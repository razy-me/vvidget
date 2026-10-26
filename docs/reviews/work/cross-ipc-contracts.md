# Cross-Cutting Audit Report: IPC & Concurrency Contracts (`cross-ipc-contracts.md`)

### [MAJOR] [OPEN] X1-01 Permanent Tauri event listener leak on unmount during asynchronous listener setup in useConfig and useSpeedtest
- **Status**: OPEN
- **Where**: `src/hooks/useConfig.ts:68-82`, `src/hooks/useSpeedtest.ts:132-180`
- **Source**: `r-review` (Cross-Cutting X1) (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In React 18/19 (e.g. StrictMode mounting in dev or quick route navigation), components mount and immediately unmount. Because `listen(...)` from `@tauri-apps/api/event` is asynchronous, the unmount cleanup function runs before the promise resolves while `unlistenFn` / `unlistenProgress` / `unlistenConfig` are still `undefined`. When `listen()` resolves afterwards, the returned cleanup functions are assigned but never invoked, permanently leaking listener registrations in Tauri's event manager.
- **Why**: `useConfig` and `useSpeedtest` do not maintain an `isDisposed` cancellation flag inside the resolution callback (unlike `useSystemMetrics.ts` which checks `if (isDisposed) unlisten();`).
- **Fix**:
```diff
--- a/src/hooks/useConfig.ts
+++ b/src/hooks/useConfig.ts
@@ -67,13 +67,20 @@ export function useConfig(): UseConfigReturn {
+    let isDisposed = false;
     let unlistenFn: (() => void) | undefined;
     void import("@tauri-apps/api/event").then(({ listen }) => {
+      if (isDisposed) return;
       void listen<AppConfig>("config-changed", (event) => {
+        if (isDisposed) return;
         if (event.payload) {
           setConfig(event.payload);
         }
       }).then((unlisten) => {
-        unlistenFn = unlisten;
+        if (isDisposed) {
+          unlisten();
+        } else {
+          unlistenFn = unlisten;
+        }
       });
     });

     return () => {
+      isDisposed = true;
       if (unlistenFn) {
         unlistenFn();
       }
     };
```

### [MAJOR] [OPEN] X1-02 Stale config ref desynchronization causes subsequent writes to revert external changes
- **Status**: OPEN
- **Where**: `src/hooks/useConfig.ts:69-75`, `src/hooks/useConfig.ts:114-116`
- **Source**: `r-review` (Cross-Cutting X1) (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When configuration changes are made from outside the component (e.g. user toggles Lock Positions or Widget Visibility via the Windows tray menu, or moves a widget in another independent window), the `"config-changed"` event handler updates React state (`setConfig(event.payload)`) but omits updating `latestConfigRef.current`. When the user later drags a widget or toggles a setting in this component, `updateConfig` or `updateWidgetPlacement` reads `latestConfigRef.current` (which is stale), overwriting and discarding the external changes before saving back to disk.
- **Why**: The `"config-changed"` event listener updates `config` via `setConfig` but omits `latestConfigRef.current = event.payload`.
- **Fix**:
```diff
--- a/src/hooks/useConfig.ts
+++ b/src/hooks/useConfig.ts
@@ -69,6 +69,7 @@ export function useConfig(): UseConfigReturn {
       void listen<AppConfig>("config-changed", (event) => {
         if (event.payload) {
+          latestConfigRef.current = event.payload;
           setConfig(event.payload);
         }
       })
```

### [MAJOR] [OPEN] X1-03 Shallow object spread in useCalendar config sync resurrects deleted calendar date entries
- **Status**: OPEN
- **Where**: `src/hooks/useCalendar.ts:68-75`
- **Source**: `r-review` (Cross-Cutting X1) (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When all notes for a specific date are removed, backend `remove_note_from_map` deletes the date key from `config.calendar_events`. When the subsequent `config-changed` event propagates to `useCalendar`, the sync effect runs `setEvents((prev) => ({ ...prev, ...config.calendar_events }))`. Because object spread cannot delete keys that exist in `prev`, the deleted date key remains in the component state, causing removed calendar notes to reappear.
- **Why**: Synchronizing state via `{ ...prev, ...config.calendar_events }` performs a key-additive merge rather than a proper reconciliation of deleted keys.
- **Fix**:
```diff
--- a/src/hooks/useCalendar.ts
+++ b/src/hooks/useCalendar.ts
@@ -68,9 +68,6 @@ export function useCalendar(options?: UseCalendarOptions): UseCalendarReturn {
   useEffect(() => {
     if (!options?.initialEvents && config.calendar_events) {
-      setEvents((prev) => ({
-        ...prev,
-        ...config.calendar_events,
-      }));
+      setEvents(config.calendar_events);
     }
   }, [config.calendar_events, options?.initialEvents]);
```

### [MAJOR] [OPEN] X1-04 Synchronous filesystem and registry game scanning executed on Tokio async worker thread
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:488-496`
- **Source**: `r-review` (Cross-Cutting X1) (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When a user opens or refreshes the Launcher widget, `scan_installed_games` is invoked. Although declared as an `async fn` command, it calls `scan_steam_games()` and `scan_epic_games()` directly on Tokio's async worker thread without `tokio::task::spawn_blocking`. These functions perform synchronous directory traversal across multiple candidate roots, parse `.vdf` text files, enumerate `appmanifest` files, and synchronously read and base64-encode icon images from disk, blocking the Tokio worker thread for hundreds of milliseconds.
- **Why**: Disk and registry I/O operations in `scan_installed_games` were not wrapped in `tokio::task::spawn_blocking`.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -488,9 +488,14 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
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
+    .map_err(|e| format!("Game scan task join failed: {}", e))
 }
```

### [MAJOR] [OPEN] X1-05 Synchronous 200ms thread sleep on Tokio worker thread during uninitialized sysinfo fallback
- **Status**: OPEN
- **Where**: `src-tauri/src/sysinfo/mod.rs:28-29`, `src-tauri/src/sysinfo/collector.rs:29`
- **Source**: `r-review` (Cross-Cutting X1) (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: If the Resources widget invokes `get_system_metrics` before the background sysinfo worker completes its first cycle (`timestamp_ms == 0`), the command creates a fallback `MetricsCollector::new()`. Its constructor calls `std::thread::sleep(Duration::from_millis(200))` synchronously. Because `get_system_metrics` is an async command running directly on a Tokio worker thread, this halts the worker thread for 200ms, stalling other concurrent async operations.
- **Why**: `get_system_metrics` calls the blocking constructor `MetricsCollector::new()` directly in an async command body without dispatching to `spawn_blocking`.
- **Fix**:
```diff
--- a/src-tauri/src/sysinfo/mod.rs
+++ b/src-tauri/src/sysinfo/mod.rs
@@ -28,3 +28,8 @@ pub async fn get_system_metrics<R: Runtime>(app: AppHandle<R>) -> Result<System
-    let mut collector = MetricsCollector::new();
-    Ok(collector.collect_metrics(true))
+    tokio::task::spawn_blocking(|| {
+        let mut collector = MetricsCollector::new();
+        collector.collect_metrics(true)
+    })
+    .await
+    .map_err(|e| format!("Metrics fallback collection failed: {}", e))
 }
```

### [MAJOR] [OPEN] X1-06 Concurrent window creation race condition in duplicate_quick_settings_widget
- **Status**: OPEN
- **Where**: `src-tauri/src/lib.rs:382-385`, `src-tauri/src/lib.rs:577-586`
- **Source**: `r-review` (Cross-Cutting X1) (2026-10-26)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: When duplicating a quick settings widget, `duplicate_quick_settings_widget` emits `"config-changed"` and then awaits `open_widget_window(app.clone(), new_id.clone())`. Concurrently, the backend listener for `"config-changed"` spawns `sync_widget_windows`, which iterates `config.widgets` and immediately calls `open_widget_window` for the exact same `new_id`. Both concurrent executions check for the window before either has finished building it, resulting in both attempting to construct a window with the same label (`widget_quick_settings_<ts>`) and triggering a Tauri window creation failure.
- **Why**: `open_widget_window` is called directly after emitting `"config-changed"`, which itself triggers `sync_widget_windows` asynchronously.
- **Fix**:
```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -382,3 +382,1 @@ pub mod integration {
             let _ = app.emit("config-changed", &config);
-
-            open_widget_window(app.clone(), new_id.clone()).await?;
-
             Ok(new_id)
```

### [MINOR] [OPEN] X1-07 Missing unmount guard for long-running Bluetooth device query and toggle in BluetoothWidget
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:91-118`
- **Source**: `r-review` (Cross-Cutting X1) (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Windows Bluetooth device enumeration (`DeviceInformation::FindAllAsyncAqsFilter` + `BluetoothDevice::FromIdAsync` per device) can take several seconds when offline paired devices are queried. If the user navigates away or closes the widget during this time, `fetchDevices` and `handleToggleDevice` call `setDevices`, `setIsLoading`, and `setTogglingId` after unmount, generating React unmounted component state update warnings and leaking memory references.
- **Why**: `BluetoothWidget` lacks an `isMountedRef` check in its asynchronous IPC callback handlers.
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
+      if (isMountedRef.current) {
+        setDevices(list || []);
+      }
     } catch (err) {
       console.error("Failed to load bluetooth devices:", err);
-      setError(err instanceof Error ? err.message : String(err));
+      if (isMountedRef.current) {
+        setError(err instanceof Error ? err.message : String(err));
+      }
     } finally {
-      setIsLoading(false);
+      if (isMountedRef.current) {
+        setIsLoading(false);
+      }
     }
   }, []);
```

### [MINOR] [OPEN] X1-08 Synchronous ShellExecuteW in execute_quick_action blocks Tokio async runtime thread
- **Status**: OPEN
- **Where**: `src-tauri/src/actions/mod.rs:127-133`, `src-tauri/src/actions/mod.rs:69-83`
- **Source**: `r-review` (Cross-Cutting X1) (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When a user triggers a quick action (e.g. sound settings, task manager, or custom URL), `execute_quick_action` is executed as an `async fn` on Tokio's worker thread. It calls `execute_resolved_action`, which performs synchronous Win32 `ShellExecuteW`. If the target involves a complex shell namespace or slow protocol handler, the Tokio worker thread is blocked.
- **Why**: The Win32 `ShellExecuteW` call is not offloaded using `tokio::task::spawn_blocking`.
- **Fix**:
```diff
--- a/src-tauri/src/actions/mod.rs
+++ b/src-tauri/src/actions/mod.rs
@@ -131,3 +131,5 @@ pub async fn execute_quick_action(
     let resolved = resolve_action_target(&action_id, custom_target.as_deref())?;
-    execute_resolved_action(&resolved)
+    tokio::task::spawn_blocking(move || execute_resolved_action(&resolved))
+        .await
+        .map_err(|e| format!("Action execution task join failed: {}", e))?
 }
```
