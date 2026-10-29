# Plan: Hardware-Close Power & Resource Optimization (`hardware-power-optimization`)
**Date**: 2026-10-29 | **Mode**: `r-plan-it` (Consolidated 8-WP Plan) | **Status**: DRAFT

## 1. Goal & Requirements
- **Outcome**: Maximize notebook battery life and minimize CPU wakeups (C-state exits), GPU compositing load, and WebView2 RAM across vvidget's desktop widgets without architectural rewrites.
- **Requirements**:
  - `R1` **Hardware & OS EcoQoS Scheduling**: Force all background worker threads onto Efficiency (E) cores via Win32 `ThreadPowerThrottling` (`THREAD_POWER_THROTTLING_EXECUTION_SPEED`).
  - `R2` **OS Power & Fullscreen Awareness**: Pause telemetry and suspend WebView2 rendering when the display is off, session is locked, or a 3D/fullscreen game/video is running (`SHQueryUserNotificationState`, `RegisterPowerSettingNotification`).
  - `R3` **Demand-Driven Telemetry & Targeted IPC**: Poll only visible widgets; decouple heavy process scans to >=4.5s; route IPC events via `emit_to` to specific windows instead of broadcasting to all 10 WebViews.
  - `R4` **Native Push over Polling**: Replace frontend timer polling with Win32 COM `IAudioEndpointVolumeCallback` (Audio) and WinRT `Battery::ReportUpdated` (Battery) for true zero-idle wakeups.
  - `R5` **Code-Splitting & Memory Trimming**: `React.lazy` per-widget code-splitting in `App.tsx` and unified low-power WebView2 browser arguments across all windows (~60–80% JS heap reduction per window).
  - `R6` **CSS Compositor & Render Hygiene**: Eliminate GPU-heavy `transition-all` and remaining `backdrop-blur` filters; isolate 1s clock render ticks to dedicated `ClockFace` subcomponents; cache geolocation coordinates.
  - `R7` **Release & Dependency Hardening**: Trim unused `tokio` features; gate `devtools` behind debug flag; enable `codegen-units = 1`.
- **Non-Goals**: Rewriting frontend in Solid/Svelte or replacing Tauri with raw DirectX/Win32 GDI; altering UI layout or widget functionality.
- **Assumptions**:
  - `A1`: Core Tauri command signatures remain intact for initial mount hydration and unit tests.
  - `A2`: All windows share identical `additional_browser_args` to ensure WebView2 initialization succeeds.

## 2. Technical Design & Contracts
- **Architecture**:
  - **Power Manager** (`src-tauri/src/power/mod.rs`): Message-only Win32 window (`HWND_MESSAGE`) listening to display state, session lock (`WTSRegisterSessionNotification`), and AC/DC power. Exposes `PowerState::should_sample()` and `interval_multiplier()` (×1 AC, ×2 Battery, ×3 Energy Saver).
  - **WebView Suspension** (`src-tauri/src/window/webview_power.rs`): On fullscreen app or screen-off, calls `ICoreWebView2Controller::SetIsVisible(false)` and `TrySuspend()`. On resume, restores visibility and emits an immediate state refresh.
  - **Native Push Handlers**:
    - `src-tauri/src/audio/notify.rs`: Implements `IAudioEndpointVolumeCallback` and emits `audio-volume-update`.
    - `src-tauri/src/battery/mod.rs`: Hooks `Battery::AggregateBattery().ReportUpdated` and emits `battery-update`.
  - **Targeted IPC**: Rust helper `emit_to_widget(&app, widget_id, event, payload)` sends data only to `"main"` or `format!("widget_{}", widget_id)`.
  - **Frontend Lazy Loading**: Route-level `React.lazy()` imports in `src/App.tsx` with Vite `manualChunks` splitting.

## 3. File Touchpoints & Work Breakdown (8 Work Packages)
| ID | Action | File / Module | Change Summary | Depends On | Verify / Test Criterion |
|---|---|---|---|---|---|
| WP-01 | EDIT | `src-tauri/Cargo.toml`, `src-tauri/src/window/mod.rs` | Add Win32 features (`Win32_System_Threading`, `Win32_System_Power`, `Win32_System_RemoteDesktop`, `Win32_UI_Shell`); gate `devtools` behind debug feature; trim `tokio` features to used subset; set `codegen-units = 1`; define uniform `const WEBVIEW_ARGS` for all Webviews. | - | `cargo check --manifest-path src-tauri/Cargo.toml` |
| WP-02 | ADD | `src-tauri/src/power/mod.rs`, `src-tauri/src/window/win32.rs`, `src-tauri/src/lib.rs` | Implement `enable_current_thread_eco_qos()`; create message-only window for display/lock/battery notifications; add 5s `SHQueryUserNotificationState` fullscreen poll; expose `PowerState` state in Tauri. | WP-01 | Unit test for `PowerState`; lock screen logs 0 samples. |
| WP-03 | EDIT | `src-tauri/src/sysinfo/collector.rs`, `src-tauri/src/sysinfo/mod.rs` | Run `sysinfo-worker` on EcoQoS; skip sampling if `resources` & `battery` hidden or `!should_sample()`; decouple process table scan to >=4.5s (6s on battery); refresh network/disks only when needed; route events via `emit_to`. | WP-02 | `cargo test sysinfo`; cached process retained across ticks. |
| WP-04 | EDIT | `src-tauri/src/audio/*`, `src-tauri/src/battery/*`, `src/hooks/useMasterVolume.ts`, `src/hooks/useBattery.ts` | Implement `IAudioEndpointVolumeCallback` and WinRT `ReportUpdated` event push; convert `useMasterVolume` & `useBattery` to event listeners with 60s fallback sync (removing 2.5s/3s polling loops). | WP-01 | Volume key updates widget <100ms; `vitest run src/test/battery.test.tsx` passes. |
| WP-05 | EDIT | `src-tauri/src/media/gsmtc.rs`, `src-tauri/src/media/mod.rs` | Apply EcoQoS to `media-monitor`; skip polling when `spotify` is hidden; increase sleep backoff (500ms -> 2000ms+ when idle/paused); route `media-metadata-update` via `emit_to`. | WP-02 | `cargo test media`; zero COM polls when widget hidden. |
| WP-06 | ADD | `src-tauri/src/window/webview_power.rs`, `src-tauri/src/lib.rs` | On fullscreen app or display-off, set WebView2 `SetIsVisible(false)` and call `TrySuspend()`; resume and push full snapshot on return (never suspend settings). | WP-02 | Fullscreen video suspends WebView2 processes in Task Manager. |
| WP-07 | EDIT | `src/App.tsx`, `vite.config.ts`, `src/utils/tauri.ts` (NEW), hooks in `src/hooks/*` | Convert static widget/settings imports to `React.lazy` + `<Suspense>`; configure Vite `manualChunks`; centralize `isTauri` & `invoke` in `src/utils/tauri.ts`. | WP-01 | `npm.cmd run build` creates isolated widget chunks; `npm.cmd run test` passes. |
| WP-08 | EDIT | `src/components/**`, `src/widgets/**`, `src/hooks/useWeather.ts`, `src-tauri/src/geo/mod.rs` | Replace `transition-all` with targeted CSS transitions; remove leftover `backdrop-blur*`; isolate `ClockFace` render tick in `ClockWidget`; await WinRT geolocator without sleep polling; cache coordinates (24h). | - | `npm.cmd run lint` & `npm.cmd run test`; React Profiler shows only `ClockFace` re-rendering on tick. |

## 4. Premortem (Edge Cases, Security, Performance)
- **Callers & Interfaces**: Existing IPC commands (`get_system_metrics`, `get_media_state`, `get_battery_status`, `get_master_volume`) remain fully operational for initial widget mounting and preview modes.
- **WebView2 Suspension**: Suspending WebViews drops incoming IPC events. The resumption sequence must first make the WebView visible, then push fresh snapshots (`metrics-update`, `media-metadata-update`, `battery-update`).
- **COM Concurrency**: `IAudioEndpointVolumeCallback::OnNotify` runs on arbitrary MTA threads. It must only format and emit events without acquiring internal mutexes.
- **Fullscreen Tolerances**: Borderless window apps or notifications can trigger `QUNS_BUSY`. Only suspend on `QUNS_RUNNING_D3D_FULL_SCREEN` or `QUNS_PRESENTATION_MODE`; treat `QUNS_BUSY` as interval throttling (×3).

## 5. Verification Plan
- **Verification Commands**:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `npm.cmd run lint`
  - `npm.cmd run test`
  - `npm.cmd run build`
- **Key Scenarios**:
  1. **Idle Telemetry Gating**: With widgets hidden, background worker CPU usage drops to 0.0% and no IPC events fire.
  2. **Zero-Polling Native Push**: Adjusting volume or unplugging power updates widgets in <150ms without active `setInterval` loops.
  3. **Lock / Display-Off Suspension**: `Win+L` suspends WebView2 renderers; unlocking immediately restores current metrics.
  4. **Code-Splitting Verification**: `dist/assets` contains separate chunks for each widget (e.g., `ClockWidget-*.js`, `WeatherWidget-*.js`) rather than a monolithic bundle.
