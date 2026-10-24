pub mod config;
pub mod tray;
pub mod window;

use config::{
    get_autostart_status, load_config, open_logs_folder, resolve_config_path, save_config,
    save_config_immediate, set_autostart, set_widgets_locked, ConfigManager,
};
use tauri::Manager;
use tray::{open_settings, setup_tray};
use window::WindowManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config_manager = ConfigManager::new(resolve_config_path());
    let window_manager = WindowManager::new();

    let builder = tauri::Builder::default().plugin(
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

    builder
        .manage(config_manager)
        .manage(window_manager)
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            save_config_immediate,
            set_widgets_locked,
            get_autostart_status,
            set_autostart,
            open_logs_folder,
            open_settings,
        ])
        .setup(|app| {
            if let Err(e) = setup_tray(app.handle()) {
                log::error!("Failed to initialize system tray: {}", e);
            }

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
    #[test]
    fn test_skeleton() {
        assert_eq!(2 + 2, 4);
    }
}
