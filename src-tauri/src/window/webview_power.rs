use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

static WIDGETS_SUSPENDED: AtomicBool = AtomicBool::new(false);

/// Returns whether widget windows are currently marked as suspended.
pub fn is_widgets_suspended() -> bool {
    WIDGETS_SUSPENDED.load(Ordering::SeqCst)
}

/// Checks whether a given window label represents a suspendable widget window.
/// Widget windows include "main" and any "widget_*" window, but NEVER the "settings" window.
pub fn is_suspendable_widget_window(label: &str) -> bool {
    if label == "settings" {
        return false;
    }
    label == "main" || label.starts_with("widget_")
}

/// Suspends or resumes WebView2 rendering controllers for all active widget windows.
///
/// When `suspended == true`:
/// - Iterates all active webview windows.
/// - Skips the "settings" window or other non-widget utility windows.
/// - Calls `ICoreWebView2Controller::SetIsVisible(false)` on all widget windows ("main", "widget_*").
///   This halts Chromium frame compositing and DWM presentation, dropping background GPU/CPU overhead to 0%.
///
/// When `suspended == false`:
/// - Restores visibility via `ICoreWebView2Controller::SetIsVisible(true)`.
/// - Triggers an immediate telemetry refresh (`metrics-update`, `media-metadata-update`, `battery-update`)
///   so restored widgets reflect up-to-date system status instantly.
pub fn set_widgets_suspended<R: Runtime>(app: &AppHandle<R>, suspended: bool) {
    let prev = WIDGETS_SUSPENDED.swap(suspended, Ordering::SeqCst);
    if prev == suspended {
        // State unchanged; avoid redundant controller calls
        return;
    }

    log::info!(
        "Transitioning WebView2 widgets suspension state: suspended={} (previous={})",
        suspended,
        prev
    );

    let windows = app.webview_windows();
    for (label, window) in windows {
        if is_suspendable_widget_window(&label) {
            set_window_suspended(&window, suspended);
        }
    }

    if !suspended {
        trigger_resume_refresh(app);
    }
}

/// Sets the suspension state for an individual WebviewWindow.
pub fn set_window_suspended<R: Runtime>(window: &WebviewWindow<R>, suspended: bool) {
    #[cfg(windows)]
    {
        let label = window.label().to_string();
        let res = window.with_webview(move |webview| {
            unsafe {
                let controller = webview.controller();
                let _ = controller.SetIsVisible(!suspended);
            }
        });
        if let Err(e) = res {
            log::debug!(
                "Failed to set WebView2 visibility for window '{}': {}",
                label,
                e
            );
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (window, suspended);
    }
}

/// Triggers an immediate broadcast of cached or current system telemetry upon resume
/// so widgets hydrate their UI immediately without waiting for the next timer tick.
pub fn trigger_resume_refresh<R: Runtime>(app: &AppHandle<R>) {
    // 1. Emit cached SystemMetrics if available
    if let Some(state) = app.try_state::<crate::sysinfo::SharedMetricsState>() {
        if let Ok(guard) = state.read() {
            if guard.timestamp_ms > 0 {
                let metrics = guard.clone();
                let _ = app.emit("metrics-update", &metrics);
                let _ = app.emit_to("main", "metrics-update", &metrics);
                let _ = app.emit_to("widget_resources", "metrics-update", &metrics);
                let _ = app.emit_to("widget_battery", "metrics-update", &metrics);
            }
        }
    }

    // 2. Emit BatteryStatus
    if let Ok(battery_status) = crate::battery::get_battery_status(app.clone()) {
        let _ = app.emit("battery-update", &battery_status);
        let _ = app.emit_to("main", "battery-update", &battery_status);
        let _ = app.emit_to("widget_battery", "battery-update", &battery_status);
    }

    // 3. Emit MediaSession
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(media_session) = crate::media::get_media_state().await {
            let _ = app_clone.emit("media-metadata-update", &media_session);
            let _ = app_clone.emit_to("main", "media-metadata-update", &media_session);
            let _ = app_clone.emit_to("widget_spotify", "media-metadata-update", &media_session);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_suspendable_widget_window() {
        // Widget windows must be suspendable
        assert!(is_suspendable_widget_window("main"));
        assert!(is_suspendable_widget_window("widget_resources"));
        assert!(is_suspendable_widget_window("widget_spotify"));
        assert!(is_suspendable_widget_window("widget_weather"));
        assert!(is_suspendable_widget_window("widget_clock"));
        assert!(is_suspendable_widget_window("widget_battery"));

        // Settings modal must NEVER be suspended
        assert!(!is_suspendable_widget_window("settings"));

        // Arbitrary helper or dialogue windows must not be treated as widgets
        assert!(!is_suspendable_widget_window("about"));
        assert!(!is_suspendable_widget_window("updater"));
        assert!(!is_suspendable_widget_window("preferences"));
    }

    #[test]
    fn test_widgets_suspended_flag_transitions() {
        WIDGETS_SUSPENDED.store(false, Ordering::SeqCst);
        assert!(!is_widgets_suspended());

        WIDGETS_SUSPENDED.store(true, Ordering::SeqCst);
        assert!(is_widgets_suspended());

        WIDGETS_SUSPENDED.store(false, Ordering::SeqCst);
        assert!(!is_widgets_suspended());
    }
}
