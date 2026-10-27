### [CRITICAL] [OPEN] M3-01 Unsafe WinRT COM iterator missing null pointer guards causing process crash
- **Status**: OPEN
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

### [MAJOR] [OPEN] M3-07 `launch_app_or_uri` blocks Tokio async worker threads with synchronous `ShellExecuteW`
- **Status**: OPEN
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
