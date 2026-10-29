import { isTauri, safeInvoke } from "@/utils/tauri";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SystemMetrics } from "@/types/resources";



// Fallback preview data for non-Tauri / test environments
export const MOCK_SYSTEM_METRICS: SystemMetrics = {
  cpu_usage_percent: 24.5,
  cpu_cores: 8,
  memory: {
    total_bytes: 16 * 1024 * 1024 * 1024,
    used_bytes: 6.8 * 1024 * 1024 * 1024,
    free_bytes: 9.2 * 1024 * 1024 * 1024,
    used_percent: 42.5,
  },
  disks: [
    {
      name: "Local Disk",
      mount_point: "C:\\",
      total_bytes: 512 * 1024 * 1024 * 1024,
      used_bytes: 235 * 1024 * 1024 * 1024,
      free_bytes: 277 * 1024 * 1024 * 1024,
      used_percent: 45.9,
    },
    {
      name: "Data Drive",
      mount_point: "D:\\",
      total_bytes: 1024 * 1024 * 1024 * 1024,
      used_bytes: 512 * 1024 * 1024 * 1024,
      free_bytes: 512 * 1024 * 1024 * 1024,
      used_percent: 50.0,
    },
  ],
  top_process_name: "chrome.exe",
  top_process_cpu: 14.2,
  network: {
    rx_bytes_per_sec: 2.4 * 1024 * 1024,
    tx_bytes_per_sec: 420 * 1024,
  },
  timestamp_ms: Date.now(),
};

const MAX_HISTORY_POINTS = 20;

export interface UseSystemMetricsReturn {
  metrics: SystemMetrics | null;
  cpuHistory: number[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSystemMetrics(): UseSystemMetricsReturn {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(
    isTauri() ? null : MOCK_SYSTEM_METRICS
  );
  const [cpuHistory, setCpuHistory] = useState<number[]>(() => {
    return isTauri() ? [] : [12, 18, 15, 22, 28, 25, 20, 24.5];
  });
  const [isLoading, setIsLoading] = useState<boolean>(isTauri());
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  const appendCpuSample = useCallback((sample: number) => {
    setCpuHistory((prev) => {
      const next = [...prev, sample];
      if (next.length > MAX_HISTORY_POINTS) {
        return next.slice(next.length - MAX_HISTORY_POINTS);
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await safeInvoke<SystemMetrics>("get_system_metrics");
      if (isMountedRef.current) {
        setMetrics(data);
        appendCpuSample(data.cpu_usage_percent);
      }
    } catch (err) {
      if (isMountedRef.current) {
        if (!isTauri()) {
          setMetrics(MOCK_SYSTEM_METRICS);
          appendCpuSample(MOCK_SYSTEM_METRICS.cpu_usage_percent);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [appendCpuSample]);

  useEffect(() => {
    isMountedRef.current = true;
    let isDisposed = false;
    let unlistenFn: (() => void) | undefined;

    if (!isTauri()) {
      return () => {
        isDisposed = true;
        isMountedRef.current = false;
      };
    }

    void refresh();

    void import("@tauri-apps/api/event").then(({ listen }) => {
      if (isDisposed) return;
      return listen<SystemMetrics>("metrics-update", (event) => {
        if (isDisposed || !isMountedRef.current || !event.payload) return;
        setMetrics(event.payload);
        appendCpuSample(event.payload.cpu_usage_percent);
      }).then((unlisten) => {
        if (isDisposed) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      });
    });

    return () => {
      isDisposed = true;
      isMountedRef.current = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [refresh, appendCpuSample]);

  return {
    metrics,
    cpuHistory,
    isLoading,
    error,
    refresh,
  };
}
