import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaSession } from "@/types/media";
import { DEFAULT_MEDIA_SESSION } from "@/types/media";

// Detect if running within Tauri desktop environment
const isTauri = (): boolean => {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
};

// Safe Tauri IPC invoke wrapper
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return Promise.reject(new Error(`Tauri IPC not available for ${cmd}`));
}

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

  const sessionRef = useRef<MediaSession>(session);
  sessionRef.current = session;

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const state = await safeInvoke<MediaSession>("get_media_state");
      setSession(state);
    } catch (err) {
      if (isTauri()) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Listen for media-metadata-update events from Rust backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      if (!isTauri()) return;

      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<MediaSession>("media-metadata-update", (event) => {
          setSession(event.payload);
          setError(null);
        });
      } catch (err) {
        console.error("Failed to bind media-metadata-update listener:", err);
      }
    };

    void setupListener();
    void refresh();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [refresh]);

  const playPause = useCallback(async () => {
    setError(null);
    const prev = sessionRef.current;
    if (!prev.is_active && !prev.title) return;

    // Optimistic UI update
    setSession((s) => ({
      ...s,
      is_playing: !s.is_playing,
      timeline: {
        ...s.timeline,
        last_updated_system_time_ms: Date.now(),
      },
    }));

    try {
      await safeInvoke("media_play_pause");
    } catch (err) {
      // Rollback on failure
      setSession(prev);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, []);

  const nextTrack = useCallback(async () => {
    setError(null);
    try {
      await safeInvoke("media_next_track");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, []);

  const previousTrack = useCallback(async () => {
    setError(null);
    try {
      await safeInvoke("media_previous_track");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
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
