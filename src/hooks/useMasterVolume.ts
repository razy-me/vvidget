import { useCallback, useEffect, useRef, useState } from "react";

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

export interface UseMasterVolumeReturn {
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;
  setVolume: (level: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseMasterVolumeReturn {
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
    if (isTauri()) {
      void refresh();
      interval = setInterval(() => {
        void refresh(true);
      }, 3000);
    }
    return () => {
      isMountedRef.current = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [refresh]);

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
