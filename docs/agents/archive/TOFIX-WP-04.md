# Code Review Report: WP-04 (Native Push Telemetry: Audio & Battery)

**Status**: APPROVED  
**Commit**: `d9d8e67f3615d5de8f005ad54eab8d03229d9077`  
**Review Level**: Tier 1 Change Review  

---

## Summary
Work Package 04 implements native OS push telemetry for audio and battery, eliminating high-frequency frontend polling:
1. **CoreAudio Volume Push Callback (`src-tauri/src/audio/notify.rs`)**: Implements `IAudioEndpointVolumeCallback` via `windows::core::implement`. Dispatches `audio-volume-update` without mutex locks or MTA thread contention. Unregisters safely on drop via `VolumeNotifierGuard` with RAII `ComGuard`.
2. **WinRT Battery Push Notifier (`src-tauri/src/battery/mod.rs`)**: Registers `TypedEventHandler` on WinRT `Battery::AggregateBattery().ReportUpdated`. Wakes background EcoQoS thread via condvar and pushes `battery-update` on delta with backoff timeouts.
3. **Frontend Event-Driven Hooks (`src/hooks/useMasterVolume.ts`, `src/hooks/useBattery.ts`)**: Replaces 2.5s/3.0s polling with push event listeners, pauses timers when `document.hidden` is true, resyncs immediately on `visibilitychange`, and retains a 60s fallback heartbeat.
4. **Verification**: 288 vitest tests and 183 cargo tests pass cleanly with 0 failures.

---

## Checklist Audit
- [x] Correct COM implementation of `IAudioEndpointVolumeCallback` in `audio/notify.rs` without deadlock risks or lock contention on MTA threads.
- [x] WinRT `ReportUpdated` registration in `battery/mod.rs` on EcoQoS thread.
- [x] `useMasterVolume` and `useBattery` converted to event-driven listeners with 60s fallback sync.
- [x] `document.hidden` handling and pause on background tab/window.
- [x] Unit tests pass cleanly (vitest + cargo test).

---

## Findings Log

### [MINOR] [OPEN] F-WP04-01 Dual Global and Targeted IPC Emission
- **Status**: OPEN
- **Where**: `src-tauri/src/audio/notify.rs:91-93`, `src-tauri/src/battery/mod.rs:645-647`
- **Source**: `r-review` (WP-04 Change Review)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: Backend emits both via `app.emit(...)` and `app.emit_to("main", ...)`, causing dual event dispatch to windows listening globally.
- **Why**: React state setters are idempotent so this produces no UI defect, but sending redundant IPC frames across the WebView2 bridge adds unnecessary IPC deserialization.
- **Fix**: In docked layout or when using targeted emission, emit either globally or target specific windows rather than both.

---

## Conclusion
Zero CRITICAL and zero MAJOR issues. Status is **APPROVED**.
