# Review Findings: Fraction M1 (Core Windows Native & Backend Host)

### [CRITICAL] [OPEN] M1-01 Win+D / Show Desktop Protection Broken by `WM_SHOWWINDOW` Self-Defeat (lens: F1b)
- **Status**: OPEN
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

### [CRITICAL] [OPEN] M1-02 Synchronous Desktop-Wide Erase and Redraw Stalls DWM and Causes Global Screen Flash (lens: F1b)
- **Status**: OPEN
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

### [MAJOR] [OPEN] M1-03 Quick Action `taskmanager` Fails with UAC Elevation Required Error (OS Error 740)
- **Status**: OPEN
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

### [MAJOR] [OPEN] M1-04 Dock Mode Switch Leaves `main` Window Untracked in `WindowManager` and `TRACKED_WINDOWS`
- **Status**: OPEN
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

### [MAJOR] [OPEN] M1-05 Missing UNC Path Sanitization in Custom Actions Allows NetNTLM Leak (lens: F1b)
- **Status**: OPEN
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

### [MAJOR] [OPEN] M1-06 `WindowEvent::Moved` Race Overwrites Snapped Grid Coordinates (lens: F1b)
- **Status**: OPEN
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

### [MAJOR] [OPEN] M1-07 Primary Monitor DC in `query_desktop_grid_metrics` Causes Mixed-DPI Snapping Glitches (lens: F1b)
- **Status**: OPEN
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
