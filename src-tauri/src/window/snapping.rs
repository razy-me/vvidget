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

/// Checks whether two rectangles overlap on the screen.
/// Margin tolerance allows adjacent edge-to-edge touching without false positives.
#[inline]
pub fn rects_overlap(r1: &Rect, r2: &Rect, margin: i32) -> bool {
    r1.left < r2.right - margin
        && r1.right > r2.left + margin
        && r1.top < r2.bottom - margin
        && r1.bottom > r2.top + margin
}

/// Finds the nearest non-overlapping slot on the desktop icon grid for a widget rectangle.
/// If the snapped candidate does not collide with any other widget, snaps directly.
/// If a collision occurs, searches the entire work area grid and picks the closest free slot.
pub fn find_nearest_non_overlapping_slot(
    target: &Rect,
    other_widgets: &[Rect],
    grid_x: i32,
    grid_y: i32,
    work_area: &Rect,
) -> Rect {
    let gx = grid_x.max(1);
    let gy = grid_y.max(1);
    let w = target.width();
    let h = target.height();

    let min_x = work_area.left;
    let max_x = (work_area.right - w).max(min_x);
    let min_y = work_area.top;
    let max_y = (work_area.bottom - h).max(min_y);

    let base_x = min_x + (((target.left - min_x) as f32 / gx as f32).round() as i32) * gx;
    let base_y = min_y + (((target.top - min_y) as f32 / gy as f32).round() as i32) * gy;

    let candidate = Rect::new(
        base_x.clamp(min_x, max_x),
        base_y.clamp(min_y, max_y),
        base_x.clamp(min_x, max_x) + w,
        base_y.clamp(min_y, max_y) + h,
    );

    let has_collision = other_widgets.iter().any(|o| rects_overlap(&candidate, o, 2));
    if !has_collision {
        return candidate;
    }

    let min_col = 0;
    let max_col = (((max_x - min_x) as f32) / (gx as f32)).ceil() as i32;
    let min_row = 0;
    let max_row = (((max_y - min_y) as f32) / (gy as f32)).ceil() as i32;

    let mut best_rect: Option<(Rect, i64)> = None;

    for c in min_col..=max_col {
        let cand_x = (min_x + c * gx).clamp(min_x, max_x);
        for r in min_row..=max_row {
            let cand_y = (min_y + r * gy).clamp(min_y, max_y);
            let test_rect = Rect::new(cand_x, cand_y, cand_x + w, cand_y + h);
            if !other_widgets.iter().any(|o| rects_overlap(&test_rect, o, 2)) {
                let dx = (cand_x - target.left) as i64;
                let dy = (cand_y - target.top) as i64;
                let dist_sq = dx * dx + dy * dy;
                match best_rect {
                    None => best_rect = Some((test_rect, dist_sq)),
                    Some((_, best_dist)) if dist_sq < best_dist => {
                        best_rect = Some((test_rect, dist_sq));
                    }
                    _ => {}
                }
            }
        }
    }

    if let Some((r, _)) = best_rect {
        return r;
    }

    candidate
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
    pub snap_to_grid: bool,
    pub grid_size_x: i32,
    pub grid_size_y: i32,
}

impl Default for SnapConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            threshold: 16,
            snap_to_edges: true,
            snap_to_widgets: true,
            snap_to_grid: true,
            grid_size_x: 120,
            grid_size_y: 128,
        }
    }
}

impl SnapConfig {
    /// Creates a SnapConfig scaled by monitor DPI factor.
    pub fn with_dpi(scale: f64) -> Self {
        let s = if scale > 0.0 { scale } else { 1.0 };
        Self {
            grid_size_x: (120.0 * s).round() as i32,
            grid_size_y: (128.0 * s).round() as i32,
            ..Default::default()
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

    // 3. Desktop Grid Snapping
    // Align widget's top-left corner with the desktop icon grid columns and rows.
    if config.snap_to_grid {
        let grid_threshold_x = (config.grid_size_x / 2).max(threshold);
        let grid_threshold_y = (config.grid_size_y / 2).max(threshold);

        if config.grid_size_x > 0 {
            let gx = config.grid_size_x;
            let rel_x = moving.left - work_area.left;
            let nearest_col = ((rel_x as f32 / gx as f32).round() as i32) * gx;
            let target_left = work_area.left + nearest_col;
            let dx = target_left - moving.left;
            if dx.abs() <= grid_threshold_x {
                match best_dx {
                    None => best_dx = Some(dx),
                    Some(best) if dx.abs() < best.abs() => best_dx = Some(dx),
                    _ => {}
                }
            }
        }

        if config.grid_size_y > 0 {
            let gy = config.grid_size_y;
            let rel_y = moving.top - work_area.top;
            let nearest_row = ((rel_y as f32 / gy as f32).round() as i32) * gy;
            let target_top = work_area.top + nearest_row;
            let dy = target_top - moving.top;
            if dy.abs() <= grid_threshold_y {
                match best_dy {
                    None => best_dy = Some(dy),
                    Some(best) if dy.abs() < best.abs() => best_dy = Some(dy),
                    _ => {}
                }
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
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

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
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

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
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

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
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

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
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

        let result = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(!result.snapped_x);
        assert!(!result.snapped_y);
        assert_eq!(moving.left, 25);
        assert_eq!(moving.top, 25);
    }

    #[test]
    fn test_snap_to_widget_all_four_edges_alignment() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        let other = Rect::new(200, 200, 500, 500); // 300x300 at (200, 200)
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

        // 1. Align left-to-left: moving left is at 208 (8px away from other.left=200)
        let mut moving_left = Rect::new(208, 250, 408, 450);
        let res_left = apply_magnetic_snapping(&mut moving_left, &work_area, &[other], &config);
        assert!(res_left.snapped_x);
        assert_eq!(moving_left.left, 200);
        assert_eq!(moving_left.right, 400);

        // 2. Align right-to-right: moving right is at 494 (6px away from other.right=500)
        let mut moving_right = Rect::new(294, 250, 494, 450);
        let res_right = apply_magnetic_snapping(&mut moving_right, &work_area, &[other], &config);
        assert!(res_right.snapped_x);
        assert_eq!(moving_right.right, 500);
        assert_eq!(moving_right.left, 300);

        // 3. Align top-to-top: moving top is at 206 (6px away from other.top=200)
        let mut moving_top = Rect::new(250, 206, 450, 406);
        let res_top = apply_magnetic_snapping(&mut moving_top, &work_area, &[other], &config);
        assert!(res_top.snapped_y);
        assert_eq!(moving_top.top, 200);
        assert_eq!(moving_top.bottom, 400);

        // 4. Align bottom-to-bottom: moving bottom is at 508 (8px away from other.bottom=500)
        let mut moving_bottom = Rect::new(250, 308, 450, 508);
        let res_bottom = apply_magnetic_snapping(&mut moving_bottom, &work_area, &[other], &config);
        assert!(res_bottom.snapped_y);
        assert_eq!(moving_bottom.bottom, 500);
        assert_eq!(moving_bottom.top, 300);
    }

    #[test]
    fn test_snap_to_widget_adjacent_top_and_bottom() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        let other = Rect::new(200, 200, 500, 500); // 300x300
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

        // Snap moving top to other's bottom (other.bottom=500, moving.top=508)
        let mut moving_below = Rect::new(220, 508, 420, 708);
        let res_below = apply_magnetic_snapping(&mut moving_below, &work_area, &[other], &config);
        assert!(res_below.snapped_y);
        assert_eq!(moving_below.top, 500);
        assert_eq!(moving_below.bottom, 700);

        // Snap moving bottom to other's top (other.top=200, moving.bottom=194)
        let mut moving_above = Rect::new(220, -6, 420, 194);
        let res_above = apply_magnetic_snapping(&mut moving_above, &work_area, &[other], &config);
        assert!(res_above.snapped_y);
        assert_eq!(moving_above.bottom, 200);
        assert_eq!(moving_above.top, 0);
    }

    #[test]
    fn test_snap_closest_candidate_chosen() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        // Candidate 1 at 300, Candidate 2 at 320
        let other1 = Rect::new(100, 100, 300, 300); // right = 300
        let other2 = Rect::new(320, 100, 500, 300); // left = 320

        // Moving left at 305 (5px from other1 right=300, 15px from other2 left=320)
        let mut moving = Rect::new(305, 110, 505, 290);
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

        let res = apply_magnetic_snapping(&mut moving, &work_area, &[other1, other2], &config);
        assert!(res.snapped_x);
        assert_eq!(res.dx, -5); // Closer target (other1) was chosen
        assert_eq!(moving.left, 300);
    }

    #[test]
    fn test_snap_flags_selective_edges_and_widgets() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        let other = Rect::new(200, 200, 400, 400);

        // 1. snap_to_edges = true, snap_to_widgets = false
        let mut config_edges = SnapConfig {
            enabled: true,
            threshold: 16,
            snap_to_edges: true,
            snap_to_widgets: false,
            snap_to_grid: false,
            grid_size_x: 75,
            grid_size_y: 75,
        };
        // 8px from other.right (408), 408px from screen edge
        let mut moving1 = Rect::new(408, 210, 608, 390);
        let res1 = apply_magnetic_snapping(&mut moving1, &work_area, &[other], &config_edges);
        assert!(!res1.snapped_x, "Should not snap to widget when snap_to_widgets is false");

        // 2. snap_to_edges = false, snap_to_widgets = true
        config_edges.snap_to_edges = false;
        config_edges.snap_to_widgets = true;
        // 8px from screen left edge (x=8)
        let mut moving2 = Rect::new(8, 50, 208, 150);
        let res2 = apply_magnetic_snapping(&mut moving2, &work_area, &[], &config_edges);
        assert!(!res2.snapped_x, "Should not snap to screen edge when snap_to_edges is false");
    }

    #[test]
    fn test_snap_widget_no_vertical_overlap_does_not_snap_horizontally() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        // Widget at y: 100..300
        let other = Rect::new(100, 100, 300, 300);
        // Moving widget at y: 800..950 (far below, well outside threshold 16)
        let mut moving = Rect::new(305, 800, 505, 950);
        let mut config = SnapConfig::default();
        config.snap_to_grid = false;

        let res = apply_magnetic_snapping(&mut moving, &work_area, &[other], &config);
        assert!(!res.snapped_x, "Vertically disjoint widgets must not snap horizontally");
        assert_eq!(moving.left, 305);
    }

    #[test]
    fn test_snap_threshold_zero_or_negative_does_nothing() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        let mut moving = Rect::new(5, 5, 300, 300);
        let mut config = SnapConfig::default();
        config.threshold = 0;

        let res0 = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(!res0.snapped_x);
        assert!(!res0.snapped_y);

        config.threshold = -10;
        let res_neg = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(!res_neg.snapped_x);
        assert!(!res_neg.snapped_y);
    }

    #[test]
    fn test_snap_to_desktop_grid() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        // Grid is 75px. Multiples: 75, 150, 225, 300, 375...
        // Window is moved to x: 230, y: 380 (5px away from grid cell (225, 375))
        let mut moving = Rect::new(230, 380, 550, 640);
        let config = SnapConfig {
            enabled: true,
            threshold: 16,
            snap_to_edges: false,
            snap_to_widgets: false,
            snap_to_grid: true,
            grid_size_x: 75,
            grid_size_y: 75,
        };

        let res = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(res.snapped_x, "Should snap horizontally to nearest grid line");
        assert!(res.snapped_y, "Should snap vertically to nearest grid line");
        assert_eq!(moving.left, 225, "Left should snap to multiple of 75 (225)");
        assert_eq!(moving.top, 375, "Top should snap to multiple of 75 (375)");
    }

    #[test]
    fn test_snap_to_desktop_grid_asymmetric_dimensions() {
        let work_area = Rect::new(0, 0, 2880, 1800);
        // Real-world Windows 11 desktop icon grid: gx = 207, gy = 169
        // Moving widget left is placed at 212 (close to 1 * 207 = 207, dx = -5)
        // Moving widget top is placed at 173 (close to 1 * 169 = 169, dy = -4)
        let mut moving = Rect::new(212, 173, 833, 511);
        let config = SnapConfig {
            enabled: true,
            threshold: 16,
            snap_to_edges: false,
            snap_to_widgets: false,
            snap_to_grid: true,
            grid_size_x: 207,
            grid_size_y: 169,
        };

        let res = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(res.snapped_x, "Should snap to nearest grid column");
        assert!(res.snapped_y, "Should snap to nearest grid row");
        assert_eq!(moving.left, 207, "Top-left corner must snap to 1 * 207 = 207");
        assert_eq!(moving.top, 169, "Top-left corner must snap to 1 * 169 = 169");
    }

    #[test]
    fn test_snap_config_default_and_dpi_scaling() {
        let default_config = SnapConfig::default();
        assert_eq!(default_config.grid_size_x, 120);
        assert_eq!(default_config.grid_size_y, 128);

        // At 200% DPI, grid should scale to 240 x 256
        let dpi_200 = SnapConfig::with_dpi(2.0);
        assert_eq!(dpi_200.grid_size_x, 240);
        assert_eq!(dpi_200.grid_size_y, 256);
    }

    #[test]
    fn test_snap_to_desktop_grid_120_128() {
        let work_area = Rect::new(0, 0, 1920, 1080);
        // Window is moved to (235, 250) - within 16px of (240, 256), which is 2*120, 2*128
        let mut moving = Rect::new(235, 250, 595, 544);
        let config = SnapConfig::default();

        let res = apply_magnetic_snapping(&mut moving, &work_area, &[], &config);
        assert!(res.snapped_x, "Should snap horizontally to 2 * 120 = 240");
        assert!(res.snapped_y, "Should snap vertically to 2 * 128 = 256");
        assert_eq!(moving.left, 240);
        assert_eq!(moving.top, 256);
    }

    #[test]
    fn test_rects_overlap_detection() {
        let r1 = Rect::new(0, 0, 360, 256);
        let r2 = Rect::new(200, 100, 560, 356); // overlapping
        let r3 = Rect::new(360, 0, 720, 256); // adjacent touching
        let r4 = Rect::new(400, 0, 760, 256); // far away

        assert!(rects_overlap(&r1, &r2, 2));
        assert!(!rects_overlap(&r1, &r3, 2), "Adjacent rects with 2px margin do not overlap");
        assert!(!rects_overlap(&r1, &r4, 2));
    }

    #[test]
    fn test_find_nearest_non_overlapping_slot_unoccupied() {
        let work_area = Rect::new(0, 0, 1440, 900);
        let target = Rect::new(20, 20, 380, 276); // w=360, h=256
        let res = find_nearest_non_overlapping_slot(&target, &[], 120, 128, &work_area);
        assert_eq!(res.left, 0);
        assert_eq!(res.top, 0);
        assert_eq!(res.width(), 360);
        assert_eq!(res.height(), 256);
    }

    #[test]
    fn test_find_nearest_non_overlapping_slot_collision_finds_adjacent_slot() {
        let work_area = Rect::new(0, 0, 1440, 900);
        // An existing widget occupies (0, 0, 360, 256)
        let existing = vec![Rect::new(0, 0, 360, 256)];
        // Moving widget dragged right onto (0, 0)
        let target = Rect::new(50, 50, 410, 306); // w=360, h=256
        let res = find_nearest_non_overlapping_slot(&target, &existing, 120, 128, &work_area);
        // Must NOT overlap existing
        assert!(!rects_overlap(&res, &existing[0], 2));
        // Should find adjacent column or row (e.g. left=360 or top=256)
        assert!(res.left >= 360 || res.top >= 256);
    }

    #[test]
    fn test_find_nearest_non_overlapping_slot_left_third() {
        let work_area = Rect::new(0, 0, 1440, 900);
        // Existing widget at x=480, y=0 (middle)
        let existing = vec![Rect::new(480, 0, 840, 384)];
        // Target is dragged to left third at x=20, y=100
        let target = Rect::new(20, 100, 380, 356); // w=360, h=256
        let res = find_nearest_non_overlapping_slot(&target, &existing, 120, 128, &work_area);
        assert_eq!(res.left, 0, "Should place at column 0 in the left third");
        assert_eq!(res.top, 128, "Should snap to row 1 (128)");
        assert!(!rects_overlap(&res, &existing[0], 2));
    }
}
