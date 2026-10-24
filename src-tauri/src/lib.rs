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
                    id: widget_id,
                    is_widget: true,
                    no_activate: true,
                    dark_mode: true,
                    target_x: Some(placement.logical_x),
                    target_y: Some(placement.logical_y),
                    width: placement.logical_width,
                    height: placement.logical_height,
                },
            );
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
                let _ = main.show();
            }
            // Destroy independent widget windows to conserve working set RAM (<90 MB budget)
            for id in &["resources", "spotify", "weather"] {
                let _ = close_widget_window(app.clone(), id.to_string()).await;
            }
        } else {
            // Independent multi-window mode: launch separate floating windows for visible widgets
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

pub use integration::{close_widget_window, open_widget_window, sync_widget_windows};

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
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = window_manager_setup.setup_widget_window(
                    &main_win,
                    WindowSetupOptions {
                        id: "main".to_string(),
                        is_widget: true,
                        no_activate: false,
                        dark_mode: true,
                        target_x: Some(40.0),
                        target_y: Some(40.0),
                        width: 360.0,
                        height: 640.0,
                    },
                );
            }

            // Sync widget windows when configuration changes (e.g. from System Tray toggles)
            let app_handle = app.handle().clone();
            app.listen("config-changed", move |_event| {
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
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
    fn test_skeleton() {
        assert_eq!(2 + 2, 4);
    }

    #[test]
    fn test_window_setup_options_default() {
        let options = WindowSetupOptions::default();
        assert!(options.is_widget);
        assert!(options.no_activate);
        assert!(options.dark_mode);
        assert_eq!(options.width, 320.0);
        assert_eq!(options.height, 400.0);
    }
}
