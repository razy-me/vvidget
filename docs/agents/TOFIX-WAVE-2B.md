# TOFIX Wave 2 Batch Part 2 — Review Findings (WP-08, WP-09, WP-10)

Commit Diff: `HEAD~1..HEAD` (`91598ec`) — **Verdict: APPROVED**

## Review Scope & Focus Verification

### 1. Calendar Note Validation & ISO Week Calculations (`WP-08 Calendar`)
- **Backend Validation & Data Integrity**:
  - `src-tauri/src/calendar/mod.rs` enforces strict string trimming and validation on both `date` (`"Date cannot be empty"`) and `note.text` (`"Note text cannot be empty"`).
  - Empty note IDs are automatically assigned a unique timestamp-derived identifier (`format!("note_{}", ...)`).
  - Note mutations (add, edit, remove, toggle completion) immediately persist to disk via `ConfigManager::save_immediate` and emit the reactive `config-changed` Tauri event.
- **ISO-8601 Week Calculation**:
  - `getISOWeek` in `src/widgets/calendar/calendarUtils.ts` adheres strictly to ISO-8601 standard: Week 1 is the week containing the first Thursday of the year, calculated in UTC to eliminate DST skew.
  - `getCalendarGrid` aligns weeks from Monday to Sunday (`startDayOffset = (firstDay.getDay() + 6) % 7`), assigns the ISO week number based on Thursday (`weekDays[3]`), and appropriately generates previous/next month day padding.
- **Frontend State Management**:
  - `useCalendar` hook provides optimistic local UI updates, synchronizes with `config.calendar_events`, and gracefully falls back in non-Tauri / test environments.
  - Calendar note completion status, quick-add input with form submit prevention, and agenda day view are fully covered by tests.

### 2. Clock Accuracy, Timer Countdown Bounds & Stopwatch Precision (`WP-08 Clock`)
- **Clock Accuracy & Timezones**:
  - `ClockWidget` uses a 250ms tick interval to ensure immediate second-transition precision without visual lag.
  - Formats time via `Intl.DateTimeFormat` with configurable timezone IDs (`Europe/Berlin`, `Europe/London`, `America/New_York`, `Asia/Tokyo`, `UTC`, `local`), with robust fallbacks.
  - Supports both Digital (tabular numerals with glowing animated colon) and Analog views (vector SVG clock dial with mathematical trigonometric hour/minute/second hand angle calculations).
- **Timer Countdown Bounds**:
  - Custom minute and second inputs enforce non-negative boundaries (`Math.max(0, ...)`), with `total > 0` validation.
  - Countdown intervals safely bottom out at 0 (`prev <= 1 ? 0 : prev - 1`) and automatically stop running (`setIsTimerRunning(false)`).
  - Visual circular SVG progress ring clamps progress percentage strictly within `[0, 100]`.
- **Stopwatch Centisecond Precision**:
  - Utilizes high-resolution `performance.now()` for elapsed calculation, accumulating elapsed deltas across pause and resume cycles via refs.
  - Calculates and formats minutes, seconds, and centiseconds (`Math.floor((safeMs % 1000) / 10)`).
  - Lap recording tracks both individual lap duration and total cumulative time in a scrollable lap list.
- **Alarm State Toggling**:
  - Fluent toggle switch (`role="switch"`, `aria-checked`) manages alarm armed state with reactive UI updates.
  - Includes alarm simulation test triggering with alert styling.

### 3. Bluetooth WinRT Enumeration, COM Safety & Fallback Handling (`WP-09 Bluetooth`)
- **WinRT Device Enumeration**:
  - Enumerates paired Bluetooth devices via `BluetoothDevice::GetDeviceSelectorFromPairingState(true)` and `DeviceInformation::FindAllAsyncAqsFilter`.
  - Determines connection state and device type classification (`AudioVideo` -> `"audio"`, `Peripheral` -> `"input"`, `Phone` -> `"phone"`) via `BluetoothDevice::FromIdAsync`.
  - Queries `System.Devices.Aep.BatteryLevel` property from device properties safely.
- **COM Safety & Threading**:
  - Implements RAII `ComGuard` initializing multithreaded COM (`CoInitializeEx(None, COINIT_MULTITHREADED)`) with deterministic `CoUninitialize()` on Drop.
  - Dispatches enumeration and settings invocations to dedicated background threads using `tokio::task::spawn_blocking`.
- **Radio Off & Error Fallback**:
  - Backend returns `Ok(vec![])` on WinRT failures, preventing crashes when the Bluetooth radio is disabled, unsupported, or in airplane mode.
  - Frontend cleanly renders a Windows 11 Fluent empty-state view (`"Keine Geräte gefunden"`) explaining that Bluetooth may be switched off.
  - Device refresh button indicates loading via spinning animation. Quick-action button invokes `open_bluetooth_settings` (`ms-settings:bluetooth` via `ShellExecuteW`).

### 4. Battery Parsing, Sliding Window Analytics & Desktop Fallback (`WP-10 Laptop Battery`)
- **Power Status Parsing**:
  - `parse_power_status` correctly decodes Win32 `SYSTEM_POWER_STATUS` flags (`ACLineStatus`, `BatteryFlag`, `BatteryLifePercent`, `BatteryLifeTime`).
  - Correctly detects desktop PCs (`BatteryFlag` bit 7 set to 128, or `BatteryLifePercent == 255`) and marks `has_battery: false`.
- **Sliding Window Drain Rate Calculation**:
  - `BatteryTracker` maintains up to 40 samples within a 15-minute sliding window.
  - Computes drain/charge rate (%/min) using linear regression (least squares) across time-series samples.
  - Resets sliding window samples when switching between charging and discharging to prevent rate calculation skew.
- **Multi-Horizon Projections**:
  - `calculate_projections` generates three distinct discharging projections:
    - Time until 20% capacity (`estimated_mins_to_20_percent`).
    - Time until 10% capacity (`estimated_mins_to_10_percent`).
    - Time until empty (`estimated_mins_to_empty`).
  - Supports fallback to hardware/OS estimated time when sliding window rate is not yet statistically significant.
  - Charging state cleanly returns `None` for low-capacity projections, rendered in the UI as `"Wird geladen"` and `"Netzbetrieb"`.
- **Non-Battery Desktop Fallback**:
  - Renders a dedicated desktop PC fallback card with a Fluent Monitor icon, informative message, button to open Windows power settings (`ms-settings:powersleep`), and dismiss/restore options.
- **Sparkline & High-Drain Alerts**:
  - Smooth SVG sparkline with gradient fill tracks the last 20 capacity samples.
  - Amber warning banner automatically highlights high drain rates exceeding -1.5 %/min (`HIGH_DRAIN_THRESHOLD`).

### 5. Windows 11 Fluent Design Fidelity & Full Test Suite Status
- **Fluent Design Tokens**:
  - Acrylic card backdrops with `backdrop-blur`, subtle borders (`border-[var(--fluent-stroke)]`), translucent glass panels (`bg-white/[0.04]`), and standard Fluent color tokens (`--fluent-accent`, `--fluent-text-primary`, `--fluent-text-secondary`, `--fluent-text-tertiary`, `--fluent-card-bg`, `--fluent-card-hover`, `--fluent-error`, `--fluent-warning`).
  - Segmented controls, toggle switches, and input styling follow Windows 11 design specifications.
- **Full Test Suite Status**:
  - **Vitest**: 29 test files, 215 tests passing (100%).
  - **Cargo Test**: 131 tests passing (100%).
  - Zero test regressions across earlier starter widgets, IPC models, window snapping, and multi-instance managers.

---

## Findings

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | ENHANCEMENT | `src-tauri/src/battery/mod.rs:300` | `top_process_name` in `BatteryStatus` is currently returned as `None` in `get_battery_status()` because process CPU metrics are tracked in the sysinfo collector. | In Wave 3, optionally bridge the top CPU process from `sysinfo::collector` into `BatteryStatus` to display the specific culprit app name on high drain rate alerts. | open (non-blocking) |
| 2 | ENHANCEMENT | `src/widgets/clock/ClockWidget.tsx:812` | Clock alarm simulation toggles an in-widget ringing state, but does not yet trigger a Windows native toast notification via `tauri-plugin-notification`. | Consider wiring Windows native toast notification during Wave 3 polish. | open (non-blocking) |

---

## Conclusion

Wave 2 Batch Part 2 (WP-08 Calendar & Clock, WP-09 Bluetooth, WP-10 Laptop Battery) exhibits high engineering quality, robust validation, COM safety, accurate mathematical and ISO calculations, resilient fallback handling, and native Windows 11 Fluent Design fidelity. All 215 frontend unit/integration tests and 131 Rust unit tests pass cleanly.

**Verdict: APPROVED.**
