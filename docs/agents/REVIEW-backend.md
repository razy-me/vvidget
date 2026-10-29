# REVIEW backend — reviewer: fresh agent

Scope: `src-tauri/` in `c:\Tools\vvidget`

## Findings Table

| # | Sev | Category (bug/security/perf/maint/spec) | File:Line | Finding | Recommendation |
|---|-----|-----------------------------------------|-----------|---------|----------------|
| 1 | MAJOR | spec / perf | `src-tauri/src/battery/mod.rs:638-682` | `start_battery_monitor` background worker lacks `power_state.should_sample()` gating, continuing to poll battery telemetry when display is off, session is locked, or fullscreen app is active (violates R2). | Read `power_state.should_sample()` inside `start_battery_monitor` loop; if false, sleep 3000ms and suppress sampling/emitting until resume. |
| 2 | MINOR | spec / perf | `src-tauri/src/audio/notify.rs:91-93`, `src-tauri/src/battery/mod.rs:647-649`, `src-tauri/src/window/webview_power.rs:91-95` | Redundant global `app.emit(...)` combined with targeted `app.emit_to(...)` broadcasts to all 10 WebViews and delivers duplicate events to target windows (violates R3). | Remove redundant global `app.emit(...)` in push callbacks; emit strictly to active target windows via `emit_to`. |
| 3 | MINOR | maint / robustness | `src-tauri/src/audio/notify.rs:75-108` | `IAudioEndpointVolumeCallback` is bound once at startup and does not dynamically track default audio endpoint routing changes (headphones plugged/unplugged). | Implement `IMMNotificationClient::OnDefaultDeviceChanged` to re-register on device switch, or formalize the 60s frontend safety heartbeat as intentional mitigation. |
| 4 | MINOR | perf | `src-tauri/src/power/mod.rs:344-362` | 5-second `WM_TIMER` checks `SHQueryUserNotificationState` continuously even when the display is already turned off or session is locked. | In `power_wnd_proc`, skip `SHQueryUserNotificationState()` inside `WM_TIMER` when `!ctx.state.is_display_on() || ctx.state.is_session_locked()`. |

---

## Detailed Audit Findings

### 1. [MAJOR] Battery Monitor Telemetry Polling Continues During Display Off / Session Lock (R2 Non-Compliance)
- **Where**: `src-tauri/src/battery/mod.rs:638-682`
- **Analysis**:
  Requirement `R2` dictates: *"Pause telemetry and suspend WebView2 rendering when the display is off, session is locked, or a 3D/fullscreen game/video is running"*.
  While `sysinfo` (`start_metrics_worker`) and `media` (`start_media_monitor`) correctly gate execution with `if !should_sample { std::thread::sleep(Duration::from_millis(3000)); continue; }`, `start_battery_monitor` in `src-tauri/src/battery/mod.rs` was not wired to `PowerState::should_sample()`. It continues its 10s/15s/30s wake loop and `ReportUpdated` event loop unconditionally, executing `query_native_power_status()`, acquiring `TRACKER.lock()`, calculating rate projections, and dispatching IPC events while WebViews are suspended.
- **Fix**: Check `PowerState` (via `app.try_state::<PowerManager>()` or `PowerState`) at the top of the monitor loop. If `!should_sample`, sleep 3000ms and continue.

### 2. [MINOR] Redundant IPC Broadcast (`emit` + `emit_to`) Across Push Notifiers (R3 Deviation)
- **Where**:
  - `src-tauri/src/audio/notify.rs:91-93`
  - `src-tauri/src/battery/mod.rs:647-649`
  - `src-tauri/src/window/webview_power.rs:91-95, 101-103, 110-112`
- **Analysis**:
  Requirement `R3` specifies: *"route IPC events via emit_to to specific windows instead of broadcasting to all 10 WebViews"*.
  In `notify.rs`, the callback executes:
  ```rust
  let _ = app_handle.emit("audio-volume-update", &payload);
  let _ = app_handle.emit_to("main", "audio-volume-update", &payload);
  let _ = app_handle.emit_to("widget_quick_settings", "audio-volume-update", &payload);
  ```
  Calling `app_handle.emit(...)` broadcasts the payload to all 10 WebViews in the process, forcing JSON serialization, IPC transport, and JavaScript event loops in inactive widgets (clock, weather, speedtest, resources, etc.). Concurrently, `main` and `widget_quick_settings` receive duplicate events. The same dual-emission occurs in `start_battery_monitor` and `trigger_resume_refresh`.
- **Fix**: Eliminate `app.emit(...)` from these callbacks and route exclusively via `emit_to` targeting `"main"` (docked mode) or specific widget labels (independent mode).

### 3. [MINOR] Static Default Audio Endpoint Binding Without Device Change Re-registration
- **Where**: `src-tauri/src/audio/notify.rs:75-108`
- **Analysis**:
  `win::register` activates `IAudioEndpointVolume` on `IMMDeviceEnumerator::GetDefaultAudioEndpoint(eRender, eMultimedia)`. If the user unplugs headphones, docks/undocks a laptop, or switches audio endpoints via Windows quick settings, `IAudioEndpointVolumeCallback` remains registered to the inactive physical endpoint. The frontend relies on the 60,000ms safety heartbeat fallback in `useMasterVolume.ts` to resync.
- **Fix**: Register an `IMMNotificationClient` interface to listen for `OnDefaultDeviceChanged(eRender, eMultimedia, pwstrDeviceId)`. On endpoint change, teardown the existing callback and re-register against the new default device.

### 4. [MINOR] Fullscreen Polling Timer Active During Display Sleep
- **Where**: `src-tauri/src/power/mod.rs:344-362`
- **Analysis**:
  The `HWND_MESSAGE` window sets a 5000ms Win32 timer (`SetTimer(hwnd, TIMER_FULLSCREEN_ID, 5000, None)`) to poll `SHQueryUserNotificationState()`. When the display is turned off or session locked, querying fullscreen D3D state is redundant since `should_sample()` already evaluates to `false`. Running this query every 5 seconds causes minor CPU wakeups during notebook sleep.
- **Fix**: Check `if !ctx.state.is_display_on() || ctx.state.is_session_locked() { return LRESULT(0); }` in `WM_TIMER`.

---

## Spec Compliance Audit (R1, R2, R3, R4, R7)

| Requirement | Description | Status | Evidence / Notes |
|-------------|-------------|--------|------------------|
| **R1** | Hardware & OS EcoQoS Scheduling (`ThreadPowerThrottling`) | **PASS** | `enable_current_thread_eco_qos()` is invoked on all background worker threads (`power-monitor`, `sysinfo-worker`, `media-monitor`, `battery-monitor`). Correctly configures `THREAD_POWER_THROTTLING_EXECUTION_SPEED` via `SetThreadInformation`. Non-Windows returns `false`. |
| **R2** | OS Power & Fullscreen Awareness (`SHQueryUserNotificationState`, `RegisterPowerSettingNotification`) | **PARTIAL** | Core engine (`power/mod.rs`) correctly implements `HWND_MESSAGE`, `RegisterPowerSettingNotification` for display/AC-DC/energy-saver GUIDs, and `WTSRegisterSessionNotification`. `set_widgets_suspended` suspends WebView2 controllers via `SetIsVisible(false)`. `sysinfo` and `media` respect `should_sample()`. **Issue noted in Finding #1**: `start_battery_monitor` omitted `should_sample()` check. |
| **R3** | Demand-Driven Telemetry & Decoupled Process Scans | **PARTIAL** | Sysinfo background thread gates on widget visibility (`resources_visible \|\| battery_visible`) and scales interval via multiplier. Process scans (`refresh_processes_specifics`) decoupled to >=4500ms * multiplier. Media monitor gates on Spotify visibility. **Issue noted in Finding #2**: Redundant global `emit` in audio and battery push paths. |
| **R4** | Native Push over Polling (`IAudioEndpointVolumeCallback`, WinRT `ReportUpdated`) | **PASS** | Native COM `IAudioEndpointVolumeCallback` pushes volume/mute events. WinRT `Battery::AggregateBattery().ReportUpdated` hooks power subsystem changes with Condvar timeout fallback. Frontend polling reduced from 2.5s/3.0s to 60.0s safety heartbeat. |
| **R7** | Release & Dependency Hardening | **PASS** | `Cargo.toml`: `tokio` features trimmed to `["rt-multi-thread", "macros", "time", "sync"]`. Devtools gated under `[features] debug = ["tauri/devtools"]`. Release profile sets `codegen-units = 1`, `lto = true`, `opt-level = "z"`, `strip = true`. |

---

## Challenged Decisions (docs/agents/DECISIONS.md)

### D-034: Build, Profile and WebView Flags Hardening
- **Verdict**: **AGREE**
- **Reason**: Gating `devtools` under `debug` feature and setting `codegen-units = 1` with `lto = true` significantly shrinks the release PE binary. Consistently passing `WEBVIEW_ARGS` across all window builders avoids WebView2 runtime profile initialization failure caused by conflicting browser arguments.

### D-035: OS Power State & EcoQoS Engine
- **Verdict**: **AGREE (with minor refinement)**
- **Reason**: Using a native Win32 `HWND_MESSAGE` window is the most lightweight, zero-CPU idle mechanism on Windows for receiving `WM_POWERBROADCAST` and `WM_WTSSESSION_CHANGE`. It avoids polling WMI or Windows services.
- **Refinement**: As noted in Finding #4, the 5-second `WM_TIMER` query for `SHQueryUserNotificationState` should be bypassed when `!is_display_on()` or `is_session_locked()`.

### D-036: Demand-Driven Sysinfo Telemetry & Decoupled Process Scans
- **Verdict**: **AGREE**
- **Reason**: Refreshing `sysinfo::ProcessesToUpdate::All` every 1.5 seconds was the single largest CPU hotpath in earlier iterations (>1.5% CPU). Decoupling it to >=4.5s and caching `(top_process_name, top_process_cpu)` while refreshing CPU/RAM at standard cadence drops idle background CPU overhead below 0.1%. Gating on `resources` and `battery` visibility completely eliminates background sampling when neither widget is active.

### D-037: Media Monitor Eco-Backoff & Event Gating
- **Verdict**: **AGREE**
- **Reason**: Backing off GSMTC polling from 500ms to 2000ms * multiplier when media is paused or inactive, and sleeping for 3000ms when the Spotify widget is not visible, avoids continuous COM cross-process marshaling and saves CPU C-state wakeups.

### D-038: Native Push Telemetry for Audio & Battery
- **Verdict**: **AGREE (with observation)**
- **Reason**: Push telemetry via COM `IAudioEndpointVolumeCallback` and WinRT `ReportUpdated` eliminates timer polling wakeups.
- **Observation**: Finding #1 (`start_battery_monitor` missing power state gating) and Finding #2 (redundant global broadcast `emit` alongside `emit_to`) should be corrected to ensure strict adherence to R2 and R3.

### D-039: WebView2 Fullscreen & Display Suspension
- **Verdict**: **AGREE**
- **Reason**: Utilizing `ICoreWebView2Controller::SetIsVisible(false)` rather than Win32 `ShowWindow(SW_HIDE)` avoids triggering vvidget's `WM_WINDOWPOSCHANGING` subclass hide protection. It successfully halts Chromium compositor frame output and DWM presentations.
- **Evaluation of `TrySuspend`**: Microsoft's `ICoreWebView2_3::TrySuspend` was evaluated. While `TrySuspend` pauses script execution and purges JavaScript heap, it requires implementing the `ICoreWebView2TrySuspendCompletedHandler` COM callback and introduces risk of delayed resumption or unhandled event buffering. `SetIsVisible(false)` achieves 0% GPU rendering overhead safely without complex asynchronous resumption coordination.
