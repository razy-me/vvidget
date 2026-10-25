#[cfg(windows)]
use windows::Win32::Foundation::{HWND, RECT, LRESULT, WPARAM, LPARAM};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE,
    WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE, WS_EX_APPWINDOW, WS_EX_TRANSPARENT,
    SetWindowPos, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_FRAMECHANGED, SWP_HIDEWINDOW, SWP_NOACTIVATE,
    WM_WINDOWPOSCHANGING, WM_MOVING, WM_SYSCOMMAND, WM_NCDESTROY, WM_EXITSIZEMOVE, WM_SHOWWINDOW,
    SC_MINIMIZE, WINDOWPOS, GetWindowRect, HWND_BOTTOM,
    FindWindowW, FindWindowExW, SendMessageW,
};
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    GetDC, ReleaseDC, GetDeviceCaps, LOGPIXELSX,
};
#[cfg(windows)]
use windows::Win32::UI::Shell::{SetWindowSubclass, DefSubclassProc, RemoveWindowSubclass};

use serde::{Deserialize, Serialize};
use super::snapping::{apply_magnetic_snapping, Rect, SnapConfig};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::RwLock;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

pub const WIDGET_SUBCLASS_ID: usize = 0x5749_4447; // 'WIDG'

static GRID_METRICS_CACHE: RwLock<Option<(Instant, DesktopGridMetrics)>> = RwLock::new(None);
const GRID_METRICS_TTL: Duration = Duration::from_secs(2);

/// Desktop icon grid spacing metrics (logical and physical pixels with scale factor).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct DesktopGridMetrics {
    pub cell_width: f64,
    pub cell_height: f64,
    pub logical_x: f64,
    pub logical_y: f64,
    pub physical_x: i32,
    pub physical_y: i32,
    pub scale_factor: f64,
}

impl Default for DesktopGridMetrics {
    fn default() -> Self {
        Self {
            cell_width: 120.0,
            cell_height: 128.0,
            logical_x: 120.0,
            logical_y: 128.0,
            physical_x: 120,
            physical_y: 128,
            scale_factor: 1.0,
        }
    }
}

static SNAP_ENABLED: AtomicBool = AtomicBool::new(true);
static SNAP_THRESHOLD: AtomicI32 = AtomicI32::new(16);
static SNAP_TO_EDGES: AtomicBool = AtomicBool::new(true);
static SNAP_TO_WIDGETS: AtomicBool = AtomicBool::new(true);
static SNAP_TO_GRID: AtomicBool = AtomicBool::new(true);

static ALLOW_HIDE: AtomicBool = AtomicBool::new(false);
static ALLOW_HIDE_HWNDS: RwLock<Option<HashSet<isize>>> = RwLock::new(None);

pub type ExitSizeMoveCallback = Box<dyn Fn(isize, Rect) + Send + Sync + 'static>;
static EXIT_SIZE_MOVE_CALLBACK: RwLock<Option<ExitSizeMoveCallback>> = RwLock::new(None);

pub fn set_exit_size_move_callback<F>(cb: F)
where
    F: Fn(isize, Rect) + Send + Sync + 'static,
{
    if let Ok(mut lock) = EXIT_SIZE_MOVE_CALLBACK.write() {
        *lock = Some(Box::new(cb));
    }
}

pub fn dispatch_exit_size_move(hwnd: isize, rect: Rect) {
    if let Ok(guard) = EXIT_SIZE_MOVE_CALLBACK.read() {
        if let Some(cb) = guard.as_ref() {
            cb(hwnd, rect);
        }
    }
}

pub fn set_allow_hide(allow: bool) {
    ALLOW_HIDE.store(allow, Ordering::SeqCst);
}

pub fn is_allow_hide() -> bool {
    ALLOW_HIDE.load(Ordering::SeqCst)
}

pub fn set_window_allow_hide(hwnd: isize, allow: bool) {
    if let Ok(mut guard) = ALLOW_HIDE_HWNDS.write() {
        let set = guard.get_or_insert_with(HashSet::new);
        if allow {
            set.insert(hwnd);
        } else {
            set.remove(&hwnd);
        }
    }
}

pub fn is_window_allow_hide(hwnd: isize) -> bool {
    if ALLOW_HIDE.load(Ordering::SeqCst) {
        return true;
    }
    if let Ok(guard) = ALLOW_HIDE_HWNDS.read() {
        if let Some(set) = guard.as_ref() {
            return set.contains(&hwnd);
        }
    }
    false
}

pub fn hide_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> Result<(), tauri::Error> {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        set_window_allow_hide(hwnd.0 as isize, true);
    }
    let res = window.hide();
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        set_window_allow_hide(hwnd.0 as isize, false);
    }
    res
}

pub fn set_snap_to_edges(enabled: bool) {
    SNAP_TO_EDGES.store(enabled, Ordering::SeqCst);
}

pub fn is_snap_to_edges() -> bool {
    SNAP_TO_EDGES.load(Ordering::SeqCst)
}

pub fn set_snap_to_widgets(enabled: bool) {
    SNAP_TO_WIDGETS.store(enabled, Ordering::SeqCst);
}

pub fn is_snap_to_widgets() -> bool {
    SNAP_TO_WIDGETS.load(Ordering::SeqCst)
}

pub fn set_snap_to_grid(enabled: bool) {
    SNAP_TO_GRID.store(enabled, Ordering::SeqCst);
}

pub fn is_snap_to_grid() -> bool {
    SNAP_TO_GRID.load(Ordering::SeqCst)
}


static TRACKED_WINDOWS: RwLock<Option<HashMap<isize, Rect>>> = RwLock::new(None);

pub fn get_tracked_windows() -> Vec<Rect> {
    if let Ok(guard) = TRACKED_WINDOWS.read() {
        if let Some(map) = guard.as_ref() {
            return map.values().copied().collect();
        }
    }
    Vec::new()
}

pub fn register_tracked_window(hwnd: isize, rect: Rect) {
    if let Ok(mut guard) = TRACKED_WINDOWS.write() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(hwnd, rect);
    }
}

pub fn unregister_tracked_window(hwnd: isize) {
    if let Ok(mut guard) = TRACKED_WINDOWS.write() {
        if let Some(map) = guard.as_mut() {
            map.remove(&hwnd);
        }
    }
}

pub fn update_tracked_window(hwnd: isize, rect: Rect) {
    if let Ok(mut guard) = TRACKED_WINDOWS.write() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(hwnd, rect);
    }
}

pub fn set_snapping_enabled(enabled: bool) {
    SNAP_ENABLED.store(enabled, Ordering::SeqCst);
}

pub fn is_snapping_enabled() -> bool {
    SNAP_ENABLED.load(Ordering::SeqCst)
}

pub fn set_snapping_threshold(threshold: i32) {
    SNAP_THRESHOLD.store(threshold, Ordering::SeqCst);
}

pub fn get_snapping_threshold() -> i32 {
    SNAP_THRESHOLD.load(Ordering::SeqCst)
}

/// Applies Win32 Tool Window styles:
/// - WS_EX_TOOLWINDOW: hides from Alt+Tab switcher and taskbar
/// - WS_EX_NOACTIVATE: prevents stealing input focus from active applications (games/browsers)
/// - Removes WS_EX_APPWINDOW
#[cfg(windows)]
pub unsafe fn apply_tool_window_styles(raw_hwnd: *mut core::ffi::c_void, no_activate: bool) -> Result<(), String> {
    let hwnd = HWND(raw_hwnd);
    let current_ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    let mut new_ex_style = (current_ex_style | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
    if no_activate {
        new_ex_style |= WS_EX_NOACTIVATE.0;
    }

    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex_style as isize);
    SetWindowPos(
        hwnd,
        HWND_BOTTOM,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
    )
    .map_err(|e| format!("SetWindowPos failed: {}", e))?;

    Ok(())
}

#[cfg(windows)]
pub unsafe fn apply_skeleton_window_styles(raw_hwnd: *mut core::ffi::c_void) -> Result<(), String> {
    let hwnd = HWND(raw_hwnd);
    let current_ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    let new_ex_style = (current_ex_style | WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0 | WS_EX_TRANSPARENT.0)
        & !WS_EX_APPWINDOW.0;

    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex_style as isize);
    SetWindowPos(
        hwnd,
        HWND_BOTTOM,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED,
    )
    .map_err(|e| format!("SetWindowPos failed: {}", e))?;

    Ok(())
}

#[cfg(not(windows))]
pub unsafe fn apply_skeleton_window_styles(_raw_hwnd: *mut core::ffi::c_void) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
pub unsafe fn apply_tool_window_styles(_raw_hwnd: *mut core::ffi::c_void, _no_activate: bool) -> Result<(), String> {
    Ok(())
}

/// Applies native window transparency and composition.
/// On Windows 11 with transparent: true, WebView2 uses DirectComposition per-pixel alpha transparency.
/// Calling window_vibrancy::apply_acrylic applies an HWND-level AccentPolicy that fills the ENTIRE
/// rectangular window with an opaque flat grey tint when inactive (WS_EX_NOACTIVATE), ruining
/// transparent rounded corners and creating an ugly square border around the widget cards.
/// By keeping the HWND purely transparent, WebView2 composites the rounded CSS Fluent cards directly onto the desktop
/// with smooth transparent anti-aliased corners and no rectangular borders!
pub fn apply_acrylic_effect<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>, _dark_mode: bool) -> Result<(), String> {
    Ok(())
}

/// Attempts to find the desktop's SysListView32 window under Progman or WorkerW.
#[cfg(windows)]
unsafe fn find_desktop_listview() -> Option<HWND> {
    use windows::core::w;

    // 1. Check Progman -> SHELLDLL_DefView -> SysListView32
    if let Ok(progman) = FindWindowW(w!("Progman"), None) {
        if progman.0 != core::ptr::null_mut() {
            if let Ok(def_view) = FindWindowExW(progman, HWND(core::ptr::null_mut()), w!("SHELLDLL_DefView"), None) {
                if def_view.0 != core::ptr::null_mut() {
                    if let Ok(listview) = FindWindowExW(def_view, HWND(core::ptr::null_mut()), w!("SysListView32"), None) {
                        if listview.0 != core::ptr::null_mut() {
                            return Some(listview);
                        }
                    }
                }
            }
        }
    }

    // 2. WorkerW check (when active wallpaper / desktop slides run in Explorer)
    let mut worker: HWND = HWND(core::ptr::null_mut());
    while let Ok(next_worker) = FindWindowExW(HWND(core::ptr::null_mut()), worker, w!("WorkerW"), None) {
        if next_worker.0 == core::ptr::null_mut() {
            break;
        }
        if let Ok(def_view) = FindWindowExW(next_worker, HWND(core::ptr::null_mut()), w!("SHELLDLL_DefView"), None) {
            if def_view.0 != core::ptr::null_mut() {
                if let Ok(listview) = FindWindowExW(def_view, HWND(core::ptr::null_mut()), w!("SysListView32"), None) {
                    if listview.0 != core::ptr::null_mut() {
                        return Some(listview);
                    }
                }
            }
        }
        worker = next_worker;
    }

    None
}

/// Live query to retrieve desktop icon grid spacing from Windows Explorer SysListView32
/// via SendMessageW(hwnd, LVM_GETITEMSPACING, 0, 0), with fallback to
/// (120 logical px / 240 physical px @ 200% DPI, 98 logical px / 196 physical px @ 200% DPI).
/// Cached with a 2-second TTL to avoid cross-process IPC stalls during high-frequency drag operations.
pub fn get_desktop_grid_metrics() -> DesktopGridMetrics {
    if let Ok(guard) = GRID_METRICS_CACHE.read() {
        if let Some((timestamp, metrics)) = guard.as_ref() {
            if timestamp.elapsed() < GRID_METRICS_TTL {
                return *metrics;
            }
        }
    }

    let fresh = query_desktop_grid_metrics();

    if let Ok(mut guard) = GRID_METRICS_CACHE.write() {
        *guard = Some((Instant::now(), fresh));
    }

    fresh
}

#[cfg(windows)]
fn query_desktop_grid_metrics() -> DesktopGridMetrics {
    unsafe {
        let (scale, mut physical_x, mut physical_y) = {
            let hdc = GetDC(HWND(core::ptr::null_mut()));
            let dpi = if hdc.0 != core::ptr::null_mut() {
                let d = GetDeviceCaps(hdc, LOGPIXELSX);
                let _ = ReleaseDC(HWND(core::ptr::null_mut()), hdc);
                d
            } else {
                96
            };
            let s = if dpi > 0 { dpi as f64 / 96.0 } else { 1.0 };
            let px = (120.0 * s).round() as i32;
            let py = (128.0 * s).round() as i32;
            (s, px, py)
        };

        if let Some(listview_hwnd) = find_desktop_listview() {
            const LVM_FIRST: u32 = 0x1000;
            const LVM_GETITEMSPACING: u32 = LVM_FIRST + 51;
            let res = SendMessageW(listview_hwnd, LVM_GETITEMSPACING, WPARAM(0), LPARAM(0));
            // Validate SendMessageW LRESULT: check positive and not -1
            if res.0 > 0 && res.0 != -1 {
                let spacing = res.0 as u32;
                let cx = (spacing & 0xFFFF) as i32;
                let cy = ((spacing >> 16) & 0xFFFF) as i32;
                // Validate reasonable icon spacing bounds (between 20px and 1000px)
                if cx >= 20 && cx <= 1000 && cy >= 20 && cy <= 1000 {
                    physical_x = cx;
                    physical_y = cy;
                }
            }
        }

        let logical_x = physical_x as f64 / scale;
        let logical_y = physical_y as f64 / scale;

        DesktopGridMetrics {
            cell_width: logical_x,
            cell_height: logical_y,
            logical_x,
            logical_y,
            physical_x,
            physical_y,
            scale_factor: scale,
        }
    }
}

#[cfg(not(windows))]
fn query_desktop_grid_metrics() -> DesktopGridMetrics {
    DesktopGridMetrics::default()
}

#[cfg(windows)]
unsafe fn on_wm_moving(hwnd: HWND, rect: &mut RECT) {
    let metrics = get_desktop_grid_metrics();
    let (grid_x, grid_y) = (metrics.physical_x.max(1), metrics.physical_y.max(1));

    let config = SnapConfig {
        enabled: SNAP_ENABLED.load(Ordering::SeqCst),
        threshold: SNAP_THRESHOLD.load(Ordering::SeqCst),
        snap_to_edges: SNAP_TO_EDGES.load(Ordering::SeqCst),
        snap_to_widgets: SNAP_TO_WIDGETS.load(Ordering::SeqCst),
        snap_to_grid: SNAP_TO_GRID.load(Ordering::SeqCst),
        grid_size_x: grid_x,
        grid_size_y: grid_y,
    };

    if !config.enabled {
        return;
    }

    // Query active monitor work area (excluding taskbar)
    let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    let mut mi = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };

    let work_area = if GetMonitorInfoW(hmon, &mut mi).as_bool() {
        Rect::new(mi.rcWork.left, mi.rcWork.top, mi.rcWork.right, mi.rcWork.bottom)
    } else {
        Rect::new(0, 0, 1920, 1080)
    };

    // Filter out our own rect from other tracked widgets
    let current_hwnd_isize = hwnd.0 as isize;
    let other_rects: Vec<Rect> = {
        if let Ok(guard) = TRACKED_WINDOWS.read() {
            if let Some(map) = guard.as_ref() {
                map.iter()
                    .filter(|(&h, _)| h != current_hwnd_isize)
                    .map(|(_, &r)| r)
                    .collect()
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    };

    let mut moving_rect = Rect::new(rect.left, rect.top, rect.right, rect.bottom);
    apply_magnetic_snapping(&mut moving_rect, &work_area, &other_rects, &config);

    rect.left = moving_rect.left;
    rect.top = moving_rect.top;
    rect.right = moving_rect.right;
    rect.bottom = moving_rect.bottom;

    update_tracked_window(current_hwnd_isize, moving_rect);
}

#[cfg(windows)]
unsafe extern "system" fn widget_subclass_proc(
    hwnd: HWND,
    umsg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    uidsubclass: usize,
    _dwrefdata: usize,
) -> LRESULT {
    match umsg {
        // Win + D (Show Desktop) protection:
        // Intercept SWP_HIDEWINDOW and strip it to keep widget visible on the desktop canvas,
        // unless programmatic hide is explicitly requested.
        WM_WINDOWPOSCHANGING => {
            let p_winpos = lparam.0 as *mut WINDOWPOS;
            if !p_winpos.is_null() {
                let winpos = &mut *p_winpos;
                if (winpos.flags & SWP_HIDEWINDOW).0 != 0 {
                    if !is_window_allow_hide(hwnd.0 as isize) {
                        winpos.flags = winpos.flags & !SWP_HIDEWINDOW;
                    }
                }
            }
            DefSubclassProc(hwnd, umsg, wparam, lparam)
        }
        // Detect programmatic hide commands (ShowWindow(SW_HIDE))
        WM_SHOWWINDOW => {
            if wparam.0 == 0 && lparam.0 == 0 {
                set_window_allow_hide(hwnd.0 as isize, true);
            } else if wparam.0 != 0 {
                set_window_allow_hide(hwnd.0 as isize, false);
            }
            DefSubclassProc(hwnd, umsg, wparam, lparam)
        }
        // Suppress standard minimize commands
        WM_SYSCOMMAND => {
            let cmd = (wparam.0 as u32) & 0xFFF0;
            if cmd == SC_MINIMIZE {
                return LRESULT(0);
            }
            DefSubclassProc(hwnd, umsg, wparam, lparam)
        }
        // Magnetic edge and widget-to-widget snapping directly in OS memory
        WM_MOVING => {
            let p_rect = lparam.0 as *mut RECT;
            if !p_rect.is_null() {
                on_wm_moving(hwnd, &mut *p_rect);
                DefSubclassProc(hwnd, umsg, wparam, lparam);
                return LRESULT(1);
            }
            DefSubclassProc(hwnd, umsg, wparam, lparam)
        }
        // Persist final dragged widget position on mouse release with magnetic grid snapping
        WM_EXITSIZEMOVE => {
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_ok() {
                on_wm_moving(hwnd, &mut rect);
                let _ = SetWindowPos(
                    hwnd,
                    HWND(core::ptr::null_mut()),
                    rect.left,
                    rect.top,
                    rect.right - rect.left,
                    rect.bottom - rect.top,
                    SWP_NOZORDER | SWP_NOACTIVATE,
                );
                let r = Rect::new(rect.left, rect.top, rect.right, rect.bottom);
                update_tracked_window(hwnd.0 as isize, r);
                dispatch_exit_size_move(hwnd.0 as isize, r);
            }
            DefSubclassProc(hwnd, umsg, wparam, lparam)
        }
        // Clean up subclass on window destruction
        WM_NCDESTROY => {
            unregister_tracked_window(hwnd.0 as isize);
            set_window_allow_hide(hwnd.0 as isize, false);
            let _ = RemoveWindowSubclass(hwnd, Some(widget_subclass_proc), uidsubclass);
            DefSubclassProc(hwnd, umsg, wparam, lparam)
        }
        _ => DefSubclassProc(hwnd, umsg, wparam, lparam),
    }
}

/// Installs the native Win32 window subclass hook onto the window's HWND.
#[cfg(windows)]
pub unsafe fn install_window_subclass(raw_hwnd: *mut core::ffi::c_void, window_id: usize) -> Result<(), String> {
    let hwnd = HWND(raw_hwnd);
    let success = SetWindowSubclass(hwnd, Some(widget_subclass_proc), window_id, 0);
    if success.as_bool() {
        Ok(())
    } else {
        Err("SetWindowSubclass returned FALSE".to_string())
    }
}

#[cfg(not(windows))]
pub unsafe fn install_window_subclass(_raw_hwnd: *mut core::ffi::c_void, _window_id: usize) -> Result<(), String> {
    Ok(())
}

/// Removes the native Win32 window subclass hook from the window's HWND.
#[cfg(windows)]
pub unsafe fn remove_window_subclass(raw_hwnd: *mut core::ffi::c_void, window_id: usize) -> Result<(), String> {
    let hwnd = HWND(raw_hwnd);
    unregister_tracked_window(hwnd.0 as isize);
    let success = RemoveWindowSubclass(hwnd, Some(widget_subclass_proc), window_id);
    if success.as_bool() {
        Ok(())
    } else {
        Err("RemoveWindowSubclass returned FALSE".to_string())
    }
}

#[cfg(not(windows))]
pub unsafe fn remove_window_subclass(_raw_hwnd: *mut core::ffi::c_void, _window_id: usize) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snapping_settings() {
        set_snapping_enabled(true);
        assert!(is_snapping_enabled());
        set_snapping_enabled(false);
        assert!(!is_snapping_enabled());
        set_snapping_enabled(true);

        set_snapping_threshold(24);
        assert_eq!(get_snapping_threshold(), 24);
        set_snapping_threshold(16);
    }

    #[test]
    fn test_desktop_grid_metrics() {
        let metrics = get_desktop_grid_metrics();
        assert!(metrics.cell_width > 0.0);
        assert!(metrics.cell_height > 0.0);
        assert!(metrics.physical_x > 0);
        assert!(metrics.physical_y > 0);
        assert!(metrics.scale_factor > 0.0);
        assert_eq!(metrics.logical_x, metrics.cell_width);
        assert_eq!(metrics.logical_y, metrics.cell_height);
    }

    #[test]
    fn test_tracked_windows_registry() {
        let fake_hwnd: isize = 12345;
        let rect = Rect::new(50, 50, 350, 350);
        register_tracked_window(fake_hwnd, rect);

        let tracked = get_tracked_windows();
        assert!(tracked.contains(&rect));

        unregister_tracked_window(fake_hwnd);
        let tracked_after = get_tracked_windows();
        assert!(!tracked_after.contains(&rect));
    }

    #[test]
    fn test_allow_hide_logic() {
        set_allow_hide(false);
        assert!(!is_allow_hide());
        assert!(!is_window_allow_hide(99999));

        set_window_allow_hide(99999, true);
        assert!(is_window_allow_hide(99999));
        assert!(!is_window_allow_hide(88888));

        set_window_allow_hide(99999, false);
        assert!(!is_window_allow_hide(99999));

        set_allow_hide(true);
        assert!(is_allow_hide());
        assert!(is_window_allow_hide(99999));
        set_allow_hide(false);
    }

    #[test]
    fn test_snap_flags_sync() {
        set_snap_to_edges(false);
        assert!(!is_snap_to_edges());
        set_snap_to_edges(true);
        assert!(is_snap_to_edges());

        set_snap_to_widgets(false);
        assert!(!is_snap_to_widgets());
        set_snap_to_widgets(true);
        assert!(is_snap_to_widgets());
    }

    #[test]
    fn test_exit_size_move_callback() {
        use std::sync::atomic::AtomicUsize;
        static CALL_COUNT: AtomicUsize = AtomicUsize::new(0);

        set_exit_size_move_callback(|_hwnd, _rect| {
            CALL_COUNT.fetch_add(1, Ordering::SeqCst);
        });

        dispatch_exit_size_move(1234, Rect::new(10, 20, 110, 120));
        assert_eq!(CALL_COUNT.load(Ordering::SeqCst), 1);
    }
}
