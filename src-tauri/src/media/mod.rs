pub mod gsmtc;
pub mod model;
pub mod protocol;

pub use model::{MediaSession, MediaTimeline};
pub use protocol::handle_album_art_protocol;

use tauri::Emitter;

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

/// Spawns the background GSMTC event monitor emitting `media-metadata-update`
pub fn start_media_monitor(app_handle: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("media-monitor".into())
        .spawn(move || {
            let _com_guard = crate::geo::winrt::ComGuard::new();
            let mut last_session = MediaSession::default();
            loop {
                let current = gsmtc::get_current_media_session().unwrap_or_default();
                if should_emit_media_update(&current, &last_session) {
                    let _ = app_handle.emit("media-metadata-update", &current);
                    last_session = current;
                }

                std::thread::sleep(std::time::Duration::from_millis(500));
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
}
