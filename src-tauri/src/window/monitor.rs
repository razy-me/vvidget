use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct LogicalRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct PhysicalRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct MonitorBounds {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

/// Convert logical coordinates to physical pixels using monitor scale factor.
pub fn logical_to_physical(logical: LogicalRect, scale_factor: f64) -> PhysicalRect {
    let scale = if scale_factor > 0.0 { scale_factor } else { 1.0 };
    PhysicalRect {
        x: (logical.x * scale).round() as i32,
        y: (logical.y * scale).round() as i32,
        width: (logical.width * scale).round().max(1.0) as u32,
        height: (logical.height * scale).round().max(1.0) as u32,
    }
}

/// Convert physical pixels to logical coordinates using monitor scale factor.
pub fn physical_to_logical(physical: PhysicalRect, scale_factor: f64) -> LogicalRect {
    let scale = if scale_factor > 0.0 { scale_factor } else { 1.0 };
    LogicalRect {
        x: physical.x as f64 / scale,
        y: physical.y as f64 / scale,
        width: physical.width as f64 / scale,
        height: physical.height as f64 / scale,
    }
}

/// Clamps target window bounds to ensure it is fully visible on at least one active monitor.
/// If target is completely off-screen, snaps it to the best available monitor.
pub fn clamp_to_monitors(mut target: PhysicalRect, monitors: &[MonitorBounds]) -> PhysicalRect {
    if monitors.is_empty() {
        return target;
    }

    // Find the monitor with the greatest overlap area with target, or closest distance if no overlap
    let mut best_monitor = &monitors[0];
    let mut max_overlap_area: i64 = -1;
    let mut min_distance_sq: i64 = i64::MAX;

    let target_center_x = target.x as i64 + (target.width as i64 / 2);
    let target_center_y = target.y as i64 + (target.height as i64 / 2);

    for m in monitors {
        let mon_right = m.x + m.width as i32;
        let mon_bottom = m.y + m.height as i32;

        let overlap_left = target.x.max(m.x);
        let overlap_top = target.y.max(m.y);
        let overlap_right = (target.x + target.width as i32).min(mon_right);
        let overlap_bottom = (target.y + target.height as i32).min(mon_bottom);

        let overlap_w = (overlap_right - overlap_left).max(0) as i64;
        let overlap_h = (overlap_bottom - overlap_top).max(0) as i64;
        let overlap_area = overlap_w * overlap_h;

        if overlap_area > max_overlap_area {
            max_overlap_area = overlap_area;
            best_monitor = m;
        }

        // Distance from target center to monitor center
        let mon_center_x = m.x as i64 + (m.width as i64 / 2);
        let mon_center_y = m.y as i64 + (m.height as i64 / 2);
        let dx = target_center_x - mon_center_x;
        let dy = target_center_y - mon_center_y;
        let dist_sq = dx * dx + dy * dy;

        if max_overlap_area <= 0 && dist_sq < min_distance_sq {
            min_distance_sq = dist_sq;
            best_monitor = m;
        }
    }

    // Clamp width/height if larger than the selected monitor
    if target.width > best_monitor.width {
        target.width = best_monitor.width;
    }
    if target.height > best_monitor.height {
        target.height = best_monitor.height;
    }

    // Clamp position within the selected monitor bounds
    let max_x = best_monitor.x + (best_monitor.width as i32 - target.width as i32);
    let max_y = best_monitor.y + (best_monitor.height as i32 - target.height as i32);

    target.x = target.x.clamp(best_monitor.x, max_x);
    target.y = target.y.clamp(best_monitor.y, max_y);

    target
}

/// Helper to clamp a logical position (e.g. from config) against active monitors.
pub fn clamp_logical_position(
    pos: (f64, f64),
    size: (f64, f64),
    scale_factor: f64,
    monitors: &[MonitorBounds],
) -> (f64, f64) {
    let logical_rect = LogicalRect {
        x: pos.0,
        y: pos.1,
        width: size.0,
        height: size.1,
    };
    let physical = logical_to_physical(logical_rect, scale_factor);
    let clamped_physical = clamp_to_monitors(physical, monitors);
    let clamped_logical = physical_to_logical(clamped_physical, scale_factor);
    (clamped_logical.x, clamped_logical.y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dpi_conversions() {
        let logical = LogicalRect {
            x: 100.0,
            y: 200.0,
            width: 300.0,
            height: 400.0,
        };

        // 125% DPI
        let physical = logical_to_physical(logical, 1.25);
        assert_eq!(physical.x, 125);
        assert_eq!(physical.y, 250);
        assert_eq!(physical.width, 375);
        assert_eq!(physical.height, 500);

        let roundtrip = physical_to_logical(physical, 1.25);
        assert_eq!(roundtrip.x, 100.0);
        assert_eq!(roundtrip.y, 200.0);
        assert_eq!(roundtrip.width, 300.0);
        assert_eq!(roundtrip.height, 400.0);
    }

    #[test]
    fn test_clamp_off_screen_to_the_right() {
        let monitors = vec![MonitorBounds {
            id: "primary".to_string(),
            name: "Display 1".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
            is_primary: true,
        }];

        // Window partially or fully beyond right edge: x=2000
        let target = PhysicalRect {
            x: 2000,
            y: 100,
            width: 300,
            height: 400,
        };

        let clamped = clamp_to_monitors(target, &monitors);
        assert_eq!(clamped.x, 1620); // 1920 - 300
        assert_eq!(clamped.y, 100);
        assert_eq!(clamped.width, 300);
        assert_eq!(clamped.height, 400);
    }

    #[test]
    fn test_clamp_negative_coordinates() {
        let monitors = vec![MonitorBounds {
            id: "primary".to_string(),
            name: "Display 1".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
            is_primary: true,
        }];

        let target = PhysicalRect {
            x: -150,
            y: -50,
            width: 300,
            height: 400,
        };

        let clamped = clamp_to_monitors(target, &monitors);
        assert_eq!(clamped.x, 0);
        assert_eq!(clamped.y, 0);
    }

    #[test]
    fn test_clamp_multi_monitor_secondary_left() {
        // Dual monitor setup: Secondary monitor is on the left (-1920 to 0)
        let monitors = vec![
            MonitorBounds {
                id: "mon2".to_string(),
                name: "Left Monitor".to_string(),
                x: -1920,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: false,
            },
            MonitorBounds {
                id: "mon1".to_string(),
                name: "Primary Monitor".to_string(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: true,
            },
        ];

        // Target is placed on left monitor
        let target = PhysicalRect {
            x: -1000,
            y: 200,
            width: 320,
            height: 480,
        };

        let clamped = clamp_to_monitors(target, &monitors);
        assert_eq!(clamped.x, -1000);
        assert_eq!(clamped.y, 200);

        // Target is off-screen beyond the left monitor's left edge (-2500)
        let target_far_left = PhysicalRect {
            x: -2500,
            y: 200,
            width: 320,
            height: 480,
        };

        let clamped_left = clamp_to_monitors(target_far_left, &monitors);
        assert_eq!(clamped_left.x, -1920);
    }

    #[test]
    fn test_clamp_target_larger_than_monitor_dimensions() {
        let monitors = vec![MonitorBounds {
            id: "primary".to_string(),
            name: "Display 1".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
            is_primary: true,
        }];

        let oversized = PhysicalRect {
            x: 100,
            y: 100,
            width: 2500,
            height: 1400,
        };

        let clamped = clamp_to_monitors(oversized, &monitors);
        assert_eq!(clamped.width, 1920);
        assert_eq!(clamped.height, 1080);
        assert_eq!(clamped.x, 0);
        assert_eq!(clamped.y, 0);
    }

    #[test]
    fn test_clamp_empty_monitors_list() {
        let target = PhysicalRect {
            x: 500,
            y: 600,
            width: 300,
            height: 200,
        };
        let clamped = clamp_to_monitors(target, &[]);
        assert_eq!(clamped, target);
    }

    #[test]
    fn test_clamp_furthest_window_selects_closest_monitor() {
        let monitors = vec![
            MonitorBounds {
                id: "mon1".to_string(),
                name: "Primary".to_string(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: true,
            },
            MonitorBounds {
                id: "mon2".to_string(),
                name: "Right".to_string(),
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: false,
            },
        ];

        // Far to the right at x=5000 (closer to mon2 than mon1)
        let target = PhysicalRect {
            x: 5000,
            y: 200,
            width: 300,
            height: 200,
        };

        let clamped = clamp_to_monitors(target, &monitors);
        // Should clamp to mon2 right edge (1920 + 1920 - 300 = 3540)
        assert_eq!(clamped.x, 3540);
        assert_eq!(clamped.y, 200);
    }

    #[test]
    fn test_invalid_scale_factor_fallback() {
        let logical = LogicalRect {
            x: 100.0,
            y: 200.0,
            width: 300.0,
            height: 400.0,
        };

        let phys_zero = logical_to_physical(logical, 0.0);
        assert_eq!(phys_zero.x, 100);
        assert_eq!(phys_zero.width, 300);

        let phys_neg = logical_to_physical(logical, -2.0);
        assert_eq!(phys_neg.x, 100);
        assert_eq!(phys_neg.width, 300);

        let log_zero = physical_to_logical(phys_zero, 0.0);
        assert_eq!(log_zero.x, 100.0);
    }

    #[test]
    fn test_clamp_logical_position_roundtrip_all_scales() {
        let monitors = vec![MonitorBounds {
            id: "primary".to_string(),
            name: "Display 1".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.5,
            is_primary: true,
        }];

        // Inside screen bounds at 150% scaling
        let (clamped_x, clamped_y) = clamp_logical_position(
            (100.0, 100.0),
            (200.0, 150.0),
            1.5,
            &monitors,
        );
        assert_eq!(clamped_x, 100.0);
        assert_eq!(clamped_y, 100.0);

        // Outside screen bounds (x = 2000.0 logical)
        let (clamped_out_x, _) = clamp_logical_position(
            (2000.0, 100.0),
            (200.0, 150.0),
            1.5,
            &monitors,
        );
        // Logical width of 1920 at 1.5 scale is 1280. Max x = 1280 - 200 = 1080.
        assert_eq!(clamped_out_x, 1080.0);
    }
}
