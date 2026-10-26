use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
pub struct MediaTimeline {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub last_updated_system_time_ms: u64,
}

impl Default for MediaTimeline {
    fn default() -> Self {
        Self {
            position_ms: 0,
            duration_ms: 0,
            last_updated_system_time_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, PartialEq, Eq)]
pub struct MediaSession {
    pub is_active: bool,
    pub is_playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_id: Option<String>,
    pub timeline: MediaTimeline,
    pub album_art_url: Option<String>,
    pub can_play_pause: bool,
    pub can_skip_next: bool,
    pub can_skip_previous: bool,
    pub source_app: String,
}

impl Default for MediaSession {
    fn default() -> Self {
        Self {
            is_active: false,
            is_playing: false,
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            track_id: None,
            timeline: MediaTimeline::default(),
            album_art_url: None,
            can_play_pause: false,
            can_skip_next: false,
            can_skip_previous: false,
            source_app: String::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_media_models_defaults() {
        let session = MediaSession::default();
        assert!(!session.is_active);
        assert!(!session.is_playing);
        assert_eq!(session.timeline.position_ms, 0);
        assert_eq!(session.timeline.duration_ms, 0);
        assert_eq!(session.title, "");
    }

    #[test]
    fn test_media_session_serialization() {
        let session = MediaSession {
            is_active: true,
            is_playing: true,
            title: "Song Title".into(),
            artist: "Artist Name".into(),
            album: "Album Name".into(),
            track_id: Some("12345".into()),
            timeline: MediaTimeline {
                position_ms: 45000,
                duration_ms: 210000,
                last_updated_system_time_ms: 1700000000000,
            },
            album_art_url: Some("vvidget://album-art?t=12345".into()),
            can_play_pause: true,
            can_skip_next: true,
            can_skip_previous: true,
            source_app: "Spotify.exe".into(),
        };

        let json = serde_json::to_string(&session).expect("serialize");
        let deserialized: MediaSession = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(session, deserialized);
    }

    #[test]
    fn test_media_timeline_edge_cases() {
        let tl = MediaTimeline {
            position_ms: 3600000,
            duration_ms: 7200000,
            last_updated_system_time_ms: 1729000000000,
        };
        assert_eq!(tl.position_ms, 3600000);
        assert_eq!(tl.duration_ms, 7200000);
    }

    #[test]
    fn test_media_session_partial_json_deserialization() {
        let partial_json = r#"{
            "is_active": false,
            "is_playing": false,
            "title": "",
            "artist": "",
            "album": "",
            "track_id": null,
            "timeline": { "position_ms": 0, "duration_ms": 0, "last_updated_system_time_ms": 0 },
            "album_art_url": null,
            "can_play_pause": false,
            "can_skip_next": false,
            "can_skip_previous": false,
            "source_app": ""
        }"#;

        let session: Result<MediaSession, _> = serde_json::from_str(partial_json);
        assert!(session.is_ok());
        let s = session.unwrap();
        assert!(!s.is_active);
        assert!(s.track_id.is_none());
        assert!(s.album_art_url.is_none());
    }
}
