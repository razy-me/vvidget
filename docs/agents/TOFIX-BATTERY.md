# TOFIX BATTERY — Review Findings (WP-01 & WP-02)

Commit Diff: `main~2..HEAD` (`05b2fda`, `135a491`) — **Verdict: APPROVED**

## Review Scope & Verification Checklist

1. **WinRT vs Win32 Safety & Lifecycle**:
   - `query_winrt_battery_report()` utilizes idiomatic `windows` crate bindings (`Battery::AggregateBattery()`, `GetReport()`).
   - COM objects are safely handled via RAII wrappers with no manual lifetime allocations or memory leaks.
   - Any failure in WinRT methods (`AggregateBattery()`, `GetReport()`, `Status()`, `ChargeRateInMilliwatts()`, etc.) gracefully falls back to Win32 `GetSystemPowerStatus` via `query_native_power_status()`.
   - Thread safety: `TRACKER` is guarded behind a standard `std::sync::Mutex<BatteryTracker>`, cleanly serializing state updates across concurrent Tauri invocations.

2. **Division by Zero Guards**:
   - `compute_instant_rate_pct_per_min`: explicitly checks `if full_mwh <= 0 { return None; }`.
   - `calculate_rate_from_samples`: guards `denominator.abs() < 1e-6` and `total_secs < 2.0`.
   - `calculate_projections`: guards `rate_mw < 0 && rem_mwh > 0` for hardware rate, and `abs_rate > 0.01` (`drain_rate_percent_per_min < -0.01`) for fractional rate. In hardware fallback, ensures `pct > 0.0`.
   - Percentage conversion in `query_winrt_battery_report`: checks `full > 0 && rem >= 0` before calculating `(rem / full) * 100.0`.

3. **Rate Calculations and EMA Filter Stability**:
   - Formula $(\text{rate\_mw} / \text{full\_mwh}) \times (100.0 / 60.0)$ mathematically converts milliwatts over milliwatt-hours to %/min.
   - EMA smoothing factor $\alpha = 0.35$ dampens short transient power spikes while tracking dynamic load changes smoothly.
   - State transition: `samples.clear()` and `smoothed_rate = None` are triggered whenever `is_charging` toggles, preventing discharge rates from contaminating charge estimates and vice versa.

4. **Zero-Rate Elimination Constraints (R3)**:
   - `eliminate_zero_rate` enforces:
     - Discharging on battery: enforces rate $\le -0.05$ %/min. If raw/smoothed is $>-0.05$, falls back to hardware-derived rate ($-\text{charge\_percent} / \text{hardware\_mins\_to\_empty}$) or conservative baseline $-0.08$ %/min.
     - Actively charging $< 100\%$: enforces rate $\ge +0.05$ %/min (fallback $+0.10$ %/min).
     - Plugged in and $\ge 100\%$: allows clean $0.00$ %/min.

5. **Sparkline Gating Logic (R5)**:
   - Updates to `capacity_history` occur only when `charge_percent` changes OR $\ge 60$ seconds have elapsed since the last push.
   - Capacity history caps at 20 samples (`Vec::drain`), representing up to 20 minutes of history instead of filling up in 40–50 seconds on high-frequency polling.

6. **AppHandle State Access Safety (`SharedMetricsState`)**:
   - `app.try_state::<crate::sysinfo::SharedMetricsState>()` safely queries state without panicking if unregistered.
   - Uses `state.read()` RwLock guard and safely clones `top_process_name`, handling lock poisoning by returning `None` instead of propagating failures.

7. **Test Validity & Quality (`src/test/battery.test.tsx` & Rust Unit Tests)**:
   - 12 Rust unit tests in `battery::tests` cover desktop fallback, instant rate calculation, EMA smoothing, zero-rate elimination, sparkline pacing, projection boundaries, and sliding window regression.
   - 17 Vitest tests in `src/test/battery.test.tsx` cover formatting of fractional rates, zero-rate elimination cases, multi-horizon projections (`~Xh Ym`), dynamic `top_process_name` high-drain banner updates, and desktop no-battery notice.
   - All tests pass cleanly (`cargo test --manifest-path src-tauri/Cargo.toml battery`: 12 passed; `npm.cmd test -- src/test/battery.test.tsx`: 17 passed).

---

## Findings

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | ENHANCEMENT | `src-tauri/src/battery/mod.rs:474` | `is_plugged_in` in WinRT report is computed as `is_charging || (status != WinRTBatteryStatus::Discharging)`. In rare OEM firmware where status is `Idle` while on battery, this might interpret as plugged in. | Consider checking AC line status or `SystemConditionFlags` if OEM discrepancies occur in production telemetry. | open (non-blocking) |
| 2 | ENHANCEMENT | `src-tauri/src/battery/mod.rs:321` | In `calculate_projections`, `telemetry.full_charge_mwh.unwrap_or(rem_mwh)` defaults to `rem_mwh` if `full_charge_mwh` is `None`. If battery is at 50% without full capacity metadata, 10% threshold calculation would base on current remaining rather than design full. | Minor edge case since WinRT provides both or falls through to fractional percentage branch. Can be noted for future refinement. | open (non-blocking) |

---

## Conclusion

Both WP-01 and WP-02 adhere strictly to the requirements in `docs/agents/SPEC.md`. Memory safety, thread safety, rate calculations, zero-rate elimination, sparkline pacing, and fallback mechanics are implemented robustly.

**Status: APPROVED**
