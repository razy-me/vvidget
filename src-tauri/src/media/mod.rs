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

/// Spawns the background GSMTC event monitor emitting `media-metadata-update`
pub fn start_media_monitor(app_handle: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("media-monitor".into())
        .spawn(move || {
            let mut last_session = MediaSession::default();
            loop {
                let current = gsmtc::get_current_media_session().unwrap_or_default();
                let has_changed = current.is_active != last_session.is_active
                    || current.is_playing != last_session.is_playing
                    || current.title != last_session.title
                    || current.artist != last_session.artist
                    || current.album != last_session.album
                    || current.track_id != last_session.track_id
                    || (current.is_playing && current.timeline.duration_ms != last_session.timeline.duration_ms);

                if has_changed {
                    let _ = app_handle.emit("media-metadata-update", &current);
                    last_session = current;
                }

                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        })
        .expect("failed to spawn media monitor thread");
}
