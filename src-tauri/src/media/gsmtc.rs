use super::model::{MediaSession, MediaTimeline};
use super::protocol::{get_cached_album_art, set_cached_album_art};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

fn calculate_hash<T: Hash>(t: &T) -> u64 {
    let mut s = DefaultHasher::new();
    t.hash(&mut s);
    s.finish()
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(windows)]
mod win {
    use super::*;
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession,
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };
    use windows::Storage::Streams::DataReader;

    fn get_session_manager() -> Result<GlobalSystemMediaTransportControlsSessionManager, String> {
        GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .map_err(|e| format!("Failed to request GSMTC session manager: {}", e))?
            .get()
            .map_err(|e| format!("Failed to await GSMTC session manager: {}", e))
    }

    /// Selects the best session: Spotify first, then current session, then first available session
    fn find_target_session(
        manager: &GlobalSystemMediaTransportControlsSessionManager,
    ) -> Option<GlobalSystemMediaTransportControlsSession> {
        if let Ok(sessions) = manager.GetSessions() {
            let mut all_sessions: Vec<GlobalSystemMediaTransportControlsSession> = Vec::new();
            for session in sessions {
                all_sessions.push(session);
            }

            // 1. Look for a playing Spotify session
            for s in &all_sessions {
                if let Ok(app_id) = s.SourceAppUserModelId() {
                    let app_str = app_id.to_string();
                    if app_str.to_lowercase().contains("spotify") {
                        if let Ok(info) = s.GetPlaybackInfo() {
                            if let Ok(status) = info.PlaybackStatus() {
                                if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                                    return Some(s.clone());
                                }
                            }
                        }
                    }
                }
            }

            // 2. Look for any Spotify session (e.g. paused)
            for s in &all_sessions {
                if let Ok(app_id) = s.SourceAppUserModelId() {
                    if app_id.to_string().to_lowercase().contains("spotify") {
                        return Some(s.clone());
                    }
                }
            }

            // 3. Fall back to the system's current session
            if let Ok(current) = manager.GetCurrentSession() {
                return Some(current);
            }

            // 4. Fall back to any active playing session
            for s in &all_sessions {
                if let Ok(info) = s.GetPlaybackInfo() {
                    if let Ok(status) = info.PlaybackStatus() {
                        if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                            return Some(s.clone());
                        }
                    }
                }
            }

            // 5. Fall back to the first available session
            if let Some(first) = all_sessions.into_iter().next() {
                return Some(first);
            }
        } else if let Ok(current) = manager.GetCurrentSession() {
            return Some(current);
        }

        None
    }

    pub fn read_session_data(
        session: &GlobalSystemMediaTransportControlsSession,
    ) -> Result<MediaSession, String> {
        let app_id = session
            .SourceAppUserModelId()
            .map(|s| s.to_string())
            .unwrap_or_else(|_| "Unknown".to_string());

        let playback_info = session
            .GetPlaybackInfo()
            .map_err(|e| format!("GetPlaybackInfo error: {}", e))?;

        let is_playing = playback_info
            .PlaybackStatus()
            .map(|s| s == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
            .unwrap_or(false);

        let (can_play_pause, can_skip_next, can_skip_previous) = if let Ok(controls) = playback_info.Controls() {
            (
                controls.IsPlayPauseToggleEnabled().unwrap_or(true),
                controls.IsNextEnabled().unwrap_or(true),
                controls.IsPreviousEnabled().unwrap_or(true),
            )
        } else {
            (true, true, true)
        };

        let media_props = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| format!("TryGetMediaPropertiesAsync request failed: {}", e))?
            .get()
            .map_err(|e| format!("TryGetMediaPropertiesAsync await failed: {}", e))?;

        let title = media_props.Title().map(|s| s.to_string()).unwrap_or_default();
        let artist = media_props.Artist().map(|s| s.to_string()).unwrap_or_default();
        let album = media_props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default();

        if title.is_empty() && artist.is_empty() {
            return Ok(MediaSession {
                is_active: false,
                is_playing: false,
                source_app: app_id,
                ..Default::default()
            });
        }

        let track_hash = calculate_hash(&(title.clone(), artist.clone(), album.clone(), app_id.clone()));
        let track_id = format!("{:016x}", track_hash);

        // Thumbnail extraction: check in-memory cache first to prevent redundant COM I/O & allocations
        let mut album_art_url = None;
        if get_cached_album_art(&track_id).is_some() {
            album_art_url = Some(format!("widgetz://album-art?t={}", track_id));
        } else if let Ok(thumb_ref) = media_props.Thumbnail() {
            if let Ok(stream_op) = thumb_ref.OpenReadAsync() {
                if let Ok(stream) = stream_op.get() {
                    if let Ok(size) = stream.Size() {
                        let size = size as usize;
                        if size > 0 && size < 10 * 1024 * 1024 {
                            if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                                if reader.LoadAsync(size as u32).and_then(|op| op.get()).is_ok() {
                                    let mut bytes = vec![0u8; size];
                                    if reader.ReadBytes(&mut bytes).is_ok() {
                                        let mime_type = stream
                                            .ContentType()
                                            .map(|s| s.to_string())
                                            .unwrap_or_else(|_| "image/jpeg".to_string());
                                        set_cached_album_art(&track_id, bytes, mime_type);
                                        album_art_url = Some(format!("widgetz://album-art?t={}", track_id));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Timeline extraction
        let now_ms = current_timestamp_ms();
        let mut position_ms = 0u64;
        let mut duration_ms = 0u64;

        if let Ok(timeline) = session.GetTimelineProperties() {
            if let Ok(pos) = timeline.Position() {
                position_ms = (pos.Duration / 10_000).max(0) as u64;
            }
            if let Ok(end) = timeline.EndTime() {
                duration_ms = (end.Duration / 10_000).max(0) as u64;
            }
        }

        Ok(MediaSession {
            is_active: true,
            is_playing,
            title,
            artist,
            album,
            track_id: Some(track_id),
            timeline: MediaTimeline {
                position_ms,
                duration_ms,
                last_updated_system_time_ms: now_ms,
            },
            album_art_url,
            can_play_pause,
            can_skip_next,
            can_skip_previous,
            source_app: app_id,
        })
    }

    pub fn get_current_media_session_win() -> Result<MediaSession, String> {
        let manager = get_session_manager()?;
        if let Some(session) = find_target_session(&manager) {
            read_session_data(&session)
        } else {
            Ok(MediaSession::default())
        }
    }

    pub fn send_play_pause_win() -> Result<(), String> {
        let manager = get_session_manager()?;
        if let Some(session) = find_target_session(&manager) {
            let res = session
                .TryTogglePlayPauseAsync()
                .map_err(|e| format!("TogglePlayPauseAsync error: {}", e))?
                .get()
                .map_err(|e| format!("TogglePlayPauseAsync await error: {}", e))?;
            if !res {
                return Err("GSMTC failed to toggle play/pause".to_string());
            }
            Ok(())
        } else {
            Err("No active media session available to toggle play/pause".to_string())
        }
    }

    pub fn send_next_track_win() -> Result<(), String> {
        let manager = get_session_manager()?;
        if let Some(session) = find_target_session(&manager) {
            let res = session
                .TrySkipNextAsync()
                .map_err(|e| format!("SkipNextAsync error: {}", e))?
                .get()
                .map_err(|e| format!("SkipNextAsync await error: {}", e))?;
            if !res {
                return Err("GSMTC failed to skip next track".to_string());
            }
            Ok(())
        } else {
            Err("No active media session available to skip next".to_string())
        }
    }

    pub fn send_previous_track_win() -> Result<(), String> {
        let manager = get_session_manager()?;
        if let Some(session) = find_target_session(&manager) {
            let res = session
                .TrySkipPreviousAsync()
                .map_err(|e| format!("SkipPreviousAsync error: {}", e))?
                .get()
                .map_err(|e| format!("SkipPreviousAsync await error: {}", e))?;
            if !res {
                return Err("GSMTC failed to skip previous track".to_string());
            }
            Ok(())
        } else {
            Err("No active media session available to skip previous".to_string())
        }
    }
}

pub fn get_current_media_session() -> Result<MediaSession, String> {
    #[cfg(windows)]
    {
        let _com_guard = crate::geo::winrt::ComGuard::new();
        win::get_current_media_session_win()
    }
    #[cfg(not(windows))]
    {
        Ok(MediaSession::default())
    }
}

pub fn send_play_pause() -> Result<(), String> {
    #[cfg(windows)]
    {
        let _com_guard = crate::geo::winrt::ComGuard::new();
        win::send_play_pause_win()
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

pub fn send_next_track() -> Result<(), String> {
    #[cfg(windows)]
    {
        let _com_guard = crate::geo::winrt::ComGuard::new();
        win::send_next_track_win()
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

pub fn send_previous_track() -> Result<(), String> {
    #[cfg(windows)]
    {
        let _com_guard = crate::geo::winrt::ComGuard::new();
        win::send_previous_track_win()
    }
    #[cfg(not(windows))]
    {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_track_hash_consistency() {
        let title = "Bohemian Rhapsody".to_string();
        let artist = "Queen".to_string();
        let album = "A Night at the Opera".to_string();
        let app = "Spotify.exe".to_string();

        let hash1 = calculate_hash(&(title.clone(), artist.clone(), album.clone(), app.clone()));
        let hash2 = calculate_hash(&(title, artist, album, app));
        assert_eq!(hash1, hash2);
        assert_ne!(hash1, 0);
    }

    #[test]
    fn test_track_hash_uniqueness_different_tracks() {
        let hash1 = calculate_hash(&("Song A".to_string(), "Artist".to_string(), "Album".to_string(), "Spotify".to_string()));
        let hash2 = calculate_hash(&("Song B".to_string(), "Artist".to_string(), "Album".to_string(), "Spotify".to_string()));
        let hash3 = calculate_hash(&("Song A".to_string(), "Other Artist".to_string(), "Album".to_string(), "Spotify".to_string()));

        assert_ne!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_ne!(hash2, hash3);
    }

    #[test]
    fn test_track_hash_with_unicode_and_emojis() {
        let title = "🎶 恋人がサンタクロース (Santa Claus is My Lover) 🎅 / Special Mix".to_string();
        let artist = "松任谷由実 / Yumi Matsutoya".to_string();
        let album = "SURF & SNOW ❄️".to_string();
        let app = "Spotify.exe".to_string();

        let hash1 = calculate_hash(&(title.clone(), artist.clone(), album.clone(), app.clone()));
        let hash2 = calculate_hash(&(title, artist, album, app));
        assert_eq!(hash1, hash2);
        assert_ne!(hash1, 0);
    }

    #[test]
    fn test_current_timestamp_nonzero() {
        let ts = current_timestamp_ms();
        assert!(ts > 1_600_000_000_000);
    }

    #[test]
    fn test_get_current_media_session_no_crash() {
        // GSMTC query should execute safely without crashing whether Spotify is running or not
        let result = get_current_media_session();
        assert!(result.is_ok());
    }
}
