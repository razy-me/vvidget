pub mod manager;
pub mod monitor;
pub mod snapping;
pub mod win32;

pub use manager::{WidgetWindowInfo, WindowManager, WindowSetupOptions};
pub use monitor::{
    clamp_logical_position, clamp_to_monitors, logical_to_physical, physical_to_logical,
    LogicalRect, MonitorBounds, PhysicalRect,
};
pub use snapping::{apply_magnetic_snapping, Rect, SnapConfig, SnapResult};
pub use win32::{
    apply_acrylic_effect, apply_tool_window_styles, install_window_subclass,
    is_snapping_enabled, register_tracked_window, remove_window_subclass,
    set_snapping_enabled, set_snapping_threshold, unregister_tracked_window,
    WIDGET_SUBCLASS_ID,
};
