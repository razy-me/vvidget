### [MAJOR] [OPEN] M3-01 WinRT Battery report query lacks COM apartment initialization
- **Status**: OPEN
- **Where**: `src-tauri/src/battery/mod.rs:440`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug [lens: F1b]
- **Scenario**: The frontend battery widget calls `get_battery_status`. Tauri dispatches this synchronous command on a worker threadpool thread where COM has not been initialized. `Battery::AggregateBattery()` fails immediately with `0x800401F0 (CO_E_NOTINITIALIZED)`. The error is discarded, and the system falls back to `GetSystemPowerStatus`, causing the widget to permanently lose exact floating-point battery percentages, discharge rates in mW, and remaining mWh capacities.
- **Why**: WinRT APIs require the calling thread to enter a COM apartment via `RoInitialize` or `CoInitializeEx`. While other WinRT modules in the project use `ComGuard`, `battery/mod.rs` omitted COM initialization entirely.
- **Fix**:
```diff
--- a/src-tauri/src/battery/mod.rs
+++ b/src-tauri/src/battery/mod.rs
@@ -440,6 +440,7 @@ fn query_winrt_battery_report() -> Result<RawBatteryTelemetry, String> {
+    let _com_guard = crate::geo::winrt::ComGuard::new();
     use windows::Devices::Power::Battery;
     use windows::System::Power::BatteryStatus as WinRTBatteryStatus;
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
