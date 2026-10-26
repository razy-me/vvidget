# SPEC: High-Precision ACPI/WinRT Battery Telemetry & Live Rate Engine

## Prompt
Wie bekommen wir die Daten, die im Akku Widget aktuell angezeigt werden noch genauer? Nicht dass wir mehr verschiedene Daten auf dem Widget anzeigen, sondern die Daten die schon angezeigt werden, noch genauer ermitteln.
Bspw. wird teilweise ein Verbrauch von 0%/min angezeigt, was ja faktisch unmöglich ist.

## Core Requirements
- **R1 (Hardware mWh & mW Telemetry)**: Query native Windows battery report via `Windows.Devices.Power.Battery::AggregateBattery().GetReport()` in `src-tauri` on Windows, reading `ChargeRateInMilliwatts`, `RemainingCapacityInMilliwattHours`, and `FullChargeCapacityInMilliwattHours`. Fall back seamlessly to `GetSystemPowerStatus` if WinRT fails or hardware does not provide mWh.
- **R2 (Instantaneous Rate with EMA Smoothing)**: Derive instant drain/charge rate directly from hardware power draw ($\frac{\text{ChargeRateInMilliwatts}}{\text{FullChargeCapacityInMilliwattHours}} \times \frac{100}{60}$ %/min), filtered with an Exponential Moving Average (EMA, $\alpha = 0.35$).
- **R3 (Zero-Rate Elimination)**: Disallow physically impossible `0.00 %/min` while on battery or active charging:
  - When discharging without hardware mW rate, fall back to fractional percentage regression and minimum floor ($\le -0.05$ %/min or derived from `BatteryLifeTime`).
  - When charging < 100%, ensure positive charging rate ($\ge +0.05$ %/min).
  - Only show `0.00 %/min` (or `Full ✓`) when plugged in and battery is fully charged (100%).
- **R4 (Exact Projections Calculation)**: Calculate `estimated_mins_to_10_percent`, `estimated_mins_to_20_percent`, and `estimated_mins_to_empty` using exact mWh capacities and smoothed discharge rate rather than integer truncated percentages.
- **R5 (Sparkline Pacing)**: Gate `capacity_history` updates to append only when the displayed percent changes or $\ge 60$ seconds have passed, allowing the 20-sample sparkline to reflect a 20-minute trend instead of a flat 50-second line.
- **R6 (Top Process Integration)**: In `get_battery_status`, resolve `top_process_name` from `SharedMetricsState` (`sysinfo`) so the high drain alert banner immediately highlights the actual power-hungry process.

## Non-Functional Requirements
- Maintain exact existing `BatteryStatus` JSON / TypeScript contract — zero breaking schema changes.
- Sub-millisecond execution without blocking Tauri main thread.
- Zero CPU/GPU idle overhead.
