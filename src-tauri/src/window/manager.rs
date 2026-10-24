use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tauri::{Position, Runtime, Size, WebviewWindow};

use super::monitor::{clamp_to_monitors, logical_to_physical, physical_to_logical, LogicalRect, MonitorBounds, PhysicalRect};
use super::snapping::{Rect, SnapConfig};
use super::win32::{
    apply_acrylic_effect, apply_tool_window_styles, install_window_subclass,
    register_tracked_window, set_snapping_enabled, set_snapping_threshold,
    unregister_tracked_window, WIDGET_SUBCLASS_ID,
};

#[derive(Debug, Clone)]
pub struct WindowSetupOptions {
    pub id: String,
    pub is_widget: bool,
    pub no_activate: bool,
    pub dark_mode: bool,
    pub target_x: Option<f64>,
    pub target_y: Option<f64>,
    pub width: f64,
    pub height: f64,
}

impl Default for WindowSetupOptions {
    fn default() -> Self {
        Self {
            id: "widget".to_string(),
            is_widget: true,
            no_activate: true,
            dark_mode: true,
            target_x: None,
            target_y: None,
            width: 320.0,
            height: 400.0,
        }
    }
}

#[derive(Debug, Clone)]
pub struct WidgetWindowInfo {
    pub id: String,
    pub hwnd: isize,
    pub rect: PhysicalRect,
    pub scale_factor: f64,
}

#[derive(Clone)]
pub struct WindowManager {
    widgets: Arc<RwLock<HashMap<String, WidgetWindowInfo>>>,
    locked: Arc<AtomicBool>,
    snap_config: Arc<RwLock<SnapConfig>>,
}

impl Default for WindowManager {
    fn default() -> Self {
        Self::new()
    }
}

impl WindowManager {
    pub fn new() -> Self {
        Self {
            widgets: Arc::new(RwLock::new(HashMap::new())),
            locked: Arc::new(AtomicBool::new(false)),
            snap_config: Arc::new(RwLock::new(SnapConfig::default())),
        }
    }

    pub fn is_locked(&self) -> bool {
        self.locked.load(Ordering::SeqCst)
    }

    pub fn set_locked(&self, locked: bool) {
        self.locked.store(locked, Ordering::SeqCst);
    }

    pub fn set_snapping(&self, enabled: bool, threshold: i32) {
        set_snapping_enabled(enabled);
        set_snapping_threshold(threshold);
        if let Ok(mut config) = self.snap_config.write() {
            config.enabled = enabled;
            config.threshold = threshold;
        }
    }

    /// Queries all connected monitors and normalizes their bounds and scale factors.
    pub fn get_monitors<R: Runtime>(&self, window: &WebviewWindow<R>) -> Vec<MonitorBounds> {
        let mut result = Vec::new();
        if let Ok(monitors) = window.available_monitors() {
            for (idx, mon) in monitors.into_iter().enumerate() {
                let pos = mon.position();
                let size = mon.size();
                let scale = mon.scale_factor();
                let name = mon.name().cloned().unwrap_or_else(|| format!("Display {}", idx + 1));

                result.push(MonitorBounds {
                    id: format!("mon_{}", idx),
                    name,
                    x: pos.x,
                    y: pos.y,
                    width: size.width,
                    height: size.height,
                    scale_factor: scale,
                    is_primary: idx == 0,
                });
            }
        }
        result
    }

    /// Clamps given logical position and size against all active monitors so window never spawns off-screen.
    pub fn clamp_coordinates<R: Runtime>(
        &self,
        window: &WebviewWindow<R>,
        logical_x: f64,
        logical_y: f64,
        logical_width: f64,
        logical_height: f64,
    ) -> (f64, f64) {
        let scale = window.scale_factor().unwrap_or(1.0);
        let monitors = self.get_monitors(window);

        let logical_rect = LogicalRect {
            x: logical_x,
            y: logical_y,
            width: logical_width,
            height: logical_height,
        };
        let physical = logical_to_physical(logical_rect, scale);
        let clamped_physical = clamp_to_monitors(physical, &monitors);
        let clamped_logical = physical_to_logical(clamped_physical, scale);

        (clamped_logical.x, clamped_logical.y)
    }

    /// Complete setup pipeline for a Tauri WebviewWindow:
    /// 1. Applies native DWM Acrylic blur backdrop via window-vibrancy
    /// 2. Applies WS_EX_TOOLWINDOW and WS_EX_NOACTIVATE via Win32 API
    /// 3. Hooks WM_WINDOWPOSCHANGING (Win+D protection) and WM_MOVING (magnetic snapping)
    /// 4. Validates and clamps coordinates against available monitors
    pub fn setup_widget_window<R: Runtime>(
        &self,
        window: &WebviewWindow<R>,
        options: WindowSetupOptions,
    ) -> Result<(), String> {
        // 1. DWM Acrylic blur backdrop
        let _ = apply_acrylic_effect(window, options.dark_mode);

        let scale = window.scale_factor().unwrap_or(1.0);
        let logical_w = options.width;
        let logical_h = options.height;

        // 2. Clamped positioning against active display monitors
        let target_x = options.target_x.unwrap_or(100.0);
        let target_y = options.target_y.unwrap_or(100.0);
        let (clamped_x, clamped_y) = self.clamp_coordinates(window, target_x, target_y, logical_w, logical_h);

        let _ = window.set_size(Size::Logical(tauri::LogicalSize {
            width: logical_w,
            height: logical_h,
        }));
        let _ = window.set_position(Position::Logical(tauri::LogicalPosition {
            x: clamped_x,
            y: clamped_y,
        }));

        // 3. Win32 styles and subclass hook (only for desktop widgets, never for Settings dialog)
        if options.is_widget {
            #[cfg(windows)]
            {
                let raw_hwnd = window
                    .hwnd()
                    .map_err(|e| format!("Failed to retrieve window HWND: {}", e))?;
                let hwnd_ptr = raw_hwnd.0 as *mut core::ffi::c_void;

                unsafe {
                    apply_tool_window_styles(hwnd_ptr, options.no_activate)?;

                    // Unique subclass ID hash for this window instance
                    let id_hash = options
                        .id
                        .bytes()
                        .fold(0usize, |acc, b| acc.wrapping_add(b as usize));
                    let subclass_id = WIDGET_SUBCLASS_ID.wrapping_add(id_hash);

                    install_window_subclass(hwnd_ptr, subclass_id)?;
                }

                let physical_rect = logical_to_physical(
                    LogicalRect {
                        x: clamped_x,
                        y: clamped_y,
                        width: logical_w,
                        height: logical_h,
                    },
                    scale,
                );

                let hwnd_isize = raw_hwnd.0 as isize;
                register_tracked_window(
                    hwnd_isize,
                    Rect::from_pos_size(
                        physical_rect.x,
                        physical_rect.y,
                        physical_rect.width,
                        physical_rect.height,
                    ),
                );

                if let Ok(mut map) = self.widgets.write() {
                    map.insert(
                        options.id.clone(),
                        WidgetWindowInfo {
                            id: options.id,
                            hwnd: hwnd_isize,
                            rect: physical_rect,
                            scale_factor: scale,
                        },
                    );
                }
            }
        }

        Ok(())
    }

    pub fn unregister_widget(&self, id: &str) {
        if let Ok(mut map) = self.widgets.write() {
            if let Some(info) = map.remove(id) {
                unregister_tracked_window(info.hwnd);
            }
        }
    }

    /// Updates tracked window bounds when programmatic position changes occur.
    pub fn update_window_position(
        &self,
        id: &str,
        logical_x: f64,
        logical_y: f64,
        logical_width: f64,
        logical_height: f64,
    ) {
        if let Ok(mut map) = self.widgets.write() {
            if let Some(info) = map.get_mut(id) {
                let physical = logical_to_physical(
                    LogicalRect {
                        x: logical_x,
                        y: logical_y,
                        width: logical_width,
                        height: logical_height,
                    },
                    info.scale_factor,
                );
                info.rect = physical;
                super::win32::update_tracked_window(
                    info.hwnd,
                    Rect::from_pos_size(
                        physical.x,
                        physical.y,
                        physical.width,
                        physical.height,
                    ),
                );
            }
        }
    }
}
