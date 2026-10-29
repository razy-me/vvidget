# TOFIX: Work Package 02 (WP-02) Code Review

**Status**: FIXED  
**Scope**: `git diff 30be684ac5f4d3184a54fbf7c64cf2d7793336cb..ae3a5545e4f08ff8c431c444bc134956ad272ef4`  
**Files**: `src-tauri/src/power/mod.rs`, `src-tauri/src/window/win32.rs`, `src-tauri/src/lib.rs`  
**Review Type**: Tier 1 Critical Change Review  

---

## 1. Summary of Changes
- Implemented `enable_current_thread_eco_qos()` using Win32 `SetThreadInformation(ThreadPowerThrottling)` forcing worker threads to Efficiency (E) cores (with fallback for non-Windows).
- Created atomic thread-safe `PowerState` and `PowerManager` tracking `display_on`, `session_locked`, `energy_saver`, `on_battery`, and `fullscreen_active` with interval scaling (`interval_multiplier()`) and sampling gating (`should_sample()`).
- Created background message-only `HWND_MESSAGE` window registering for OS power notifications (`GUID_CONSOLE_DISPLAY_STATE`, `GUID_ACDC_POWER_SOURCE`, `GUID_ENERGY_SAVER_STATUS`) via `RegisterPowerSettingNotification`, session lock/unlock events via `WTSRegisterSessionNotification`, and 5-second periodic fullscreen check via `SHQueryUserNotificationState`.
- Implemented `PowerEventSink` emitting `power-state-changed` event on state transitions and exposed `get_power_state` IPC command.

---

## 2. Review Findings

### [MAJOR] [FIXED] WP02-01 PowerManager not managed in Tauri state, monitor thread not spawned, and get_power_state omitted from IPC handlers
- **Status**: OPEN
- **Where**: `src-tauri/src/lib.rs:485`
- **Source**: `r-review` (Tier 1) (2026-10-29)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: At application runtime, the `vvidget-power-monitor` background worker is never started, so no Win32 power/session/fullscreen notifications are registered and `power-state-changed` events are never emitted. Any frontend invocation of `get_power_state` fails with unknown command error. Downstream modules (WP-03 demand-driven sysinfo) calling `app.try_state::<PowerManager>()` or `app.try_state::<Arc<PowerState>>()` find no managed state and cannot scale or suppress sampling.
- **Why**: WP-02 added `pub mod power;` to `src-tauri/src/lib.rs`, but omitted registering `PowerManager` in `builder.manage(...)`, adding `power::get_power_state` to `invoke_handler!`, and launching `power::start_power_monitor` in `setup(...)`.
- **Fix**:
```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -452,6 +452,7 @@ pub fn run() {
     let window_manager = WindowManager::new();
     let metrics_collector = MetricsCollector::new();
     let shared_metrics = metrics_collector.cached_handle();
+    let power_manager = power::PowerManager::new();
 
     let builder = tauri::Builder::default()
@@ -486,6 +487,7 @@ pub fn run() {
         .manage(config_manager.clone())
         .manage(window_manager)
         .manage(shared_metrics)
+        .manage(power_manager.clone())
         .invoke_handler(tauri::generate_handler![
             load_config,
             save_config,
@@ -533,6 +535,7 @@ pub fn run() {
             get_bluetooth_devices,
             open_bluetooth_settings,
             toggle_bluetooth_device,
+            power::get_power_state,
         ])
         .setup(move |app| {
+            power::start_power_monitor(app.handle().clone(), power_manager.state());
             start_metrics_worker(
                 app.handle().clone(),
                 config_manager_setup,
```

### [MINOR] [FIXED] WP02-02 Missing COM apartment initialization on vvidget-power-monitor worker thread
- **Status**: OPEN
- **Where**: `src-tauri/src/power/mod.rs:403`
- **Source**: `r-review` (Tier 1) (2026-10-29)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: When `vvidget-power-monitor` thread calls `SHQueryUserNotificationState()` during initial sync or periodic timer ticks, the Shell API can fail with `0x800401F0` (`CO_E_NOTINITIALIZED`) on threads that have not initialized COM, silently failing to detect fullscreen D3D applications or presentation mode.
- **Why**: Windows Shell query APIs rely internally on COM/RPC interfaces and require the thread to be initialized with COM.
- **Fix**:
```diff
diff --git a/src-tauri/src/power/mod.rs b/src-tauri/src/power/mod.rs
--- a/src-tauri/src/power/mod.rs
+++ b/src-tauri/src/power/mod.rs
@@ -402,6 +402,7 @@ fn start_power_monitor_inner(sink: Option<Box<dyn PowerEventSink>>, state: Arc<P
         .spawn(move || {
+            let _com_guard = crate::geo::winrt::ComGuard::new();
             // Force this monitoring thread onto Efficiency (E) cores via Win32 EcoQoS
             let _ = crate::window::win32::enable_current_thread_eco_qos();
```

### [MINOR] [FIXED] WP02-03 Potential unaligned pointer dereference when reading POWERBROADCAST_SETTING.Data
- **Status**: OPEN
- **Where**: `src-tauri/src/power/mod.rs:266`
- **Source**: `r-review` (Tier 1) (2026-10-29)
- **Confidence**: MEDIUM
- **Category**: robustness
- **Scenario**: `*(pbs.Data.as_ptr() as *const u32)` casts a `[u8; 1]` array pointer to `*const u32` and performs a direct dereference.
- **Why**: Casting byte array pointers directly to `*const u32` without `std::ptr::read_unaligned` is unsafe against alignment assumptions in Rust.
- **Fix**:
```diff
diff --git a/src-tauri/src/power/mod.rs b/src-tauri/src/power/mod.rs
--- a/src-tauri/src/power/mod.rs
+++ b/src-tauri/src/power/mod.rs
@@ -265,3 +265,3 @@ unsafe extern "system" fn power_wnd_proc(
                             if pbs.PowerSetting == GUID_CONSOLE_DISPLAY_STATE {
                                 if pbs.DataLength >= 4 {
-                                    let val = *(pbs.Data.as_ptr() as *const u32);
+                                    let val = std::ptr::read_unaligned(pbs.Data.as_ptr() as *const u32);
                                     // 0 = Display Off, 1 = Display On, 2 = Display Dimmed
@@ -274,3 +274,3 @@ unsafe extern "system" fn power_wnd_proc(
                             } else if pbs.PowerSetting == GUID_ACDC_POWER_SOURCE {
                                 if pbs.DataLength >= 4 {
-                                    let val = *(pbs.Data.as_ptr() as *const u32);
+                                    let val = std::ptr::read_unaligned(pbs.Data.as_ptr() as *const u32);
                                     // 0 = AC power, 1 = Battery (DC), 2 = Hot (Short term battery)
@@ -283,3 +283,3 @@ unsafe extern "system" fn power_wnd_proc(
                             } else if pbs.PowerSetting == GUID_ENERGY_SAVER_STATUS {
                                 if pbs.DataLength >= 4 {
-                                    let val = *(pbs.Data.as_ptr() as *const u32);
+                                    let val = std::ptr::read_unaligned(pbs.Data.as_ptr() as *const u32);
                                     // 0 = Off, 1 = Energy Saver On
```
