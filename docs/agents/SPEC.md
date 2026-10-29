# SPEC: Hardware-Close Power & Resource Optimization

## Original Prompt (verbatim)
> Schau mal. Ich bin begeistert von der Anwendung, finde aber, dass es noch Hardwarenäher und mit besserem Techstack entwickelt werden könnte um noch mehr ressourcen und somit auch Strom auf Notebooks zu sparen. Ich will keinen kompletten Architektur wechsel haben, aber eine große Optimierungs Aktion

## Requirements
- `R1`: **Hardware & OS EcoQoS Scheduling**: Force all background worker threads onto Efficiency (E) cores via Win32 `ThreadPowerThrottling` (`THREAD_POWER_THROTTLING_EXECUTION_SPEED`).
- `R2`: **OS Power & Fullscreen Awareness**: Pause telemetry and suspend WebView2 rendering when the display is off, session is locked, or a 3D/fullscreen game/video is running (`SHQueryUserNotificationState`, `RegisterPowerSettingNotification`).
- `R3`: **Demand-Driven Telemetry & Targeted IPC**: Poll only visible widgets; decouple heavy process scans to >=4.5s; route IPC events via `emit_to` to specific windows instead of broadcasting to all 10 WebViews.
- `R4`: **Native Push over Polling**: Replace frontend timer polling with Win32 COM `IAudioEndpointVolumeCallback` (Audio) and WinRT `Battery::ReportUpdated` (Battery) for true zero-idle wakeups.
- `R5`: **Code-Splitting & Memory Trimming**: `React.lazy` per-widget code-splitting in `App.tsx` and unified low-power WebView2 browser arguments across all windows (~60–80% JS heap reduction per window).
- `R6`: **CSS Compositor & Render Hygiene**: Eliminate GPU-heavy `transition-all` and remaining `backdrop-blur` filters; isolate 1s clock render ticks to dedicated `ClockFace` subcomponents; cache geolocation coordinates (24h TTL) and await WinRT operations asynchronously.
- `R7`: **Release & Dependency Hardening**: Trim unused `tokio` features; gate `devtools` behind debug flag; enable `codegen-units = 1`.

## Non-Functional Requirements
- Maintain existing Tauri IPC command signatures (`get_system_metrics`, `get_media_state`, `get_battery_status`, `get_master_volume`, `get_master_mute`) for backwards compatibility, initial mount hydration, and tests.
- Zero visual regression across all 10 desktop widgets and settings modal.
- Build, lint, and all test suites (`cargo test`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`) must pass cleanly.

## Assumptions
- `A1`: The target OS is Windows 11 (build 22000+), with graceful fallback on earlier builds if `SetThreadInformation` or energy saver notifications are unsupported.
- `A2`: All windows must share identical `additional_browser_args` to ensure WebView2 initialization succeeds.

## Out of Scope
- Complete rewrite of the frontend in Solid/Svelte or replacing Tauri with raw DirectX/Win32 GDI.
- Altering the visual design tokens, grid dimensions, or existing widget behavior.
