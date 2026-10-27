use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use serde::{Deserialize, Serialize};
use tauri::{Position, Runtime, Size, WebviewWindow};

use super::monitor::{clamp_to_monitors, logical_to_physical, physical_to_logical, LogicalRect, MonitorBounds, PhysicalRect};
use super::snapping::{Rect, SnapConfig};
use super::win32::{
    apply_acrylic_effect, apply_tool_window_styles, install_window_subclass,
    register_tracked_window, set_snap_to_edges, set_snap_to_widgets, set_snap_to_grid, set_snapping_enabled,
    set_snapping_threshold, unregister_tracked_window, WIDGET_SUBCLASS_ID,
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ActiveWidgetRect {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone)]
pub struct WidgetWindowInfo {
    pub id: String,
    pub hwnd: isize,
    pub rect: PhysicalRect,
    pub logical_rect: LogicalRect,
    pub scale_factor: f64,
}

#[derive(Clone)]
pub struct WindowManager {
    widgets: Arc<RwLock<HashMap<String, WidgetWindowInfo>>>,
    locked: Arc<AtomicBool>,
    snap_config: Arc<RwLock<SnapConfig>>,
    config_manager: Arc<RwLock<Option<crate::config::ConfigManager>>>,
    sync_lock: Arc<tokio::sync::Mutex<()>>,
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
            config_manager: Arc::new(RwLock::new(None)),
            sync_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    pub fn sync_lock(&self) -> Arc<tokio::sync::Mutex<()>> {
        self.sync_lock.clone()
    }

    pub fn is_locked(&self) -> bool {
        self.locked.load(Ordering::SeqCst)
    }

    pub fn set_locked(&self, locked: bool) {
        self.locked.store(locked, Ordering::SeqCst);
        #[cfg(windows)]
        super::win32::set_positions_locked(locked);
    }

    pub fn set_snapping(&self, enabled: bool, threshold: i32) {
        set_snapping_enabled(enabled);
        set_snapping_threshold(threshold);
        if let Ok(mut config) = self.snap_config.write() {
            config.enabled = enabled;
            config.threshold = threshold;
        }
    }

    pub fn set_snap_to_edges(&self, enabled: bool) {
        set_snap_to_edges(enabled);
        if let Ok(mut config) = self.snap_config.write() {
            config.snap_to_edges = enabled;
        }
    }

    pub fn set_snap_to_widgets(&self, enabled: bool) {
        set_snap_to_widgets(enabled);
        if let Ok(mut config) = self.snap_config.write() {
            config.snap_to_widgets = enabled;
        }
    }

    pub fn set_snap_to_grid(&self, enabled: bool) {
        set_snap_to_grid(enabled);
        if let Ok(mut config) = self.snap_config.write() {
            config.snap_to_grid = enabled;
        }
    }

    pub fn set_config_manager(&self, config_manager: crate::config::ConfigManager) {
        if let Ok(mut lock) = self.config_manager.write() {
            *lock = Some(config_manager);
        }
    }

    pub fn get_config_manager(&self) -> Option<crate::config::ConfigManager> {
        self.config_manager.read().ok().and_then(|g| g.clone())
    }

    pub fn find_widget_by_hwnd(&self, hwnd: isize) -> Option<WidgetWindowInfo> {
        if let Ok(map) = self.widgets.read() {
            for info in map.values() {
                if info.hwnd == hwnd {
                    return Some(info.clone());
                }
            }
        }
        None
    }

    pub fn get_active_widget_rects(&self, exclude_id: Option<&str>) -> Vec<ActiveWidgetRect> {
        let mut list = Vec::new();
        if let Ok(map) = self.widgets.read() {
            for (id, info) in map.iter() {
                if let Some(ex) = exclude_id {
                    if id == ex {
                        continue;
                    }
                }
                list.push(ActiveWidgetRect {
                    id: id.clone(),
                    x: info.logical_rect.x,
                    y: info.logical_rect.y,
                    width: info.logical_rect.width,
                    height: info.logical_rect.height,
                });
            }
        }
        list
    }

    pub fn handle_window_moved(&self, hwnd: isize, rect: Rect) {
        if self.is_locked() {
            return;
        }
        if let Some(info) = self.find_widget_by_hwnd(hwnd) {
            #[cfg(windows)]
            let current_scale = {
                let s = super::win32::get_window_scale(hwnd);
                if s > 0.0 { s } else { info.scale_factor }
            };
            #[cfg(not(windows))]
            let current_scale = info.scale_factor;
            let scale = if current_scale > 0.0 { current_scale } else { 1.0 };
            let logical_x = (rect.left as f64) / scale;
            let logical_y = (rect.top as f64) / scale;
            let logical_width = ((rect.right - rect.left) as f64) / scale;
            let logical_height = ((rect.bottom - rect.top) as f64) / scale;

            if let Ok(mut map) = self.widgets.write() {
                if let Some(w) = map.get_mut(&info.id) {
                    w.scale_factor = scale;
                }
            }

            self.update_window_position(&info.id, logical_x, logical_y, logical_width, logical_height);

            if let Some(cm) = self.get_config_manager() {
                let widget_id = info.id.clone();
                tauri::async_runtime::spawn(async move {
                    let mut config = cm.get_config().await;
                    let placement = config.widgets.entry(widget_id.clone()).or_insert_with(|| crate::config::WidgetPlacement {
                        id: widget_id.clone(),
                        visible: true,
                        logical_x,
                        logical_y,
                        logical_width,
                        logical_height,
                        scale_factor: scale,
                        monitor_id: None,
                    });
                    placement.logical_x = logical_x;
                    placement.logical_y = logical_y;
                    placement.logical_width = logical_width;
                    placement.logical_height = logical_height;
                    placement.scale_factor = scale;
                    if let Err(e) = cm.save_debounced(config).await {
                        log::error!("Failed to save debounced widget position: {}", e);
                    }
                });
            }
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
                            logical_rect: LogicalRect {
                                x: clamped_x,
                                y: clamped_y,
                                width: logical_w,
                                height: logical_h,
                            },
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
                info.logical_rect = LogicalRect {
                    x: logical_x,
                    y: logical_y,
                    width: logical_width,
                    height: logical_height,
                };
                let physical = logical_to_physical(
                    info.logical_rect,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::window::win32;

    #[test]
    fn test_window_manager_lock_state() {
        let wm = WindowManager::new();
        assert!(!wm.is_locked());

        wm.set_locked(true);
        assert!(wm.is_locked());

        wm.set_locked(false);
        assert!(!wm.is_locked());
    }

    #[test]
    fn test_window_manager_snapping_settings() {
        let wm = WindowManager::new();
        wm.set_snapping(false, 32);

        assert!(!win32::is_snapping_enabled());
        assert_eq!(win32::get_snapping_threshold(), 32);

        // Reset to default
        wm.set_snapping(true, 16);
        assert!(win32::is_snapping_enabled());
        assert_eq!(win32::get_snapping_threshold(), 16);
    }

    #[test]
    fn test_window_manager_widget_tracking_lifecycle() {
        let wm = WindowManager::new();

        // Directly insert info into manager
        {
            let mut map = wm.widgets.write().unwrap();
            map.insert(
                "widget_a".to_string(),
                WidgetWindowInfo {
                    id: "widget_a".to_string(),
                    hwnd: 55555,
                    rect: PhysicalRect { x: 10, y: 20, width: 300, height: 200 },
                    logical_rect: LogicalRect { x: 10.0, y: 20.0, width: 300.0, height: 200.0 },
                    scale_factor: 1.0,
                },
            );
        }

        // Update position
        wm.update_window_position("widget_a", 50.0, 60.0, 320.0, 220.0);
        {
            let map = wm.widgets.read().unwrap();
            let info = map.get("widget_a").expect("Widget should exist");
            assert_eq!(info.rect.x, 50);
            assert_eq!(info.rect.y, 60);
            assert_eq!(info.rect.width, 320);
            assert_eq!(info.rect.height, 220);
        }

        // Unregister
        wm.unregister_widget("widget_a");
        {
            let map = wm.widgets.read().unwrap();
            assert!(!map.contains_key("widget_a"));
        }
    }

    #[test]
    fn test_window_manager_concurrent_thread_safety() {
        let wm = WindowManager::new();
        let mut handles = Vec::new();

        for i in 0..8 {
            let wm_clone = wm.clone();
            handles.push(std::thread::spawn(move || {
                for j in 0..50 {
                    wm_clone.set_locked(j % 2 == 0);
                    let _ = wm_clone.is_locked();
                    wm_clone.set_snapping(j % 2 == 1, 16 + (i as i32));
                }
            }));
        }

        for h in handles {
            h.join().unwrap();
        }
    }

    #[tokio::test]
    async fn test_window_manager_handle_window_moved_persists_config() {
        let temp_dir = std::env::temp_dir().join(format!("wm_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let config_path = temp_dir.join("config.json");
        let cm = crate::config::ConfigManager::new(config_path.clone());

        let wm = WindowManager::new();
        wm.set_config_manager(cm.clone());

        // Register widget_a
        {
            let mut map = wm.widgets.write().unwrap();
            map.insert(
                "resources".to_string(),
                WidgetWindowInfo {
                    id: "resources".to_string(),
                    hwnd: 77777,
                    rect: PhysicalRect { x: 40, y: 40, width: 320, height: 180 },
                    logical_rect: LogicalRect { x: 40.0, y: 40.0, width: 320.0, height: 180.0 },
                    scale_factor: 1.0,
                },
            );
        }

        // Simulate WM_EXITSIZEMOVE reporting new rect (x=150, y=250, r=470, b=430)
        wm.handle_window_moved(77777, Rect::new(150, 250, 470, 430));

        // Memory of WindowManager should be updated immediately
        {
            let map = wm.widgets.read().unwrap();
            let info = map.get("resources").unwrap();
            assert_eq!(info.rect.x, 150);
            assert_eq!(info.rect.y, 250);
        }

        // ConfigManager debounced save should update memory
        let mut updated = false;
        for _ in 0..20 {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            let cfg = cm.get_config().await;
            if let Some(p) = cfg.widgets.get("resources") {
                if (p.logical_x - 150.0).abs() < 1e-3 && (p.logical_y - 250.0).abs() < 1e-3 {
                    updated = true;
                    break;
                }
            }
        }
        assert!(updated, "ConfigManager should have persisted moved widget position");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
