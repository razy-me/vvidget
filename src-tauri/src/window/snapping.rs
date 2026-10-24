use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, specta::Type)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub const fn new(left: i32, top: i32, right: i32, bottom: i32) -> Self {
        Self {
            left,
            top,
            right,
            bottom,
        }
    }

    pub fn from_pos_size(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            left: x,
            top: y,
            right: x + width as i32,
            bottom: y + height as i32,
        }
    }

    #[inline]
    pub fn width(&self) -> i32 {
        self.right - self.left
    }

    #[inline]
    pub fn height(&self) -> i32 {
        self.bottom - self.top
    }

    #[inline]
    pub fn overlaps_horizontal(&self, other: &Rect, tolerance: i32) -> bool {
        self.left <= other.right + tolerance && self.right >= other.left - tolerance
    }

    #[inline]
    pub fn overlaps_vertical(&self, other: &Rect, tolerance: i32) -> bool {
        self.top <= other.bottom + tolerance && self.bottom >= other.top - tolerance
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct SnapResult {
    pub snapped_x: bool,
    pub snapped_y: bool,
    pub dx: i32,
    pub dy: i32,
}

#[derive(Debug, Clone, Copy)]
pub struct SnapConfig {
    pub enabled: bool,
    pub threshold: i32,
    pub snap_to_edges: bool,
    pub snap_to_widgets: bool,
}

impl Default for SnapConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            threshold: 16,
            snap_to_edges: true,
            snap_to_widgets: true,
        }
    }
}

/// Calculate magnetic snapping adjustments for a moving window.
/// Modifies `moving` in place to reflect snapped coordinates.
pub fn apply_magnetic_snapping(
    moving: &mut Rect,
    work_area: &Rect,
    other_widgets: &[Rect],
    config: &SnapConfig,
) -> SnapResult {
    if !config.enabled || config.threshold <= 0 {
        return SnapResult::default();
    }

    let w = moving.width();
    let h = moving.height();
    let threshold = config.threshold;

    let mut best_dx: Option<i32> = None;
    let mut best_dy: Option<i32> = None;

    let consider_dx = |dx: i32, current_best: &mut Option<i32>| {
        if dx.abs() <= threshold {
            match *current_best {
                None => *current_best = Some(dx),
                Some(best) if dx.abs() < best.abs() => *current_best = Some(dx),
                _ => {}
            }
        }
    };

    let consider_dy = |dy: i32, current_best: &mut Option<i32>| {
        if dy.abs() <= threshold {
            match *current_best {
                None => *current_best = Some(dy),
                Some(best) if dy.abs() < best.abs() => *current_best = Some(dy),
                _ => {}
            }
        }
    };

    // 1. Horizontal Snapping
    if config.snap_to_edges {
        // Snap left edge to screen left edge
        consider_dx(work_area.left - moving.left, &mut best_dx);
        // Snap right edge to screen right edge
        consider_dx(work_area.right - moving.right, &mut best_dx);
    }

    if config.snap_to_widgets {
        for other in other_widgets {
            // Only consider widgets if they vertically overlap or are close enough vertically
            if moving.overlaps_vertical(other, threshold) {
                // Snap left to other's right (adjacent)
                consider_dx(other.right - moving.left, &mut best_dx);
                // Snap right to other's left (adjacent)
                consider_dx(other.left - moving.right, &mut best_dx);
                // Snap left to other's left (aligned)
                consider_dx(other.left - moving.left, &mut best_dx);
                // Snap right to other's right (aligned)
                consider_dx(other.right - moving.right, &mut best_dx);
            }
        }
    }

    // 2. Vertical Snapping
    if config.snap_to_edges {
        // Snap top edge to screen top edge
        consider_dy(work_area.top - moving.top, &mut best_dy);
        // Snap bottom edge to screen bottom edge
        consider_dy(work_area.bottom - moving.bottom, &mut best_dy);
    }

    if config.snap_to_widgets {
        for other in other_widgets {
            // Only consider widgets if they horizontally overlap or are close enough horizontally
            if moving.overlaps_horizontal(other, threshold) {
                // Snap top to other's bottom (adjacent)
                consider_dy(other.bottom - moving.top, &mut best_dy);
                // Snap bottom to other's top (adjacent)
                consider_dy(other.top - moving.bottom, &mut best_dy);
                // Snap top to other's top (aligned)
                consider_dy(other.top - moving.top, &mut best_dy);
                // Snap bottom to other's bottom (aligned)
                consider_dy(other.bottom - moving.bottom, &mut best_dy);
            }
        }
    }

    let result = SnapResult {
        snapped_x: best_dx.is_some(),
        snapped_y: best_dy.is_some(),
        dx: best_dx.unwrap_or(0),
        dy: best_dy.unwrap_or(0),
    };

    if let Some(dx) = best_dx {
        moving.left += dx;
        moving.right = moving.left + w;
    }

    if let Some(dy) = best_dy {
        moving.top += dy;
        moving.bottom = moving.top + h;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rect_dimensions() {
        let r = Rect::new(100, 200, 300, 450);
        assert_eq!(r.width(), 200);
        assert_eq!(r.height(), 250);

        let r2 = Rect::from_pos_size(50, 60, 100, 150);
        assert_eq!(r2.left, 50);
        assert_eq!(r2.top, 60);
        assert_eq!(r2.right, 150);
        assert_eq!(r2.bottom, 210);
    }

    #[test]
    fn test_snap_to_screen_left_edge() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        // Moving window is at x=10 (within default threshold 16)
        let mut moving = Rect::new(10, 100, 310, 400);
        let config = SnapConfig::default();

        let result = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(result.snapped_x);
        assert_eq!(result.dx, -10);
        assert_eq!(moving.left, 0);
        assert_eq!(moving.right, 300); // Width preserved (300)
    }

    #[test]
    fn test_snap_to_screen_right_edge() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        // Moving window right edge is at 1912 (8px away from 1920)
        let mut moving = Rect::new(1612, 100, 1912, 400);
        let config = SnapConfig::default();

        let result = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(result.snapped_x);
        assert_eq!(result.dx, 8);
        assert_eq!(moving.right, 1920);
        assert_eq!(moving.left, 1620); // Width preserved
    }

    #[test]
    fn test_snap_to_screen_top_and_bottom_edges() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        let mut moving_top = Rect::new(100, 12, 400, 312);
        let config = SnapConfig::default();

        let res_top = apply_magnetic_snapping(&mut moving_top, &work_area, &[], &config);
        assert!(res_top.snapped_y);
        assert_eq!(moving_top.top, 0);
        assert_eq!(moving_top.bottom, 300);

        let mut moving_bot = Rect::new(100, 770, 400, 1070);
        let res_bot = apply_magnetic_snapping(&mut moving_bot, &work_area, &[], &config);
        assert!(res_bot.snapped_y);
        assert_eq!(moving_bot.bottom, 1080);
        assert_eq!(moving_bot.top, 780);
    }

    #[test]
    fn test_snap_to_adjacent_widget() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        // Existing widget at (100, 100) -> (400, 300)
        let other = Rect::new(100, 100, 400, 300);
        // Moving widget left edge is at 408 (8px away from other's right edge 400)
        let mut moving = Rect::new(408, 110, 708, 310);
        let config = SnapConfig::default();

        let result = apply_magnetic_snapping(&mut moving, &work_area, &[other], &config);
        assert!(result.snapped_x);
        assert_eq!(moving.left, 400);
        assert_eq!(moving.right, 700);
    }

    #[test]
    fn test_snap_disabled_leaves_rect_untouched() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        let mut moving = Rect::new(5, 5, 305, 305);
        let mut config = SnapConfig::default();
        config.enabled = false;

        let result = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(!result.snapped_x);
        assert!(!result.snapped_y);
        assert_eq!(moving.left, 5);
        assert_eq!(moving.top, 5);
    }

    #[test]
    fn test_distance_outside_threshold_does_not_snap() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        // 25px away from edge (threshold is 16)
        let mut moving = Rect::new(25, 25, 325, 325);
        let config = SnapConfig::default();

        let result = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(!result.snapped_x);
        assert!(!result.snapped_y);
        assert_eq!(moving.left, 25);
        assert_eq!(moving.top, 25);
    }
}
