export interface MediaTimeline {
  position_ms: number;
  duration_ms: number;
  last_updated_system_time_ms: number;
}

export interface MediaSession {
  is_active: boolean;
  is_playing: boolean;
  title: string;
  artist: string;
  album: string;
  track_id: string | null;
  timeline: MediaTimeline;
  album_art_url: string | null;
  can_play_pause: boolean;
  can_skip_next: boolean;
  can_skip_previous: boolean;
  source_app: string;
}

export const DEFAULT_MEDIA_SESSION: MediaSession = {
  is_active: false,
  is_playing: false,
  title: "",
  artist: "",
  album: "",
  track_id: null,
  timeline: {
    position_ms: 0,
    duration_ms: 0,
    last_updated_system_time_ms: 0,
  },
  album_art_url: null,
  can_play_pause: false,
  can_skip_next: false,
  can_skip_previous: false,
  source_app: "",
};
