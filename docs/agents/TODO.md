# TODO
Plan Status: APPROVED 2026-10-29

## Stack (with justification)
- **Rust (Tauri v2.12+)**: Native OS integration with Win32/WinRT APIs, minimal runtime overhead, thread-level power throttling (`ThreadPowerThrottling`), and COM event sinking.
- **React 19 + TypeScript 5.7+**: Component library with `React.lazy` code-splitting, targeted subscriptions, and isolated sub-tree re-renders (`ClockFace`).
- **Vite 6.1+ & Tailwind CSS v4**: Fast multi-chunk bundling with discrete CSS transition property targeting instead of broad `transition-all`.
- **Windows 11 APIs (`windows` crate v0.58)**: Win32 Power Setting Notifications, `SHQueryUserNotificationState`, CoreAudio `IAudioEndpointVolumeCallback`, WinRT `BatteryReport`, and EcoQoS thread flags.

## Architecture
```mermaid
flowchart TD
    subgraph Windows 11 Kernel & Subsystems
        PWR[Power & Display Events\nGUID_CONSOLE_DISPLAY_STATE] --> PM[Power & Session Manager\nsrc-tauri/src/power]
        FS[Fullscreen App Detection\nSHQueryUserNotificationState] --> PM
        COM[CoreAudio & WinRT Battery\nIAudioEndpointVolumeCallback / ReportUpdated] --> SINK[Native Push Sinks\naudio/notify & battery]
    end

    subgraph Tauri Backend Engine (Rust)
        PM -->|should_sample / multiplier| SYS[Sysinfo Worker\nEcoQoS E-Core Thread]
        PM -->|should_sample / multiplier| MED[Media Monitor\nEcoQoS E-Core Thread]
        PM -->|suspend / resume| WV[WebView2 Controller\nSetIsVisible & TrySuspend]
        SINK -->|emit_to widget_*| IPC[Targeted IPC Router]
        SYS -->|emit_to widget_resources| IPC
        MED -->|emit_to widget_spotify| IPC
    end

    subgraph Frontend (React 19 / Vite)
        IPC --> USE_AUDIO[useMasterVolume Hook\nEvent-Driven]
        IPC --> USE_BAT[useBattery Hook\nEvent-Driven]
        IPC --> USE_SYS[useSystemMetrics Hook]
        IPC --> USE_MED[useMediaPlayback Hook]
        ROUTER[App Router\nReact.lazy chunks] --> WIDGETS[Isolated Widget Windows\nclock, weather, spotify, etc.]
    end
```

## Folder Layout
```
c:\vvidget\
├── docs/agents/                   # SPEC.md, TODO.md, CONTEXT.md, DECISIONS.md
├── docs/plans/                    # PLAN-hardware-power-optimization.md
├── src-tauri/src/
│   ├── power/                     # NEW: PowerState, display/session/fullscreen detection
│   │   └── mod.rs
│   ├── audio/
│   │   ├── mod.rs
│   │   └── notify.rs              # NEW: IAudioEndpointVolumeCallback COM sink
│   ├── battery/
│   │   └── mod.rs                 # WinRT ReportUpdated event push
│   ├── window/
│   │   ├── win32.rs               # EcoQoS helper
│   │   ├── webview_power.rs       # NEW: TrySuspend / SetIsVisible helpers
│   │   └── mod.rs                 # Shared WEBVIEW_ARGS constant
│   ├── sysinfo/                   # Demand-gated metrics & decoupled process scans
│   ├── media/                     # GSMTC idle backoff & targeted emit
│   └── lib.rs                     # PowerManager state and module wiring
└── src/
    ├── App.tsx                    # React.lazy widget route-splitting
    ├── utils/
    │   └── tauri.ts               # NEW: Centralized isTauri & safe invoke wrapper
    ├── hooks/                     # Event-driven audio, battery, weather hooks
    └── widgets/                   # Optimized transitions and isolated ClockFace
```

## Module Interfaces
- `PowerState`:
  - `pub fn should_sample(&self) -> bool`
  - `pub fn interval_multiplier(&self) -> u32` (1 = AC, 2 = Battery, 3 = Energy Saver / Busy)
  - `pub fn is_fullscreen_active(&self) -> bool`
- `WebViewPower`:
  - `pub fn set_webview_suspended<R: Runtime>(window: &WebviewWindow<R>, suspended: bool)`
- `AudioNotify`:
  - `pub fn register_volume_notifier<R: Runtime>(app: &AppHandle<R>) -> Result<VolumeNotifierGuard, String>`
- `Targeted Emitter`:
  - `pub fn emit_to_widget<R: Runtime, S: Serialize + Clone>(app: &AppHandle<R>, widget_id: &str, event: &str, payload: &S)`

---

## Work Packages

### WP-01 Build, Profile & WebView Flags Hardening [x]
- **Covers**: R5, R7
- **Owns**: `src-tauri/Cargo.toml`, `src-tauri/src/window/mod.rs`
- **Depends on**: —
- **Parallel group**: A
- **Scope**:
  - Add required Win32 features to `Cargo.toml`: `Win32_System_Threading`, `Win32_System_Power`, `Win32_System_RemoteDesktop`, `Win32_UI_Shell`.
  - Gate `devtools` behind `[features] debug = ["tauri/devtools"]`.
  - Trim `tokio` features to used subset (`rt-multi-thread`, `macros`, `time`, `sync`).
  - Set `codegen-units = 1` under `[profile.release]`.
  - Define uniform `const WEBVIEW_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,TranslateUI"` in `window/mod.rs` applied to all `WebviewWindowBuilder` calls.
- **Acceptance**: `cargo check --manifest-path src-tauri/Cargo.toml` compiles cleanly.

### WP-02 OS Power State & EcoQoS Engine [x]
- **Covers**: R1, R2
- **Owns**: `src-tauri/src/power/mod.rs`, `src-tauri/src/window/win32.rs`, `src-tauri/src/lib.rs`
- **Depends on**: WP-01
- **Parallel group**: B
- **Scope**:
  - Implement `enable_current_thread_eco_qos()` using Win32 `SetThreadInformation(ThreadPowerThrottling)`.
  - Create message-only window (`HWND_MESSAGE`) registering for display state, session lock, and AC/DC power.
  - Implement background fullscreen check via `SHQueryUserNotificationState` (5s interval).
  - Manage and expose `PowerState` in Tauri state; emit `power-state-changed` on delta.
- **Acceptance**: Unit tests pass for `PowerState`; manual display-off / lock emits state change.

### WP-03 Demand-Driven Sysinfo Telemetry [x]
- **Covers**: R1, R3
- **Owns**: `src-tauri/src/sysinfo/collector.rs`, `src-tauri/src/sysinfo/mod.rs`
- **Depends on**: WP-02
- **Parallel group**: C
- **Scope**:
  - Apply `enable_current_thread_eco_qos()` to `vvidget-sysinfo-worker`.
  - Skip metrics collection if neither `resources` nor `battery` is visible, or if `!power_state.should_sample()`.
  - Scale polling interval with `power_state.interval_multiplier()` (e.g. 1.5s AC -> 3.0s battery).
  - Decouple process table scan (`refresh_processes_specifics`) to >=4.5s (6s on battery); retain cached `top_process_name`.
  - Refresh disks/network only when needed.
  - Replace global broadcast with targeted `emit_to` targeting `main`, `widget_resources`, and `widget_battery`.
- **Acceptance**: `cargo test sysinfo` passes; cached top process retained between scans; 0 samples collected when hidden.

### WP-04 Native Push Telemetry (Audio & Battery) [x]
- **Covers**: R4
- **Owns**: `src-tauri/src/audio/*`, `src-tauri/src/battery/*`, `src/hooks/useMasterVolume.ts`, `src/hooks/useBattery.ts`
- **Depends on**: WP-01
- **Parallel group**: C
- **Scope**:
  - Implement `IAudioEndpointVolumeCallback` in `src-tauri/src/audio/notify.rs` pushing `audio-volume-update`.
  - Hook WinRT `Battery::AggregateBattery().ReportUpdated` pushing `battery-update`.
  - In `useMasterVolume` and `useBattery`, convert to event listener pattern with 60s fallback sync, eliminating 2.5s and 3s active `setInterval` loops.
- **Acceptance**: Adjusting system volume updates widget in <100ms without timer tick; `vitest run src/test/battery.test.tsx` passes.

### WP-05 Media Monitor Eco-Backoff & Event Gating [x]
- **Covers**: R1, R3
- **Owns**: `src-tauri/src/media/gsmtc.rs`, `src-tauri/src/media/mod.rs`
- **Depends on**: WP-02
- **Parallel group**: C
- **Scope**:
  - Apply `enable_current_thread_eco_qos()` to `media-monitor`.
  - Skip GSMTC polling entirely when `spotify` widget is not visible or `!power_state.should_sample()`.
  - Increase idle/paused sleep backoff from 500ms to 2000ms+ when no playback is active.
  - Route `media-metadata-update` via `emit_to` only to `widget_spotify` and `main`.
- **Acceptance**: `cargo test media` passes; 0 COM calls when `spotify` is hidden.

### WP-06 WebView2 Fullscreen & Display Suspension [x]
- **Covers**: R2
- **Owns**: `src-tauri/src/window/webview_power.rs`, `src-tauri/src/lib.rs`
- **Depends on**: WP-02
- **Parallel group**: D
- **Scope**:
  - On `power_state` transition to fullscreen game or display-off, iterate widget windows, set `ICoreWebView2Controller::SetIsVisible(false)`, and call `TrySuspend()`.
  - On return, restore visibility and trigger instant state snapshot refresh (`metrics-update`, `media-metadata-update`, `battery-update`).
  - Never suspend the settings window or active modals.
- **Acceptance**: Fullscreen app suspends WebView2 background renderer processes in Windows Task Manager; exit restores all widgets instantly.

### WP-07 Frontend Lazy Route-Splitting & Memory Reduction [ ]
- **Covers**: R5
- **Owns**: `src/App.tsx`, `vite.config.ts`, `src/utils/tauri.ts`, `src/hooks/*`
- **Depends on**: WP-01
- **Parallel group**: D
- **Scope**:
  - Create `src/utils/tauri.ts` centralizing `isTauri` and static `invoke` import, removing repeated dynamic import promises in hooks.
  - Convert all widget components and `SettingsModal` in `src/App.tsx` to `React.lazy` with `<Suspense fallback={null}>`.
  - Configure Vite `manualChunks` in `vite.config.ts` so each widget is compiled into an isolated chunk.
- **Acceptance**: `npm.cmd run build` emits separate JS bundles for each widget; `npm.cmd run test` passes without suspense regressions.

### WP-08 CSS Compositor, Render & Timer Hygiene [ ]
- **Covers**: R6
- **Owns**: `src/components/**`, `src/widgets/**`, `src/hooks/useWeather.ts`, `src-tauri/src/geo/mod.rs`
- **Depends on**: —
- **Parallel group**: D
- **Scope**:
  - Replace all occurrences of generic `transition-all` with targeted transitions (`transition-[colors,opacity,transform]`).
  - Remove leftover `backdrop-blur*` classes from `HeaderBar`, `Tooltip`, `GameLauncherWidget`, and `App.tsx`.
  - Isolate the 1s clock tick in `ClockWidget` into a `React.memo`'d `ClockFace` subcomponent; sync ticks with `setTimeout(1000 - now % 1000)`.
  - Await WinRT geolocation asynchronously in `geo/mod.rs` without sleep loops; cache coordinates in `useWeather.ts` (24h TTL) and pause polling when offline or suspended.
- **Acceptance**: `npm.cmd run lint` and `npm.cmd run test` pass; React Profiler shows only `ClockFace` re-rendering on tick; no `transition-all` in widget hot paths.

---

## Phase Status
- [x] Phase 1 Plan
- [ ] Phase 2 Build (WP-01 to WP-08)
- [ ] Phase 3 Test (Coverage & Integration)
- [ ] Phase 4 Review (Tier 1 & Tier 3 Audit)
- [ ] Phase 5 Handover
