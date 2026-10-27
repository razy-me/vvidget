# Cross-Cutting Audit Report: IPC & Concurrency (`cross-ipc-concurrency.md`)

### [MAJOR] [OPEN] X-ipc-concurrency-01 Systemic Read-Modify-Write (RMW) race conditions across Tauri commands bypassing `ConfigManager::update_config`
- **Status**: OPEN
- **Where**: `src-tauri/src/lib.rs:131-146`, `src-tauri/src/lib.rs:349-387`, `src-tauri/src/lib.rs:403-412`, `src-tauri/src/launcher/mod.rs:591-604`, `src-tauri/src/actions/mod.rs:141-152`, `src-tauri/src/config/mod.rs:70-82`, `src-tauri/src/tray/mod.rs:252-326`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: A user drags a desktop widget to snap it to a new grid position while simultaneously adding a custom launcher game, toggling Lock Positions in the system tray, or adding a calendar note. Because `save_widget_position`, `duplicate_quick_settings_widget`, `remove_widget_instance`, `add_custom_launcher_item`, `update_quick_settings_instance`, `set_widgets_locked`, and the tray event handlers all execute `let mut config = cm.get_config().await;`, modify that local snapshot outside of any lock, and then call `cm.save_immediate(config.clone()).await;`, whichever command saves last completely overwrites the global `AppConfig` and silently discards the other command's modifications.
- **Why**: Although `ConfigManager::update_config` is implemented specifically to prevent lost-update races by mutating configuration inside an atomic `RwLock::write` guard, multiple Tauri commands and tray handlers bypass it by performing un-synchronized read-modify-write sequences across async await boundaries.
- **Fix**:
```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -131,14 +131,16 @@ pub mod integration {
         if let Some(cm) = app.try_state::<ConfigManager>() {
-            let mut config = cm.get_config().await;
-            let (w, h) = if let Some(placement) = config.widgets.get_mut(&widget_id) {
-                placement.logical_x = logical_x;
-                placement.logical_y = logical_y;
-                (placement.logical_width, placement.logical_height)
-            } else {
-                (320.0, 240.0)
-            };
+            let (w, h, snapshot) = cm.update_config(|config| {
+                let (w, h) = if let Some(placement) = config.widgets.get_mut(&widget_id) {
+                    placement.logical_x = logical_x;
+                    placement.logical_y = logical_y;
+                    (placement.logical_width, placement.logical_height)
+                } else {
+                    (320.0, 240.0)
+                };
+                Ok((w, h, config.clone()))
+            }).await?;
             if let Some(wm) = app.try_state::<WindowManager>() {
                 wm.update_window_position(&widget_id, logical_x, logical_y, w, h);
             }
-            cm.save_immediate(config.clone()).await.map_err(|e| e.to_string())?;
             use tauri::Emitter;
-            let _ = app.emit("config-changed", &config);
+            let _ = app.emit("config-changed", &snapshot);
         }
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -591,12 +591,15 @@ pub async fn add_custom_launcher_item<R: tauri::Runtime>(
     if let Some(cm) = app.try_state::<crate::config::ConfigManager>() {
-        let mut config = cm.get_config().await;
-        if let Some(existing) = config.launcher_items.iter_mut().find(|i| i.id == item.id) {
-            *existing = item;
-        } else {
-            config.launcher_items.push(item);
-        }
-        cm.save_immediate(config.clone())
-            .await
-            .map_err(|e| e.to_string())?;
+        let snapshot = cm.update_config(|config| {
+            if let Some(existing) = config.launcher_items.iter_mut().find(|i| i.id == item.id) {
+                *existing = item.clone();
+            } else {
+                config.launcher_items.push(item.clone());
+            }
+            Ok(config.clone())
+        }).await?;
         use tauri::Emitter;
-        let _ = app.emit("config-changed", &config);
+        let _ = app.emit("config-changed", &snapshot);
         Ok(())
```

---

### [MAJOR] [OPEN] X-ipc-concurrency-02 Unsynchronized concurrent window creation and destruction in `sync_widget_windows` triggered by un-debounced `config-changed` cascades
- **Status**: OPEN
- **Where**: `src-tauri/src/lib.rs:579-588`, `src-tauri/src/lib.rs:174-233`, `src-tauri/src/lib.rs:48-99`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: When high-frequency config changes occur (such as adding multiple notes, toggling settings, or saving widget positions), each operation emits `"config-changed"`. In `lib.rs`, `app.listen("config-changed")` unconditionally spawns an async task executing `sync_widget_windows(handle).await;`. Because there is no mutex, task cancellation, debounce, or serialized queue for `sync_widget_windows`, multiple instances run concurrently. When two concurrent sync passes check `app.get_webview_window(&label)`, neither finds the window while it is asynchronously initializing in `WebviewWindowBuilder::build()`, causing both tasks to invoke `build()` with the identical label and failing with a duplicate window creation error.
- **Why**: `app.listen("config-changed")` spawns uncoordinated concurrent instances of `sync_widget_windows` without debouncing or synchronization guards.
- **Fix**:
```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -578,11 +578,16 @@ pub fn run() {
             let app_handle = app.handle().clone();
             let wm_config_sync = window_manager_setup.clone();
+            let sync_mutex = std::sync::Arc::new(tokio::sync::Mutex::new(()));
             app.listen("config-changed", move |_event| {
                 let handle = app_handle.clone();
                 let wm = wm_config_sync.clone();
+                let mutex = sync_mutex.clone();
                 tauri::async_runtime::spawn(async move {
+                    let _guard = mutex.lock().await;
                     if let Ok(cfg) = load_config(handle.clone()).await {
                         wm.set_snap_to_edges(cfg.snap_to_edges);
                     }
                     let _ = sync_widget_windows(handle).await;
                 });
             });
```

---

### [MAJOR] [OPEN] X-ipc-concurrency-03 Permanent Tauri event listener leak on unmount during asynchronous listener setup in `useSpeedtest`
- **Status**: OPEN
- **Where**: `src/hooks/useSpeedtest.ts:132-180`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In React 18/19 (e.g. StrictMode mounting in development or rapid route/tab navigation), components mount and immediately unmount. Because `setupListeners()` is an asynchronous function awaiting dynamic `import("@tauri-apps/api/event")` and `listen(...)`, the effect cleanup function runs before the promises resolve while `unlistenProgress` and `unlistenConfig` are still `undefined`. When the promises resolve afterwards, the returned cleanup functions are assigned to closure variables that are never invoked, permanently leaking listener registrations in Tauri's event manager.
- **Why**: `useSpeedtest` lacks an `isDisposed` cancellation check upon promise resolution (unlike `useConfig.ts` and `useSystemMetrics.ts` which check `if (isDisposed) unlisten();`).
- **Fix**:
```diff
--- a/src/hooks/useSpeedtest.ts
+++ b/src/hooks/useSpeedtest.ts
@@ -124,15 +124,17 @@ export function useSpeedtest(options?: {
     isMountedRef.current = true;
+    let isDisposed = false;
     let unlistenProgress: (() => void) | undefined;
     let unlistenConfig: (() => void) | undefined;

     const setupListeners = async () => {
       if (!isTauri()) return;

       try {
         const { listen } = await import("@tauri-apps/api/event");
+        if (isDisposed) return;

-        unlistenProgress = await listen<SpeedtestProgress>("speedtest-progress", (evt) => {
+        const up = await listen<SpeedtestProgress>("speedtest-progress", (evt) => {
           if (!isMountedRef.current) return;
           const p = evt.payload;
@@ -158,16 +160,25 @@ export function useSpeedtest(options?: {
-        unlistenConfig = await listen<{ speedtest_history?: SpeedtestResult[] }>(
+        const uc = await listen<{ speedtest_history?: SpeedtestResult[] }>(
           "config-changed",
           (evt) => {
             if (!isMountedRef.current) return;
             if (evt.payload?.speedtest_history) {
               updateHistoryList(evt.payload.speedtest_history);
             }
           }
         );
+
+        if (isDisposed) {
+          up();
+          uc();
+        } else {
+          unlistenProgress = up;
+          unlistenConfig = uc;
+        }
       } catch (e) {
         console.error("Failed to setup speedtest listeners:", e);
       }
     };

     void setupListeners();
     void refreshHistory();

     return () => {
+      isDisposed = true;
       isMountedRef.current = false;
       if (unlistenProgress) unlistenProgress();
       if (unlistenConfig) unlistenConfig();
     };
```

---

### [MAJOR] [OPEN] X-ipc-concurrency-04 Dual competing writes and redundant IPC cascades in `QuickSettingsWidget.tsx:saveInstance`
- **Status**: OPEN
- **Where**: `src/widgets/quick-settings/QuickSettingsWidget.tsx:142-156`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: When a user changes the title or pinned actions in Quick Settings, `saveInstance` calls `await updateConfig(...)` (which serializes and saves the entire `AppConfig` via `save_config`) and immediately afterwards calls `invoke("update_quick_settings_instance", { instance: updated })` (which reads and saves via `save_immediate`). Both commands trigger disk writes and both emit `"config-changed"`. Because `save_config` (debounced) and `update_quick_settings_instance` (immediate) race against each other in Tokio, the debounced write can clobber the immediate write, and redundant `"config-changed"` events trigger duplicated window synchronization cascades.
- **Why**: `saveInstance` redundantly invokes two separate backend persistence channels (`save_config` and `update_quick_settings_instance`) for the same configuration update.
- **Fix**:
```diff
--- a/src/widgets/quick-settings/QuickSettingsWidget.tsx
+++ b/src/widgets/quick-settings/QuickSettingsWidget.tsx
@@ -141,18 +141,17 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
   const saveInstance = useCallback(
     async (updated: QuickSettingsInstance) => {
-      await updateConfig((prev) => ({
-        ...prev,
-        quick_settings_instances: {
-          ...prev.quick_settings_instances,
-          [instanceId]: updated,
-        },
-      }));
-
       try {
         const { invoke } = await import("@tauri-apps/api/core");
         await invoke("update_quick_settings_instance", { instance: updated });
       } catch {
-        // Safe fallback in web or test environment
+        // Safe fallback in web or test environment
+        await updateConfig((prev) => ({
+          ...prev,
+          quick_settings_instances: {
+            ...prev.quick_settings_instances,
+            [instanceId]: updated,
+          },
+        }));
       }
     },
     [instanceId, updateConfig],
```

---

### [MAJOR] [OPEN] X-ipc-concurrency-05 Synchronous filesystem traversal, .vdf parsing, and icon I/O on Tokio worker thread in `scan_installed_games`
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:486-496`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When the Launcher widget mounts or the user clicks refresh, `scan_installed_games` is called. Although declared as an `async fn` Tauri command, it executes `scan_steam_games()` and `scan_epic_games()` directly on Tokio's async worker thread without `tokio::task::spawn_blocking`. These functions traverse directories across multiple drive roots, parse large `.vdf` text files, enumerate manifest files, and read/base64-encode executable icon binaries from disk, freezing Tokio's worker thread for 200–800ms and stalling other async operations (such as speedtests, telemetry updates, and config saves).
- **Why**: Heavy disk and registry I/O in `scan_installed_games` was executed synchronously within an `async fn` command rather than being dispatched to `tokio::task::spawn_blocking`.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -486,9 +486,14 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
 #[tauri::command]
 #[specta::specta]
 pub async fn scan_installed_games() -> Result<Vec<LauncherItem>, String> {
-    let mut games = scan_steam_games();
-    let mut epic_games = scan_epic_games();
-    games.append(&mut epic_games);
-
-    // Sort alphabetically by name
-    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
-    Ok(games)
+    tokio::task::spawn_blocking(|| {
+        let mut games = scan_steam_games();
+        let mut epic_games = scan_epic_games();
+        games.append(&mut epic_games);
+        games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
+        games
+    })
+    .await
+    .map_err(|e| format!("Game scan worker join failed: {}", e))
 }
```

---

### [MAJOR] [OPEN] X-ipc-concurrency-06 Synchronous Win32 `ShellExecuteW` and filesystem stat on Tokio worker thread in `launch_app_or_uri` and `execute_quick_action`
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:503-558`, `src-tauri/src/actions/mod.rs:122-128`, `src-tauri/src/actions/mod.rs:73-78`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When a user launches a game from the Launcher widget or triggers a quick action from the Quick Settings widget, `launch_app_or_uri` or `execute_quick_action` runs as an `async fn` on Tokio's worker thread. Both functions perform synchronous Win32 `ShellExecuteW` (and `launch_app_or_uri` performs synchronous `Path::is_file()` disk checks). If the target executable is on a spinning drive, sleeping disk, or requires DDE/COM protocol dispatch, the Tokio worker thread is blocked until the OS shell call returns.
- **Why**: Win32 `ShellExecuteW` is a synchronous blocking API that must be offloaded via `tokio::task::spawn_blocking` when called from async commands.
- **Fix**:
```diff
--- a/src-tauri/src/actions/mod.rs
+++ b/src-tauri/src/actions/mod.rs
@@ -125,3 +125,5 @@ pub async fn execute_quick_action(
     let resolved = resolve_action_target(&action_id, custom_target.as_deref())?;
-    execute_resolved_action(&resolved)
+    tokio::task::spawn_blocking(move || execute_resolved_action(&resolved))
+        .await
+        .map_err(|e| format!("Action task join failed: {}", e))?
 }
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -505,3 +505,4 @@ pub async fn launch_app_or_uri(target: String) -> Result<(), String> {
     validate_launch_target(&target)?;
+    tokio::task::spawn_blocking(move || {
     #[cfg(windows)]
@@ -550,2 +551,6 @@ pub async fn launch_app_or_uri(target: String) -> Result<(), String> {
     Ok(())
+    })
+    .await
+    .map_err(|e| format!("Launch task join failed: {}", e))?
```

---

### [MINOR] [OPEN] X-ipc-concurrency-07 Swallowed backend IPC errors and optimistic state desynchronization in `useCalendar` and `QuickSettingsWidget`
- **Status**: OPEN
- **Where**: `src/hooks/useCalendar.ts:150-209`, `src/widgets/quick-settings/QuickSettingsWidget.tsx:200-228`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In `useCalendar`, `addNote`, `removeNote`, and `toggleNote` optimistically update local state and call `safeInvoke`. When the backend returns an error (e.g. disk error or empty text validation), empty `catch {}` blocks swallow the error completely. The state is never rolled back, no error is set, and the user is unaware their note was rejected. In `QuickSettingsWidget`, `handleActionClick` sets `activeFeedback` before the IPC call, and swallows errors with an empty catch block, flashing a false-positive "Gestartet" feedback for 700ms when launch fails.
- **Why**: Promises from `safeInvoke` and `invoke` are caught by empty catch clauses without error state updates or rollback mechanisms.
- **Fix**:
```diff
--- a/src/hooks/useCalendar.ts
+++ b/src/hooks/useCalendar.ts
@@ -154,3 +154,4 @@ export function useCalendar(options?: UseCalendarOptions): UseCalendarReturn {
         });
-      } catch {
-        // Ignored in non-Tauri / mock environments
+      } catch (err) {
+        if (isTauri()) {
+          setError(err instanceof Error ? err.message : String(err));
+          void safeInvoke<Record<string, CalendarNote[]>>("get_calendar_events")
+            .then((res) => setEvents(res || {}));
+        }
       }
--- a/src/widgets/quick-settings/QuickSettingsWidget.tsx
+++ b/src/widgets/quick-settings/QuickSettingsWidget.tsx
@@ -201,3 +201,2 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
   const handleActionClick = async (actionId: string) => {
-    setActiveFeedback(actionId);
     try {
@@ -221,4 +220,6 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
       });
-    } catch {
-      // Safe fallback in web/test environment
+      setActiveFeedback(actionId);
+    } catch (err) {
+      console.error("Action execution failed:", err);
     } finally {
```

---

### [MINOR] [OPEN] X-ipc-concurrency-08 Missing unmount cancellation guards in `BluetoothWidget.tsx` async handlers
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:87-119`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Windows Bluetooth device enumeration and device pairing/connection queries can take several seconds when offline paired devices are queried via WinRT. If the user navigates away or closes the widget during this time, `fetchDevices` and `handleToggleDevice` call `setDevices`, `setIsLoading`, and `setTogglingId` after unmount, generating React unmounted component state update warnings and leaking memory references.
- **Why**: Asynchronous IPC callbacks in `BluetoothWidget` lack an `isMountedRef` lifecycle guard.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -86,6 +86,11 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
+  const isMountedRef = useRef(true);
+  useEffect(() => {
+    isMountedRef.current = true;
+    return () => { isMountedRef.current = false; };
+  }, []);
+
   const fetchDevices = useCallback(async () => {
     setIsLoading(true);
     setError(null);
     try {
       const { invoke } = await import("@tauri-apps/api/core");
       const list = await invoke<BluetoothDeviceInfo[]>("get_bluetooth_devices");
-      setDevices(list || []);
+      if (isMountedRef.current) setDevices(list || []);
     } catch (err) {
       console.error("Failed to load bluetooth devices:", err);
-      setError(err instanceof Error ? err.message : String(err));
+      if (isMountedRef.current) setError(err instanceof Error ? err.message : String(err));
     } finally {
-      setIsLoading(false);
+      if (isMountedRef.current) setIsLoading(false);
     }
   }, []);
```
