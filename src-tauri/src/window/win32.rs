#[cfg(windows)]
use windows::Win32::Foundation::{HWND, RECT, LRESULT, WPARAM, LPARAM};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE,
    WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE, WS_EX_APPWINDOW,
    SetWindowPos, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_FRAMECHANGED, SWP_HIDEWINDOW,
    WM_WINDOWPOSCHANGING, WM_MOVING, WM_SYSCOMMAND, WM_NCDESTROY, SC_MINIMIZE, WINDOWPOS,
};
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
#[cfg(windows)]
use windows::Win32::UI::Shell::{SetWindowSubclass, DefSubclassProc, RemoveWindowSubclass};

use super::snapping::{apply_magnetic_snapping, Rect, SnapConfig};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::RwLock;
use std::collections::HashMap;

pub const WIDGET_SUBCLASS_ID: usize = 0x5749_4447; // 'WIDG'

static SNAP_ENABLED: AtomicBool = AtomicBool::new(true);
static SNAP_THRESHOLD: AtomicI32 = AtomicI32::new(16);
static SNAP_TO_EDGES: AtomicBool = AtomicBool::new(true);
static SNAP_TO_WIDGETS: AtomicBool = AtomicBool::new(true);


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
        None,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
    )
    .map_err(|e| format!("SetWindowPos failed: {}", e))?;

    Ok(())
}

#[cfg(not(windows))]
pub unsafe fn apply_tool_window_styles(_raw_hwnd: *mut core::ffi::c_void, _no_activate: bool) -> Result<(), String> {
    Ok(())
}

/// Applies native DWM Acrylic blur backdrop using window-vibrancy
pub fn apply_acrylic_effect<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, dark_mode: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let tint = if dark_mode {
            Some((18, 18, 18, 128))
        } else {
            Some((245, 245, 245, 128))
        };
        window_vibrancy::apply_acrylic(window, tint)
            .map_err(|e| format!("Failed to apply Acrylic blur: {:?}", e))?;
    }
    Ok(())
}

#[cfg(windows)]
unsafe fn on_wm_moving(hwnd: HWND, rect: &mut RECT) {
    let config = SnapConfig {
        enabled: SNAP_ENABLED.load(Ordering::SeqCst),
        threshold: SNAP_THRESHOLD.load(Ordering::SeqCst),
        snap_to_edges: SNAP_TO_EDGES.load(Ordering::SeqCst),
        snap_to_widgets: SNAP_TO_WIDGETS.load(Ordering::SeqCst),
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
        // Intercept SWP_HIDEWINDOW and strip it to keep widget visible on the desktop canvas.
        WM_WINDOWPOSCHANGING => {
            let p_winpos = lparam.0 as *mut WINDOWPOS;
            if !p_winpos.is_null() {
                let winpos = &mut *p_winpos;
                if (winpos.flags & SWP_HIDEWINDOW).0 != 0 {
                    winpos.flags = winpos.flags & !SWP_HIDEWINDOW;
                }
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
                return LRESULT(1);
            }
            DefSubclassProc(hwnd, umsg, wparam, lparam)
        }
        // Clean up subclass on window destruction
        WM_NCDESTROY => {
            unregister_tracked_window(hwnd.0 as isize);
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
}
