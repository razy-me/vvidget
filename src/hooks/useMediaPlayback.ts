import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaSession } from "@/types/media";
import { DEFAULT_MEDIA_SESSION } from "@/types/media";
import { isTauri, safeInvoke } from "@/utils/tauri";



export interface UseMediaPlaybackReturn {
  session: MediaSession;
  isLoading: boolean;
  error: string | null;
  playPause: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMediaPlayback(): UseMediaPlaybackReturn {
  const [session, setSession] = useState<MediaSession>(DEFAULT_MEDIA_SESSION);
  const [isLoading, setIsLoading] = useState<boolean>(isTauri());
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const sessionRef = useRef<MediaSession>(session);
  sessionRef.current = session;

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const state = await safeInvoke<MediaSession>("get_media_state");
      if (isMountedRef.current) {
        setSession(state);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Listen for media-metadata-update events from Rust backend
  useEffect(() => {
    isMountedRef.current = true;
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      if (!isTauri()) return;

      try {
        const { listen } = await import("@tauri-apps/api/event");
        const fn = await listen<MediaSession>("media-metadata-update", (event) => {
          if (isMountedRef.current) {
            setSession(event.payload);
            setError(null);
          }
        });

        if (!isMountedRef.current) {
          fn();
        } else {
          unlisten = fn;
        }
      } catch (err) {
        console.error("Failed to bind media-metadata-update listener:", err);
      }
    };

    if (isTauri()) {
      void setupListener();
      void refresh();
    }

    return () => {
      isMountedRef.current = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [refresh]);

  const playPause = useCallback(async () => {
    setError(null);
    const prev = sessionRef.current;
    if (!prev.is_active && !prev.title) return;

    // Optimistic UI update: advance position by elapsed time when pausing
    const now = Date.now();
    setSession((s) => {
      let nextPosition = s.timeline.position_ms;
      if (s.is_playing && s.timeline.last_updated_system_time_ms > 0) {
        const elapsed = Math.max(0, now - s.timeline.last_updated_system_time_ms);
        nextPosition = s.timeline.duration_ms > 0
          ? Math.min(s.timeline.duration_ms, s.timeline.position_ms + elapsed)
          : s.timeline.position_ms + elapsed;
      }

      return {
        ...s,
        is_playing: !s.is_playing,
        timeline: {
          ...s.timeline,
          position_ms: nextPosition,
          last_updated_system_time_ms: now,
        },
      };
    });

    try {
      await safeInvoke("media_play_pause");
    } catch (err) {
      // Rollback on failure
      if (isMountedRef.current) {
        setSession(prev);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    }
  }, []);

  const nextTrack = useCallback(async () => {
    setError(null);
    try {
      await safeInvoke("media_next_track");
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    }
  }, []);

  const previousTrack = useCallback(async () => {
    setError(null);
    try {
      await safeInvoke("media_previous_track");
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    }
  }, []);

  return {
    session,
    isLoading,
    error,
    playPause,
    nextTrack,
    previousTrack,
    refresh,
  };
}
