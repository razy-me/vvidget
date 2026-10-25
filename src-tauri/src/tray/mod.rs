use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};
use crate::config::{load_config, open_logs_folder, save_config_immediate};

/// Opens or focuses the lazy-loaded Settings window.
/// Note: Settings retains standard activation (never WS_EX_NOACTIVATE) allowing keyboard input.
/// On close, the window is fully destroyed (window.destroy()) to free WebView2 RAM.
pub fn open_settings_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.unminimize();
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html?view=settings".into()),
    )
    .title("Widgetz Settings")
    .inner_size(600.0, 720.0)
    .min_inner_size(480.0, 560.0)
    .resizable(true)
    .center()
    .focused(true)
    .decorations(true)
    .build()
    .map_err(|e| format!("Failed to create settings window: {}", e))?;

    // Hook close request to destroy the window rather than hide, saving resident RAM
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.destroy();
        }
    });

    Ok(())
}

/// Tauri command to open the Settings window from frontend widgets or shortcuts.
#[tauri::command]
#[specta::specta]
pub async fn open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    open_settings_window(&app)
}

/// Sets up the native Windows System Tray icon and context menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<TrayIcon<R>, Box<dyn std::error::Error>> {
    let icon = app
        .default_window_icon()
        .ok_or_else(|| "No default window icon found for system tray".to_string())?
        .clone();

    let menu = Menu::new(app)?;

    let initial_config = crate::config::load_or_recover_config(&crate::config::resolve_config_path()).0;

    let toggle_lock = CheckMenuItem::with_id(
        app,
        "toggle_lock",
        "Lock Positions",
        true,
        initial_config.lock_positions,
        None::<&str>,
    )?;
    menu.append(&toggle_lock)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Widgets visibility submenu
    let widgets_menu = Submenu::new(app, "Widgets", true)?;
    let toggle_resources = CheckMenuItem::with_id(
        app,
        "toggle_resources",
        "System Resources",
        true,
        initial_config
            .widgets
            .get("resources")
            .map(|w| w.visible)
            .unwrap_or(true),
        None::<&str>,
    )?;
    let toggle_spotify = CheckMenuItem::with_id(
        app,
        "toggle_spotify",
        "Media Controls",
        true,
        initial_config
            .widgets
            .get("spotify")
            .map(|w| w.visible)
            .unwrap_or(true),
        None::<&str>,
    )?;
    let toggle_weather = CheckMenuItem::with_id(
        app,
        "toggle_weather",
        "Weather Forecast",
        true,
        initial_config
            .widgets
            .get("weather")
            .map(|w| w.visible)
            .unwrap_or(true),
        None::<&str>,
    )?;
    widgets_menu.append(&toggle_resources)?;
    widgets_menu.append(&toggle_spotify)?;
    widgets_menu.append(&toggle_weather)?;
    menu.append(&widgets_menu)?;

    // Layout mode submenu with CheckMenuItems to reflect active layout
    let is_docked = initial_config.layout_mode == "docked";
    let layout_menu = Submenu::new(app, "Layout Mode", true)?;
    let layout_independent = CheckMenuItem::with_id(
        app,
        "layout_independent",
        "Independent Windows",
        true,
        !is_docked,
        None::<&str>,
    )?;
    let layout_docked = CheckMenuItem::with_id(
        app,
        "layout_docked",
        "Docked Stack",
        true,
        is_docked,
        None::<&str>,
    )?;
    layout_menu.append(&layout_independent)?;
    layout_menu.append(&layout_docked)?;
    menu.append(&layout_menu)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
    let logs_item = MenuItem::with_id(app, "view_logs", "View Logs", true, None::<&str>)?;
    menu.append(&settings_item)?;
    menu.append(&logs_item)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Widgetz", true, None::<&str>)?;
    menu.append(&quit_item)?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Widgetz - Windows 11 Desktop Widgets")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app_handle, event| {
            let id = event.id().as_ref();
            match id {
                "toggle_lock" => {
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Ok(mut config) = load_config(handle.clone()).await {
                            config.lock_positions = !config.lock_positions;
                            let _ = save_config_immediate(handle, config).await;
                        }
                    });
                }
                "toggle_resources" | "toggle_spotify" | "toggle_weather" => {
                    let widget_key = match id {
                        "toggle_resources" => "resources",
                        "toggle_spotify" => "spotify",
                        "toggle_weather" => "weather",
                        _ => "",
                    };
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Ok(mut config) = load_config(handle.clone()).await {
                            if let Some(w) = config.widgets.get_mut(widget_key) {
                                w.visible = !w.visible;
                            }
                            let _ = save_config_immediate(handle, config).await;
                        }
                    });
                }
                "layout_independent" | "layout_docked" => {
                    let is_ind = id == "layout_independent";
                    let mode = if is_ind { "independent" } else { "docked" };
                    let _ = layout_independent.set_checked(is_ind);
                    let _ = layout_docked.set_checked(!is_ind);
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Ok(mut config) = load_config(handle.clone()).await {
                            config.layout_mode = mode.to_string();
                            let _ = save_config_immediate(handle, config).await;
                        }
                    });
                }
                "settings" => {
                    let _ = open_settings_window(app_handle);
                }
                "view_logs" => {
                    let handle = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = open_logs_folder(handle).await;
                    });
                }
                "quit" => {
                    app_handle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = open_settings_window(app);
            }
        })
        .build(app)?;

    Ok(tray)
}
