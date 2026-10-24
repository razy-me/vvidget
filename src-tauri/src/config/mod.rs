pub mod model;
pub mod storage;

pub use model::*;
pub use storage::*;

use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;

/// Loads application configuration from state or disk.
#[tauri::command]
#[specta::specta]
pub async fn load_config<R: Runtime>(app: AppHandle<R>) -> Result<AppConfig, String> {
    if let Some(manager) = app.try_state::<ConfigManager>() {
        Ok(manager.get_config().await)
    } else {
        let (config, _) = load_or_recover_config(&resolve_config_path());
        Ok(config)
    }
}

/// Saves application configuration with 500ms debounce and emits `config-changed`.
#[tauri::command]
#[specta::specta]
pub async fn save_config<R: Runtime>(app: AppHandle<R>, config: AppConfig) -> Result<(), String> {
    // Synchronize Windows autostart state if it differs from system state
    if let Ok(autostart) = app.autolaunch().is_enabled() {
        if autostart != config.auto_start {
            if config.auto_start {
                let _ = app.autolaunch().enable();
            } else {
                let _ = app.autolaunch().disable();
            }
        }
    }

    if let Some(manager) = app.try_state::<ConfigManager>() {
        manager.save_debounced(config.clone()).await?;
    } else {
        save_config_atomic(&resolve_config_path(), &config)?;
    }

    // Broadcast config update to all webview windows
    let _ = app.emit("config-changed", &config);

    Ok(())
}

/// Saves application configuration immediately without movement debounce.
#[tauri::command]
#[specta::specta]
pub async fn save_config_immediate<R: Runtime>(
    app: AppHandle<R>,
    config: AppConfig,
) -> Result<(), String> {
    if let Some(manager) = app.try_state::<ConfigManager>() {
        manager.save_immediate(config.clone()).await?;
    } else {
        save_config_atomic(&resolve_config_path(), &config)?;
    }

    let _ = app.emit("config-changed", &config);
    Ok(())
}

/// Sets widget position locking state across all windows.
#[tauri::command]
#[specta::specta]
pub async fn set_widgets_locked<R: Runtime>(
    app: AppHandle<R>,
    locked: bool,
) -> Result<(), String> {
    let mut config = if let Some(manager) = app.try_state::<ConfigManager>() {
        manager.get_config().await
    } else {
        load_or_recover_config(&resolve_config_path()).0
    };

    config.lock_positions = locked;
    save_config_immediate(app, config).await
}

/// Queries current Windows autostart status from the operating system.
#[tauri::command]
#[specta::specta]
pub async fn get_autostart_status<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("Failed to query autostart status: {}", e))
}

/// Configures Windows autostart on user login.
#[tauri::command]
#[specta::specta]
pub async fn set_autostart<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch
            .enable()
            .map_err(|e| format!("Failed to enable autostart: {}", e))?;
    } else {
        autolaunch
            .disable()
            .map_err(|e| format!("Failed to disable autostart: {}", e))?;
    }

    // Update config in state as well
    if let Some(manager) = app.try_state::<ConfigManager>() {
        let mut config = manager.get_config().await;
        if config.auto_start != enabled {
            config.auto_start = enabled;
            let _ = manager.save_immediate(config.clone()).await;
            let _ = app.emit("config-changed", &config);
        }
    }

    Ok(())
}

/// Opens the application log folder in Windows Explorer.
#[tauri::command]
#[specta::specta]
pub async fn open_logs_folder<R: Runtime>(_app: AppHandle<R>) -> Result<(), String> {
    let logs_dir = resolve_logs_dir();
    let _ = std::fs::create_dir_all(&logs_dir);

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&logs_dir)
            .spawn()
            .map_err(|e| format!("Failed to launch Windows Explorer: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        println!("Logs directory: {:?}", logs_dir);
    }

    Ok(())
}
