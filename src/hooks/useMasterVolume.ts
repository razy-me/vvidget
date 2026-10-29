import { isTauri, safeInvoke } from "@/utils/tauri";
import { useCallback, useEffect, useRef, useState } from "react";



export interface AudioVolumeUpdatePayload {
  volume: number; // 0.0 to 1.0
  is_muted?: boolean;
  isMuted?: boolean;
}

export interface UseMasterVolumeReturn {
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;
  setVolume: (level: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMasterVolume(
  initialVolume = 0.5,
  initialMuted = false,
  pollIntervalMs = 60000
): UseMasterVolumeReturn {
  const [volume, setVolumeState] = useState<number>(initialVolume);
  const [isMuted, setIsMutedState] = useState<boolean>(initialMuted);
  const [isLoading, setIsLoading] = useState<boolean>(isTauri());
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const isMutedRef = useRef<boolean>(initialMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const refresh = useCallback(async (silent = false) => {
    if (!isTauri()) {
      return;
    }
    if (!silent) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [vol, muted] = await Promise.all([
        safeInvoke<number>("get_master_volume"),
        safeInvoke<boolean>("get_master_mute"),
      ]);
      if (isMountedRef.current) {
        setVolumeState(Math.max(0, Math.min(1, vol)));
        setIsMutedState(muted);
        isMutedRef.current = muted;
      }
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    } finally {
      if (isMountedRef.current && !silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    let interval: ReturnType<typeof setInterval> | undefined;
    let unlisten: (() => void) | undefined;

    if (isTauri()) {
      void refresh();

      // Native push telemetry via Win32 CoreAudio IAudioEndpointVolumeCallback
      void import("@tauri-apps/api/event")
        .then(async ({ listen }) => {
          if (!isMountedRef.current) return;
          try {
            const fn = await listen<AudioVolumeUpdatePayload>("audio-volume-update", (event) => {
              if (!isMountedRef.current || !event.payload) return;
              const { volume: nextVol, is_muted, isMuted: camelMuted } = event.payload;
              if (typeof nextVol === "number") {
                setVolumeState(Math.max(0, Math.min(1, nextVol)));
              }
              const mutedVal = is_muted ?? camelMuted;
              if (typeof mutedVal === "boolean") {
                setIsMutedState(mutedVal);
                isMutedRef.current = mutedVal;
              }
            });
            if (!isMountedRef.current) {
              fn();
            } else {
              unlisten = fn;
            }
          } catch {
            // Gracefully ignore if event listening is unsupported or un-mocked
          }
        })
        .catch(() => {});

      // Low-frequency heartbeat fallback (60s); pauses completely when document is hidden
      interval = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) {
          return;
        }
        void refresh(true);
      }, pollIntervalMs);
    }

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden && isTauri()) {
        void refresh(true);
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isMountedRef.current = false;
      if (interval) {
        clearInterval(interval);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (unlisten) {
        unlisten();
      }
    };
  }, [refresh, pollIntervalMs]);

  const setVolume = useCallback(async (level: number) => {
    const clamped = Math.max(0, Math.min(1, level));
    setVolumeState(clamped);
    const wasMuted = isMutedRef.current;
    if (wasMuted && clamped > 0) {
      isMutedRef.current = false;
      setIsMutedState(false);
    }
    if (!isTauri()) return;

    try {
      if (wasMuted && clamped > 0) {
        await safeInvoke("toggle_master_mute");
      }
      await safeInvoke("set_master_volume", { level: clamped });
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    }
  }, []);

  const toggleMute = useCallback(async () => {
    isMutedRef.current = !isMutedRef.current;
    setIsMutedState((prev) => !prev);
    if (!isTauri()) return;

    try {
      const newMute = await safeInvoke<boolean>("toggle_master_mute");
      if (isMountedRef.current) {
        isMutedRef.current = newMute;
        setIsMutedState(newMute);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    }
  }, []);

  return {
    volume,
    isMuted,
    isLoading,
    error,
    setVolume,
    toggleMute,
    refresh,
  };
}
