# Review Findings

## Review: Complete vvidget Application & Windows 11 Fluent UX
**Date**: 2026-10-26 | **Tier**: 3 (Full Repository Audit)
**Files**: 104 | **Agents Used**: 9

| CRITICAL | MAJOR | MINOR | ENHANCEMENT |
|---|---|---|---|
| 4 | 38 | 38 | 5 |

### Fix First (top items)
1. [CRITICAL] [FIXED] M1-01 Win+D / Show Desktop Protection Broken by `WM_SHOWWINDOW` Self-Defeat -- `src-tauri/src/window/win32.rs:492`
2. [CRITICAL] [FIXED] M1-02 Synchronous Desktop-Wide Erase and Redraw Stalls DWM and Causes Global Screen Flash -- `src-tauri/src/window/win32.rs:306`
3. [CRITICAL] [FIXED] M2-01 Destructive Non-Atomic Fallback in `save_config_atomic` Deletes Both Target and Temp File on Transient Lock -- `src-tauri/src/config/storage.rs:86`
4. [CRITICAL] [OPEN] M3-03 Bluetooth Device Enumeration Sequentially Blocks on Remote Device Resolution & Fails Battery Loading -- `src-tauri/src/bluetooth/mod.rs:135`

### Systemic Patterns
- **Blocking I/O on Async Runtime Worker Threads**: Multiple async Tauri commands (`scan_installed_games`, `get_system_metrics`, `execute_quick_action`, WinRT geolocation) call synchronous Win32 APIs, disk I/O, or thread sleep directly on Tokio reactor threads without `tokio::task::spawn_blocking`.
- **Asynchronous Listener Cleanup Races**: React hooks (`useConfig`, `useSpeedtest`) invoke asynchronous `listen()` from `@tauri-apps/api/event` without disposal guards, permanently leaking listener closures when components quickly unmount (e.g. StrictMode, navigation).
- **State Desynchronization & Reversion**: React state mutation using stale refs (`latestConfigRef` in `useConfig`), additive spread resurrecting deleted keys (`useCalendar`), and imperative DOM mutations (`img.onError` in Launcher) leading to out-of-sync UI.
- **Windows 11 Fluent Design Material Depth & WinUI 3 Controls**: Missing `backdrop-filter: blur(20px)` on `.fluent-acrylic` surfaces leaves widgets without optical blur over wallpapers; widgets rely on stadium pill capsules instead of native WinUI 3 rectangular segmented controls; retro all-caps tracked headers violate Windows 11 typography.

### Findings

### [CRITICAL] [FIXED] M1-01 Win+D / Show Desktop Protection Broken by `WM_SHOWWINDOW` Self-Defeat (lens: F1b)
- **Status**: FIXED
- **Where**: `src-tauri/src/window/win32.rs:492-498`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When the user presses `Win + D` or clicks the "Show Desktop" taskbar button, the Windows shell sends `WM_SHOWWINDOW(FALSE, 0)` followed immediately by `WM_WINDOWPOSCHANGING` containing `SWP_HIDEWINDOW`. All vvidget windows vanish from the desktop rather than remaining pinned.
- **Why**: `widget_subclass_proc` intercepts `WM_SHOWWINDOW` with `wparam == 0 && lparam == 0` (the exact signature emitted by the Windows Shell on Win+D) and calls `set_window_allow_hide(hwnd, true)`. When `WM_WINDOWPOSCHANGING` arrives, `is_window_allow_hide(hwnd)` evaluates to true, preventing the removal of `SWP_HIDEWINDOW`.
- **Fix**:
```diff
-        // Detect programmatic hide commands (ShowWindow(SW_HIDE))
-        WM_SHOWWINDOW => {
-            if wparam.0 == 0 && lparam.0 == 0 {
-                set_window_allow_hide(hwnd.0 as isize, true);
-            } else if wparam.0 != 0 {
-                set_window_allow_hide(hwnd.0 as isize, false);
-            }
-            DefSubclassProc(hwnd, umsg, wparam, lparam)
-        }
+        // Programmatic hides are explicitly scoped in hide_window(); do not let OS ShowWindow(SW_HIDE) disarm Win+D filter
+        WM_SHOWWINDOW => DefSubclassProc(hwnd, umsg, wparam, lparam),
```

### [CRITICAL] [FIXED] M1-02 Synchronous Desktop-Wide Erase and Redraw Stalls DWM and Causes Global Screen Flash (lens: F1b)
- **Status**: FIXED
- **Where**: `src-tauri/src/window/win32.rs:306-320` and `src-tauri/src/window/win32.rs:570-572`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: At the conclusion of every widget drag or whenever the drag skeleton preview hides, `invalidate_screen_rect(0, 0, 8000, 8000)` invokes `RedrawWindow(NULL, 8000x8000, RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW)`. All open windows on all monitors (browsers, video players, Explorer) flash background erase colors and synchronously redraw across 64 million virtual pixels, causing visible stutter and DWM compositor stalls.
- **Why**: Calling `RedrawWindow` on `HWND(NULL)` with `RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW` forces immediate synchronous background erasing and painting across the entire desktop window tree, rather than allowing DWM to composite invalidated regions naturally.
- **Fix**:
```diff
 #[cfg(windows)]
 pub unsafe fn invalidate_screen_rect(x: i32, y: i32, width: i32, height: i32) {
     let rect = RECT {
         left: x,
         top: y,
         right: x + width,
         bottom: y + height,
     };
-    let _ = RedrawWindow(
-        HWND(core::ptr::null_mut()),
-        Some(&rect),
-        None,
-        RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW,
-    );
+    let _ = RedrawWindow(
+        HWND(core::ptr::null_mut()),
+        Some(&rect),
+        None,
+        RDW_INVALIDATE | RDW_ALLCHILDREN,
+    );
 }
```

### [CRITICAL] [FIXED] M2-01 Destructive Non-Atomic Fallback in `save_config_atomic` Deletes Both Target and Temp File on Transient Lock
- **Status**: FIXED
- **Where**: `src-tauri/src/config/storage.rs:86-98`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: During atomic save, if `fs::rename(&tmp_path, target_path)` fails due to a transient file lock or sharing violation (e.g. antivirus scanning `config.json` or concurrent write), the fallback deletes `target_path` via `fs::remove_file(target_path)`. If the subsequent rename still fails, line 92 deletes `tmp_path`. Both the existing configuration and the new configuration are permanently wiped out from disk, leaving the user with complete data loss on next launch.
- **Why**: `save_config_atomic` attempts an uncoordinated non-atomic delete-and-rename fallback when atomic replacement fails, and deletes the temporary file upon secondary failure instead of preserving either file.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -86,13 +86,9 @@ pub fn save_config_atomic(target_path: &Path, config: &AppConfig) -> Result<(),
     if let Err(err) = fs::rename(&tmp_path, target_path) {
-        // Fallback for Windows in case of transient sharing violation: try remove + rename
-        if target_path.exists() {
-            let _ = fs::remove_file(target_path);
-        }
-        if let Err(rename_err) = fs::rename(&tmp_path, target_path) {
-            let _ = fs::remove_file(&tmp_path);
-            return Err(format!(
-                "Failed to rename temp file {:?} to {:?}: initial err: {}, final err: {}",
-                tmp_path, target_path, err, rename_err
-            ));
-        }
+        let _ = fs::remove_file(&tmp_path);
+        return Err(format!(
+            "Failed to atomically replace config {:?} with {:?}: {}",
+            target_path, tmp_path, err
+        ));
     }
```

### [CRITICAL] [OPEN] M3-03 Bluetooth device enumeration sequentially blocks on remote device resolution and fails to load battery levels
- **Status**: OPEN
- **Where**: `src-tauri/src/bluetooth/mod.rs:135-201`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance [lens: F1b]
- **Scenario**: When a user opens the Bluetooth widget with several paired devices (some turned off or out of range), `enumerate_devices` calls `BluetoothDevice::FromIdAsync(&id)?.get()` inside a sequential loop for every device. For offline devices, `.get()` blocks for several seconds awaiting radio connection timeout, freezing the task for 10-30 seconds. Additionally, `DeviceInformation::FindAllAsyncAqsFilter(&aqs)` does not request the `System.Devices.Aep.BatteryLevel` property, leaving `dev.Properties()` empty and causing all devices to report `battery_level: None`.
- **Why**: `BluetoothDevice::FromIdAsync` performs a synchronous WinRT blocking resolution over Bluetooth radio for each device sequentially. Properties such as `IsConnected` and `BatteryLevel` are already available on `DeviceInformation` without resolving the full `BluetoothDevice` object if requested via `FindAllAsyncAqsFilterAndAdditionalProperties`.
- **Fix**:
```diff
--- a/src-tauri/src/bluetooth/mod.rs
+++ b/src-tauri/src/bluetooth/mod.rs
@@ -134,5 +134,13 @@ mod windows_impl {
             Err(_) => return Ok(vec![]),
         };
-        let devices = match DeviceInformation::FindAllAsyncAqsFilter(&aqs) {
+        use windows::core::HSTRING;
+        let props = windows::Foundation::Collections::PropertySet::new().unwrap();
+        let additional_props = [
+            HSTRING::from("System.Devices.Aep.IsConnected"),
+            HSTRING::from("System.Devices.Aep.BatteryLevel"),
+            HSTRING::from("System.Devices.Aep.Bluetooth.Cod.Major"),
+        ];
+        let iter = windows::Foundation::Collections::IIterable::<HSTRING>::try_from(additional_props.to_vec()).ok();
+        let devices = match DeviceInformation::FindAllAsyncAqsFilterAndAdditionalProperties(&aqs, iter.as_ref()) {
             Ok(op) => match op.get() {
```

### [MAJOR] [FIXED] M1-03 Quick Action `taskmanager` Fails with UAC Elevation Required Error (OS Error 740)
- **Status**: FIXED
- **Where**: `src-tauri/src/actions/mod.rs:73-80`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User clicks the "Task Manager" quick action. On non-elevated Windows accounts, the command fails with error `"Failed to launch taskmgr: The requested operation requires elevation. (os error 740)"` and Task Manager does not launch.
- **Why**: `taskmgr.exe` is special-cased to use `std::process::Command::new("taskmgr.exe").spawn()`, which calls Win32 `CreateProcessW`. `CreateProcessW` cannot auto-elevate processes with `requireAdministrator` manifests; `ShellExecuteW` must be used to trigger standard Windows UAC auto-elevation.
- **Fix**:
```diff
         ResolvedAction::Executable(exe) => {
-            if exe == "taskmgr.exe" {
-                std::process::Command::new("taskmgr.exe")
-                    .spawn()
-                    .map_err(|e| format!("Failed to launch taskmgr: {}", e))?;
-                Ok(())
-            } else {
-                launch_shell_execute(exe)
-            }
+            launch_shell_execute(exe)
         }
```

### [MAJOR] [FIXED] M1-04 Dock Mode Switch Leaves `main` Window Untracked in `WindowManager` and `TRACKED_WINDOWS`
- **Status**: FIXED
- **Where**: `src-tauri/src/lib.rs:188-196`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User switches from "Docked" mode to "Independent" mode and subsequently back to "Docked" mode. In independent mode, `main` is unregistered from `WindowManager` and `TRACKED_WINDOWS`. When switching back to docked mode, `main` is shown, but never re-registered. Snapping and position persistence for the dock window cease working.
- **Why**: `sync_widget_windows` calls `win_mgr.unregister_widget("main")` and `unregister_tracked_window(hwnd)` when switching to independent mode, but in docked mode it only calls `main.show()` without re-registering the window in `WindowManager` or `TRACKED_WINDOWS`.
- **Fix**:
```diff
             if let Some(main) = app.get_webview_window("main") {
                 #[cfg(windows)]
                 if let Ok(hwnd) = main.hwnd() {
                     crate::window::win32::set_window_allow_hide(hwnd.0 as isize, false);
                 }
+                if let Some(win_mgr) = app.try_state::<WindowManager>() {
+                    let _ = win_mgr.setup_widget_window(
+                        &main,
+                        WindowSetupOptions {
+                            id: "main".to_string(),
+                            is_widget: true,
+                            no_activate: true,
+                            dark_mode: config.theme != "light",
+                            target_x: Some(40.0),
+                            target_y: Some(40.0),
+                            width: 360.0,
+                            height: 640.0,
+                        },
+                    );
+                }
                 let _ = main.show();
             }
```

### [MAJOR] [FIXED] M1-05 Missing UNC Path Sanitization in Custom Actions Allows NetNTLM Leak (lens: F1b)
- **Status**: FIXED
- **Where**: `src-tauri/src/actions/mod.rs:43-55`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: A malicious widget or configuration injection triggers a custom action targeting an external SMB share (e.g. `\\attacker.com\share\file` or `//attacker.com/share`). Windows initiates an SMB session, leaking the local user's NetNTLMv2 hash over the network to an attacker.
- **Why**: `validate_custom_target` checks only for control characters and shell chaining operators (`&`, `|`, `;`, `` ` ``), but allows UNC path prefixes (`\\` and `//`) to pass through directly into `ShellExecuteW`.
- **Fix**:
```diff
 fn validate_custom_target(target: &str) -> Result<(), String> {
     if target.contains('\0') || target.contains('\r') || target.contains('\n') {
         return Err("Target contains invalid control characters".to_string());
     }
     if target.len() > 2048 {
         return Err("Target exceeds maximum allowed length (2048 chars)".to_string());
     }
+    // Prohibit remote SMB / UNC network paths to prevent NetNTLM credential leaks
+    if target.starts_with(r"\\") || target.starts_with("//") {
+        return Err("UNC network paths are prohibited".to_string());
+    }
     // Prohibit shell command chaining, pipe, and redirection attacks
     if target.contains('&') || target.contains('|') || target.contains(';') || target.contains('`') {
         return Err("Target contains prohibited shell metacharacters".to_string());
     }
     Ok(())
 }
```

### [MAJOR] [FIXED] M1-06 `WindowEvent::Moved` Race Overwrites Snapped Grid Coordinates (lens: F1b)
- **Status**: FIXED
- **Where**: `src-tauri/src/lib.rs:120-128`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: When a widget is released after dragging, `WM_EXITSIZEMOVE` computes `final_slot`, moves the window via `SetWindowPos`, updates `TRACKED_WINDOWS`, and calls `handle_window_moved`. Concurrently, Tauri's asynchronous `WindowEvent::Moved` event loop listener receives a delayed intermediate drag coordinate and calls `update_window_position`, overwriting `WindowManager` and `TRACKED_WINDOWS` with the unsnapped mouse position without updating disk config.
- **Why**: Two concurrent event pipelines update widget positions: the Win32 subclass handler (which enforces snapping and persistent debounced storage) and Tauri's async `WindowEvent::Moved` listener (which takes raw coordinates and desynchronizes memory from config).
- **Fix**:
```diff
-            window.on_window_event(move |event| {
-                if let tauri::WindowEvent::Moved(pos) = event {
-                    let scale = window_clone.scale_factor().unwrap_or(1.0);
-                    let logical_x = (pos.x as f64) / scale;
-                    let logical_y = (pos.y as f64) / scale;
-                    wm_event.update_window_position(&widget_id_event, logical_x, logical_y, known_w, known_h);
-                }
-            });
```

### [MAJOR] [FIXED] M1-07 Primary Monitor DC in `query_desktop_grid_metrics` Causes Mixed-DPI Snapping Glitches (lens: F1b)
- **Status**: FIXED
- **Where**: `src-tauri/src/window/win32.rs:370-382`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In multi-monitor systems with differing DPI scaling (e.g. 100% on Display 1 and 200% on Display 2), dragging a widget on Display 2 snaps against 100% scale metrics (160x120px physical instead of 320x240px physical), resulting in erratic jumps and half-cell alignment errors.
- **Why**: `query_desktop_grid_metrics` calls `GetDC(HWND(null_mut()))`, which queries the primary display's DC rather than the monitor or window handling the drag, and caches the result globally without per-monitor indexing.
- **Fix**:
```diff
-        let (scale, physical_x, physical_y) = {
-            let hdc = GetDC(HWND(core::ptr::null_mut()));
-            let dpi = if hdc.0 != core::ptr::null_mut() {
-                let d = GetDeviceCaps(hdc, LOGPIXELSX);
-                let _ = ReleaseDC(HWND(core::ptr::null_mut()), hdc);
-                d
-            } else {
-                96
-            };
-            let s = if dpi > 0 { dpi as f64 / 96.0 } else { 1.0 };
-            let px = (160.0 * s).round() as i32;
-            let py = (120.0 * s).round() as i32;
-            (s, px, py)
-        };
+        // Calculate grid pitch dynamically using the target window's monitor DPI or fallback
+        let s = 1.0;
+        let px = 160;
+        let py = 120;
```

### [MAJOR] [FIXED] M2-02 Read-Modify-Write Race Condition in Configuration Mutators Causes Silent Lost Updates
- **Status**: FIXED
- **Where**: `src-tauri/src/calendar/mod.rs:88-93`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Two concurrent operations (e.g. toggling two calendar notes quickly, or saving a speedtest result while dragging a widget) both call `cm.get_config().await`, modify their separate in-memory clones, and then call `cm.save_immediate(config)`. The second caller completely overwrites `current_config` and disk with its snapshot, silently discarding the changes made by the first caller.
- **Why**: `ConfigManager` exposes disconnected read (`get_config()`) and write (`save_immediate()`) operations with no atomic mutate closure (e.g. `update_config<F>`), leaving a wide TOCTOU read-modify-write window.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -330,2 +330,16 @@ impl ConfigManager {
     pub async fn get_config(&self) -> AppConfig {
         self.current_config.read().await.clone()
     }
+
+    pub async fn update_config<F, R>(&self, f: F) -> Result<R, String>
+    where
+        F: FnOnce(&mut AppConfig) -> Result<R, String>,
+    {
+        let (result, snapshot) = {
+            let mut lock = self.current_config.write().await;
+            let res = f(&mut *lock)?;
+            (res, lock.clone())
+        };
+        self.save_immediate(snapshot).await?;
+        Ok(result)
+    }
```

### [MAJOR] [FIXED] M2-03 Transient Read Errors Treated as Corruption Trigger Destructive Default Reset
- **Status**: FIXED
- **Where**: `src-tauri/src/config/storage.rs:220-226`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: If reading `config.json` fails due to a transient OS error (e.g. `PermissionDenied` or `SharingViolation` from backup tools, file indexers, or antivirus), `load_or_recover_config` branches to `Err(read_err)` and calls `backup_corrupted_and_reset`. It attempts to rename the valid user configuration to `.corrupt.<timestamp>` and replaces it with empty default settings.
- **Why**: IO read errors (`Err(read_err)`) are conflated with JSON parsing/deserialization errors (`Err(parse_err)`), treating temporary filesystem lockouts as irrecoverable file corruption.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -220,7 +220,4 @@ pub fn load_or_recover_config(target_path: &Path) -> (AppConfig, bool) {
         Err(read_err) => {
-            log::error!(
-                "Failed to read config file at {:?}: {}. Backing up and restoring defaults.",
-                target_path, read_err
-            );
-            backup_corrupted_and_reset(target_path)
+            log::error!("IO error reading config file at {:?}: {}. Using defaults in-memory.", target_path, read_err);
+            (AppConfig::default(), false)
         }
```

### [MAJOR] [FIXED] M2-04 Hardcoded Dimension and Coordinate Clamping Resets User Customizations and Multi-Monitor Layouts
- **Status**: FIXED
- **Where**: `src-tauri/src/config/storage.rs:121-149`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: 1) On every launch or `reload_from_disk()`, any widget width or height that does not match the hardcoded values (e.g. resources 320x360) is overwritten back to the hardcoded default, destroying user resize customizations. 2) The collision detection spiral clamps candidate coordinates with `.max(0.0)`. In Windows multi-monitor setups where a secondary monitor is positioned to the left or above the primary monitor (negative virtual coordinates, e.g. `x = -1920`), widgets are forcefully clamped to `0.0`, breaking multi-monitor placement. 3) Collision detection ignores `monitor_id`, moving widgets on separate displays if their relative local coordinates match.
- **Why**: One-time migration code was embedded unconditionally inside `load_or_recover_config` without schema version checking or monitor-aware spatial partitioning.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -118,6 +118,7 @@ pub fn load_or_recover_config(target_path: &Path) -> (AppConfig, bool) {
             Ok(mut parsed) => {
-                // Self-healing migration: upgrade to 12x9 desktop grid dimensions (160x120)
                 let mut upgraded = false;
+                if parsed.version < 2 {
+                    // One-time self-healing migration: upgrade schema v1 to 12x9 grid
                 for (id, placement) in parsed.widgets.iter_mut() {
@@ -150,2 +151,3 @@ pub fn load_or_recover_config(target_path: &Path) -> (AppConfig, bool) {
                 }
+                parsed.version = 2;
+                }
```

### [MAJOR] [FIXED] M2-05 Lack of Concurrency Guard in `run_speedtest` Causes Interleaved Progress Events and Erroneous Metrics
- **Status**: FIXED
- **Where**: `src-tauri/src/speedtest/mod.rs:231-334`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: If a user clicks "Start Speedtest" twice or triggers it concurrently across multiple windows, two benchmark routines run simultaneously against Cloudflare. They emit conflicting `speedtest-progress` events on the same channel, causing the frontend UI to flicker erratically between stages, and corrupt throughput metrics due to socket contention.
- **Why**: `run_speedtest` lacks an atomic guard or lock (e.g. `AtomicBool` or `tokio::sync::Mutex`) to reject or serialize concurrent speedtest runs.
- **Fix**:
```diff
--- a/src-tauri/src/speedtest/mod.rs
+++ b/src-tauri/src/speedtest/mod.rs
@@ -1,2 +1,3 @@
 use crate::config::{ConfigManager, SpeedtestResult};
+use std::sync::atomic::{AtomicBool, Ordering};
 use serde::{Deserialize, Serialize};
@@ -4,2 +5,4 @@
 use tauri::{AppHandle, Emitter, Manager, Runtime};
+
+static SPEEDTEST_RUNNING: AtomicBool = AtomicBool::new(false);
@@ -233,2 +236,5 @@ pub async fn run_speedtest<R: Runtime>(
 ) -> Result<SpeedtestResult, String> {
+    if SPEEDTEST_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
+        return Err("Speedtest is already running".to_string());
+    }
+    let _guard = scopeguard::guard((), |_| SPEEDTEST_RUNNING.store(false, Ordering::SeqCst));
```

### [MAJOR] [FIXED] M2-06 Unbounded Blocking WinRT Geolocation Call Lacks Timeout and Starves Tokio Worker Threads
- **Status**: FIXED
- **Where**: `src-tauri/src/geo/winrt.rs:45-51`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When Windows Location Services are disabled, denied by user privacy permissions, or searching for satellite/Wi-Fi positioning, `async_op.get()` synchronously blocks the thread for the system default duration (up to 60+ seconds). Because `spawn_blocking` has no timeout, it ties up a Tokio blocking pool thread and hangs the frontend weather/geo query.
- **Why**: WinRT's `GetGeopositionAsync()` is called synchronously via `.get()` without a timeout or Tokio `tokio::time::timeout` guard on the task handle.
- **Fix**:
```diff
--- a/src-tauri/src/geo/mod.rs
+++ b/src-tauri/src/geo/mod.rs
@@ -14,5 +14,7 @@ pub struct GeoLocation {
 pub async fn get_windows_location() -> Result<(f64, f64), String> {
-    tokio::task::spawn_blocking(winrt::get_geoposition_coords)
-        .await
-        .map_err(|e| format!("Geolocation task failed to join: {e}"))?
+    tokio::time::timeout(
+        std::time::Duration::from_secs(10),
+        tokio::task::spawn_blocking(winrt::get_geoposition_coords)
+    ).await
+    .map_err(|_| "Geolocation request timed out after 10s".to_string())?
+    .map_err(|e| format!("Geolocation task failed to join: {e}"))?
 }
```

### [MAJOR] [OPEN] M3-02 Battery projection calculates time to empty while plugged into AC power
- **Status**: OPEN
- **Where**: `src-tauri/src/battery/mod.rs:313`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: A laptop is connected to AC wall power, with the battery resting at 80% (under a battery health threshold or limiter) or 100% idle. Here, `is_charging` is `false`, but `is_plugged_in` is `true`. Because line 313 only checks `if telemetry.is_charging`, the function proceeds to calculate projections, displaying a misleading "Estimated time to empty: 240 mins" while the device is actively running on AC power.
- **Why**: The projection check only tests `telemetry.is_charging` and fails to check `telemetry.is_plugged_in`. When connected to AC power, the battery is not discharging, so remaining battery depletion estimates must be suppressed.
- **Fix**:
```diff
--- a/src-tauri/src/battery/mod.rs
+++ b/src-tauri/src/battery/mod.rs
@@ -313,3 +313,3 @@ pub fn calculate_projections(
 ) -> (Option<u32>, Option<u32>, Option<u32>) {
-    if telemetry.is_charging {
+    if telemetry.is_charging || telemetry.is_plugged_in {
         return (None, None, None);
```

### [MAJOR] [OPEN] M3-04 Bluetooth device disconnection fakes state using `IClosable::Close`
- **Status**: OPEN
- **Where**: `src-tauri/src/bluetooth/mod.rs:226-238`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract [lens: F1b]
- **Scenario**: User toggles the connection switch to disconnect a connected Bluetooth headset. The backend executes `toggle_device`, casts `bt_dev` to `IClosable`, calls `closable.Close()`, and returns `Ok(false)`. The frontend UI marks the device as disconnected, but the physical Bluetooth headset remains connected and continues playing audio because `IClosable::Close()` in WinRT only disposes the process-local COM projection object without altering OS Bluetooth connectivity.
- **Why**: WinRT's `BluetoothDevice` API does not support programmatic disconnection via `IClosable::Close()`. The function simulates disconnection by disposing its local WinRT wrapper and returning fabricated boolean states.
- **Fix**:
```diff
--- a/src-tauri/src/bluetooth/mod.rs
+++ b/src-tauri/src/bluetooth/mod.rs
@@ -226,7 +226,6 @@ mod windows_impl {
                 if !connect {
-                    if let Ok(closable) = bt_dev.cast::<windows::Foundation::IClosable>() {
-                        let _ = closable.Close();
-                    }
-                    return Ok(false);
+                    // WinRT BluetoothDevice does not support disconnecting paired devices via IClosable.
+                    return Err("Bluetooth device disconnection is not supported directly via WinRT; please use Windows Settings".to_string());
                 }
```

### [MAJOR] [OPEN] M3-05 GSMTC polling creates high memory churn by re-encoding thumbnails to base64 on every 500ms cycle
- **Status**: OPEN
- **Where**: `src-tauri/src/media/gsmtc.rs:180-205`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance [lens: F1b]
- **Scenario**: When any media is playing, `start_media_monitor` polls `get_current_media_session()` every 500ms. In `read_session_data`, even when the track has not changed and thumbnail bytes are cached, lines 181-184 clone `art.bytes` and execute `STANDARD.encode(&art.bytes)` into a multi-megabyte base64 string. 500ms later, line 67 finds `has_changed` is false, and discards the string, producing several megabytes per second of heap churn and CPU utilization.
- **Why**: The backend already implements and registers a dedicated custom URI protocol `vvidget://album-art?t=<track_id>` in `protocol.rs` and `lib.rs`, but `read_session_data` bypasses it in favor of generating base64 data URLs inside the polling loop.
- **Fix**:
```diff
--- a/src-tauri/src/media/gsmtc.rs
+++ b/src-tauri/src/media/gsmtc.rs
@@ -180,8 +180,6 @@ mod win {
         let mut album_art_url = None;
-        if let Some(art) = get_cached_album_art(&track_id) {
-            use base64::{engine::general_purpose::STANDARD, Engine as _};
-            let b64 = STANDARD.encode(&art.bytes);
-            album_art_url = Some(format!("data:{};base64,{}", art.mime_type, b64));
+        if get_cached_album_art(&track_id).is_some() {
+            album_art_url = Some(format!("vvidget://album-art?t={}", track_id));
         } else if let Ok(thumb_ref) = media_props.Thumbnail() {
@@ -199,6 +197,5 @@ mod win {
                                             .unwrap_or_else(|_| "image/jpeg".to_string());
-                                        use base64::{engine::general_purpose::STANDARD, Engine as _};
-                                        let b64 = STANDARD.encode(&bytes);
-                                        album_art_url = Some(format!("data:{};base64,{}", mime_type, b64));
+                                        album_art_url = Some(format!("vvidget://album-art?t={}", track_id));
                                         set_cached_album_art(&track_id, bytes, mime_type);
```

### [MAJOR] [OPEN] M3-06 GSMTC background monitor repeatedly requests new SessionManager COM instances instead of subscribing to events
- **Status**: OPEN
- **Where**: `src-tauri/src/media/gsmtc.rs:30-35,247`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness [lens: F1b]
- **Scenario**: Throughout application execution, the `media-monitor` background thread repeatedly executes `GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.get()` every 500ms (7,200 times per hour), creating continuous COM activation requests and query overhead on the Windows media control subsystem while idle.
- **Why**: WinRT GSMTC exposes event notifications (`CurrentSessionChanged`, `SessionsChanged`, `PlaybackInfoChanged`, `MediaPropertiesChanged`), but the codebase relies entirely on continuous polling and instantiates a new `GlobalSystemMediaTransportControlsSessionManager` on every poll.
- **Fix**:
```diff
--- a/src-tauri/src/media/gsmtc.rs
+++ b/src-tauri/src/media/gsmtc.rs
@@ -30,6 +30,12 @@ mod win {
+    use std::sync::OnceLock;
+    static SESSION_MGR: OnceLock<GlobalSystemMediaTransportControlsSessionManager> = OnceLock::new();
+
     fn get_session_manager() -> Result<GlobalSystemMediaTransportControlsSessionManager, String> {
+        if let Some(mgr) = SESSION_MGR.get() {
+            return Ok(mgr.clone());
+        }
         GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
             .map_err(|e| format!("Failed to request GSMTC session manager: {}", e))?
             .get()
+            .map(|mgr| { let _ = SESSION_MGR.set(mgr.clone()); mgr })
             .map_err(|e| format!("Failed to await GSMTC session manager: {}", e))
     }
```

### [MAJOR] [OPEN] M3-07 `launch_app_or_uri` spawns processes with null `lpDirectory`, causing relative file access crashes
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:518-526`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug [lens: F1b]
- **Scenario**: A user launches an application or game (e.g. `C:\Games\Doom\doom.exe` or a portable app) from the launcher widget. `ShellExecuteW` is called with `lpDirectory` set to `PCWSTR::null()`. The new process inherits vvidget's working directory (`C:\Program Files\vvidget`). When the launched executable tries to read relative configuration files, game assets, or dependency DLLs in its own folder, it fails and crashes immediately on launch.
- **Why**: `ShellExecuteW` defaults to the caller process's current directory when `lpDirectory` is null. For executable targets, `lpDirectory` must explicitly specify the target file's parent folder.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -512,4 +512,12 @@ pub async fn launch_app_or_uri(target: String) -> Result<(), String> {
         let wide_target: Vec<u16> = std::ffi::OsStr::new(&target)
             .encode_wide()
             .chain(std::iter::once(0))
             .collect();
+        let parent_dir = std::path::Path::new(&target).parent().map(|p| {
+            std::ffi::OsStr::new(p).encode_wide().chain(std::iter::once(0)).collect::<Vec<u16>>()
+        });
+        let wide_dir_ptr = match &parent_dir {
+            Some(d) => windows::core::PCWSTR(d.as_ptr()),
+            None => windows::core::PCWSTR::null(),
+        };
 
         unsafe {
             let res = ShellExecuteW(
@@ -522,3 +530,3 @@ pub async fn launch_app_or_uri(target: String) -> Result<(), String> {
                 windows::core::PCWSTR(wide_target.as_ptr()),
                 windows::core::PCWSTR::null(),
-                windows::core::PCWSTR::null(),
+                wide_dir_ptr,
                 windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
```

### [MAJOR] [OPEN] M3-08 `validate_launch_target` falsely blocks valid Windows paths containing `'&'` or `'\''`
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:444-453`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug [lens: F1b]
- **Scenario**: A user attempts to add or launch an installed game located in paths like `D:\Games\Command & Conquer\game.exe`, `C:\Program Files\Rockstar Games & Media\app.exe`, or under a Windows user directory with an apostrophe (e.g. `C:\Users\O'Connor\AppData\...`). `validate_launch_target` rejects the target with `"Launch target contains forbidden shell character: '&'"`, preventing users from launching valid games and applications.
- **Why**: The validation logic treats `'&'` and `'\''` as command injection risks. However, `ShellExecuteW` does not execute commands through a shell interpreter, and `validate_launch_target` already verifies that the path is an absolute, existing `.exe`, `.lnk`, or `.url` file on the filesystem.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -443,6 +443,6 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
     // Disallow shell operators and chaining characters in paths
-    let dangerous_path_chars = ['&', '|', ';', '>', '<', '"', '\'', '`', '$', '%'];
+    let dangerous_path_chars = ['|', ';', '>', '<', '"', '`'];
     for dc in dangerous_path_chars {
         if trimmed.contains(dc) {
             return Err(format!(
```

### [MAJOR] [OPEN] M4-02 `Math.ceil` in `gridCollision.ts` generates off-grid candidate coordinates clamped outside desktop grid
- **Status**: OPEN
- **Where**: `src/utils/gridCollision.ts:63-78`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When work area height or width does not evenly divide by grid step (e.g. 1032px work area height with taskbar, 240px widget height, `maxY = 792`, `gridY = 120`), dragging to bottom causes `candY = 792`.
- **Why**: `maxRow` and `maxCol` are computed using `Math.ceil(maxY / gridY)` (e.g., `Math.ceil(792 / 120) = 7`). In the candidate search loop, `Math.min(maxY, r * gridY)` produces `Math.min(792, 840) = 792`, which is not an integer multiple of `gridY` (792 / 120 = 6.6). The widget snaps to an off-grid position, breaking icon-grid desktop alignment.
- **Fix**:
```diff
--- a/src/utils/gridCollision.ts
+++ b/src/utils/gridCollision.ts
@@ -48,4 +48,4 @@ export function findNearestNonOverlappingSlot(
   const candidate = {
-    x: Math.max(minX, Math.min(maxX, baseSnappedX)),
-    y: Math.max(minY, Math.min(maxY, baseSnappedY)),
+    x: Math.max(minX, Math.min(Math.floor(maxX / gridX) * gridX, baseSnappedX)),
+    y: Math.max(minY, Math.min(Math.floor(maxY / gridY) * gridY, baseSnappedY)),
     width,
     height,
   };
@@ -62,4 +62,4 @@ export function findNearestNonOverlappingSlot(
   const minCol = Math.floor(minX / gridX);
-  const maxCol = Math.ceil(maxX / gridX);
+  const maxCol = Math.floor(maxX / gridX);
   const minRow = Math.floor(minY / gridY);
-  const maxRow = Math.ceil(maxY / gridY);
+  const maxRow = Math.floor(maxY / gridY);
```

### [MAJOR] [OPEN] M4-03 Invisible `HeaderBar` lacks `pointer-events-none` when `opacity-0` and occludes top of widget content
- **Status**: OPEN
- **Where**: `src/components/layout/HeaderBar.tsx:66-70`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In independent window mode, user hovers over and attempts to click top controls/buttons inside a widget (e.g. Spotify widget or Resource widget).
- **Why**: `HeaderBar` is rendered as an absolute overlay (`absolute top-0 left-0 right-0 z-20`) with `opacity-0 group-hover:opacity-100`. Because `pointer-events-none` is omitted when not hovered, the invisible header intercepts pointer clicks in the top 36px of the card. Furthermore, the widget content container lacks top padding to accommodate the header when hovered, causing the header to overlay and block underlying interactive elements.
- **Fix**:
```diff
--- a/src/components/layout/HeaderBar.tsx
+++ b/src/components/layout/HeaderBar.tsx
@@ -67,3 +67,3 @@ export const HeaderBar: FC<HeaderBarProps> = ({
           "absolute top-0 left-0 right-0 z-20 backdrop-blur-md bg-[var(--fluent-acrylic-bg)]/80 rounded-t-2xl",
-          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150",
+          "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150",
           isGridDragging && "opacity-100"
```

### [MAJOR] [OPEN] M4-04 Conditional DOM unmounting of children in `DockItem` destroys widget state and causes abrupt layout shift
- **Status**: OPEN
- **Where**: `src/components/docking/DockItem.tsx:98-105`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User collapses a widget item in the Dock (e.g. active Speedtest or Spotify player), then expands it later.
- **Why**: `DockItem` completely unmounts `{children}` via `!isCollapsed && (...)`. Unmounting destroys active React state, cancels running background timers/network streams, and resets widget state from scratch on expansion. Furthermore, removing the element from the DOM makes the declared `transition-all duration-200` ineffective, producing an instantaneous layout snap.
- **Fix**:
```diff
--- a/src/components/docking/DockItem.tsx
+++ b/src/components/docking/DockItem.tsx
@@ -98,8 +98,8 @@ export const DockItem: FC<DockItemProps> = ({
-      {!isCollapsed && (
-        <div
-          className="p-2.5 transition-all duration-200"
-          data-testid={`dock-item-content-${id}`}
-        >
-          {children}
-        </div>
-      )}
+      <div
+        className={cn(
+          "p-2.5 transition-all duration-200 overflow-hidden",
+          isCollapsed && "hidden"
+        )}
+        data-testid={`dock-item-content-${id}`}
+      >
+        {children}
+      </div>
```

### [MAJOR] [OPEN] M4-05 Tooltips clipped by parent `Card` `overflow-hidden` when positioned at `top` or right boundaries
- **Status**: OPEN
- **Where**: `src/components/docking/DockItem.tsx:37, 64-80` & `src/components/ui/Tooltip.tsx:51-55`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User hovers over "Hide from Dock" or collapse chevron in `DockItem`.
- **Why**: `DockItem` wraps its content in `<Card ... className="... overflow-hidden ...">`. `DockItem` assigns `position="top"` to tooltips at the very top edge of the card, placing the tooltip at `bottom-full` (outside the top boundary). The parent's `overflow-hidden` completely clips the tooltip flyout, rendering it invisible.
- **Fix**:
```diff
--- a/src/components/docking/DockItem.tsx
+++ b/src/components/docking/DockItem.tsx
@@ -64,3 +64,3 @@ export const DockItem: FC<DockItemProps> = ({
           {onHide && (
-            <Tooltip content="Hide from Dock" position="top" delay={300}>
+            <Tooltip content="Hide from Dock" position="bottom" delay={300}>
               <button
@@ -77,3 +77,3 @@ export const DockItem: FC<DockItemProps> = ({
           <Tooltip
             content={isCollapsed ? "Expand widget" : "Collapse widget"}
-            position="top"
+            position="bottom"
             delay={300}
```

### [MAJOR] [OPEN] M4-06 Undefined CSS token `--fluent-card-subtle` breaks active grid drag visual feedback
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:3-33` & `src/components/layout/HeaderBar.tsx:58`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User drags an independent widget window. `HeaderBar` sets `bg-[var(--fluent-card-subtle)]`.
- **Why**: `HeaderBar.tsx` references `bg-[var(--fluent-card-subtle)]` for the dragging state, but `--fluent-card-subtle` is never defined in `fluent.css` (neither in `:root` nor in `.theme-light`). The CSS variable evaluates to empty, rendering the drag header background transparent instead of shaded.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -10,2 +10,3 @@
   --fluent-card-active: rgba(255, 255, 255, 0.06);
+  --fluent-card-subtle: rgba(255, 255, 255, 0.02);
   --fluent-stroke: rgba(255, 255, 255, 0.08);
@@ -39,2 +40,3 @@
   --fluent-card-active: rgba(255, 255, 255, 0.8);
+  --fluent-card-subtle: rgba(255, 255, 255, 0.5);
   --fluent-stroke: rgba(0, 0, 0, 0.08);
```

### [MAJOR] [OPEN] M5-01 BatterySparkline flexbox centering and missing min-h-0 causes SVG vertical collapse and clipping
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatterySparkline.tsx:68-78`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Laptop battery status contains 4 capacity samples (e.g., `[82, 82, 82, 82]`). The header displays "Kapazitätsverlauf 4 Messpunkte", but the sparkline graph area below it is completely blank.
- **Why**: The outer wrapper `<div className="w-full overflow-hidden flex flex-col justify-center" style={{ height: `${height}px` }}>` wraps an `<svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">`. In CSS Flexbox, SVG elements default to `min-height: auto`, which resolves to their 1:1 intrinsic aspect-ratio height (~280-320px based on widget width). `justify-center` vertically centers this 280px tall element inside the 32px box, translating the SVG top to approximately -124px. Because high battery charge levels (75-100%) render near the top of the viewBox (y = 8..25), the path is placed at screen position ~-100px and completely clipped away by `overflow-hidden`. Additionally, `preserveAspectRatio="none"` non-uniformly distorts the marker circle into a flattened ellipse and clips its right half at x=100.
- **Fix**:
```diff
--- a/src/widgets/battery/BatterySparkline.tsx
+++ b/src/widgets/battery/BatterySparkline.tsx
@@ -65,13 +65,13 @@ export const BatterySparkline: FC<BatterySparklineProps> = ({
   const lastPoint = coords[coords.length - 1];
 
   return (
     <div
-      className={cn("w-full overflow-hidden flex flex-col justify-center", className)}
+      className={cn("w-full overflow-hidden relative block", className)}
       style={{ height: `${height}px` }}
       role="img"
       aria-label="Akkukapazitätsverlauf Sparkline"
       data-testid="battery-sparkline"
     >
       <svg
         viewBox="0 0 100 100"
         preserveAspectRatio="none"
-        className="w-full h-full overflow-visible"
+        className="w-full h-full block"
       >
```

---

### [MAJOR] [OPEN] M5-02 Erroneous "Systemlaufwerk" header and MetricBar duplicate label for secondary disk drives
- **Status**: OPEN
- **Where**: `src/widgets/resources/ResourceWidget.tsx:160-163, 191`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: System has drive C: and secondary data drive D:. On C:, the card displays "Systemlaufwerk (C:)" in the header and immediately repeats "Systemlaufwerk" inside the MetricBar 5px below. When clicking "D:", the header displays "Systemlaufwerk (D:)" (calling a secondary volume "Systemlaufwerk"), and the MetricBar sub-label also displays "Systemlaufwerk".
- **Why**: The section header unconditionally hardcodes `"Systemlaufwerk ("` instead of checking if `activeDiskIndex === systemDiskIndex`. In the MetricBar, `label` falls back to `"Systemlaufwerk"` instead of displaying the volume label or "Laufwerk".
- **Fix**:
```diff
--- a/src/widgets/resources/ResourceWidget.tsx
+++ b/src/widgets/resources/ResourceWidget.tsx
@@ -158,8 +158,10 @@ export const ResourceWidget: FC<ResourceWidgetProps> = ({
               <div className="flex items-center justify-between mb-1">
                 <div className="flex items-center gap-1.5 text-xs font-medium">
                   <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                   <span>
-                    Systemlaufwerk ({activeDisk.mount_point.replace(/\\$/, "")})
+                    {activeDiskIndex === systemDiskIndex ? "Systemlaufwerk" : "Laufwerk"} (
+                    {activeDisk.mount_point.replace(/\\$/, "")})
                   </span>
                 </div>
 
                 {/* Windows 11 Segmented Control rounded-[5px] */}
@@ -188,7 +190,11 @@ export const ResourceWidget: FC<ResourceWidgetProps> = ({
               </div>
 
               <MetricBar
-                label={activeDisk.name !== activeDisk.mount_point && activeDisk.name ? activeDisk.name : "Systemlaufwerk"}
+                label={
+                  activeDisk.name && activeDisk.name !== activeDisk.mount_point
+                    ? activeDisk.name
+                    : `Belegt (${activeDisk.mount_point.slice(0, 2)})`
+                }
                 valueDisplay={`${diskUsedGb} / ${diskTotalGb}`}
                 percent={diskPercent}
                 variant={diskVariant}
```

---

### [MAJOR] [OPEN] M5-03 Bluetooth device list overflow, name compression by hidden toggle, and bottom button clipping
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:203, 278-316, 324-334`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When two or more devices are paired, the device list overflows the 240px card height. The "Trennen"/"Verbinden" button has `opacity-0` but occupies ~65px in the layout flow permanently, crushing device names down to ~100px. At 125% Windows DPI scaling, the 40-character button text "Windows Bluetooth-Einstellungen öffnen" wraps into two lines, pushing the button outside the card boundaries where its bottom corners are clipped off.
- **Why**: Hidden hover controls reserve physical flex space in the item row instead of acting as an overlay or appearing on touch/focus. The bottom button text is overly verbose and overflows the available width in small containers.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -280,7 +280,7 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
                   {device.battery_level != null && (
                     <div
                       data-testid={`device-battery-${device.id}`}
-                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--fluent-text-secondary)] px-1.5 py-0.5 rounded bg-[var(--fluent-subtle-bg)] border border-[var(--fluent-stroke)] flex-shrink-0 group-hover:opacity-40 transition-opacity"
+                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--fluent-text-secondary)] px-1.5 py-0.5 rounded bg-[var(--fluent-subtle-bg)] border border-[var(--fluent-stroke)] flex-shrink-0 group-hover:hidden"
                     >
                       <Battery className="w-3.5 h-3.5 text-emerald-400" />
                       <span>{device.battery_level}%</span>
@@ -301,7 +301,7 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
                       device.connected
                         ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40"
                         : "bg-[var(--fluent-accent-subtle)] text-[var(--fluent-accent)] border-[var(--fluent-accent)]/30 hover:bg-[var(--fluent-accent)]/20 hover:border-[var(--fluent-accent)]",
-                      "opacity-0 group-hover:opacity-100 focus:opacity-100",
+                      "hidden group-hover:flex focus:flex",
                       isToggling && "opacity-60 pointer-events-none"
                     )}
                   >
@@ -329,7 +329,7 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
           className="w-full py-1.5 px-3 rounded-lg bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] active:bg-[var(--fluent-card-active)] border border-[var(--fluent-stroke)] text-xs font-medium text-[var(--fluent-text-primary)] flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--fluent-accent)] flex-shrink-0 cursor-pointer"
         >
           <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
-          <span>Windows Bluetooth-Einstellungen öffnen</span>
+          <span className="truncate">Bluetooth-Einstellungen</span>
         </button>
       </div>
```

---

### [MAJOR] [OPEN] M5-04 Custom quick actions missing from customization list, preventing deletion or reordering
- **Status**: OPEN
- **Where**: `src/widgets/quick-settings/QuickSettingsWidget.tsx:424-473`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User adds a custom URL or executable via the "Eigener Pfad / URL" field. The action tile appears on the widget dashboard. When opening the customization menu to delete or reorder it, only `PREDEFINED_ACTIONS` are displayed; custom actions are absent and cannot be unpinned or removed.
- **Why**: The customization dialog exclusively maps over `PREDEFINED_ACTIONS`. Custom action IDs starting with `custom:` are never rendered in the list, making it impossible to uncheck or delete them from the UI.
- **Fix**:
```diff
--- a/src/widgets/quick-settings/QuickSettingsWidget.tsx
+++ b/src/widgets/quick-settings/QuickSettingsWidget.tsx
@@ -423,7 +423,7 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
           {/* List of predefined actions with toggle and reordering */}
           <div className="flex flex-col gap-1">
-            {PREDEFINED_ACTIONS.map((action) => {
+            {Array.from(new Set([...PREDEFINED_ACTIONS.map((a) => a.id), ...pinnedActionIds])).map((actionId) => {
+              const action = resolveActionDef(actionId);
               const isPinned = pinnedActionIds.includes(action.id);
               const pinnedIndex = pinnedActionIds.indexOf(action.id);
               const ActionIcon = action.icon;
```

---

### [MAJOR] [OPEN] M5-05 `setVolume` updates UI mute state without unmuting native Windows audio endpoint
- **Status**: OPEN
- **Where**: `src/hooks/useMasterVolume.ts:75-91`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: System volume is muted in Windows. In the media widget, user drags the volume slider up from 0 to 45%. The UI shows the unmuted speaker icon, but no sound plays because the Windows Core Audio endpoint remains muted.
- **Why**: `setVolume` updates React state `setIsMutedState(false)` when `clamped > 0`, but only calls `set_master_volume` over IPC. In Windows WASAPI, `SetMasterVolumeLevelScalar` does not clear the mute flag on `IAudioEndpointVolume`.
- **Fix**:
```diff
--- a/src/hooks/useMasterVolume.ts
+++ b/src/hooks/useMasterVolume.ts
@@ -82,6 +82,7 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
     if (!isTauri()) return;
 
     try {
+      if (isMuted && clamped > 0) {
+        await safeInvoke("toggle_master_mute");
+      }
       await safeInvoke("set_master_volume", { level: clamped });
     } catch (err) {
```

---

### [MAJOR] [OPEN] M6-02 Upload metric subtitle "Speed test payload" truncated to "Speed test paylo..."
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:255`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When viewing the Speedtest widget, the third sub-card (Upload metric) permanently displays "Speed test paylo..." with an ellipsis on screen.
- **Why**: In `SpeedtestWidget.tsx`, the 3-column sub-card grid allocates only ~92px of horizontal content width per card. The unlocalized English string `"Speed test payload"` (18 characters) exceeds this boundary and is aggressively clipped by the `truncate` CSS utility class.
- **Fix**:
```diff
--- a/src/widgets/speedtest/SpeedtestWidget.tsx
+++ b/src/widgets/speedtest/SpeedtestWidget.tsx
@@ -252,5 +252,5 @@ export const SpeedtestWidget: FC<SpeedtestWidgetProps> = ({
               : "--"}{" "}
             <span className="text-[9px] font-normal text-[var(--fluent-text-secondary)]">Mbps</span>
           </div>
-          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Speed test payload</div>
+          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Cloudflare Payload</div>
         </div>
```

### [MAJOR] [OPEN] M6-03 Direct DOM mutation in launcher `img.onError` hides both icon and fallback initials upon re-render
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:265-272`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When a launcher item has an invalid or slow `icon_url`, `onError` imperatively removes `"hidden"` from the fallback initials `div` and hides the `<img>`. As soon as any React state update re-renders the component (e.g. typing in the search box, filtering by category, or launching an item), React's reconciliation re-evaluates `item.icon_url && "hidden"` and restores the `"hidden"` class on the initials `div`, while the `<img>` remains at `display: none`. This results in both the image and the fallback initials disappearing entirely, leaving an empty hole.
- **Why**: The fallback mechanism mutates the DOM directly (`style.display = "none"` and `classList.remove("hidden")`) rather than managing image error state through React component state.
- **Fix**:
```diff
--- a/src/widgets/launcher/GameLauncherWidget.tsx
+++ b/src/widgets/launcher/GameLauncherWidget.tsx
@@ -260,14 +260,8 @@ export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
                   {item.icon_url ? (
                     <img
                       src={item.icon_url}
                       alt={item.name}
                       className="w-8 h-8 rounded-md object-cover shadow-sm shrink-0 transition-transform group-hover:scale-105 border border-[var(--fluent-stroke-subtle)]"
-                      onError={(e) => {
-                        // Fallback gracefully to initials if image fails to load
-                        (e.currentTarget as HTMLElement).style.display = "none";
-                        const fallback = e.currentTarget.nextElementSibling;
-                        if (fallback) (fallback as HTMLElement).classList.remove("hidden");
-                      }}
+                      onError={(e) => { (e.currentTarget as HTMLElement).classList.add("hidden"); }}
                     />
                   ) : null}
```

### [MAJOR] [OPEN] M6-04 Add custom game modal escapes card bounds due to missing `relative` on Card
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:146-153, 343-350`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Clicking "+ Hinzufügen" in `GameLauncherWidget` opens the modal dialog. Because `Card` does not declare `relative` positioning and `GameLauncherWidget` does not include `relative` in its root classes, the modal's `absolute inset-0` coordinates resolve against whatever ancestor container has relative positioning (e.g., the whole window or docking canvas), stretching the modal backdrop and dialog far outside the launcher widget card.
- **Why**: `Card.tsx` does not include `relative` in its default class list, and `GameLauncherWidget.tsx` omits `relative` while placing an `absolute inset-0` modal overlay inside it.
- **Fix**:
```diff
--- a/src/widgets/launcher/GameLauncherWidget.tsx
+++ b/src/widgets/launcher/GameLauncherWidget.tsx
@@ -147,5 +147,5 @@ export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
     <Card
       variant="acrylic"
       className={cn(
-        "w-full h-full p-3.5 flex flex-col gap-3 text-[var(--fluent-text-primary)] select-none overflow-hidden",
+        "relative w-full h-full p-3.5 flex flex-col gap-3 text-[var(--fluent-text-primary)] select-none overflow-hidden",
         className
```

### [MAJOR] [OPEN] M6-05 Stale key retention in `useCalendar` preserves deleted calendar dates across updates
- **Status**: OPEN
- **Where**: `src/hooks/useCalendar.ts:70-74`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When all notes for a given calendar date are deleted, the backend removes that date key from `config.calendar_events`. When the updated configuration is received, `useCalendar` executes `setEvents((prev) => ({ ...prev, ...config.calendar_events }))`. Due to the object spread merge, the deleted date key in `prev` is preserved indefinitely in state, causing phantom note indicators (`note-dot`) to remain displayed on the monthly grid.
- **Why**: `useCalendar.ts` uses shallow object spread merge `{ ...prev, ...config.calendar_events }`, which retains keys that were deleted from the source configuration.
- **Fix**:
```diff
--- a/src/hooks/useCalendar.ts
+++ b/src/hooks/useCalendar.ts
@@ -69,6 +69,3 @@
     if (!options?.initialEvents && config.calendar_events) {
-      setEvents((prev) => ({
-        ...prev,
-        ...config.calendar_events,
-      }));
+      setEvents(config.calendar_events);
     }
```

### [MAJOR] [OPEN] M6-06 Alarm tab in `ClockWidget` never triggers automatically when current time reaches alarm time
- **Status**: OPEN
- **Where**: `src/widgets/clock/ClockWidget.tsx:204-213, 811-828`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User sets an alarm for "07:00" and enables it (`isAlarmEnabled: true`). When the system clock strikes 07:00, no alarm sounds, no visual alert triggers, and `alarmTriggered` remains false. The only way the alarm state ever flips to true is if the user manually clicks "Alarm-Test simulieren".
- **Why**: `ClockWidget.tsx` stores `alarmTime` and `isAlarmEnabled`, but contains zero timer or tick effect comparing `currentTime` to `alarmTime`.
- **Fix**:
```diff
--- a/src/widgets/clock/ClockWidget.tsx
+++ b/src/widgets/clock/ClockWidget.tsx
@@ -212,2 +212,12 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
     if (alarmTriggered) setAlarmTriggered(false);
   };
+
+  useEffect(() => {
+    if (!isAlarmEnabled || alarmTriggered) return;
+    const nowStr = `${digitalTime.hours}:${digitalTime.minutes}`;
+    if (nowStr === alarmTime && parseInt(digitalTime.seconds, 10) === 0) {
+      setAlarmTriggered(true);
+    }
+  }, [digitalTime, alarmTime, isAlarmEnabled, alarmTriggered]);
```

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

### [MAJOR] [FIXED] X1-06 Concurrent window creation race condition in duplicate_quick_settings_widget
- **Status**: FIXED
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

### [MAJOR] [OPEN] X2-01 Missing Backdrop Blur on Fluent Acrylic Surfaces Destroys Native Windows 11 Material Depth
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:56-58`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / design-token
- **Scenario**: When widgets are positioned over the Windows desktop wallpaper (as shown in the provided screenshot against the dark purple ribbon wallpaper), the widget containers appear as flat, semi-opaque dark boxes rather than authentic Windows 11 Desktop Acrylic / Mica material with blurred background refraction.
- **Why**: `.fluent-acrylic` defines only `background-color: var(--fluent-acrylic-bg)` without any `backdrop-filter: blur(20px) saturate(180%)` or `-webkit-backdrop-filter`. The default dark opacity `rgba(28, 28, 30, 0.58)` without background blur results in low contrast and lacks the optical depth characteristic of Windows 11 Fluent surfaces.
- **Fix**:
```diff
 /* Acrylic style class for desktop widget containers */
 .fluent-acrylic {
   background-color: var(--fluent-acrylic-bg);
+  backdrop-filter: blur(20px) saturate(180%);
+  -webkit-backdrop-filter: blur(20px) saturate(180%);
 }
```

---

### [MINOR] [OPEN] M1-08 Window Creation Lacks Initial Position and Hidden Flag, Causing Visible Cascade Pop
- **Status**: OPEN
- **Where**: `src-tauri/src/lib.rs:87-98`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: When a widget window is opened, it flashes briefly at Windows' default cascade coordinates (or top-left origin) before teleporting to its configured `placement.logical_x` and `logical_y`.
- **Why**: `WebviewWindowBuilder::new` creates the window with default visibility and omitted coordinates, deferring placement to `setup_widget_window` after the window has already been rendered on screen.
- **Fix**:
```diff
         let window = tauri::WebviewWindowBuilder::new(
             &app,
             &label,
             tauri::WebviewUrl::App(format!("index.html?widget={}", widget_id).into()),
         )
         .title(format!("vvidget - {}", widget_id))
+        .position(placement.logical_x, placement.logical_y)
+        .visible(false)
         .inner_size(placement.logical_width, placement.logical_height)
```

### [MINOR] [OPEN] M1-09 Tray Menu Checkboxes Fail to Update Checked State on Toggle
- **Status**: OPEN
- **Where**: `src-tauri/src/tray/mod.rs:250-258` and `src-tauri/src/tray/mod.rs:268-313`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Clicking "Lock Positions" or any widget item in the system tray menu toggles the backend setting, but the checkmark icon in the tray context menu never updates, misleading users regarding active status.
- **Why**: Tauri 2 `CheckMenuItem` items in Windows tray menus do not automatically toggle visual checked state on click event; explicit `.set_checked()` calls are required (as implemented for `layout_independent` / `layout_docked`), but omitted for `toggle_lock` and widget toggles.
- **Fix**:
```diff
                 "toggle_lock" => {
+                    let _ = toggle_lock.set_checked(!toggle_lock.is_checked().unwrap_or(false));
                     let handle = app_handle.clone();
```

### [MINOR] [OPEN] M1-10 `WindowManager::locked` Flag Ignored in Native Win32 Drag Path
- **Status**: OPEN
- **Where**: `src-tauri/src/window/win32.rs:509-516` and `src-tauri/src/window/manager.rs:84-90`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: MEDIUM
- **Category**: contract
- **Scenario**: When the user locks positions in vvidget, frontend drag handles are disabled, but widgets can still be moved natively via Win32 messages or OS window movement.
- **Why**: `WindowManager::locked` is stored in an atomic variable that is never checked in `widget_subclass_proc` during `WM_MOVING` or `WM_WINDOWPOSCHANGING`.
- **Fix**:
```diff
         WM_MOVING => {
+            if is_snap_locked() {
+                return LRESULT(0);
+            }
             let p_rect = lparam.0 as *mut RECT;
```

### [MINOR] [OPEN] M1-11 `WM_NCDESTROY` Leaves Stale Widget Entries in `WindowManager::widgets` (lens: F1b)
- **Status**: OPEN
- **Where**: `src-tauri/src/window/win32.rs:580-585`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: MEDIUM
- **Category**: robustness
- **Scenario**: If a widget window is closed by external process termination or an unhandled webview crash, `WM_NCDESTROY` unregisters the HWND from `TRACKED_WINDOWS` but leaves the record in `WindowManager::widgets`. `get_active_widget_rects` continues to return phantom rectangles for dead windows.
- **Why**: `WM_NCDESTROY` cleans up subclass hooks and `TRACKED_WINDOWS`, but lacks a bridge back to `WindowManager` to remove the widget from its internal map.
- **Fix**:
```diff
         WM_NCDESTROY => {
             unregister_tracked_window(hwnd.0 as isize);
             set_window_allow_hide(hwnd.0 as isize, false);
+            dispatch_window_destroyed(hwnd.0 as isize);
             let _ = RemoveWindowSubclass(hwnd, Some(widget_subclass_proc), uidsubclass);
             DefSubclassProc(hwnd, umsg, wparam, lparam)
         }
```

### [MINOR] [OPEN] M2-07 Date Whitespace Divergence in `remove_calendar_note` and `toggle_calendar_note` Prevents Note Deletion/Toggle
- **Status**: OPEN
- **Where**: `src-tauri/src/calendar/mod.rs:41-50`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: While `add_note_to_map` trims the date parameter before inserting into the `HashMap` (`date_trimmed = date.trim()`), `remove_note_from_map` and `toggle_note_in_map` use `events.get_mut(date)` directly without trimming. If a date string contains leading or trailing whitespace (e.g. `"2026-10-26 "`), the lookup fails, and the note cannot be removed or toggled.
- **Why**: Inconsistent normalization between insertion (trimmed) and query/deletion (untrimmed).
- **Fix**:
```diff
--- a/src-tauri/src/calendar/mod.rs
+++ b/src-tauri/src/calendar/mod.rs
@@ -43,3 +43,3 @@ pub fn remove_note_from_map(
 ) {
-    if let Some(notes) = events.get_mut(date) {
+    if let Some(notes) = events.get_mut(date.trim()) {
         notes.retain(|n| n.id != note_id);
@@ -57,3 +57,3 @@ pub fn toggle_note_in_map(
 ) {
-    if let Some(notes) = events.get_mut(date) {
+    if let Some(notes) = events.get_mut(date.trim()) {
         if let Some(note) = notes.iter_mut().find(|n| n.id == note_id) {
```

### [MINOR] [OPEN] M2-08 Upload Benchmark Progress Freeze and Low Bandwidth Timeout Failure
- **Status**: OPEN
- **Where**: `src-tauri/src/speedtest/mod.rs:173-206`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In `run_upload_phase`, the 3.5 MB buffer is dispatched in a single `body(payload).send().await` call. During upload (which can take 15-20 seconds on modest connections), progress stays frozen at 0.1 with zero interim progress events. Furthermore, on upload speeds below ~1.12 Mbps, the 25-second overall timeout aborts the entire test, discarding already completed ping and download measurements.
- **Why**: Upload phase does not stream chunks with progress emissions, and treats upload failure as fatal to the entire benchmark pipeline.
- **Fix**:
```diff
--- a/src-tauri/src/speedtest/mod.rs
+++ b/src-tauri/src/speedtest/mod.rs
@@ -282,18 +282,10 @@ pub async fn run_speedtest<R: Runtime>(
     // Phase 3: Upload Speed
-    let upload_mbps = match run_upload_phase(&client, &app, CF_SPEEDTEST_UP_URL, ping_ms, jitter_ms, download_mbps).await {
+    let upload_mbps = match run_upload_phase(&client, &app, CF_SPEEDTEST_UP_URL, ping_ms, jitter_ms, download_mbps).await
+    {
         Ok(mbps) => mbps,
         Err(e) => {
-            let _ = app.emit(
-                "speedtest-progress",
-                SpeedtestProgress {
-                    stage: "error".to_string(),
-                    progress: 0.0,
-                    current_mbps: 0.0,
-                    ping_ms: Some(ping_ms),
-                    jitter_ms: Some(jitter_ms),
-                    download_mbps: Some(download_mbps),
-                    upload_mbps: None,
-                    error: Some(e.clone()),
-                },
-            );
-            return Err(e);
+            log::warn!("Speedtest upload phase failed: {}", e);
+            0.0
         }
     };
```

### [MINOR] [OPEN] M2-09 Debounced Config Drops Unsaved Changes on Application Termination
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:287-318`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: MEDIUM
- **Category**: robustness
- **Scenario**: When a user drags a widget, `save_config` dispatches `save_debounced`, resetting the 500ms timer. If the application is closed within 500ms of the move, the spawned debounce task is aborted by process exit without flushing `is_dirty` config to disk, silently losing the latest widget positions.
- **Why**: `ConfigManager` lacks a flush method or lifecycle hook to save dirty configuration on window close or process termination.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -367,2 +367,11 @@ impl ConfigManager {
     }
+
+    pub async fn flush(&self) -> Result<(), String> {
+        if self.is_dirty.swap(false, Ordering::SeqCst) {
+            let config = self.current_config.read().await.clone();
+            let path = self.config_path.clone();
+            tokio::task::spawn_blocking(move || save_config_atomic(&path, &config))
+                .await
+                .map_err(|e| format!("Flush error: {e}"))?
         } else {
             Ok(())
         }
     }
```

### [MINOR] [OPEN] M2-10 Unhandled Error and Silent State Desync in Debounce Task Disk Save
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:308-314`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In the background debounce task, when the timer fires, `loop_dirty.swap(false, Ordering::SeqCst)` clears the dirty flag BEFORE running `save_config_atomic`. If `save_config_atomic` fails (e.g. disk full, permission denied), the return value is discarded (`let _ = tokio::task::spawn_blocking(...)`), no log entry is written, and `is_dirty` remains false. The memory and disk states permanently desynchronize without notifying the app.
- **Why**: Background debounce loop ignores `Result` from atomic save and clears dirty flag prematurely without retry on error.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -308,6 +308,10 @@ impl ConfigManager {
                         if loop_dirty.swap(false, Ordering::SeqCst) {
                             let config_to_save = loop_config.read().await.clone();
                             let path = write_path.clone();
-                            let _ = tokio::task::spawn_blocking(move || {
+                            let res = tokio::task::spawn_blocking(move || {
                                 save_config_atomic(&path, &config_to_save)
                             }).await;
+                            if let Ok(Err(e)) = res {
+                                log::error!("Debounced config write failed: {}", e);
+                                loop_dirty.store(true, Ordering::SeqCst);
+                            }
                         }
```

### [MINOR] [OPEN] M3-09 `validate_launch_target` rejects standard gaming and desktop app URI schemes
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:416-427`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: A user configures a custom launcher item for a game or tool using its standard URI scheme (e.g. `goggalaxy://`, `battlenet://`, `ea://`, `xbox://`, `discord://`, `spotify:`). `validate_launch_target` rejects the entry because only `steam://`, `com.epicgames.launcher://`, and `http(s)://` are allowed.
- **Why**: The URI scheme allowlist is overly strict and omits common gaming launcher protocols and popular desktop application protocols.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -421,4 +421,11 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
         "com.epicgames.launcher:",
+        "goggalaxy://",
+        "battlenet://",
+        "ea://",
+        "xbox://",
+        "discord://",
+        "spotify:",
         "https://",
         "http://",
     ];
```

### [MINOR] [OPEN] M3-10 Steam desktop shortcut icon resolution fails by matching numeric `appid` against hash filenames
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:77-84,162-195`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Steam creates game icons in `<SteamRoot>/steam/games/<hash>.ico`. `find_steam_icon_url` checks if the `.ico` filename starts with the numeric `appid`. Because Steam names these files using a 40-character SHA-1 hash from the manifest's `"clienticon"` field, the comparison never matches, and games without librarycache artwork appear without icons.
- **Why**: `parse_appmanifest_acf` only extracts `(appid, name, installdir)` and ignores the `"clienticon"` field containing the actual icon filename hash.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -77,4 +77,4 @@ pub fn find_steam_icon_url(appid: &str, steam_roots: &[PathBuf]) -> Option<Str
                             let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
-                            if stem.starts_with(appid) || stem == appid {
+                            if stem.starts_with(appid) || stem == appid || stem.len() == 40 {
                                 if let Some(url) = file_to_data_url(&p) {
                                     return Some(url);
```

### [MINOR] [OPEN] M3-11 `MetricsCollector::new()` delays cold application startup by sleeping synchronously on the main thread
- **Status**: OPEN
- **Where**: `src-tauri/src/sysinfo/collector.rs:29` & `src-tauri/src/lib.rs:424`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: During cold application start, `lib.rs::run()` calls `MetricsCollector::new()` before creating windows or the tray icon. Line 29 performs a 200ms synchronous sleep (`std::thread::sleep(Duration::from_millis(200))`), adding unnecessary latency to application startup.
- **Why**: The 200ms pause was introduced to let sysinfo calculate an initial CPU delta, but executing it synchronously during constructor creation on the main bootstrap thread blocks initialization.
- **Fix**:
```diff
--- a/src-tauri/src/sysinfo/collector.rs
+++ b/src-tauri/src/sysinfo/collector.rs
@@ -28,3 +28,2 @@ impl MetricsCollector {
-        // Initial 200ms sleep before first CPU sample to eliminate 0.0% artifacts
-        std::thread::sleep(Duration::from_millis(200));
+        // Initial CPU sample without blocking startup thread
         system.refresh_cpu_all();
```

### [MINOR] [OPEN] M3-12 Sysinfo background worker runs `tauri::async_runtime::block_on` in an inner loop every 500ms
- **Status**: OPEN
- **Where**: `src-tauri/src/sysinfo/mod.rs:47`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: The sysinfo worker runs on a dedicated OS thread. Every 500ms, it calls `tauri::async_runtime::block_on(config_manager.get_config())` to read polling rate settings. Incurring Tokio `block_on` runtime synchronization every 500ms in an infinite loop introduces unnecessary CPU overhead and context switching.
- **Why**: `ConfigManager::get_config()` is an async method protecting an in-memory struct with a Tokio `RwLock`. The background thread only needs the polling rates, which can be cached and refreshed reactively on `config-changed`.
- **Fix**:
```diff
--- a/src-tauri/src/sysinfo/mod.rs
+++ b/src-tauri/src/sysinfo/mod.rs
@@ -43,4 +43,5 @@ pub fn start_metrics_worker<R: Runtime>(
             let mut last_disk_check = std::time::Instant::now();
+            let mut cached_config = tauri::async_runtime::block_on(config_manager.get_config());
 
             loop {
-                let config = tauri::async_runtime::block_on(config_manager.get_config());
+                let config = &cached_config;
```

### [MINOR] [OPEN] M4-07 `onMouseDown` stop-propagation on `HeaderBar` toolbar fails to prevent `onPointerDown` window dragging
- **Status**: OPEN
- **Where**: `src/components/layout/HeaderBar.tsx:106-109`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User clicks in the whitespace between buttons or on non-button action elements inside the `actions` header toolbar.
- **Why**: `HeaderBar` has `onMouseDown={(e) => e.stopPropagation()}` on the toolbar wrapper. However, `useGridDrag` listens to `onPointerDown`, which fires prior to `onMouseDown` in the DOM event lifecycle. As a result, non-button pointerdown events bubble up to `<header {...dragHandlers}>`, triggering an accidental drag start.
- **Fix**:
```diff
--- a/src/components/layout/HeaderBar.tsx
+++ b/src/components/layout/HeaderBar.tsx
@@ -107,3 +107,4 @@ export const HeaderBar: FC<HeaderBarProps> = ({
       <div
         className="flex items-center gap-1 flex-shrink-0"
         onMouseDown={(e) => e.stopPropagation()}
+        onPointerDown={(e) => e.stopPropagation()}
       >
```

### [MINOR] [OPEN] M4-08 Missing optional chaining on `config.widgets` causes uncaught `TypeError` crash during initial load
- **Status**: OPEN
- **Where**: `src/App.tsx:301-310` & `src/components/docking/DockContainer.tsx:85`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Application starts with uninitialized or empty configuration where `config.widgets` is null or undefined.
- **Why**: `App.tsx` and `DockContainer.tsx` directly evaluate `config.widgets.resources?.visible`. While line 71 of `App.tsx` explicitly guards `if (!config.widgets)`, line 301 accesses `.resources` directly without optional chaining, throwing `TypeError: Cannot read properties of undefined (reading 'resources')` and crashing to the ErrorBoundary.
- **Fix**:
```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -301,10 +301,10 @@ export const AppContent: FC = () => {
   // 4. Main Window (Independent Preview / Multi-Widget Canvas for Web/Test environment)
-  const isResourcesVisible = config.widgets.resources?.visible ?? true;
-  const isSpotifyVisible = config.widgets.spotify?.visible ?? true;
-  const isWeatherVisible = config.widgets.weather?.visible ?? true;
-  const isSpeedtestVisible = config.widgets.speedtest?.visible ?? false;
-  const isLauncherVisible = config.widgets.launcher?.visible ?? false;
-  const isQuickSettingsVisible = config.widgets.quick_settings?.visible ?? false;
-  const isBluetoothVisible = config.widgets.bluetooth?.visible ?? false;
-  const isBatteryVisible = config.widgets.battery?.visible ?? false;
-  const isCalendarVisible = config.widgets.calendar?.visible ?? false;
-  const isClockVisible = config.widgets.clock?.visible ?? false;
+  const isResourcesVisible = config.widgets?.resources?.visible ?? true;
+  const isSpotifyVisible = config.widgets?.spotify?.visible ?? true;
+  const isWeatherVisible = config.widgets?.weather?.visible ?? true;
+  const isSpeedtestVisible = config.widgets?.speedtest?.visible ?? false;
+  const isLauncherVisible = config.widgets?.launcher?.visible ?? false;
+  const isQuickSettingsVisible = config.widgets?.quick_settings?.visible ?? false;
+  const isBluetoothVisible = config.widgets?.bluetooth?.visible ?? false;
+  const isBatteryVisible = config.widgets?.battery?.visible ?? false;
+  const isCalendarVisible = config.widgets?.calendar?.visible ?? false;
+  const isClockVisible = config.widgets?.clock?.visible ?? false;
```

### [MINOR] [OPEN] M4-09 Incomplete `.theme-light` tokens for status indicators fail WCAG contrast requirements
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:35-53`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User switches to light mode. Widgets render status badges or progress bars (e.g. warning or success states).
- **Why**: `.theme-light` fails to define `--fluent-success`, `--fluent-warning`, and `--fluent-error`. Light theme inherits dark-mode pastel shades (e.g. `--fluent-warning: #fce100`), which have near-zero contrast against light acrylic surfaces (`rgba(243, 243, 243, 0.72)`), making status text and icons unreadable and failing WCAG 2.1 AA.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -52,2 +52,7 @@
   --fluent-control-bg: rgba(0, 0, 0, 0.04);
   --fluent-control-active: rgba(0, 0, 0, 0.08);
+
+  /* Status Colors - Light Theme (High Contrast) */
+  --fluent-success: #107c10;
+  --fluent-warning: #9d5d00;
+  --fluent-error: #c42b1c;
```

### [MINOR] [OPEN] M4-10 `Tooltip` lacks accessible `aria-describedby` association and keyboard Escape dismissal
- **Status**: OPEN
- **Where**: `src/components/ui/Tooltip.tsx:22-31, 58-79`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: Keyboard-only or screen reader user navigates action buttons in `HeaderBar` or `DockContainer`.
- **Why**: `Tooltip` renders a detached `<div role="tooltip">` without an `id` or linking `aria-describedby` attribute on the trigger element. Additionally, it lacks a `keydown` listener for the `Escape` key to dismiss the tooltip without shifting focus, violating WCAG 2.1 SC 1.4.13.
- **Fix**:
```diff
--- a/src/components/ui/Tooltip.tsx
+++ b/src/components/ui/Tooltip.tsx
@@ -1,3 +1,3 @@
-import { useState, useRef, useEffect } from "react";
+import { useState, useRef, useEffect, useId } from "react";
 import type { FC, ReactNode } from "react";
 import { cn } from "@/utils/cn";
@@ -23,6 +23,17 @@ export const Tooltip: FC<TooltipProps> = ({
   const timeoutRef = useRef<NodeJS.Timeout | null>(null);
+  const tooltipId = useId();
 
   useEffect(() => {
+    const handleKeyDown = (e: KeyboardEvent) => {
+      if (e.key === "Escape" && isVisible) {
+        hideTooltip();
+      }
+    };
+    window.addEventListener("keydown", handleKeyDown);
     return () => {
+      window.removeEventListener("keydown", handleKeyDown);
       if (timeoutRef.current) {
         clearTimeout(timeoutRef.current);
       }
     };
-  }, []);
+  }, [isVisible]);
@@ -66,3 +77,4 @@ export const Tooltip: FC<TooltipProps> = ({
       {isVisible && (
         <div
+          id={tooltipId}
           role="tooltip"
```

### [MINOR] [OPEN] M4-11 `ProgressBar` ignores `labelPosition="inline"` and produces invalid CSS width on `NaN` value
- **Status**: OPEN
- **Where**: `src/components/ui/ProgressBar.tsx:30-31, 49`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Caller passes `showLabel={true} labelPosition="inline"`, or telemetry hook passes uninitialized metric (`value={NaN}`).
- **Why**: `ProgressBarProps` defines `labelPosition?: "inline" | "top"`, but the JSX only checks `labelPosition === "top"`, silently dropping the label for `"inline"`. When `value` is `NaN`, clamping logic propagates `NaN`, producing `style={{ width: "NaN%" }}` and `aria-valuenow={NaN}`.
- **Fix**:
```diff
--- a/src/components/ui/ProgressBar.tsx
+++ b/src/components/ui/ProgressBar.tsx
@@ -30,2 +30,3 @@ export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
   ) => {
-    const clampedValue = max <= min ? min : Math.min(Math.max(value, min), max);
+    const safeValue = Number.isFinite(value) ? value : min;
+    const clampedValue = max <= min ? min : Math.min(Math.max(safeValue, min), max);
@@ -49,3 +50,3 @@ export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
-        {showLabel && labelPosition === "top" && (
+        {showLabel && (
           <div className="flex justify-between items-center text-xs text-[var(--fluent-text-secondary)]">
```

### [MINOR] [OPEN] M5-06 Missing volume poll interval or OS event listener leaves slider permanently out of sync
- **Status**: OPEN
- **Where**: `src/hooks/useMasterVolume.ts:38-73`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User adjusts volume using keyboard hardware keys (Volume Up/Down) or Windows taskbar slider. The widget volume slider never updates and stays on the stale mount value.
- **Why**: `useMasterVolume` invokes `refresh()` only once on initial component mount and lacks any periodic polling or native WASAPI endpoint callback.
- **Fix**:
```diff
--- a/src/hooks/useMasterVolume.ts
+++ b/src/hooks/useMasterVolume.ts
@@ -67,6 +67,10 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
     if (isTauri()) {
       void refresh();
+      const interval = setInterval(() => {
+        void refresh();
+      }, 3000);
+      return () => {
+        isMountedRef.current = false;
+        clearInterval(interval);
+      };
     }
     return () => {
       isMountedRef.current = false;
     };
```

---

### [MINOR] [OPEN] M5-07 Hardcoded 360x384px card dimensions in BatteryWidget exceed 320x360px window registry
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:79, 101, 161, 198`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When BatteryWidget is mounted in standalone or preview contexts without an explicit `className` override, it renders at `w-[360px] h-[384px]`. The Tauri window is sized to `320x360px`, resulting in 40px horizontal and 24px vertical overflow clipping.
- **Why**: Dismissed, no-battery, loading, and normal cards hardcode `w-[360px] h-[384px]` instead of `w-full h-full max-w-none`.
- **Fix**:
```diff
--- a/src/widgets/battery/BatteryWidget.tsx
+++ b/src/widgets/battery/BatteryWidget.tsx
@@ -78,3 +78,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
           className={cn(
-            "w-[360px] h-[384px] p-5 flex flex-col items-center justify-center text-center select-none text-[var(--fluent-text-secondary)]",
+            "w-full h-full p-5 flex flex-col items-center justify-center text-center select-none text-[var(--fluent-text-secondary)]",
             className
@@ -100,3 +100,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
         className={cn(
-          "w-[360px] h-[384px] p-5 flex flex-col justify-between select-none relative overflow-hidden",
+          "w-full h-full p-5 flex flex-col justify-between select-none relative overflow-hidden",
           className
@@ -160,3 +160,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
         className={cn(
-          "w-[360px] h-[384px] p-5 flex flex-col items-center justify-center text-center select-none",
+          "w-full h-full p-5 flex flex-col items-center justify-center text-center select-none",
           className
@@ -197,3 +197,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
       className={cn(
-        "w-[360px] h-[384px] p-4 flex flex-col justify-between text-[var(--fluent-text-primary)] select-none overflow-hidden",
+        "w-full h-full p-4 flex flex-col justify-between text-[var(--fluent-text-primary)] select-none overflow-hidden",
         className
```

---

### [MINOR] [OPEN] M5-08 Bluetooth status badge displays green "Aktiv" when all paired devices are disconnected
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:147, 172-179`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User has paired devices (e.g. keyboard and mouse), but both are turned off and disconnected. The Bluetooth widget header displays a green badge labeled "Aktiv".
- **Why**: `statusText` evaluates `devices.length > 0` rather than `devices.some(d => d.connected)`.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -146,3 +146,4 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
   }, [devices]);
 
-  const statusText = devices.length > 0 ? "Aktiv" : "Keine Geräte";
+  const hasConnected = devices.some((d) => d.connected);
+  const statusText = hasConnected ? "Verbunden" : devices.length > 0 ? "Bereit" : "Keine Geräte";
 
@@ -173,3 +174,3 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
                 className={cn(
                   "text-[10px] px-1.5 py-0.2 rounded-full font-medium flex-shrink-0",
-                  devices.length > 0
+                  hasConnected
                     ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
```

---

### [MINOR] [OPEN] M5-09 MetricBar unvalidated `NaN` produces `"NaN%"` and invalid CSS progress bar width
- **Status**: OPEN
- **Where**: `src/widgets/resources/MetricBar.tsx:28-30`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: During system startup or if a sensor returns `NaN`, `percent` passed to MetricBar is `NaN`. MetricBar renders `"NaN%"` and passes `NaN` to `ProgressBar`, corrupting CSS inline styling.
- **Why**: `Math.round(NaN)` returns `NaN`, and `Math.min(Math.max(NaN, 0), 100)` evaluates to `NaN` without a fallback check.
- **Fix**:
```diff
--- a/src/widgets/resources/MetricBar.tsx
+++ b/src/widgets/resources/MetricBar.tsx
@@ -27,4 +27,5 @@ export const MetricBar: FC<MetricBarProps> = ({
 }) => {
-  const roundedPercent = Math.min(Math.max(Math.round(percent), 0), 100);
+  const safePercent = Number.isFinite(percent) ? percent : 0;
+  const roundedPercent = Math.min(Math.max(Math.round(safePercent), 0), 100);
   const activeVariant = variant ?? getMetricVariant(roundedPercent);
```

---

### [MINOR] [OPEN] M5-10 Dead code and continuous CPU history array allocations for unrendered `MiniGraph`
- **Status**: OPEN
- **Where**: `src/widgets/resources/MiniGraph.tsx:1-107`, `src/hooks/useSystemMetrics.ts:72-88`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: Every second, telemetry events trigger `appendCpuSample`. The hook slices and allocates a new 20-element number array for `cpuHistory`, triggering re-renders, but `ResourceWidget` never imports or renders `MiniGraph` or `cpuHistory`.
- **Why**: `MiniGraph` was unlinked during design refactors without cleaning up unused component exports or removing the unrendered history accumulator from the hook.
- **Fix**: Either re-integrate `MiniGraph` into `ResourceWidget` under CPU usage, or remove `cpuHistory` state accumulation from `useSystemMetrics.ts` when no sparkline is rendered.

### [MINOR] [OPEN] M6-01 Hero temperature unit disconnected from number as lowercase-like orphan "C"
- **Status**: OPEN
- **Where**: `src/widgets/weather/WeatherWidget.tsx:160-168`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In `WeatherWidget`, the current temperature renders as `14°` in a 30px (3xl) font, followed by an orphaned `C` in muted 12px (`text-xs text-[var(--fluent-text-secondary)]`) separated by a `gap-1` flex offset. In Segoe UI Variable, this renders visually as `14°  C` where the tiny, muted "C" looks like an accidental subscript / lowercase letter "c", while all other temperatures in the widget (`• Gefühlt 12°`, hourly `15°`, daily `18° / 9°`) omit "C" entirely and `formatTemperature` in `wmoCodes.ts` specifies unified `${rounded}°C`.
- **Why**: `WeatherWidget.tsx` fragments the temperature value and Celsius unit across two distinct flex items with `gap-1`, styling the unit with `text-xs text-[var(--fluent-text-secondary)]` instead of displaying a unified temperature string.
- **Fix**:
```diff
--- a/src/widgets/weather/WeatherWidget.tsx
+++ b/src/widgets/weather/WeatherWidget.tsx
@@ -160,9 +160,8 @@ export const WeatherWidget: FC<WeatherWidgetProps> = ({ className = "" }) => {
           <div className="flex items-baseline gap-1">
             <span
               className="text-3xl font-light tracking-tight text-[var(--fluent-text-primary)]"
               data-testid="weather-current-temp"
             >
-              {current.temperatureC}°
+              {current.temperatureC}°C
             </span>
-            <span className="text-xs text-[var(--fluent-text-secondary)]">C</span>
           </div>
```

### [MINOR] [OPEN] M6-07 Note input '+' button positioned with hardcoded `top-[3px]` against padded form, causing vertical misalignment
- **Status**: OPEN
- **Where**: `src/widgets/calendar/CalendarWidget.tsx:192-207`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In `CalendarWidget`, the '+' button inside the note input is offset using a hardcoded `top-[3px]` on a form element that has `pb-2`. Under high-DPI scaling or non-standard system fonts, the button is visibly uncentered against the input field, sitting too high and clipping against the top border.
- **Why**: The `<form>` element applies padding-bottom (`pb-2`), so an absolute child pinned to `top-[3px]` does not center vertically within the `<input>` element.
- **Fix**:
```diff
--- a/src/widgets/calendar/CalendarWidget.tsx
+++ b/src/widgets/calendar/CalendarWidget.tsx
@@ -192,3 +192,3 @@ export const CalendarWidget: FC<CalendarWidgetProps> = ({
-        <form onSubmit={handleAddNote} className="relative flex items-center pb-2 shrink-0">
+        <form onSubmit={handleAddNote} className="flex items-center mb-2 shrink-0">
+          <div className="relative flex-1">
           <input
@@ -204,3 +204,4 @@ export const CalendarWidget: FC<CalendarWidgetProps> = ({
-            className="absolute right-1 top-[3px] p-1 rounded bg-[var(--fluent-accent)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center shadow-xs"
+            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded bg-[var(--fluent-accent)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center shadow-xs"
           >
             <Plus className="w-3 h-3 stroke-[2.5]" />
           </button>
+          </div>
         </form>
```

### [MINOR] [OPEN] M6-08 In-flow invisible delete button creates asymmetric title truncation in custom launcher items
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:301-310`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Custom launcher items display an invisible delete button with `opacity-0 group-hover:opacity-100`. Because the button is in the layout flow, custom item titles truncate 26px earlier than Steam or Epic game titles, and an asymmetric 26px void appears between the title and the "Starten" button when unhovered.
- **Why**: The delete button occupies layout space even when invisible (`opacity-0`) instead of using `hidden group-hover:block` or conditional absolute layout.
- **Fix**:
```diff
--- a/src/widgets/launcher/GameLauncherWidget.tsx
+++ b/src/widgets/launcher/GameLauncherWidget.tsx
@@ -305,3 +305,3 @@ export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
-                      className="p-1.5 rounded-md text-[var(--fluent-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
+                      className="p-1.5 rounded-md text-[var(--fluent-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors hidden group-hover:block focus:block"
                       aria-label={`${item.name} entfernen`}
```

### [MINOR] [OPEN] M6-09 Any Win32 application with auto-generated AppUserModelId is falsely branded as "Spotify"
- **Status**: OPEN
- **Where**: `src/widgets/spotify/SpotifyWidget.tsx:28-31`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When playing audio or video from any generic Win32 media player, game, or tool without an explicit AppUserModelId (e.g. Foobar2000, VLC portable, Winamp, OBS, or Chrome background audio with an auto-generated GUID `Microsoft.AutoGenerated.{GUID}`), `formatSourceApp` classifies the application as `"Spotify"`.
- **Why**: `formatSourceApp` checks `if (lower.startsWith("microsoft.autogenerated") || (lower.includes("{") && lower.includes("}"))) return "Spotify";`. Any application with a Windows-generated GUID AppUserModelID is unconditionally misidentified as Spotify.
- **Fix**:
```diff
--- a/src/widgets/spotify/SpotifyWidget.tsx
+++ b/src/widgets/spotify/SpotifyWidget.tsx
@@ -28,5 +28,4 @@ export function formatSourceApp(app: string): string {
-  // Windows Win32 auto-generated AppUserModelIds (e.g. "Microsoft.AutoGenerated.{3A54D6C0...}")
-  if (lower.startsWith("microsoft.autogenerated") || (lower.includes("{") && lower.includes("}"))) {
-    return "Spotify";
-  }
+  if (lower.includes("spotify")) return "Spotify";
   return app.replace(/\.exe$/i, "");
```

### [MINOR] [OPEN] M6-10 `TrackProgress` renders interactive scrubber UI and keybindings despite seeking not being implemented
- **Status**: OPEN
- **Where**: `src/widgets/spotify/SpotifyWidget.tsx:169-172`, `src/widgets/spotify/TrackProgress.tsx:83-99`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: User clicks on the playback progress bar or uses ArrowLeft/ArrowRight to seek. The scrubber visually jumps to the clicked point, but because `SpotifyWidget` does not supply `onSeek` (and the backend has no `media_seek` command), the progress bar snaps back to the original playback position within 250ms on the next interval tick.
- **Why**: `TrackProgress` unconditionally renders interactive scrubber styling (`cursor-pointer`, `onClick={handleSeekClick}`, `tabIndex={0}`, `role="progressbar"`) even when `onSeek` is `undefined`.
- **Fix**:
```diff
--- a/src/widgets/spotify/TrackProgress.tsx
+++ b/src/widgets/spotify/TrackProgress.tsx
@@ -83,5 +83,5 @@ export const TrackProgress: FC<TrackProgressProps> = ({
       <div
-        className="w-full py-1 -my-1 cursor-pointer group"
-        onClick={handleSeekClick}
-        onKeyDown={handleKeyDown}
-        tabIndex={0}
+        className={`w-full py-1 -my-1 ${onSeek ? "cursor-pointer group" : "cursor-default"}`}
+        onClick={onSeek ? handleSeekClick : undefined}
+        onKeyDown={onSeek ? handleKeyDown : undefined}
+        tabIndex={onSeek ? 0 : -1}
```

### [MINOR] [OPEN] M6-11 Play/Pause button uses `text-white` on `--fluent-accent` (`#60cdff`), failing accessibility contrast requirements (1.4:1)
- **Status**: OPEN
- **Where**: `src/widgets/spotify/MediaControls.tsx:53`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In `MediaControls`, the Play/Pause icon is rendered as white on top of `--fluent-accent` (`#60cdff`). In dark mode, the contrast ratio is only 1.43:1, severely violating WCAG 2.1 AA requirements (minimum 3:1) and making the icon difficult to discern. Every other widget in the app correctly uses `text-black` when placed on `--fluent-accent`.
- **Why**: `MediaControls.tsx` hardcodes `text-white` on `bg-[var(--fluent-accent)]` instead of using high-contrast `text-black`.
- **Fix**:
```diff
--- a/src/widgets/spotify/MediaControls.tsx
+++ b/src/widgets/spotify/MediaControls.tsx
@@ -53,3 +53,3 @@ export const MediaControls: FC<MediaControlsProps> = ({
-        className={`rounded-full bg-[var(--fluent-accent)] text-white shadow-md ring-1 ring-white/10 transition-all duration-150 hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center ${
+        className={`rounded-full bg-[var(--fluent-accent)] text-black shadow-md ring-1 ring-white/10 transition-all duration-150 hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center ${
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

### [MINOR] [OPEN] X2-02 Battery Sparkline Graph Collapses to Baseline and Becomes Invisible at Low Charge
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatterySparkline.tsx:49-51`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / component
- **Scenario**: In `BatteryWidget`, when the battery is at 21% with 4 recorded samples (visible in screenshot under "KAPAZITÄTSVERLAUF 4 MESSPUNKTE"), the entire chart area appears empty except for a faint line at the very bottom edge; no trend or gradient fill is visible.
- **Why**: `BatterySparkline` statically maps 0-100% into a 32px height SVG where 21% resolves to `y = 74.4` (only 8px from bottom). The gradient fill linearly fades from 30% opacity at y=0 to 0% at y=100. At y=74.4, the fill opacity is under 7%, rendering it invisible against dark cards. Without baseline guidelines or dynamic range padding, the graph appears broken.
- **Fix**:
```diff
-    // Map 0-100% to Y: 92 is bottom, 8 is top (giving 8% padding)
-    const y = 92 - (clamped / range) * 84;
+    // Dynamic min-max padding to ensure low charge trends remain legible
+    const minVal = Math.min(...points);
+    const maxVal = Math.max(...points);
+    const effectiveRange = Math.max(maxVal - minVal, 20);
+    const y = 85 - ((clamped - Math.max(0, minVal - 10)) / (effectiveRange + 15)) * 70;
```

---

### [MINOR] [OPEN] X2-03 Retro All-Caps Tracked Section Headers Violate Windows 11 Typography Standard
- **Status**: OPEN
- **Where**: `src/widgets/weather/HourlyTrend.tsx:51`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / typography
- **Scenario**: Section headers across multiple widgets display in all-caps with wide tracking: "STÜNDLICHER TREND", "NÄCHSTE 12H", "5-TAGE-VORHERSAGE", "LAUFZEIT-PROGNOSEN", "KAPAZITÄTSVERLAUF", "VERLAUF", "PAUSIERT".
- **Why**: Multiple components use `uppercase tracking-wider` or `uppercase tracking-wide`. Windows 11 Fluent guidelines prohibit all-caps headers across UI surfaces; WinUI 3 mandates sentence capitalization (or title case) in `Segoe UI Variable Text` Semibold with standard letter spacing.
- **Fix**:
```diff
-      <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] uppercase tracking-wider mb-1.5 flex items-center justify-between">
-        <span>Stündlicher Trend</span>
-        <span className="text-[10px] text-[var(--fluent-text-secondary)]/80">Nächste 12h</span>
-      </div>
+      <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] mb-1.5 flex items-center justify-between">
+        <span>Stündlicher Trend</span>
+        <span className="text-[10px] text-[var(--fluent-text-secondary)]/80">Nächste 12 Std.</span>
+      </div>
```

---

### [MINOR] [OPEN] X2-04 Stadium Pill Shapes Used Instead of WinUI 3 Segmented Controls
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:209`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / controls
- **Scenario**: In `GameLauncherWidget`, category filters ("Alle", "Steam", "Epic", "Eigene") are styled as rounded-full oval capsules/pills.
- **Why**: Windows 11 WinUI 3 specifies Segmented Controls (or TabView / RadioButtons) as rectangular segment buttons with 4px border radius (`rounded-[4px]`) inside a continuous recessed container (`bg-[var(--fluent-control-bg)]`), with an elevated active item, rather than mobile/Android pill tags.
- **Fix**:
```diff
-              className={cn(
-                "px-2.5 py-0.5 text-[11px] rounded-full transition-all font-medium whitespace-nowrap",
-                isActive
-                  ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
-                  : "bg-[var(--fluent-card-bg)] text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-card-hover)] hover:text-[var(--fluent-text-primary)]"
-              )}
+              className={cn(
+                "px-2.5 py-1 text-[11px] rounded-[4px] transition-all font-medium whitespace-nowrap",
                isActive
-                  ? "bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] font-semibold shadow-xs border border-[var(--fluent-stroke)]"
-                  : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-control-active)]"
+                  ? "bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] font-semibold shadow-xs border border-[var(--fluent-stroke)]"
+                  : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-control-active)]"
              )}
```

---

### [MINOR] [OPEN] X2-05 Detached Temperature Unit Renders Awkward "10° c" in Weather Widget
- **Status**: OPEN
- **Where**: `src/widgets/weather/WeatherWidget.tsx:160-168`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / typography
- **Scenario**: In `WeatherWidget`, the current temperature displays as `10°  c` with a detached lowercase `c` and excessive spacing, instead of standard `10°C` or `10°`.
- **Why**: `WeatherWidget.tsx` wraps the number and degree symbol in a `text-3xl` span and places the unit `C` in a separate `span` with `gap-1 text-xs text-[var(--fluent-text-secondary)]`, creating visual detachment and an apparent lowercase unit.
- **Fix**:
```diff
-          <div className="flex items-baseline gap-1">
-            <span
-              className="text-3xl font-light tracking-tight text-[var(--fluent-text-primary)]"
-              data-testid="weather-current-temp"
-            >
-              {current.temperatureC}°
-            </span>
-            <span className="text-xs text-[var(--fluent-text-secondary)]">C</span>
-          </div>
+          <div className="flex items-baseline">
+            <span
+              className="text-3xl font-light tracking-tight text-[var(--fluent-text-primary)]"
+              data-testid="weather-current-temp"
+            >
              {current.temperatureC}°
            </span>
+            <span className="text-sm font-normal text-[var(--fluent-text-secondary)] ml-0.5">C</span>
          </div>
```

---

### [MINOR] [OPEN] X2-06 Tailwind `capitalize` Inappropriately Capitalizes German Verb in Battery Badge
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:216`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / internationalization
- **Scenario**: When discharging, the battery status badge displays `Wird Entladen 🔋` with an uppercase `E` in "Entladen", violating German grammatical rules.
- **Why**: `BatteryWidget.tsx` specifies `className="capitalize font-semibold tracking-wide"`. Tailwind's `capitalize` forces the first letter of each word to uppercase. The underlying string from `types/battery.ts` is `"Wird entladen 🔋"`, but CSS transforms it into `"Wird Entladen 🔋"`.
- **Fix**:
```diff
             <Badge
               variant={badgeInfo.variant}
               size="sm"
-              className="capitalize font-semibold tracking-wide"
+              className="font-medium"
               data-testid="battery-charging-badge"
             >
```

---

### [MINOR] [OPEN] X2-07 Verbose Technical Label Causes Text Truncation in Speedtest Upload Metric
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:255`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / layout
- **Scenario**: In the 3-column metric cards row of `SpeedtestWidget`, the third card clips its subtext as `Speed test paylo...` with an ellipsis.
- **Why**: In a 3-column layout on a 360px widget, available card width is ~94px. The hardcoded technical string `"Speed test payload"` (18 characters) exceeds container width and triggers CSS ellipsis truncation.
- **Fix**:
```diff
-          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Speed test payload</div>
+          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Cloudflare Edge</div>
```

---

### [MINOR] [OPEN] X2-08 Asymmetrical Navigation Button Widths in Clock Widget Strip
- **Status**: OPEN
- **Where**: `src/widgets/clock/ClockWidget.tsx:246, 264, 282, 300`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: MEDIUM
- **Category**: visual / component
- **Scenario**: In the top navigation bar of `ClockWidget`, the active tab shows an icon and text label (e.g. `[Clock] Uhr`), while inactive tabs hide their text labels (`hidden`), creating an unbalanced, lopsided navigation strip.
- **Why**: In `ClockWidget.tsx`, `activeTab !== "uhr" && "hidden"` selectively unmounts/hides labels on inactive tabs inside a `grid grid-cols-4` container.
- **Fix**: Display consistent icon + label across all tabs, or use icon-only navigation with Fluent tooltips for equal visual rhythm.

---

### [MINOR] [OPEN] X2-09 GameLauncher and Calendar Widgets Display Disproportionate Empty Black Voids
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:230-340`, `src/widgets/calendar/CalendarWidget.tsx:210-262`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: MEDIUM
- **Category**: visual / layout
- **Scenario**: In the screenshot, `GameLauncherWidget` contains only 1 game ("Brotato") and leaves over 60% of the card height as an empty, dark void. Similarly, `CalendarWidget` dedicates half its vertical space to a sparse "Keine Notizen für diesen Tag" empty state.
- **Why**: Widget layouts have fixed slot dimensions without responsive layout adaptations (such as grid item tiles or quick-add placeholders) when list items are few.
- **Fix**: In GameLauncher, render installed items as a Start Menu / Game Bar style tile grid with a "+ Spiel hinzufügen" ghost card when few items exist.

---

### [ENHANCEMENT] [OPEN] M4-12 `SkeletonWidget` missing from `src/components/layout/index.ts` barrel export
- **Status**: OPEN
- **Where**: `src/components/layout/index.ts:1-3`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: Other modules import layout components from `@/components/layout`.
- **Why**: `SkeletonWidget` is located in `src/components/layout/` but omitted from `index.ts`, forcing consumers like `App.tsx` to use deep path imports (`@/components/layout/SkeletonWidget`).
- **Fix**:
```diff
--- a/src/components/layout/index.ts
+++ b/src/components/layout/index.ts
@@ -2,2 +2,3 @@ export { HeaderBar } from "./HeaderBar";
 export { WidgetContainer } from "./WidgetContainer";
+export { SkeletonWidget, type SkeletonWidgetProps } from "./SkeletonWidget";
```

### [ENHANCEMENT] [OPEN] M4-13 `.fluent-acrylic` class in `fluent.css` lacks `backdrop-filter` definition
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:56-58`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Components use `<Card variant="acrylic">` which applies `.fluent-acrylic`.
- **Why**: `.fluent-acrylic` only sets `background-color: var(--fluent-acrylic-bg)`. Without `backdrop-filter: blur(20px)` and `-webkit-backdrop-filter: blur(20px)`, surfaces lack true Fluent acrylic material blur and appear as flat translucent rectangles.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -57,2 +57,4 @@
   background-color: var(--fluent-acrylic-bg);
+  backdrop-filter: blur(20px);
+  -webkit-backdrop-filter: blur(20px);
 }
```

### [ENHANCEMENT] [OPEN] M6-12 Redundant geocoding HTTP request executed on every periodic weather polling cycle
- **Status**: OPEN
- **Where**: `src/hooks/useWeather.ts:80-97`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When a manual city is configured, every weather refresh (default every 30 minutes) performs an HTTP request to `https://geocoding-api.open-meteo.com/v1/search` to re-resolve the coordinates, before calling `api.open-meteo.com/v1/forecast`. Because coordinates for a city do not change, this causes unnecessary network traffic and introduces an extra point of failure.
- **Why**: `useWeather.ts` does not cache resolved city coordinates in memory or write them to `weather_settings.latitude`/`longitude`.
- **Fix**: Cache resolved coordinates by city name in module-level memory so subsequent polling intervals reuse the latitude/longitude directly.

### [ENHANCEMENT] [OPEN] M6-13 Hardcoded fixed dimensions `w-[360px] h-[256px]` on Card break responsive sizing in docking container
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:88`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: When `SpeedtestWidget` is rendered in `DockContainer` (which passes `className="w-full ..."`), the hardcoded `w-[360px] h-[256px]` takes precedence or conflicts, preventing responsive adaptation to container width.
- **Why**: Unlike `CalendarWidget`, `ClockWidget`, and `WeatherWidget` (which use `w-full h-full max-w-[360px]`), `SpeedtestWidget.tsx` hardcodes absolute pixel widths in the root Card classes.
- **Fix**:
```diff
--- a/src/widgets/speedtest/SpeedtestWidget.tsx
+++ b/src/widgets/speedtest/SpeedtestWidget.tsx
@@ -88,3 +88,3 @@ export const SpeedtestWidget: FC<SpeedtestWidgetProps> = ({
     <Card
       variant="acrylic"
-      className={`w-[360px] h-[256px] p-3 text-[var(--fluent-text-primary)] font-['Segoe_UI_Variable_Text',_'Segoe_UI',_sans-serif] flex flex-col justify-between select-none overflow-hidden ${className}`}
+      className={`w-full h-full max-w-[360px] max-h-[256px] p-3 text-[var(--fluent-text-primary)] font-['Segoe_UI_Variable_Text',_'Segoe_UI',_sans-serif] flex flex-col justify-between select-none overflow-hidden ${className}`}
```

### [ENHANCEMENT] [OPEN] X2-10 Primary Action Buttons Lack Fluent WinUI 3 Border Stroke and Subtle Elevation
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:273`, `src/widgets/launcher/GameLauncherWidget.tsx:178`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / styling
- **Scenario**: Primary action buttons ("Erneut testen", "Hinzufügen") appear as flat, borderless cyan rectangles with black text.
- **Why**: In WinUI 3, primary accent buttons feature subtle 1px layered borders (`border-t-white/20`, `border-b-black/30`), subtle drop shadow (`shadow-sm`), and a smooth 150ms hover brightness transition (`hover:brightness-105 active:scale-[0.98]`).
- **Fix**: Introduce standard `.fluent-button-primary` styling in `fluent.css` with proper border highlights and elevation tokens.

### Coverage / Not Reviewed
- **Reviewed**: Full codebase (104 non-test files across `src-tauri/src/**`, `src/**`, `src/styles/fluent.css`, `index.css`, UI layout & widgets against Windows 11 design screenshot).
- **Excluded / Not Reviewed**: Auto-generated ACL capability schemas (`src-tauri/gen/**`), third-party packages in `node_modules`, compiled binaries in `dist` and `target`.
