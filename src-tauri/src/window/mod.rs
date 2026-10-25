pub mod manager;
pub mod monitor;
pub mod snapping;
pub mod win32;

pub use manager::{ActiveWidgetRect, WidgetWindowInfo, WindowManager, WindowSetupOptions};
pub use monitor::{
    clamp_logical_position, clamp_to_monitors, logical_to_physical, physical_to_logical,
    LogicalRect, MonitorBounds, PhysicalRect,
};
pub use snapping::{apply_magnetic_snapping, Rect, SnapConfig, SnapResult};
pub use win32::{
    apply_acrylic_effect, apply_tool_window_styles, dispatch_exit_size_move, hide_window,
    install_window_subclass, is_allow_hide, is_snap_to_edges, is_snap_to_widgets,
    is_snapping_enabled, is_window_allow_hide, register_tracked_window, remove_window_subclass,
    set_allow_hide, set_exit_size_move_callback, set_snap_to_edges, set_snap_to_widgets,
    set_snapping_enabled, set_snapping_threshold, set_window_allow_hide, unregister_tracked_window,
    get_desktop_grid_metrics, DesktopGridMetrics,
    WIDGET_SUBCLASS_ID,
};
