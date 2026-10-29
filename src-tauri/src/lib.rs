pub mod actions;
pub mod audio;
pub mod battery;
pub mod bluetooth;
pub mod calendar;
pub mod media;
pub mod config;
pub mod geo;
pub mod launcher;
pub mod power;
pub mod speedtest;
pub mod sysinfo;
pub mod tray;
pub mod window;

use actions::{execute_quick_action, update_quick_settings_instance};
use audio::{get_master_mute, get_master_volume, notify::register_volume_notifier, set_master_volume, toggle_master_mute};
use battery::{get_battery_status, open_power_settings, start_battery_monitor};
use bluetooth::{get_bluetooth_devices, open_bluetooth_settings, toggle_bluetooth_device};
use calendar::{add_calendar_note, get_calendar_events, remove_calendar_note, toggle_calendar_note};
use config::{
    get_autostart_status, load_config, open_logs_folder, resolve_config_path, save_config,
    save_config_immediate, set_autostart, set_widgets_locked, ConfigManager,
};
use geo::get_windows_location;
use launcher::{
    add_custom_launcher_item, launch_app_or_uri, remove_launcher_item, scan_installed_games,
};
use media::{
    get_media_state, handle_album_art_protocol, media_next_track, media_play_pause,
    media_previous_track, start_media_monitor,
};
use speedtest::{get_speedtest_history, run_speedtest, save_speedtest_result};
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
            .unwrap_or_else(|| {
                let (w, h) = match widget_id.as_str() {
                    "resources" => (320.0, 360.0),
                    "spotify" => (320.0, 240.0),
                    "weather" => (320.0, 480.0),
                    "speedtest" => (320.0, 240.0),
                    "launcher" => (320.0, 360.0),
                    "quick_settings" => (320.0, 240.0),
                    "calendar" => (320.0, 360.0),
                    "clock" => (320.0, 360.0),
                    "bluetooth" => (320.0, 240.0),
                    "battery" => (320.0, 360.0),
                    id if id.starts_with("quick_settings") => (320.0, 240.0),
                    _ => (320.0, 240.0),
                };
                crate::config::WidgetPlacement {
                    id: widget_id.clone(),
                    visible: true,
                    logical_x: 80.0,
                    logical_y: 80.0,
                    logical_width: w,
                    logical_height: h,
                    scale_factor: 1.0,
                    monitor_id: None,
                }
            });

        let window = tauri::WebviewWindowBuilder::new(
            &app,
            &label,
            tauri::WebviewUrl::App(format!("index.html?widget={}", widget_id).into()),
        )
        .title(format!("vvidget - {}", widget_id))
        .inner_size(placement.logical_width, placement.logical_height)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .additional_browser_args(crate::window::WEBVIEW_ARGS)
        .build()
        .map_err(|e| format!("Failed to create widget window {}: {}", widget_id, e))?;

        if let Some(win_mgr) = app.try_state::<WindowManager>() {
            let _ = win_mgr.setup_widget_window(
                &window,
                WindowSetupOptions {
                    id: widget_id.clone(),
                    is_widget: true,
                    no_activate: true,
                    dark_mode: config.theme != "light",
                    target_x: Some(placement.logical_x),
                    target_y: Some(placement.logical_y),
                    width: placement.logical_width,
                    height: placement.logical_height,
                },
            );


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
        if let Some(wm) = app.try_state::<WindowManager>() {
            if wm.is_locked() {
                return Ok(());
            }
        }
        if let Some(cm) = app.try_state::<ConfigManager>() {
            let (w, h, snapshot) = cm
                .update_config(|config| {
                    let placement = config.widgets.entry(widget_id.clone()).or_insert_with(|| crate::config::WidgetPlacement {
                        id: widget_id.clone(),
                        visible: true,
                        logical_x,
                        logical_y,
                        logical_width: 320.0,
                        logical_height: 240.0,
                        scale_factor: 1.0,
                        monitor_id: None,
                    });
                    placement.logical_x = logical_x;
                    placement.logical_y = logical_y;
                    let (w, h) = (placement.logical_width, placement.logical_height);
                    Ok((w, h, config.clone()))
                })
                .await?;
            if let Some(wm) = app.try_state::<WindowManager>() {
                wm.update_window_position(&widget_id, logical_x, logical_y, w, h);
            }
            use tauri::Emitter;
            let _ = app.emit("config-changed", &snapshot);
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
            #[cfg(windows)]
            if let Ok(hwnd) = window.hwnd() {
                crate::window::win32::unregister_tracked_window(hwnd.0 as isize);
            }
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
        let sync_lock = app.try_state::<WindowManager>().map(|wm| wm.sync_lock());
        let _guard = match sync_lock {
            Some(ref lock) => Some(lock.lock().await),
            None => None,
        };
        let config = load_config(app.clone()).await?;
        if config.layout_mode == "docked" {
            // Docked mode: ensure single unified desktop dock window is visible
            if let Some(main) = app.get_webview_window("main") {
                #[cfg(windows)]
                if let Ok(hwnd) = main.hwnd() {
                    crate::window::win32::set_window_allow_hide(hwnd.0 as isize, false);
                }
                if let Some(win_mgr) = app.try_state::<WindowManager>() {
                    let _ = win_mgr.setup_widget_window(
                        &main,
                        WindowSetupOptions {
                            id: "main".to_string(),
                            is_widget: true,
                            no_activate: true,
                            dark_mode: config.theme != "light",
                            target_x: Some(40.0),
                            target_y: Some(40.0),
                            width: 360.0,
                            height: 640.0,
                        },
                    );
                }
                let _ = main.show();
            }
            // Destroy independent widget windows to conserve working set RAM (<90 MB budget)
            let mut all_ids: std::collections::HashSet<String> = config.widgets.keys().cloned().collect();
            for base in &[
                "resources", "spotify", "weather", "speedtest", "launcher",
                "quick_settings", "calendar", "clock", "bluetooth", "battery",
            ] {
                all_ids.insert(base.to_string());
            }
            for id in all_ids {
                let _ = close_widget_window(app.clone(), id).await;
            }
        } else {
            // Independent multi-window mode: hide main window to avoid duplicate rendering and RAM waste
            if let Some(main) = app.get_webview_window("main") {
                #[cfg(windows)]
                if let Ok(hwnd) = main.hwnd() {
                    crate::window::win32::unregister_tracked_window(hwnd.0 as isize);
                }
                if let Some(win_mgr) = app.try_state::<WindowManager>() {
                    win_mgr.unregister_widget("main");
                }
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

    /// Queries the live Windows Explorer desktop icon grid spacing or returns calibrated fallback.
    #[tauri::command]
    #[specta::specta]
    pub fn get_desktop_grid_metrics() -> Result<window::DesktopGridMetrics, String> {
        Ok(window::get_desktop_grid_metrics())
    }

    /// Returns live positions of all active widget windows from WindowManager memory.
    #[tauri::command]
    #[specta::specta]
    pub async fn get_active_widget_rects<R: Runtime>(
        app: tauri::AppHandle<R>,
        exclude_id: Option<String>,
    ) -> Result<Vec<window::ActiveWidgetRect>, String> {
        if let Some(wm) = app.try_state::<WindowManager>() {
            let list = wm.get_active_widget_rects(exclude_id.as_deref());
            return Ok(list);
        }
        Ok(vec![])
    }

    /// Shows or updates the position and size of the translucent desktop skeleton preview window during drag.
    #[tauri::command]
    #[specta::specta]
    pub async fn update_skeleton_preview<R: Runtime>(
        app: tauri::AppHandle<R>,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> Result<(), String> {
        const SKELETON_LABEL: &str = "widget_skeleton";
        if let Some(window) = app.get_webview_window(SKELETON_LABEL) {
            #[cfg(windows)]
            if let Ok(hwnd) = window.hwnd() {
                crate::window::win32::set_skeleton_hwnd(hwnd.0 as isize);
            }
            // Use Tauri high-level set_size and set_position so ICoreWebView2Controller::put_Bounds resizes the child viewport
            let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
            let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
            let _ = window.show();
            return Ok(());
        }

        let window = tauri::WebviewWindowBuilder::new(
            &app,
            SKELETON_LABEL,
            tauri::WebviewUrl::App("index.html?view=skeleton".into()),
        )
        .title("vvidget Skeleton")
        .inner_size(width, height)
        .position(x, y)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .additional_browser_args(crate::window::WEBVIEW_ARGS)
        .build()
        .map_err(|e| format!("Failed to create skeleton window: {}", e))?;

        #[cfg(windows)]
        {
            if let Ok(hwnd) = window.hwnd() {
                unsafe {
                    let _ = crate::window::win32::apply_skeleton_window_styles(hwnd.0 as *mut core::ffi::c_void);
                }
            }
        }

        let _ = window.show();
        Ok(())
    }

    /// Hides the desktop skeleton preview window once the widget drag operation concludes.
    #[tauri::command]
    #[specta::specta]
    pub async fn hide_skeleton_preview<R: Runtime>(
        app: tauri::AppHandle<R>,
    ) -> Result<(), String> {
        const SKELETON_LABEL: &str = "widget_skeleton";
        if let Some(window) = app.get_webview_window(SKELETON_LABEL) {
            #[cfg(windows)]
            {
                if let Ok(hwnd) = window.hwnd() {
                    unsafe {
                        use windows::Win32::UI::WindowsAndMessaging::{
                            ShowWindow, SW_HIDE,
                        };
                        let raw_h = windows::Win32::Foundation::HWND(hwnd.0 as *mut core::ffi::c_void);
                        let _ = ShowWindow(raw_h, SW_HIDE);
                        // Force desktop wallpaper redraw over the previous area
                        crate::window::win32::invalidate_screen_rect(0, 0, 8000, 8000);
                    }
                }
            }
            let _ = window.hide();
        }
        Ok(())
    }

    /// Duplicates an existing Quick Settings widget instance or creates a new one from default,
    /// assigning a new unique ID, cloning configuration & placement with offset, and opening its window.
    #[tauri::command]
    #[specta::specta]
    pub async fn duplicate_quick_settings_widget<R: Runtime>(
        app: tauri::AppHandle<R>,
        source_id: Option<String>,
    ) -> Result<String, String> {
        let millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis();
        let new_id = format!("quick_settings_{}", millis);

        if let Some(cm) = app.try_state::<ConfigManager>() {
            let created_id = new_id.clone();
            let snapshot = cm
                .update_config(|config| {
                    let src_key = source_id.as_deref().unwrap_or("quick_settings");
                    let mut placement = config
                        .widgets
                        .get(src_key)
                        .cloned()
                        .unwrap_or(crate::config::WidgetPlacement {
                            id: created_id.clone(),
                            visible: true,
                            logical_x: 160.0,
                            logical_y: 120.0,
                            logical_width: 320.0,
                            logical_height: 240.0,
                            scale_factor: 1.0,
                            monitor_id: None,
                        });

                    placement.id = created_id.clone();
                    placement.visible = true;
                    placement.logical_x += 40.0;
                    placement.logical_y += 40.0;
                    config.widgets.insert(created_id.clone(), placement);

                    let mut instance = if let Some(ref src) = source_id {
                        config.quick_settings_instances.get(src).cloned().unwrap_or_default()
                    } else if let Some(existing) = config.quick_settings_instances.get("quick_settings") {
                        existing.clone()
                    } else {
                        crate::config::QuickSettingsInstance::default()
                    };
                    instance.id = created_id.clone();
                    config.quick_settings_instances.insert(created_id.clone(), instance);
                    Ok(config.clone())
                })
                .await?;
            use tauri::Emitter;
            let _ = app.emit("config-changed", &snapshot);

            Ok(new_id)
        } else {
            Err("ConfigManager not available".to_string())
        }
    }

    /// Removes a widget instance from config, closes its window, and emits config-changed.
    #[tauri::command]
    #[specta::specta]
    pub async fn remove_widget_instance<R: Runtime>(
        app: tauri::AppHandle<R>,
        widget_id: String,
    ) -> Result<(), String> {
        let _ = close_widget_window(app.clone(), widget_id.clone()).await;

        if let Some(cm) = app.try_state::<ConfigManager>() {
            let snapshot = cm
                .update_config(|config| {
                    config.widgets.remove(&widget_id);
                    config.quick_settings_instances.remove(&widget_id);
                    Ok(config.clone())
                })
                .await?;
            use tauri::Emitter;
            let _ = app.emit("config-changed", &snapshot);
        }
        Ok(())
    }
}

pub use integration::{
    close_widget_window, duplicate_quick_settings_widget, get_active_widget_rects,
    get_desktop_grid_metrics, hide_skeleton_preview, open_widget_window, remove_widget_instance,
    save_widget_position, sync_widget_windows, update_skeleton_preview,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config_manager = ConfigManager::new(resolve_config_path());
    let window_manager = WindowManager::new();
    let metrics_collector = MetricsCollector::new();
    let shared_metrics = metrics_collector.cached_handle();
    let power_manager = power::PowerManager::new();

    let builder = tauri::Builder::default()
        .register_uri_scheme_protocol("vvidget", handle_album_art_protocol)
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Folder {
                        path: config::resolve_logs_dir(),
                        file_name: Some("vvidget".to_string()),
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
        .manage(power_manager.clone())
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
            get_master_volume,
            set_master_volume,
            get_master_mute,
            toggle_master_mute,
            open_widget_window,
            close_widget_window,
            sync_widget_windows,
            save_widget_position,
            get_desktop_grid_metrics,
            get_active_widget_rects,
            update_skeleton_preview,
            hide_skeleton_preview,
            duplicate_quick_settings_widget,
            remove_widget_instance,
            run_speedtest,
            get_speedtest_history,
            save_speedtest_result,
            scan_installed_games,
            launch_app_or_uri,
            add_custom_launcher_item,
            remove_launcher_item,
            execute_quick_action,
            update_quick_settings_instance,
            get_calendar_events,
            add_calendar_note,
            remove_calendar_note,
            toggle_calendar_note,
            get_battery_status,
            open_power_settings,
            get_bluetooth_devices,
            open_bluetooth_settings,
            toggle_bluetooth_device,
            power::get_power_state,
        ])
        .setup(move |app| {
            power::start_power_monitor(app.handle().clone(), power_manager.state());
            start_metrics_worker(
                app.handle().clone(),
                config_manager_setup,
                metrics_collector,
            );

            start_media_monitor(app.handle().clone());
            start_battery_monitor(app.handle().clone());

            if let Ok(guard) = register_volume_notifier(app.handle()) {
                app.manage(guard);
            }

            if let Err(e) = setup_tray(app.handle()) {
                log::error!("Failed to initialize system tray: {}", e);
            }

            // Setup main window with DWM Acrylic backdrop, tool window styles, and snapping
            let initial_config = config::load_or_recover_config(&config::resolve_config_path()).0;
            window_manager_setup.set_snap_to_edges(initial_config.snap_to_edges);

            if let Some(main_win) = app.get_webview_window("main") {
                if initial_config.layout_mode == "docked" {
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
                } else {
                    let _ = crate::window::win32::hide_window(&main_win);
                }
            }

            // Pre-create translucent desktop skeleton window hidden so it is immediately ready for zero-latency drag feedback
            let _ = tauri::WebviewWindowBuilder::new(
                app,
                "widget_skeleton",
                tauri::WebviewUrl::App("index.html?view=skeleton".into()),
            )
            .title("vvidget Skeleton")
            .inner_size(320.0, 240.0)
            .visible(false)
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .skip_taskbar(true)
            .additional_browser_args(crate::window::WEBVIEW_ARGS)
            .build()
            .map(|w| {
                #[cfg(windows)]
                if let Ok(hwnd) = w.hwnd() {
                    unsafe {
                        let _ = crate::window::win32::apply_skeleton_window_styles(hwnd.0 as *mut core::ffi::c_void);
                    }
                }
            });

            // Sync widget windows on application startup and when configuration changes
            let initial_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = sync_widget_windows(initial_handle).await;
            });

            let app_handle = app.handle().clone();
            let wm_config_sync = window_manager_setup.clone();
            let sync_mutex = wm_config_sync.sync_lock();
            app.listen("config-changed", move |_event| {
                let handle = app_handle.clone();
                let wm = wm_config_sync.clone();
                let mutex = sync_mutex.clone();
                tauri::async_runtime::spawn(async move {
                    let _guard = mutex.lock().await;
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
        .expect("error while running vvidget application");
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
            let _ = serde_json::from_str::<speedtest::SpeedtestProgress>(bad);
            let _ = serde_json::from_str::<config::SpeedtestResult>(bad);
            let _ = serde_json::from_str::<battery::BatteryStatus>(bad);
            let _ = serde_json::from_str::<audio::notify::AudioVolumeUpdate>(bad);
            let _ = serde_json::from_str::<window::Rect>(bad);
            let _ = serde_json::from_str::<window::DesktopGridMetrics>(bad);
            let _ = serde_json::from_str::<power::PowerStateSnapshot>(bad);
        }
    }
}
