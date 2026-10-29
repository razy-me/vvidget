use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct BatteryStatus {
    /// Whether a physical battery is present (false on desktops, signals widget to hide/absent).
    pub has_battery: bool,
    /// Current charge percentage (0-100).
    pub charge_percent: u8,
    /// Whether the battery is actively charging.
    pub is_charging: bool,
    /// Whether connected to AC power.
    pub is_plugged_in: bool,
    /// Drain/charge rate in %/min (negative when discharging, e.g. -0.28, positive when charging).
    pub drain_rate_percent_per_min: f32,
    /// Estimated time remaining until 10% capacity in minutes.
    pub estimated_mins_to_10_percent: Option<u32>,
    /// Estimated time remaining until 20% capacity in minutes.
    pub estimated_mins_to_20_percent: Option<u32>,
    /// Estimated time remaining until 0% capacity (empty) in minutes.
    pub estimated_mins_to_empty: Option<u32>,
    /// Recent battery capacity samples for sparkline graph (up to 20 samples).
    pub capacity_history: Vec<u8>,
    /// Top CPU-consuming process name if available.
    pub top_process_name: Option<String>,
}

impl Default for BatteryStatus {
    fn default() -> Self {
        Self {
            has_battery: false,
            charge_percent: 100,
            is_charging: false,
            is_plugged_in: true,
            drain_rate_percent_per_min: 0.0,
            estimated_mins_to_10_percent: None,
            estimated_mins_to_20_percent: None,
            estimated_mins_to_empty: None,
            capacity_history: Vec::new(),
            top_process_name: None,
        }
    }
}

/// Raw telemetry snapshot gathered from WinRT BatteryReport or Win32 GetSystemPowerStatus fallback.
#[derive(Debug, Clone, PartialEq)]
pub struct RawBatteryTelemetry {
    pub has_battery: bool,
    pub charge_percent_exact: f64,
    pub charge_percent: u8,
    pub is_charging: bool,
    pub is_plugged_in: bool,
    pub charge_rate_mw: Option<i32>,
    pub remaining_mwh: Option<i32>,
    pub full_charge_mwh: Option<i32>,
    pub hardware_mins_to_empty: Option<u32>,
}

impl Default for RawBatteryTelemetry {
    fn default() -> Self {
        Self {
            has_battery: false,
            charge_percent_exact: 100.0,
            charge_percent: 100,
            is_charging: false,
            is_plugged_in: true,
            charge_rate_mw: None,
            remaining_mwh: None,
            full_charge_mwh: None,
            hardware_mins_to_empty: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BatterySample {
    pub timestamp: Instant,
    pub percent: f32,
    pub is_charging: bool,
}

pub struct BatteryTracker {
    pub samples: Vec<BatterySample>,
    pub capacity_history: Vec<u8>,
    pub smoothed_rate: Option<f32>,
    pub last_sparkline_push: Option<Instant>,
    pub last_sparkline_percent: Option<u8>,
    pub last_power_state: Option<(bool, bool)>,
}

impl BatteryTracker {
    pub const fn new() -> Self {
        Self {
            samples: Vec::new(),
            capacity_history: Vec::new(),
            smoothed_rate: None,
            last_sparkline_push: None,
            last_sparkline_percent: None,
            last_power_state: None,
        }
    }

    /// Records high-precision telemetry, computes EMA smoothed rate, eliminates 0-rate anomalies,
    /// and updates 60s/delta-gated sparkline capacity history.
    pub fn record_telemetry(&mut self, telemetry: &RawBatteryTelemetry, now: Instant) -> f32 {
        // Reset state if power or charging state toggled (e.g. plugged in / unplugged)
        if let Some((last_charging, last_plugged)) = self.last_power_state {
            if last_charging != telemetry.is_charging || last_plugged != telemetry.is_plugged_in {
                self.samples.clear();
                self.smoothed_rate = None;
            }
        }
        self.last_power_state = Some((telemetry.is_charging, telemetry.is_plugged_in));

        // Record sliding-window sample for fallback regression
        self.samples.push(BatterySample {
            timestamp: now,
            percent: telemetry.charge_percent_exact as f32,
            is_charging: telemetry.is_charging,
        });

        // Retain samples within 15 minutes (max 40)
        self.samples.retain(|s| now.duration_since(s.timestamp).as_secs() <= 900);
        if self.samples.len() > 40 {
            let start = self.samples.len() - 40;
            self.samples.drain(0..start);
        }

        // Gate sparkline history updates: only push if percent changed OR >= 60s elapsed
        let should_push_history = match (self.last_sparkline_percent, self.last_sparkline_push) {
            (Some(prev_pct), Some(prev_time)) => {
                prev_pct != telemetry.charge_percent
                    || now.duration_since(prev_time).as_secs() >= 60
            }
            _ => true,
        };

        if should_push_history {
            self.capacity_history.push(telemetry.charge_percent);
            if self.capacity_history.len() > 20 {
                let excess = self.capacity_history.len() - 20;
                self.capacity_history.drain(0..excess);
            }
            self.last_sparkline_percent = Some(telemetry.charge_percent);
            self.last_sparkline_push = Some(now);
        }

        // 1. Calculate raw instantaneous rate from mW if available
        let instant_hw_rate = compute_instant_rate_pct_per_min(
            telemetry.charge_rate_mw,
            telemetry.full_charge_mwh,
        );

        // 2. Fall back to linear regression from samples if no direct mW rate
        let raw_rate = instant_hw_rate.unwrap_or_else(|| {
            calculate_rate_from_samples(&self.samples)
        });

        // 3. Smooth with EMA (alpha = 0.35)
        let alpha = 0.35f32;
        let smoothed = match self.smoothed_rate {
            Some(prev) => (alpha * raw_rate) + ((1.0 - alpha) * prev),
            None => raw_rate,
        };
        self.smoothed_rate = Some(smoothed);

        // 4. Zero-rate elimination (R3)
        let finalized_rate = eliminate_zero_rate(
            smoothed,
            telemetry.is_charging,
            telemetry.is_plugged_in,
            telemetry.charge_percent,
            telemetry.hardware_mins_to_empty,
        );

        // Round to 2 decimal places
        ((finalized_rate * 100.0).round() / 100.0) as f32
    }

    /// Legacy record_sample wrapper for compatibility and tests.
    pub fn record_sample(&mut self, percent: u8, is_charging: bool, now: Instant) {
        let telemetry = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: percent as f64,
            charge_percent: percent,
            is_charging,
            is_plugged_in: is_charging,
            charge_rate_mw: None,
            remaining_mwh: None,
            full_charge_mwh: None,
            hardware_mins_to_empty: None,
        };
        self.record_telemetry(&telemetry, now);
    }

    /// Calculates drain rate in %/min over the sliding window.
    pub fn calculate_drain_rate(&self) -> f32 {
        self.smoothed_rate.unwrap_or_else(|| calculate_rate_from_samples(&self.samples))
    }
}

/// Computes instantaneous rate in %/min from hardware charge rate in milliwatts.
/// Formula: rate_pct_per_min = (charge_rate_mw / full_charge_mwh) * (100 / 60)
pub fn compute_instant_rate_pct_per_min(
    charge_rate_mw: Option<i32>,
    full_charge_mwh: Option<i32>,
) -> Option<f32> {
    let rate_mw = charge_rate_mw?;
    let full_mwh = full_charge_mwh?;

    if full_mwh <= 0 {
        return None;
    }

    let rate = (rate_mw as f64 / full_mwh as f64) * (100.0 / 60.0);
    Some(rate as f32)
}

/// Enforces physically realistic rates (R3 Zero-Rate Elimination):
/// - Discharging on battery: rate must be <= -0.05 %/min (if >= -0.05, use hardware estimated time or fallback -0.08 %/min).
/// - Charging < 100%: rate must be >= +0.05 %/min (fallback +0.10 %/min).
/// - Fully charged (100%) and plugged in: exactly 0.00 %/min.
pub fn eliminate_zero_rate(
    current_rate: f32,
    is_charging: bool,
    is_plugged_in: bool,
    charge_percent: u8,
    hardware_mins_to_empty: Option<u32>,
) -> f32 {
    if !is_charging && !is_plugged_in {
        // Discharging on battery
        if current_rate > -0.05 {
            // Rate is too close to 0 or positive; apply physically grounded floor
            if let Some(mins) = hardware_mins_to_empty {
                if mins > 0 && charge_percent > 0 {
                    let derived = -(charge_percent as f32 / mins as f32);
                    return derived.min(-0.05);
                }
            }
            return -0.08;
        }
        current_rate
    } else if is_charging && charge_percent < 100 {
        // Actively charging below 100%
        if current_rate < 0.05 {
            return 0.10;
        }
        current_rate
    } else if is_plugged_in && charge_percent >= 100 {
        // Plugged in and full
        0.0
    } else {
        current_rate
    }
}

static TRACKER: Mutex<BatteryTracker> = Mutex::new(BatteryTracker::new());

/// Calculates rate of change in % per minute using linear regression over time-series samples.
pub fn calculate_rate_from_samples(samples: &[BatterySample]) -> f32 {
    if samples.len() < 2 {
        return 0.0;
    }

    let first_time = samples[0].timestamp;
    let points: Vec<(f64, f64)> = samples
        .iter()
        .map(|s| {
            let t = s.timestamp.duration_since(first_time).as_secs_f64();
            (t, s.percent as f64)
        })
        .collect();

    let total_secs = points.last().unwrap().0;
    if total_secs < 2.0 {
        return 0.0;
    }

    let n = points.len() as f64;
    let sum_t: f64 = points.iter().map(|p| p.0).sum();
    let sum_y: f64 = points.iter().map(|p| p.1).sum();
    let mean_t = sum_t / n;
    let mean_y = sum_y / n;

    let mut numerator = 0.0;
    let mut denominator = 0.0;
    for (t, y) in points {
        let dt = t - mean_t;
        let dy = y - mean_y;
        numerator += dt * dy;
        denominator += dt * dt;
    }

    if denominator.abs() < 1e-6 {
        return 0.0;
    }

    let slope_per_sec = numerator / denominator;
    let slope_per_min = slope_per_sec * 60.0;

    // Round to 2 decimal places
    ((slope_per_min * 100.0).round() / 100.0) as f32
}

/// Computes multi-horizon battery projections to 10%, 20%, and 0% (empty).
/// Supports high-precision mWh/mW telemetry and fractional percentage rate.
pub fn calculate_projections(
    telemetry: &RawBatteryTelemetry,
    drain_rate_percent_per_min: f32,
) -> (Option<u32>, Option<u32>, Option<u32>) {
    if telemetry.is_charging || telemetry.is_plugged_in {
        return (None, None, None);
    }

    // Direct mWh / mW hardware calculation if available and discharging
    if let (Some(rem_mwh), Some(rate_mw)) = (telemetry.remaining_mwh, telemetry.charge_rate_mw) {
        if rate_mw < 0 && rem_mwh > 0 {
            let discharge_mw = (-rate_mw) as f64;
            let full_mwh = telemetry.full_charge_mwh.unwrap_or(rem_mwh) as f64;

            let mwh_at_10 = full_mwh * 0.10;
            let mwh_at_20 = full_mwh * 0.20;
            let rem_mwh_f64 = rem_mwh as f64;

            let mins_to_empty = ((rem_mwh_f64 / discharge_mw) * 60.0).round() as u32;

            let mins_to_10 = if rem_mwh_f64 > mwh_at_10 {
                Some((((rem_mwh_f64 - mwh_at_10) / discharge_mw) * 60.0).round() as u32)
            } else {
                Some(0)
            };

            let mins_to_20 = if rem_mwh_f64 > mwh_at_20 {
                Some((((rem_mwh_f64 - mwh_at_20) / discharge_mw) * 60.0).round() as u32)
            } else {
                Some(0)
            };

            return (mins_to_10, mins_to_20, Some(mins_to_empty));
        }
    }

    // Fractional percentage / smoothed rate calculation
    if drain_rate_percent_per_min < -0.01 {
        let abs_rate = drain_rate_percent_per_min.abs() as f64;
        let pct = telemetry.charge_percent_exact;

        let mins_to_empty = (pct / abs_rate).round() as u32;

        let mins_to_10 = if pct > 10.0 {
            Some(((pct - 10.0) / abs_rate).round() as u32)
        } else {
            Some(0)
        };

        let mins_to_20 = if pct > 20.0 {
            Some(((pct - 20.0) / abs_rate).round() as u32)
        } else {
            Some(0)
        };

        return (mins_to_10, mins_to_20, Some(mins_to_empty));
    }

    // Fallback: If hardware/OS provided estimated mins to empty
    if let Some(empty_mins) = telemetry.hardware_mins_to_empty {
        let pct = telemetry.charge_percent_exact;
        if pct > 0.0 {
            let mins_per_percent = empty_mins as f64 / pct;
            let mins_to_10 = if pct > 10.0 {
                Some(((pct - 10.0) * mins_per_percent).round() as u32)
            } else {
                Some(0)
            };
            let mins_to_20 = if pct > 20.0 {
                Some(((pct - 20.0) * mins_per_percent).round() as u32)
            } else {
                Some(0)
            };
            return (mins_to_10, mins_to_20, Some(empty_mins));
        }
    }

    (None, None, None)
}

/// Evaluates raw power parameters to detect whether a system has a physical battery (Win32 fallback).
pub fn parse_power_status(
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    battery_life_time_secs: u32,
) -> RawBatteryTelemetry {
    // BatteryFlag bit 7 (128) means "No system battery"
    // BatteryLifePercent == 255 means Unknown (standard on desktop systems without battery)
    let has_battery = (battery_flag & 128 == 0) && (battery_life_percent <= 100);

    if !has_battery {
        let is_plugged_in = ac_line_status == 1;
        return RawBatteryTelemetry {
            has_battery: false,
            charge_percent_exact: 100.0,
            charge_percent: 100,
            is_charging: false,
            is_plugged_in,
            charge_rate_mw: None,
            remaining_mwh: None,
            full_charge_mwh: None,
            hardware_mins_to_empty: None,
        };
    }

    let charge_percent = battery_life_percent.min(100);
    let is_plugged_in = ac_line_status == 1;
    let is_charging = is_plugged_in && ((battery_flag & 8 != 0) || (charge_percent < 100 && ac_line_status == 1));

    let hardware_mins = if battery_life_time_secs != u32::MAX && battery_life_time_secs > 0 {
        Some(battery_life_time_secs / 60)
    } else {
        None
    };

    RawBatteryTelemetry {
        has_battery: true,
        charge_percent_exact: charge_percent as f64,
        charge_percent,
        is_charging,
        is_plugged_in,
        charge_rate_mw: None,
        remaining_mwh: None,
        full_charge_mwh: None,
        hardware_mins_to_empty: hardware_mins,
    }
}

/// Queries WinRT AggregateBattery report.
#[cfg(target_os = "windows")]
fn query_winrt_battery_report() -> Result<RawBatteryTelemetry, String> {
    let _com_guard = crate::geo::winrt::ComGuard::new();
    use windows::Devices::Power::Battery;
    use windows::System::Power::BatteryStatus as WinRTBatteryStatus;

    let battery = Battery::AggregateBattery()
        .map_err(|e| format!("Battery::AggregateBattery failed: {}", e))?;
    let report = battery
        .GetReport()
        .map_err(|e| format!("Battery::GetReport failed: {}", e))?;

    let status = report
        .Status()
        .map_err(|e| format!("GetReport::Status failed: {}", e))?;

    let charge_rate_mw: Option<i32> = report.ChargeRateInMilliwatts().ok().and_then(|ref_val| {
        ref_val.GetInt32().ok()
    });
    let remaining_mwh: Option<i32> = report.RemainingCapacityInMilliwattHours().ok().and_then(|ref_val| {
        ref_val.GetInt32().ok()
    });
    let full_charge_mwh: Option<i32> = report.FullChargeCapacityInMilliwattHours().ok().and_then(|ref_val| {
        ref_val.GetInt32().ok()
    });

    let (charge_percent_exact, charge_percent) = match (remaining_mwh, full_charge_mwh) {
        (Some(rem), Some(full)) if full > 0 && rem >= 0 => {
            let exact = (rem as f64 / full as f64 * 100.0).clamp(0.0, 100.0);
            let rounded = exact.round() as u8;
            (exact, rounded)
        }
        _ => return Err("Missing or invalid mWh capacities in WinRT BatteryReport".to_string()),
    };

    let is_charging = status == WinRTBatteryStatus::Charging;
    let is_plugged_in = is_charging || (status != WinRTBatteryStatus::Discharging);
    let has_battery = status != WinRTBatteryStatus::NotPresent;

    Ok(RawBatteryTelemetry {
        has_battery,
        charge_percent_exact,
        charge_percent,
        is_charging,
        is_plugged_in,
        charge_rate_mw,
        remaining_mwh,
        full_charge_mwh,
        hardware_mins_to_empty: None,
    })
}

/// Native Win32 / WinRT query implementation.
#[cfg(target_os = "windows")]
fn query_native_power_status() -> Result<RawBatteryTelemetry, String> {
    // 1. First attempt WinRT AggregateBattery report
    if let Ok(telemetry) = query_winrt_battery_report() {
        return Ok(telemetry);
    }

    // 2. Fall back to Win32 GetSystemPowerStatus
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

    let mut status = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut status) }
        .map_err(|e| format!("Win32 GetSystemPowerStatus call failed: {}", e))?;

    Ok(parse_power_status(
        status.ACLineStatus,
        status.BatteryFlag,
        status.BatteryLifePercent,
        status.BatteryLifeTime,
    ))
}

#[cfg(not(target_os = "windows"))]
fn query_native_power_status() -> Result<RawBatteryTelemetry, String> {
    // Non-windows fallback simulation
    Ok(RawBatteryTelemetry {
        has_battery: true,
        charge_percent_exact: 78.4,
        charge_percent: 78,
        is_charging: false,
        is_plugged_in: false,
        charge_rate_mw: Some(-10500),
        remaining_mwh: Some(41000),
        full_charge_mwh: Some(50000),
        hardware_mins_to_empty: Some(215),
    })
}

/// Queries current battery status and updates rolling sliding-window analytics.
#[tauri::command]
#[specta::specta]
pub fn get_battery_status<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<BatteryStatus, String> {
    let telemetry = query_native_power_status()?;

    // Read top_process_name from shared sysinfo metrics if available
    let top_process = if let Some(state) = app.try_state::<crate::sysinfo::SharedMetricsState>() {
        if let Ok(guard) = state.read() {
            guard.top_process_name.clone()
        } else {
            None
        }
    } else {
        None
    };

    if !telemetry.has_battery {
        return Ok(BatteryStatus {
            has_battery: false,
            charge_percent: 100,
            is_charging: false,
            is_plugged_in: telemetry.is_plugged_in,
            drain_rate_percent_per_min: 0.0,
            estimated_mins_to_10_percent: None,
            estimated_mins_to_20_percent: None,
            estimated_mins_to_empty: None,
            capacity_history: Vec::new(),
            top_process_name: top_process,
        });
    }

    let mut tracker = TRACKER
        .lock()
        .map_err(|e| format!("Battery tracker lock poisoned: {}", e))?;

    let now = Instant::now();
    let drain_rate = tracker.record_telemetry(&telemetry, now);
    let (to_10, to_20, to_empty) = calculate_projections(&telemetry, drain_rate);

    Ok(BatteryStatus {
        has_battery: true,
        charge_percent: telemetry.charge_percent,
        is_charging: telemetry.is_charging,
        is_plugged_in: telemetry.is_plugged_in,
        drain_rate_percent_per_min: drain_rate,
        estimated_mins_to_10_percent: to_10,
        estimated_mins_to_20_percent: to_20,
        estimated_mins_to_empty: to_empty,
        capacity_history: tracker.capacity_history.clone(),
        top_process_name: top_process,
    })
}

/// Spawns background battery monitor on EcoQoS E-core thread with WinRT ReportUpdated event push.
pub fn start_battery_monitor<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    std::thread::Builder::new()
        .name("vvidget-battery-monitor".to_string())
        .spawn(move || {
            #[cfg(windows)]
            let _ = crate::window::win32::enable_current_thread_eco_qos();

            let _com_guard = crate::geo::winrt::ComGuard::new();

            let notify_flag = std::sync::Arc::new((
                std::sync::Mutex::new(false),
                std::sync::Condvar::new(),
            ));
            let notify_clone = std::sync::Arc::clone(&notify_flag);

            #[cfg(target_os = "windows")]
            let _event_token = {
                use windows::core::IInspectable;
                use windows::Devices::Power::Battery;
                use windows::Foundation::TypedEventHandler;

                match Battery::AggregateBattery() {
                    Ok(battery) => {
                        let res = battery.ReportUpdated(&TypedEventHandler::<Battery, IInspectable>::new(
                            move |_, _| {
                                let (lock, cvar) = &*notify_clone;
                                if let Ok(mut flag) = lock.lock() {
                                    *flag = true;
                                    cvar.notify_all();
                                }
                                Ok(())
                            },
                        ));
                        match res {
                            Ok(token) => {
                                log::info!("Successfully hooked WinRT Battery::AggregateBattery().ReportUpdated");
                                Some((battery, token))
                            }
                            Err(e) => {
                                log::warn!("Failed to hook WinRT Battery ReportUpdated: {e}");
                                None
                            }
                        }
                    }
                    Err(e) => {
                        log::debug!("WinRT AggregateBattery not available (desktop/headless): {e}");
                        None
                    }
                }
            };

            let mut last_status: Option<BatteryStatus> = None;

            loop {
                let should_sample = if let Some(pm) = app.try_state::<crate::power::PowerManager>() {
                    pm.should_sample()
                } else if let Some(state) = app.try_state::<crate::power::PowerState>() {
                    state.should_sample()
                } else if let Some(state) = app.try_state::<std::sync::Arc<crate::power::PowerState>>() {
                    state.should_sample()
                } else {
                    true
                };

                if !should_sample {
                    std::thread::sleep(std::time::Duration::from_millis(3000));
                    continue;
                }

                match get_battery_status(app.clone()) {
                    Ok(current) => {
                        let should_emit = match &last_status {
                            Some(prev) => prev != &current,
                            None => true,
                        };

                        if should_emit {
                            let _ = app.emit_to("main", "battery-update", &current);
                            let _ = app.emit_to("widget_battery", "battery-update", &current);
                            last_status = Some(current.clone());
                        }

                        let timeout_secs = if !current.has_battery {
                            60
                        } else if !current.is_charging && !current.is_plugged_in {
                            10
                        } else if current.is_charging && current.charge_percent < 100 {
                            15
                        } else {
                            30
                        };

                        let (lock, cvar) = &*notify_flag;
                        if let Ok(guard) = lock.lock() {
                            if !*guard {
                                if let Ok((mut g, _)) = cvar.wait_timeout(guard, std::time::Duration::from_secs(timeout_secs)) {
                                    *g = false;
                                }
                            } else {
                                drop(guard);
                                if let Ok(mut g) = lock.lock() {
                                    *g = false;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::trace!("Battery monitor error: {e}");
                        std::thread::sleep(std::time::Duration::from_secs(30));
                    }
                }
            }
        })
        .expect("Failed to spawn vvidget-battery-monitor thread");
}

/// Opens the Windows Power & Sleep Settings panel (`ms-settings:powersleep`).
#[tauri::command]
#[specta::specta]
pub fn open_power_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let wide_target: Vec<u16> = OsStr::new("ms-settings:powersleep")
            .encode_wide()
            .chain(Some(0))
            .collect();
        let wide_open: Vec<u16> = OsStr::new("open")
            .encode_wide()
            .chain(Some(0))
            .collect();

        let res = unsafe {
            ShellExecuteW(
                HWND(std::ptr::null_mut()),
                PCWSTR(wide_open.as_ptr()),
                PCWSTR(wide_target.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };

        if (res.0 as usize) > 32 {
            Ok(())
        } else {
            Err(format!(
                "Failed to open ms-settings:powersleep: code {}",
                res.0 as usize
            ))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        log::info!("Simulated open_power_settings");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_desktop_fallback_no_battery() {
        // BatteryFlag = 128 (No battery)
        let telemetry = parse_power_status(1, 128, 255, u32::MAX);
        assert!(!telemetry.has_battery);
        assert_eq!(telemetry.charge_percent, 100);
        assert!(!telemetry.is_charging);
        assert!(telemetry.is_plugged_in);
        assert_eq!(telemetry.hardware_mins_to_empty, None);

        // Unknown percent = 255
        let telemetry2 = parse_power_status(1, 0, 255, u32::MAX);
        assert!(!telemetry2.has_battery);
    }

    #[test]
    fn test_parse_laptop_power_status() {
        // Discharging at 78%
        let telemetry = parse_power_status(0, 0, 78, 12000);
        assert!(telemetry.has_battery);
        assert_eq!(telemetry.charge_percent, 78);
        assert!(!telemetry.is_charging);
        assert!(!telemetry.is_plugged_in);
        assert_eq!(telemetry.hardware_mins_to_empty, Some(200));

        // Charging on AC at 45%
        let telemetry = parse_power_status(1, 8, 45, u32::MAX);
        assert!(telemetry.has_battery);
        assert_eq!(telemetry.charge_percent, 45);
        assert!(telemetry.is_charging);
        assert!(telemetry.is_plugged_in);
    }

    #[test]
    fn test_compute_instant_rate_pct_per_min() {
        // -10,500 mW draw on 50,000 mWh battery
        // (-10500 / 50000) * (100 / 60) = -0.21 * 1.666667 = -0.35 %/min
        let rate = compute_instant_rate_pct_per_min(Some(-10500), Some(50000));
        assert!(rate.is_some());
        let val = rate.unwrap();
        assert!((val - (-0.35)).abs() < 1e-4);

        // Charging: +15,000 mW on 60,000 mWh battery
        // (15000 / 60000) * (100 / 60) = 0.25 * 1.666667 = +0.416667 %/min
        let rate_chg = compute_instant_rate_pct_per_min(Some(15000), Some(60000)).unwrap();
        assert!((rate_chg - 0.416667).abs() < 1e-4);

        // Edge case: None or zero capacity
        assert_eq!(compute_instant_rate_pct_per_min(None, Some(50000)), None);
        assert_eq!(compute_instant_rate_pct_per_min(Some(-1000), Some(0)), None);
        assert_eq!(compute_instant_rate_pct_per_min(Some(-1000), Some(-500)), None);
    }

    #[test]
    fn test_ema_rate_smoothing() {
        let mut tracker = BatteryTracker::new();
        let t0 = Instant::now();

        // 1st telemetry: -10500 mW on 50000 mWh => instant rate = -0.35 %/min
        let t1 = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: 80.0,
            charge_percent: 80,
            is_charging: false,
            is_plugged_in: false,
            charge_rate_mw: Some(-10500),
            remaining_mwh: Some(40000),
            full_charge_mwh: Some(50000),
            hardware_mins_to_empty: None,
        };
        let rate1 = tracker.record_telemetry(&t1, t0);
        assert_eq!(rate1, -0.35);

        // 2nd telemetry after 2s: rate surges to -15000 mW => instant rate = -0.50 %/min
        // EMA: 0.35 * (-0.50) + 0.65 * (-0.35) = -0.175 - 0.2275 = -0.4025 => -0.40
        let t2 = RawBatteryTelemetry {
            charge_rate_mw: Some(-15000),
            ..t1
        };
        let rate2 = tracker.record_telemetry(&t2, t0 + Duration::from_secs(2));
        assert_eq!(rate2, -0.40);
    }

    #[test]
    fn test_zero_rate_elimination() {
        // Discharging on battery, raw rate is 0.00
        let rate_disch = eliminate_zero_rate(0.0, false, false, 80, None);
        assert_eq!(rate_disch, -0.08);

        // Discharging on battery, with hardware remaining time: 80% remaining, 800 mins
        // derived = -(80 / 800) = -0.10 %/min
        let rate_disch_hw = eliminate_zero_rate(0.0, false, false, 80, Some(800));
        assert_eq!(rate_disch_hw, -0.10);

        // Charging < 100%, raw rate is 0.00
        let rate_chg = eliminate_zero_rate(0.0, true, true, 50, None);
        assert_eq!(rate_chg, 0.10);

        // Fully charged (100%) and plugged in
        let rate_full = eliminate_zero_rate(0.0, false, true, 100, None);
        assert_eq!(rate_full, 0.00);
    }

    #[test]
    fn test_sparkline_gating_60s_or_delta() {
        let mut tracker = BatteryTracker::new();
        let t0 = Instant::now();

        let make_telemetry = |pct: u8| RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: pct as f64,
            charge_percent: pct,
            is_charging: false,
            is_plugged_in: false,
            charge_rate_mw: Some(-10500),
            remaining_mwh: Some(40000),
            full_charge_mwh: Some(50000),
            hardware_mins_to_empty: None,
        };

        // 1. Initial sample
        tracker.record_telemetry(&make_telemetry(80), t0);
        assert_eq!(tracker.capacity_history.len(), 1);

        // 2. Sample 10s later with SAME percent -> should NOT push
        tracker.record_telemetry(&make_telemetry(80), t0 + Duration::from_secs(10));
        assert_eq!(tracker.capacity_history.len(), 1);

        // 3. Sample 20s later with CHANGED percent (79) -> should push immediately
        tracker.record_telemetry(&make_telemetry(79), t0 + Duration::from_secs(20));
        assert_eq!(tracker.capacity_history.len(), 2);
        assert_eq!(tracker.capacity_history, vec![80, 79]);

        // 4. Sample 30s after previous (t0 + 50s) with SAME percent (79) -> should NOT push
        tracker.record_telemetry(&make_telemetry(79), t0 + Duration::from_secs(50));
        assert_eq!(tracker.capacity_history.len(), 2);

        // 5. Sample 65s after previous (t0 + 85s) with SAME percent (79) -> should push due to 60s rule
        tracker.record_telemetry(&make_telemetry(79), t0 + Duration::from_secs(85));
        assert_eq!(tracker.capacity_history.len(), 3);
        assert_eq!(tracker.capacity_history, vec![80, 79, 79]);
    }

    #[test]
    fn test_projections_from_mwh_and_mw() {
        // 41,000 mWh remaining, 50,000 mWh full, -10,500 mW rate
        // 10% mWh = 5,000 mWh; 20% mWh = 10,000 mWh
        // mins_to_empty: (41000 / 10500) * 60 = 234.28 mins = 234 mins
        // mins_to_10%: ((41000 - 5000) / 10500) * 60 = (36000 / 10500) * 60 = 205.71 mins = 206 mins
        // mins_to_20%: ((41000 - 10000) / 10500) * 60 = (31000 / 10500) * 60 = 177.14 mins = 177 mins
        let telemetry = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: 82.0,
            charge_percent: 82,
            is_charging: false,
            is_plugged_in: false,
            charge_rate_mw: Some(-10500),
            remaining_mwh: Some(41000),
            full_charge_mwh: Some(50000),
            hardware_mins_to_empty: None,
        };

        let (to_10, to_20, to_empty) = calculate_projections(&telemetry, -0.35);
        assert_eq!(to_20, Some(177));
        assert_eq!(to_10, Some(206));
        assert_eq!(to_empty, Some(234));
    }

    #[test]
    fn test_projections_discharging_fallback_rate() {
        let telemetry = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: 78.0,
            charge_percent: 78,
            is_charging: false,
            is_plugged_in: false,
            charge_rate_mw: None,
            remaining_mwh: None,
            full_charge_mwh: None,
            hardware_mins_to_empty: None,
        };
        let drain_rate = -0.28;

        let (to_10, to_20, to_empty) = calculate_projections(&telemetry, drain_rate);

        // Bis 20%: (78 - 20) / 0.28 = 58 / 0.28 = 207.14 mins = 207 mins
        assert_eq!(to_20, Some(207));
        // Bis 10%: (78 - 10) / 0.28 = 68 / 0.28 = 242.85 mins = 243 mins
        assert_eq!(to_10, Some(243));
        // Bis leer: 78 / 0.28 = 278.57 mins = 279 mins
        assert_eq!(to_empty, Some(279));
    }

    #[test]
    fn test_projections_charging_returns_none() {
        let telemetry = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: 50.0,
            charge_percent: 50,
            is_charging: true,
            is_plugged_in: true,
            charge_rate_mw: Some(15000),
            remaining_mwh: Some(25000),
            full_charge_mwh: Some(50000),
            hardware_mins_to_empty: None,
        };

        let (to_10, to_20, to_empty) = calculate_projections(&telemetry, 0.85);
        assert_eq!(to_10, None);
        assert_eq!(to_20, None);
        assert_eq!(to_empty, None);
    }

    #[test]
    fn test_projections_boundary_conditions() {
        // Battery already below 20% but above 10%
        let telemetry = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: 15.0,
            charge_percent: 15,
            is_charging: false,
            is_plugged_in: false,
            charge_rate_mw: None,
            remaining_mwh: None,
            full_charge_mwh: None,
            hardware_mins_to_empty: None,
        };

        let (to_10, to_20, to_empty) = calculate_projections(&telemetry, -0.5);
        assert_eq!(to_20, Some(0));
        assert_eq!(to_10, Some(10)); // (15 - 10) / 0.5 = 10 mins
        assert_eq!(to_empty, Some(30)); // 15 / 0.5 = 30 mins

        // Battery already below 10%
        let telemetry_low = RawBatteryTelemetry {
            charge_percent_exact: 5.0,
            charge_percent: 5,
            ..telemetry
        };
        let (to_10, to_20, to_empty) = calculate_projections(&telemetry_low, -0.5);
        assert_eq!(to_20, Some(0));
        assert_eq!(to_10, Some(0));
        assert_eq!(to_empty, Some(10)); // 5 / 0.5 = 10 mins
    }

    #[test]
    fn test_sliding_window_drain_rate_discharging() {
        let t0 = Instant::now();
        let samples = vec![
            BatterySample {
                timestamp: t0,
                percent: 80.0,
                is_charging: false,
            },
            BatterySample {
                timestamp: t0 + Duration::from_secs(60),
                percent: 79.5,
                is_charging: false,
            },
            BatterySample {
                timestamp: t0 + Duration::from_secs(120),
                percent: 79.0,
                is_charging: false,
            },
        ];

        let rate = calculate_rate_from_samples(&samples);
        // Drops 1.0% in 2 minutes => -0.50 %/min
        assert_eq!(rate, -0.50);
    }

    #[test]
    fn test_sliding_window_drain_rate_charging() {
        let t0 = Instant::now();
        let samples = vec![
            BatterySample {
                timestamp: t0,
                percent: 50.0,
                is_charging: true,
            },
            BatterySample {
                timestamp: t0 + Duration::from_secs(60),
                percent: 51.0,
                is_charging: true,
            },
        ];

        let rate = calculate_rate_from_samples(&samples);
        // Rises 1.0% in 1 minute => +1.00 %/min
        assert_eq!(rate, 1.00);
    }

    #[test]
    fn test_projections_suppressed_when_plugged_in_not_charging() {
        // Laptop resting at 80% with battery charge limiter or idle on AC
        let telemetry = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: 80.0,
            charge_percent: 80,
            is_charging: false,
            is_plugged_in: true,
            charge_rate_mw: None,
            remaining_mwh: Some(40000),
            full_charge_mwh: Some(50000),
            hardware_mins_to_empty: Some(240),
        };

        let projections = calculate_projections(&telemetry, -0.3);
        assert_eq!(
            projections,
            (None, None, None),
            "Projections must be suppressed when connected to AC power"
        );
    }

    #[test]
    fn test_battery_tracker_resets_on_unplugged_at_full_charge() {
        // M3-03: Laptop plugged into AC at 100% capacity (is_charging: false, is_plugged_in: true)
        let mut tracker = BatteryTracker::new();
        let t0 = Instant::now();

        let ac_telemetry = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: 100.0,
            charge_percent: 100,
            is_charging: false,
            is_plugged_in: true,
            charge_rate_mw: Some(0),
            remaining_mwh: Some(50000),
            full_charge_mwh: Some(50000),
            hardware_mins_to_empty: None,
        };

        tracker.record_telemetry(&ac_telemetry, t0);
        assert_eq!(tracker.samples.len(), 1);
        assert_eq!(tracker.last_power_state, Some((false, true)));

        // User unplugs the laptop: is_charging is still false, but is_plugged_in becomes false!
        let battery_telemetry = RawBatteryTelemetry {
            has_battery: true,
            charge_percent_exact: 100.0,
            charge_percent: 100,
            is_charging: false,
            is_plugged_in: false,
            charge_rate_mw: Some(-8000),
            remaining_mwh: Some(50000),
            full_charge_mwh: Some(50000),
            hardware_mins_to_empty: Some(300),
        };

        tracker.record_telemetry(&battery_telemetry, t0 + Duration::from_secs(5));
        // Samples from AC operation must be cleared, leaving only the fresh battery sample
        assert_eq!(tracker.samples.len(), 1);
        assert_eq!(tracker.samples[0].timestamp, t0 + Duration::from_secs(5));
        assert_eq!(tracker.last_power_state, Some((false, false)));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_query_winrt_battery_report_safe_com_initialization() {
        // M3-02: Executing in a fresh thread where COM has not been initialized should not fail with CO_E_NOTINITIALIZED
        let handle = std::thread::spawn(|| {
            let res = query_winrt_battery_report();
            // In CI/headless or real devices, query_winrt_battery_report returns Ok(telemetry) or an Err string,
            // but must NEVER panic or fail due to uninitialized COM apartment.
            let _ = res;
        });
        assert!(handle.join().is_ok());
    }
}
