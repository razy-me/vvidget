import { useCallback, useEffect, useRef, useState } from "react";
import type { BatteryStatus } from "@/types/battery";
import { MOCK_BATTERY_STATUS } from "@/types/battery";

// Check if running in Tauri desktop webview
export const isTauri = (): boolean => {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
};

// Safe invoke wrapper
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return Promise.reject(new Error(`Tauri IPC not available for ${cmd}`));
}

/**
 * Invokes native `open_power_settings` to display Windows 11 ms-settings:powersleep.
 */
export async function openPowerSettings(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_power_settings");
  } else {
    // Non-Tauri fallback (e.g. browser preview)
    try {
      window.open("ms-settings:powersleep", "_blank");
    } catch {
      // Ignored in headless/test environments
    }
  }
}

export interface UseBatteryReturn {
  battery: BatteryStatus | null;
  batteryStatus: BatteryStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBattery(pollIntervalMs = 2500): UseBatteryReturn {
  const [battery, setBattery] = useState<BatteryStatus | null>(() =>
    isTauri() ? null : MOCK_BATTERY_STATUS
  );
  const [isLoading, setIsLoading] = useState<boolean>(() => isTauri());
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      if (isTauri()) {
        const data = await safeInvoke<BatteryStatus>("get_battery_status");
        if (isMountedRef.current) {
          setBattery(data);
          setError(null);
        }
      } else {
        if (isMountedRef.current) {
          setBattery((prev) => prev ?? MOCK_BATTERY_STATUS);
          setError(null);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchStatus();

    const intervalId = setInterval(() => {
      void fetchStatus();
    }, pollIntervalMs);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [fetchStatus, pollIntervalMs]);

  return {
    battery,
    batteryStatus: battery,
    isLoading,
    error,
    refresh: fetchStatus,
  };
}
