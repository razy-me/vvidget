use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Instant;

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

#[derive(Debug, Clone)]
pub struct BatterySample {
    pub timestamp: Instant,
    pub percent: f32,
    pub is_charging: bool,
}

pub struct BatteryTracker {
    pub samples: Vec<BatterySample>,
    pub capacity_history: Vec<u8>,
}

impl BatteryTracker {
    pub const fn new() -> Self {
        Self {
            samples: Vec::new(),
            capacity_history: Vec::new(),
        }
    }

    /// Records a new sample and maintains sliding window and capacity history.
    pub fn record_sample(&mut self, percent: u8, is_charging: bool, now: Instant) {
        // If charging mode changed, reset samples so drain calculations are not corrupted
        if let Some(last) = self.samples.last() {
            if last.is_charging != is_charging {
                self.samples.clear();
            }
        }

        self.samples.push(BatterySample {
            timestamp: now,
            percent: percent as f32,
            is_charging,
        });

        // Retain samples within the last 15 minutes (or at most 40 samples)
        self.samples.retain(|s| now.duration_since(s.timestamp).as_secs() <= 900);
        if self.samples.len() > 40 {
            let start = self.samples.len() - 40;
            self.samples.drain(0..start);
        }

        // Update capacity history (up to 20 samples)
        self.capacity_history.push(percent);
        if self.capacity_history.len() > 20 {
            let excess = self.capacity_history.len() - 20;
            self.capacity_history.drain(0..excess);
        }
    }

    /// Calculates drain rate in %/min over the sliding window.
    pub fn calculate_drain_rate(&self) -> f32 {
        calculate_rate_from_samples(&self.samples)
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
pub fn calculate_projections(
    charge_percent: u8,
    is_charging: bool,
    drain_rate_percent_per_min: f32,
    hardware_estimated_mins_to_empty: Option<u32>,
) -> (Option<u32>, Option<u32>, Option<u32>) {
    // Projections to empty/low levels only make sense when discharging
    if is_charging {
        return (None, None, None);
    }

    // If drain rate is noticeably negative (< -0.01 %/min)
    if drain_rate_percent_per_min < -0.01 {
        let abs_rate = drain_rate_percent_per_min.abs();

        let mins_to_empty = (charge_percent as f32 / abs_rate).round() as u32;

        let mins_to_10 = if charge_percent > 10 {
            Some(((charge_percent - 10) as f32 / abs_rate).round() as u32)
        } else {
            Some(0)
        };

        let mins_to_20 = if charge_percent > 20 {
            Some(((charge_percent - 20) as f32 / abs_rate).round() as u32)
        } else {
            Some(0)
        };

        return (mins_to_10, mins_to_20, Some(mins_to_empty));
    }

    // Fallback: If hardware/OS provided estimated mins to empty
    if let Some(empty_mins) = hardware_estimated_mins_to_empty {
        if charge_percent > 0 {
            let mins_per_percent = empty_mins as f32 / charge_percent as f32;
            let mins_to_10 = if charge_percent > 10 {
                Some(((charge_percent - 10) as f32 * mins_per_percent).round() as u32)
            } else {
                Some(0)
            };
            let mins_to_20 = if charge_percent > 20 {
                Some(((charge_percent - 20) as f32 * mins_per_percent).round() as u32)
            } else {
                Some(0)
            };
            return (mins_to_10, mins_to_20, Some(empty_mins));
        }
    }

    (None, None, None)
}

/// Evaluates raw power parameters to detect whether a system has a physical battery.
pub fn parse_power_status(
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    battery_life_time_secs: u32,
) -> (bool, u8, bool, bool, Option<u32>) {
    // BatteryFlag bit 7 (128) means "No system battery"
    // BatteryLifePercent == 255 means Unknown (standard on desktop systems without battery)
    let has_battery = (battery_flag & 128 == 0) && (battery_life_percent <= 100);

    if !has_battery {
        let is_plugged_in = ac_line_status == 1;
        return (false, 100, false, is_plugged_in, None);
    }

    let charge_percent = battery_life_percent.min(100);
    let is_plugged_in = ac_line_status == 1;
    // Charging flag is bit 3 (8)
    let is_charging = is_plugged_in && ((battery_flag & 8 != 0) || (charge_percent < 100 && ac_line_status == 1));

    let hardware_mins = if battery_life_time_secs != u32::MAX && battery_life_time_secs > 0 {
        Some(battery_life_time_secs / 60)
    } else {
        None
    };

    (true, charge_percent, is_charging, is_plugged_in, hardware_mins)
}

/// Native Win32 / WinRT query implementation.
#[cfg(target_os = "windows")]
fn query_native_power_status() -> Result<(bool, u8, bool, bool, Option<u32>), String> {
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
fn query_native_power_status() -> Result<(bool, u8, bool, bool, Option<u32>), String> {
    // Non-windows fallback simulation
    Ok((true, 78, false, false, Some(215)))
}

/// Queries current battery status and updates rolling sliding-window analytics.
#[tauri::command]
#[specta::specta]
pub fn get_battery_status() -> Result<BatteryStatus, String> {
    let (has_battery, charge_percent, is_charging, is_plugged_in, hardware_mins) =
        query_native_power_status()?;

    if !has_battery {
        return Ok(BatteryStatus {
            has_battery: false,
            charge_percent: 100,
            is_charging: false,
            is_plugged_in,
            drain_rate_percent_per_min: 0.0,
            estimated_mins_to_10_percent: None,
            estimated_mins_to_20_percent: None,
            estimated_mins_to_empty: None,
            capacity_history: Vec::new(),
            top_process_name: None,
        });
    }

    let mut tracker = TRACKER
        .lock()
        .map_err(|e| format!("Battery tracker lock poisoned: {}", e))?;

    let now = Instant::now();
    tracker.record_sample(charge_percent, is_charging, now);

    let drain_rate = tracker.calculate_drain_rate();
    let (to_10, to_20, to_empty) =
        calculate_projections(charge_percent, is_charging, drain_rate, hardware_mins);

    Ok(BatteryStatus {
        has_battery: true,
        charge_percent,
        is_charging,
        is_plugged_in,
        drain_rate_percent_per_min: drain_rate,
        estimated_mins_to_10_percent: to_10,
        estimated_mins_to_20_percent: to_20,
        estimated_mins_to_empty: to_empty,
        capacity_history: tracker.capacity_history.clone(),
        top_process_name: None,
    })
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
        let (has_battery, charge, charging, plugged, mins) =
            parse_power_status(1, 128, 255, u32::MAX);
        assert!(!has_battery);
        assert_eq!(charge, 100);
        assert!(!charging);
        assert!(plugged);
        assert_eq!(mins, None);

        // Unknown percent = 255
        let (has_battery2, _, _, _, _) = parse_power_status(1, 0, 255, u32::MAX);
        assert!(!has_battery2);
    }

    #[test]
    fn test_parse_laptop_power_status() {
        // Discharging at 78%
        let (has_battery, charge, charging, plugged, mins) =
            parse_power_status(0, 0, 78, 12000);
        assert!(has_battery);
        assert_eq!(charge, 78);
        assert!(!charging);
        assert!(!plugged);
        assert_eq!(mins, Some(200));

        // Charging on AC at 45%
        let (has_battery, charge, charging, plugged, _) =
            parse_power_status(1, 8, 45, u32::MAX);
        assert!(has_battery);
        assert_eq!(charge, 45);
        assert!(charging);
        assert!(plugged);
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
    fn test_projections_discharging() {
        let charge_percent = 78;
        let is_charging = false;
        let drain_rate = -0.28; // %/min

        let (to_10, to_20, to_empty) =
            calculate_projections(charge_percent, is_charging, drain_rate, None);

        // Bis 20%: (78 - 20) / 0.28 = 58 / 0.28 = 207.14 mins = 207 mins (~3h 27m)
        assert_eq!(to_20, Some(207));
        // Bis 10%: (78 - 10) / 0.28 = 68 / 0.28 = 242.85 mins = 243 mins (~4h 3m)
        assert_eq!(to_10, Some(243));
        // Bis leer: 78 / 0.28 = 278.57 mins = 279 mins (~4h 39m)
        assert_eq!(to_empty, Some(279));
    }

    #[test]
    fn test_projections_charging_returns_none() {
        let (to_10, to_20, to_empty) = calculate_projections(50, true, 0.85, None);
        assert_eq!(to_10, None);
        assert_eq!(to_20, None);
        assert_eq!(to_empty, None);
    }

    #[test]
    fn test_projections_boundary_conditions() {
        // Battery already below 20% but above 10%
        let (to_10, to_20, to_empty) = calculate_projections(15, false, -0.5, None);
        assert_eq!(to_20, Some(0));
        assert_eq!(to_10, Some(10)); // (15 - 10) / 0.5 = 10 mins
        assert_eq!(to_empty, Some(30)); // 15 / 0.5 = 30 mins

        // Battery already below 10%
        let (to_10, to_20, to_empty) = calculate_projections(5, false, -0.5, None);
        assert_eq!(to_20, Some(0));
        assert_eq!(to_10, Some(0));
        assert_eq!(to_empty, Some(10)); // 5 / 0.5 = 10 mins
    }

    #[test]
    fn test_capacity_history_limit_to_20() {
        let mut tracker = BatteryTracker::new();
        let now = Instant::now();
        for i in 0..25 {
            tracker.record_sample(50 + i, false, now + Duration::from_secs(i as u64 * 10));
        }

        assert_eq!(tracker.capacity_history.len(), 20);
        // The last sample pushed should be 50 + 24 = 74
        assert_eq!(*tracker.capacity_history.last().unwrap(), 74);
        // The first of the 20 should be 50 + 5 = 55
        assert_eq!(*tracker.capacity_history.first().unwrap(), 55);
    }
}
