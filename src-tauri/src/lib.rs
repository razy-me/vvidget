pub mod media;
pub mod config;
pub mod geo;
pub mod sysinfo;
pub mod tray;
pub mod window;

use config::{
    get_autostart_status, load_config, open_logs_folder, resolve_config_path, save_config,
    save_config_immediate, set_autostart, set_widgets_locked, ConfigManager,
};
use geo::get_windows_location;
use media::{
    get_media_state, handle_album_art_protocol, media_next_track, media_play_pause,
    media_previous_track, start_media_monitor,
};
use sysinfo::{get_system_metrics, start_metrics_worker, MetricsCollector};
use tauri::{Listener, Manager, Runtime};
use tray::{open_settings, setup_tray};
use window::{WindowManager, WindowSetupOptions};

pub mod integration {
    use super::*;

    /// Opens an independent WebviewWindow for a specific starter widget (resources, spotify, weather).
    #[tauri::command]
    #[specta::specta]
    pub async fn open_widget_window<R: Runtime>(
        app: tauri::AppHandle<R>,
        widget_id: String,
    ) -> Result<(), String> {
        let label = format!("widget_{}", widget_id);
        if let Some(existing) = app.get_webview_window(&label) {
            let _ = existing.unminimize();
            let _ = existing.show();
            return Ok(());
        }

        let config = load_config(app.clone()).await?;
        let placement = config
            .widgets
            .get(&widget_id)
            .cloned()
            .unwrap_or(crate::config::WidgetPlacement {
                id: widget_id.clone(),
                visible: true,
                logical_x: 80.0,
                logical_y: 80.0,
                logical_width: 340.0,
                logical_height: 420.0,
                scale_factor: 1.0,
                monitor_id: None,
            });

        let window = tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::App(format!("index.html?widget={}", widget_id).into()),
        )
        .title(format!("Widgetz - {}", widget_id))
        .inner_size(placement.logical_width, placement.logical_height)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .build()
        .map_err(|e| format!("Failed to create widget window {}: {}", widget_id, e))?;

        if let Some(win_mgr) = app.try_state::<WindowManager>() {
            let _ = win_mgr.setup_widget_window(
                &window,
                WindowSetupOptions {
                    id: widget_id.clone(),
                    is_widget: true,
                    no_activate: false,
                    dark_mode: config.theme != "light",
                    target_x: Some(placement.logical_x),
                    target_y: Some(placement.logical_y),
                    width: placement.logical_width,
                    height: placement.logical_height,
                },
            );

            let wm_event = win_mgr.inner().clone();
            let widget_id_event = widget_id.clone();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Moved(pos) = event {
                    let scale = window_clone.scale_factor().unwrap_or(1.0);
                    let logical_x = (pos.x as f64) / scale;
                    let logical_y = (pos.y as f64) / scale;
                    let size = window_clone
                        .inner_size()
                        .unwrap_or(tauri::PhysicalSize { width: 342, height: 300 });
                    let logical_w = (size.width as f64) / scale;
                    let logical_h = (size.height as f64) / scale;
                    wm_event.update_window_position(&widget_id_event, logical_x, logical_y, logical_w, logical_h);
                }
            });
        }

        Ok(())
    }

    /// Saves the exact snapped grid coordinates of a widget to persistent config immediately.
    #[tauri::command]
    #[specta::specta]
    pub async fn save_widget_position<R: Runtime>(
        app: tauri::AppHandle<R>,
        widget_id: String,
        logical_x: f64,
        logical_y: f64,
    ) -> Result<(), String> {
        if let Some(cm) = app.try_state::<ConfigManager>() {
            let mut config = cm.get_config().await;
            if let Some(placement) = config.widgets.get_mut(&widget_id) {
                placement.logical_x = logical_x;
                placement.logical_y = logical_y;
            }
            cm.save_immediate(config).await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Closes an independent widget window and releases associated tracking.
    #[tauri::command]
    #[specta::specta]
    pub async fn close_widget_window<R: Runtime>(
        app: tauri::AppHandle<R>,
        widget_id: String,
    ) -> Result<(), String> {
        let label = format!("widget_{}", widget_id);
        if let Some(window) = app.get_webview_window(&label) {
            if let Some(win_mgr) = app.try_state::<WindowManager>() {
                win_mgr.unregister_widget(&widget_id);
            }
            let _ = window.destroy();
        }
        Ok(())
    }

    /// Synchronizes active windows based on current layout mode (docked vs independent) and visibility.
    #[tauri::command]
    #[specta::specta]
    pub async fn sync_widget_windows<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
        let config = load_config(app.clone()).await?;
        if config.layout_mode == "docked" {
            // Docked mode: ensure single unified desktop dock window is visible
            if let Some(main) = app.get_webview_window("main") {
                #[cfg(windows)]
                if let Ok(hwnd) = main.hwnd() {
                    crate::window::win32::set_window_allow_hide(hwnd.0 as isize, false);
                }
                let _ = main.show();
            }
            // Destroy independent widget windows to conserve working set RAM (<90 MB budget)
            for id in &["resources", "spotify", "weather"] {
                let _ = close_widget_window(app.clone(), id.to_string()).await;
            }
        } else {
            // Independent multi-window mode: hide main window to avoid duplicate rendering and RAM waste
            if let Some(main) = app.get_webview_window("main") {
                let _ = crate::window::win32::hide_window(&main);
            }
            // Launch separate floating windows for visible widgets
            for (id, placement) in &config.widgets {
                if placement.visible {
                    let _ = open_widget_window(app.clone(), id.clone()).await;
                } else {
                    let _ = close_widget_window(app.clone(), id.clone()).await;
                }
            }
        }
        Ok(())
    }
}

pub use integration::{close_widget_window, open_widget_window, sync_widget_windows, save_widget_position};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config_manager = ConfigManager::new(resolve_config_path());
    let window_manager = WindowManager::new();
    let metrics_collector = MetricsCollector::new();
    let shared_metrics = metrics_collector.cached_handle();

    let builder = tauri::Builder::default()
        .register_uri_scheme_protocol("widgetz", handle_album_art_protocol)
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Folder {
                        path: config::resolve_logs_dir(),
                        file_name: Some("widgetz".to_string()),
                    },
                ))
                .build(),
        );

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ));

    let window_manager_setup = window_manager.clone();
    let config_manager_setup = config_manager.clone();

    // Wire WindowManager with ConfigManager for persisting dragged coordinates (BACKEND-02)
    window_manager.set_config_manager(config_manager.clone());
    let wm_move = window_manager.clone();
    crate::window::win32::set_exit_size_move_callback(move |hwnd, rect| {
        wm_move.handle_window_moved(hwnd, rect);
    });

    builder
        .manage(config_manager.clone())
        .manage(window_manager)
        .manage(shared_metrics)
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            save_config_immediate,
            set_widgets_locked,
            get_autostart_status,
            set_autostart,
            open_logs_folder,
            open_settings,
            get_system_metrics,
            get_windows_location,
            media_play_pause,
            media_next_track,
            media_previous_track,
            get_media_state,
            open_widget_window,
            close_widget_window,
            sync_widget_windows,
            save_widget_position,
        ])
        .setup(move |app| {
            start_metrics_worker(
                app.handle().clone(),
                config_manager_setup,
                metrics_collector,
            );

            start_media_monitor(app.handle().clone());

            if let Err(e) = setup_tray(app.handle()) {
                log::error!("Failed to initialize system tray: {}", e);
            }

            // Setup main window with DWM Acrylic backdrop, tool window styles, and snapping
            let initial_config = config::load_or_recover_config(&config::resolve_config_path()).0;
            window_manager_setup.set_snap_to_edges(initial_config.snap_to_edges);

            if let Some(main_win) = app.get_webview_window("main") {
                let _ = window_manager_setup.setup_widget_window(
                    &main_win,
                    WindowSetupOptions {
                        id: "main".to_string(),
                        is_widget: true,
                        no_activate: true,
                        dark_mode: initial_config.theme != "light",
                        target_x: Some(40.0),
                        target_y: Some(40.0),
                        width: 360.0,
                        height: 640.0,
                    },
                );
            }

            // Sync widget windows on application startup and when configuration changes
            let initial_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = sync_widget_windows(initial_handle).await;
            });

            let app_handle = app.handle().clone();
            let wm_config_sync = window_manager_setup.clone();
            app.listen("config-changed", move |_event| {
                let handle = app_handle.clone();
                let wm = wm_config_sync.clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(cfg) = load_config(handle.clone()).await {
                        wm.set_snap_to_edges(cfg.snap_to_edges);
                    }
                    let _ = sync_widget_windows(handle).await;
                });
            });

            #[cfg(debug_assertions)]
            {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running widgetz application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_setup_options_default() {
        let options = WindowSetupOptions::default();
        assert!(options.is_widget);
        assert!(options.no_activate);
        assert!(options.dark_mode);
        assert_eq!(options.width, 320.0);
        assert_eq!(options.height, 400.0);
    }

    #[test]
    fn test_capabilities_acl_strict_security() {
        // Read capability file from filesystem
        let cap_path = std::path::Path::new("capabilities/default.json");
        let content = std::fs::read_to_string(cap_path)
            .or_else(|_| std::fs::read_to_string("src-tauri/capabilities/default.json"))
            .expect("capabilities/default.json must exist and be readable");

        let json: serde_json::Value = serde_json::from_str(&content)
            .expect("capabilities/default.json must be valid JSON");

        let permissions = json["permissions"]
            .as_array()
            .expect("permissions array missing in capability ACL");

        // Verify that only safe, local permissions are configured (R8 Security)
        let allowed_prefixes = [
            "core:default",
            "core:window:",
            "core:event:",
            "autostart:default",
        ];

        for perm in permissions {
            let perm_str = perm.as_str().expect("Permission item must be string");
            let is_allowed = allowed_prefixes
                .iter()
                .any(|prefix| perm_str.starts_with(prefix));
            assert!(
                is_allowed,
                "Disallowed or overly broad permission found in capabilities: {}",
                perm_str
            );

            // Explicitly deny dangerous capabilities
            assert!(!perm_str.contains("shell:execute"), "Shell execution permission is forbidden");
            assert!(!perm_str.contains("fs:allow-read-all"), "Full filesystem read is forbidden");
            assert!(!perm_str.contains("http:default"), "Unrestricted HTTP capability is forbidden");
        }
    }

    #[test]
    fn test_default_config_security_no_hardcoded_secrets() {
        let config = config::AppConfig::default();
        let json_str = serde_json::to_string(&config).expect("Serialize config");

        // R8: Ensure no secrets, tokens or unauthorized tracking endpoints
        let suspicious_terms = ["api_key", "secret", "token", "password", "telemetry", "tracking"];
        let lower = json_str.to_lowercase();
        for term in suspicious_terms {
            assert!(
                !lower.contains(term),
                "Suspicious credential or tracking term '{}' found in default configuration",
                term
            );
        }
    }

    #[test]
    fn test_resolve_paths_security() {
        let app_dir = config::resolve_app_dir();
        let config_path = config::resolve_config_path();
        let logs_dir = config::resolve_logs_dir();

        assert!(config_path.starts_with(&app_dir));
        assert!(logs_dir.starts_with(&app_dir));
        assert!(config_path.ends_with("config.json"));
        assert!(logs_dir.ends_with("logs"));
    }

    #[test]
    fn test_all_specta_data_models_deserialization_safety() {
        // Invalid inputs must fail gracefully without panicking
        let bad_inputs = [
            "{",
            "null",
            "\"just_a_string\"",
            "12345",
            "{\"widgets\": \"invalid_map\"}",
            "{\"timeline\": [1, 2, 3]}",
        ];

        for bad in bad_inputs {
            let _ = serde_json::from_str::<config::AppConfig>(bad);
            let _ = serde_json::from_str::<media::MediaSession>(bad);
            let _ = serde_json::from_str::<sysinfo::SystemMetrics>(bad);
            let _ = serde_json::from_str::<geo::GeoLocation>(bad);
            let _ = serde_json::from_str::<window::Rect>(bad);
        }
    }
}
