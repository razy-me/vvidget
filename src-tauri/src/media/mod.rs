pub mod gsmtc;
pub mod model;
pub mod protocol;

pub use model::{MediaSession, MediaTimeline};
pub use protocol::handle_album_art_protocol;

use tauri::{Emitter, Manager, Runtime};

#[tauri::command]
#[specta::specta]
pub async fn get_media_state() -> Result<MediaSession, String> {
    tokio::task::spawn_blocking(|| {
        gsmtc::get_current_media_session()
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub async fn media_play_pause() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        gsmtc::send_play_pause()
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub async fn media_next_track() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        gsmtc::send_next_track()
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub async fn media_previous_track() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        gsmtc::send_previous_track()
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

/// Evaluates whether media session changes warrant emitting a frontend update event.
pub fn should_emit_media_update(current: &MediaSession, last: &MediaSession) -> bool {
    let pos_jump = (current.timeline.position_ms as i64 - last.timeline.position_ms as i64).abs() > 3000;
    current.is_active != last.is_active
        || current.is_playing != last.is_playing
        || current.title != last.title
        || current.artist != last.artist
        || current.album != last.album
        || current.track_id != last.track_id
        || pos_jump
        || (current.is_playing && current.timeline.duration_ms != last.timeline.duration_ms)
}

/// Calculates the media polling sleep duration based on playback state and power multiplier.
pub fn calculate_media_poll_interval(is_active: bool, is_playing: bool, multiplier: u32) -> std::time::Duration {
    let base_ms = if is_active && is_playing { 500 } else { 2000 };
    std::time::Duration::from_millis(base_ms * multiplier.max(1) as u64)
}

/// Resolves the target webview window label for media metadata updates.
pub fn resolve_media_target_window(layout_mode: &str) -> &'static str {
    if layout_mode == "docked" {
        "main"
    } else {
        "widget_spotify"
    }
}

/// Spawns the background GSMTC event monitor emitting `media-metadata-update`
pub fn start_media_monitor<R: Runtime + 'static>(app_handle: tauri::AppHandle<R>) {
    std::thread::Builder::new()
        .name("media-monitor".into())
        .spawn(move || {
            let _com_guard = crate::geo::winrt::ComGuard::new();
            crate::window::win32::enable_current_thread_eco_qos();

            let mut last_session = MediaSession::default();
            let mut last_config_check = std::time::Instant::now();
            let mut config = if let Some(cm) = app_handle.try_state::<crate::config::ConfigManager>() {
                tauri::async_runtime::block_on(cm.get_config())
            } else {
                crate::config::load_or_recover_config(&crate::config::resolve_config_path()).0
            };

            loop {
                // Refresh cached configuration periodically
                if last_config_check.elapsed() >= std::time::Duration::from_secs(2) {
                    if let Some(cm) = app_handle.try_state::<crate::config::ConfigManager>() {
                        config = tauri::async_runtime::block_on(cm.get_config());
                    }
                    last_config_check = std::time::Instant::now();
                }

                // Check OS power state & fullscreen status
                let (should_sample, multiplier) = if let Some(pm) = app_handle.try_state::<crate::power::PowerManager>() {
                    (pm.should_sample(), pm.interval_multiplier())
                } else if let Some(ps) = app_handle.try_state::<crate::power::PowerState>() {
                    (ps.should_sample(), ps.interval_multiplier())
                } else if let Some(ps) = app_handle.try_state::<std::sync::Arc<crate::power::PowerState>>() {
                    (ps.should_sample(), ps.interval_multiplier())
                } else {
                    (true, 1)
                };

                if !should_sample {
                    std::thread::sleep(std::time::Duration::from_millis(3000));
                    continue;
                }

                // Check Spotify widget visibility
                let spotify_visible = config
                    .widgets
                    .get("spotify")
                    .map(|w| w.visible)
                    .unwrap_or(false);

                if !spotify_visible {
                    std::thread::sleep(std::time::Duration::from_millis(3000));
                    continue;
                }

                let current = gsmtc::get_current_media_session().unwrap_or_default();
                if should_emit_media_update(&current, &last_session) {
                    let target = resolve_media_target_window(&config.layout_mode);
                    let _ = app_handle.emit_to(target, "media-metadata-update", &current);
                    last_session = current.clone();
                }

                let sleep_duration = calculate_media_poll_interval(
                    current.is_active,
                    current.is_playing,
                    multiplier,
                );
                std::thread::sleep(sleep_duration);
            }
        })
        .expect("failed to spawn media monitor thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_update_detects_seek_jump() {
        let mut last = MediaSession::default();
        last.is_active = true;
        last.is_playing = true;
        last.title = "Song".to_string();
        last.timeline.position_ms = 15_000;
        last.timeline.duration_ms = 200_000;

        let mut current = last.clone();
        // Normal 500ms playback advance -> no seek jump
        current.timeline.position_ms = 15_500;
        assert!(!should_emit_media_update(&current, &last));

        // User scrubs/seeks timeline forward by 30 seconds -> pos_jump detected
        current.timeline.position_ms = 45_000;
        assert!(should_emit_media_update(&current, &last));

        // User seeks backwards by 10 seconds -> pos_jump detected
        current.timeline.position_ms = 5_000;
        assert!(should_emit_media_update(&current, &last));
    }

    #[test]
    fn test_calculate_media_poll_interval_active_vs_idle() {
        // Normal playback on AC (multiplier 1) -> 500ms
        assert_eq!(
            calculate_media_poll_interval(true, true, 1),
            std::time::Duration::from_millis(500)
        );
        // Normal playback on Battery (multiplier 2) -> 1000ms
        assert_eq!(
            calculate_media_poll_interval(true, true, 2),
            std::time::Duration::from_millis(1000)
        );
        // Normal playback on Energy Saver (multiplier 3) -> 1500ms
        assert_eq!(
            calculate_media_poll_interval(true, true, 3),
            std::time::Duration::from_millis(1500)
        );

        // Paused on AC (multiplier 1) -> 2000ms
        assert_eq!(
            calculate_media_poll_interval(true, false, 1),
            std::time::Duration::from_millis(2000)
        );
        // Paused on Battery (multiplier 2) -> 4000ms
        assert_eq!(
            calculate_media_poll_interval(true, false, 2),
            std::time::Duration::from_millis(4000)
        );
        // Inactive on Energy Saver (multiplier 3) -> 6000ms
        assert_eq!(
            calculate_media_poll_interval(false, false, 3),
            std::time::Duration::from_millis(6000)
        );
    }

    #[test]
    fn test_resolve_media_target_window() {
        assert_eq!(resolve_media_target_window("docked"), "main");
        assert_eq!(resolve_media_target_window("independent"), "widget_spotify");
        assert_eq!(resolve_media_target_window(""), "widget_spotify");
    }
}
