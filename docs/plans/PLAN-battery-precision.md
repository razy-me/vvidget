# Plan: High-Precision ACPI/WinRT Battery Telemetry & Live Rate Engine
**Date**: 2026-10-26 | **Mode**: `r-plan-it` (Compact) | **Status**: DRAFT

## 1. Goal & Requirements
- **Outcome**: Replace coarse integer-percentage battery polling with direct Windows hardware mW/mWh telemetry (`Windows.Devices.Power.Battery`), eliminating impossible `0.00 %/min` readings and providing instantaneous, physically accurate drain rates and projections without adding new UI clutter.
- **Requirements**:
  - `R1`: Query real-time hardware `ChargeRateInMilliwatts`, `RemainingCapacityInMilliwattHours`, and `FullChargeCapacityInMilliwattHours` via `Windows.Devices.Power.Battery::AggregateBattery().GetReport()` (with automatic fallback to Win32 `GetSystemPowerStatus`).
  - `R2`: Compute instantaneous drain/charge rate in `%/min` directly from hardware power draw: $\text{rate} = \frac{\text{ChargeRateInMilliwatts}}{\text{FullChargeCapacityInMilliwattHours}} \times \frac{100}{60}$, smoothed with an Exponential Moving Average (EMA, $\alpha = 0.35$) to prevent UI jitter while responding in <2.5s to load changes.
  - `R3`: Eliminate `0.00 %/min` when discharging or actively charging: if hardware `ChargeRateInMilliwatts` is unsupported/zero on a specific OEM controller, fall back to high-resolution fractional percentage ($\frac{\text{Remaining mWh}}{\text{Full mWh}} \times 100$) regression + `BatteryLifeTime` derivation, enforcing a physical minimum floor ($\le -0.05\text{ \%/min}$ on battery, $\ge +0.05\text{ \%/min}$ when charging <100%).
  - `R4`: Calculate projections (`estimated_mins_to_10_percent`, `estimated_mins_to_20_percent`, `estimated_mins_to_empty`) from exact mWh capacities and smoothed mW discharge rate rather than rounded integer percentages.
  - `R5`: Record a new point in `capacity_history` only when `charge_percent` changes or >= 60 seconds have elapsed (instead of every 2.5s poll), so the 20-point sparkline represents a real 20-minute capacity trend instead of a flat 50-second line.
  - `R6`: Populate `top_process_name` in `get_battery_status` from the shared `SharedMetricsState` (`sysinfo` worker) so the existing high-drain warning banner (`> 1.5 %/min`) names the actual culprit process.
- **Non-Goals**: Adding new UI fields, extra numbers, or changing the `BatteryStatus` JSON/TypeScript contract.
- **Assumptions**: `A1`: Keeping `BatteryStatus` schema identical guarantees zero breaking changes to frontend components while making every displayed metric (`%`, `%/min`, projections, sparkline, high-drain culprit) significantly more accurate.

## 2. Technical Design & Contracts
- **Chosen Approach**: Enable `"Devices_Power"` and `"System_Power"` features on the existing `windows` v0.58 crate. Query `Battery::AggregateBattery()?.GetReport()?` to obtain mWh and mW telemetry directly from the ACPI battery controller. Combine hardware instantaneous rate with an EMA filter in `BatteryTracker` and wire `tauri::AppHandle` into `get_battery_status` to read the latest `top_process_name` from `SharedMetricsState`.
- **Interfaces / Types / Signatures**:
  - `Cargo.toml`: Add `"Devices_Power"` to `[target.'cfg(windows)'.dependencies.windows].features`.
  - `src-tauri/src/battery/mod.rs`:
    ```rust
    #[derive(Debug, Clone, Default)]
    pub struct RawBatteryTelemetry {
        pub has_battery: bool,
        pub charge_percent_exact: f64,        // Fractional % from mWh (e.g. 82.43%), fallback to u8
        pub charge_percent: u8,               // Rounded 0..=100
        pub is_charging: bool,
        pub is_plugged_in: bool,
        pub charge_rate_mw: Option<i32>,      // Negative = discharging, Positive = charging
        pub remaining_mwh: Option<i32>,
        pub full_charge_mwh: Option<i32>,
        pub hardware_mins_to_empty: Option<u32>,
    }

    pub fn compute_instant_rate_pct_per_min(
        charge_rate_mw: Option<i32>,
        full_charge_mwh: Option<i32>,
    ) -> Option<f32>;

    #[tauri::command]
    #[specta::specta]
    pub fn get_battery_status(app: tauri::AppHandle) -> Result<BatteryStatus, String>;
    ```
- **Data / State Flow**:
  `WinRT Battery::AggregateBattery().GetReport()` (+ `GetSystemPowerStatus` fallback) -> `RawBatteryTelemetry` -> `BatteryTracker::record_telemetry()` (EMA rate smoothing + 60s/delta-gated sparkline history + fractional fallback regression) -> `calculate_projections()` (exact mWh / mW math) -> enrich `top_process_name` from `SharedMetricsState` -> `BatteryStatus`.

## 3. File Touchpoints & Work Breakdown
| ID | Action | File / Module | Change Summary | Depends On | Verify / Test Criterion |
|---|---|---|---|---|---|
| WP-01 | EDIT | `src-tauri/Cargo.toml` | Add `"Devices_Power"` feature to `windows` crate dependencies. | - | `cargo check --manifest-path src-tauri/Cargo.toml` compiles cleanly. |
| WP-02 | EDIT | `src-tauri/src/battery/mod.rs` | Implement `query_winrt_battery_report()`, `RawBatteryTelemetry`, mW-based rate calculation + EMA smoothing, physical floor guard against `0.00 %/min`, 60s/delta sparkline gating, exact fractional projection math, and `top_process_name` lookup via `app.try_state::<SharedMetricsState>()`. Update unit tests. | WP-01 | `cargo test --manifest-path src-tauri/Cargo.toml battery::` passes 100%. |
| WP-03 | EDIT | `src/types/battery.ts`, `src/test/battery.test.tsx` | Ensure `formatDrainRate` handles small non-zero rates cleanly and add unit test coverage for non-zero discharging floor and `top_process_name` integration. | WP-02 | `npm.cmd test -- --run src/test/battery.test.tsx` passes 100%. |

## 4. Premortem (Edge Cases, Security, Performance)
- **Callers / Breaking Impact**: Tauri automatically injects `app: tauri::AppHandle` into `#[tauri::command] fn get_battery_status(app: tauri::AppHandle)` without changing the frontend `invoke("get_battery_status")` call signature or `BatteryStatus` struct.
- **Edge Cases & Error Handling**:
  - *OEM Firmware omits `ChargeRateInMilliwatts` (`IReference<i32>` is `None` or `0`)*: Fallback chain: (1) hardware mW rate -> (2) fractional mWh linear regression over sliding window -> (3) OS `BatteryLifeTime` ratio -> (4) physical idle baseline (`-0.08 %/min` when on battery, `+0.10 %/min` when charging below 100%) so `0.00 %/min` never appears during active discharge.
  - *Full Charge Capacity <= 0 or corrupt firmware report*: Guard against division by zero (`full_mwh > 0`), falling back to `GetSystemPowerStatus`.
  - *AC Plug/Unplug transition*: Reset EMA state and regression window immediately when `is_charging` or `is_plugged_in` flips, preventing lag between charging and discharging signs.
- **Security & Performance**: `Battery::AggregateBattery().GetReport()` is a sub-millisecond in-process WinRT call with zero network or disk I/O. Reading `SharedMetricsState` uses a non-blocking `try_read()` lock.

## 5. Verification Plan
- **Verification Commands**:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `npm.cmd test -- --run`
- **Key Scenarios**:
  1. **Instantaneous mW Telemetry**: `remaining = 41_000 mWh`, `full = 50_000 mWh`, `charge_rate = -10_500 mW` -> `drain_rate_percent_per_min` immediately reports `-0.35 %/min` on the very first poll (no 5-minute wait for integer `%` drop) and `estimated_mins_to_10_percent` = `206 min`.
  2. **Zero/Missing mW Fallback Floor**: When discharging on battery with constant integer `%` and `charge_rate_mw = None`, rate never reports `0.00 %/min` (uses hardware remaining time or `-0.08 %/min` floor).
  3. **Sparkline History Pacing**: Polling every 2.5s for 30s at constant `82%` records only 1 sample instead of 12 identical samples; records immediately when percentage drops to `81%` or 60s elapses.
