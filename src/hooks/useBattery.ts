import { isTauri, safeInvoke } from "@/utils/tauri";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BatteryStatus } from "@/types/battery";
import { MOCK_BATTERY_STATUS } from "@/types/battery";

export { isTauri } from "@/utils/tauri";

/**
 * Invokes native `open_power_settings` to display Windows 11 ms-settings:powersleep.
 */
export async function openPowerSettings(): Promise<void> {
  if (isTauri()) {
    await safeInvoke("open_power_settings");
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

export function useBattery(pollIntervalMs = 60000): UseBatteryReturn {
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

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      // Native push telemetry via WinRT Battery::AggregateBattery().ReportUpdated
      void import("@tauri-apps/api/event")
        .then(async ({ listen }) => {
          if (!isMountedRef.current) return;
          try {
            const fn = await listen<BatteryStatus>("battery-update", (event) => {
              if (!isMountedRef.current || !event.payload) return;
              setBattery(event.payload);
              setError(null);
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
    }

    // Low-frequency heartbeat fallback (60s); pauses completely when document is hidden
    const intervalId = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      void fetchStatus();
    }, pollIntervalMs);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden && isTauri()) {
        void fetchStatus();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (unlisten) {
        unlisten();
      }
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
