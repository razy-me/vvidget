# TODO
Plan Status: APPROVED 2026-10-26

## Express Scope: High-Precision Battery Telemetry (PLAN-battery-precision.md)
Target: 3 files affected (`src-tauri/Cargo.toml`, `src-tauri/src/battery/mod.rs`, `src/types/battery.ts` + `src/test/battery.test.tsx`).

### Work Packages
- [x] **WP-01: Windows Devices_Power Cargo & WinRT Battery Report Implementation**
  - **Files**: `src-tauri/Cargo.toml`, `src-tauri/src/battery/mod.rs`
  - **Scope**: Enable `"Devices_Power"` in `windows` crate features. Implement `Windows.Devices.Power.Battery::AggregateBattery().GetReport()` query. Extract `RemainingCapacityInMilliwattHours`, `FullChargeCapacityInMilliwattHours`, and `ChargeRateInMilliwatts`. Fall back cleanly to Win32 `GetSystemPowerStatus`. Implement fractional percent calculation, EMA rate smoothing, zero-rate elimination with physical floor, exact projection calculations, 60s/delta sparkline gating, and `top_process_name` resolution from `SharedMetricsState`. Update Rust unit tests.
  - **Acceptance**: `cargo test --manifest-path src-tauri/Cargo.toml` passes 100%.
- [x] **WP-02: Frontend Formatting & Vitest Verification**
  - **Files**: `src/types/battery.ts`, `src/test/battery.test.tsx`
  - **Scope**: Verify and adapt `formatDrainRate` and test cases for accurate fractional drain rates, ensure tests verify zero-rate elimination, sparkline pacing, and `top_process_name` display.
  - **Acceptance**: `npm.cmd test -- --run` passes 100% (228+ frontend tests).

## Review & Audit Gates
- [x] **Phase 4: Tier 1 Change Review Gate** (TOFIX check & approval - docs/agents/TOFIX-BATTERY.md APPROVED)
- [x] **Phase 5: Release Build Verification** (`npx.cmd tauri build --no-bundle` -> widgetz.exe)
