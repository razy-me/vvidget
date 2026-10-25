import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeedtestResult } from "@/types/config";
import type {
  SpeedtestProgress,
  SpeedtestStage,
  SpeedtestStatus,
  UseSpeedtestReturn,
} from "@/types/speedtest";

const isTauri = (): boolean => {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
};

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return Promise.reject(new Error(`Tauri IPC not available for ${cmd}`));
}

export function useSpeedtest(options?: {
  initialHistory?: SpeedtestResult[];
  initialLastResult?: SpeedtestResult | null;
}): UseSpeedtestReturn {
  const [status, setStatus] = useState<SpeedtestStatus>("idle");
  const [stage, setStage] = useState<SpeedtestStage>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [currentMbps, setCurrentMbps] = useState<number>(0);
  const [liveMetrics, setLiveMetrics] = useState<{
    ping_ms: number | null;
    jitter_ms: number | null;
    download_mbps: number | null;
    upload_mbps: number | null;
  }>({
    ping_ms: null,
    jitter_ms: null,
    download_mbps: null,
    upload_mbps: null,
  });

  const [lastResult, setLastResult] = useState<SpeedtestResult | null>(
    options?.initialLastResult ?? null
  );
  const [history, setHistory] = useState<SpeedtestResult[]>(
    options?.initialHistory ?? []
  );
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  // Sync and cap history to last 5 items
  const updateHistoryList = useCallback((raw: SpeedtestResult[]) => {
    // Keep most recent 5 runs
    const sliced = raw.slice(-5);
    setHistory(sliced);
    if (sliced.length > 0 && !lastResult) {
      setLastResult(sliced[sliced.length - 1]);
    }
  }, [lastResult]);

  const refreshHistory = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const hist = await safeInvoke<SpeedtestResult[]>("get_speedtest_history");
      if (isMountedRef.current && Array.isArray(hist)) {
        updateHistoryList(hist);
      }
    } catch {
      // Ignored in test / mock environment
    }
  }, [updateHistoryList]);

  // Start benchmark
  const startTest = useCallback(async (): Promise<SpeedtestResult | null> => {
    setStatus("running");
    setStage("ping");
    setProgress(0);
    setCurrentMbps(0);
    setError(null);
    setLiveMetrics({
      ping_ms: null,
      jitter_ms: null,
      download_mbps: null,
      upload_mbps: null,
    });

    try {
      const result = await safeInvoke<SpeedtestResult>("run_speedtest");
      if (isMountedRef.current) {
        setLastResult(result);
        setStatus("done");
        setStage("complete");
        setProgress(1.0);
        setCurrentMbps(result.download_mbps);
        setLiveMetrics({
          ping_ms: result.ping_ms,
          jitter_ms: result.jitter_ms,
          download_mbps: result.download_mbps,
          upload_mbps: result.upload_mbps,
        });
        setHistory((prev) => {
          const next = [...prev.filter((r) => r.timestamp !== result.timestamp), result];
          return next.slice(-5);
        });
      }
      return result;
    } catch (err) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus("error");
        setStage("error");
        setError(msg);
      }
      return null;
    }
  }, []);

  // Listen to Tauri progress and config events
  useEffect(() => {
    isMountedRef.current = true;
    let unlistenProgress: (() => void) | undefined;
    let unlistenConfig: (() => void) | undefined;

    const setupListeners = async () => {
      if (!isTauri()) return;

      try {
        const { listen } = await import("@tauri-apps/api/event");

        unlistenProgress = await listen<SpeedtestProgress>("speedtest-progress", (evt) => {
          if (!isMountedRef.current) return;
          const p = evt.payload;
          const stg = p.stage as SpeedtestStage;
          setStage(stg);
          setProgress(p.progress);
          setCurrentMbps(p.current_mbps);

          setLiveMetrics((prev) => ({
            ping_ms: p.ping_ms !== undefined ? p.ping_ms : prev.ping_ms,
            jitter_ms: p.jitter_ms !== undefined ? p.jitter_ms : prev.jitter_ms,
            download_mbps: p.download_mbps !== undefined ? p.download_mbps : prev.download_mbps,
            upload_mbps: p.upload_mbps !== undefined ? p.upload_mbps : prev.upload_mbps,
          }));

          if (stg === "complete") {
            setStatus("done");
          } else if (stg === "error") {
            setStatus("error");
            setError(p.error ?? "Speedtest failed");
          } else {
            setStatus("running");
          }
        });

        unlistenConfig = await listen<{ speedtest_history?: SpeedtestResult[] }>(
          "config-changed",
          (evt) => {
            if (!isMountedRef.current) return;
            if (evt.payload?.speedtest_history) {
              updateHistoryList(evt.payload.speedtest_history);
            }
          }
        );
      } catch (e) {
        console.error("Failed to setup speedtest listeners:", e);
      }
    };

    void setupListeners();
    void refreshHistory();

    return () => {
      isMountedRef.current = false;
      if (unlistenProgress) unlistenProgress();
      if (unlistenConfig) unlistenConfig();
    };
  }, [refreshHistory, updateHistoryList]);

  return {
    status,
    stage,
    progress,
    currentMbps,
    liveMetrics,
    lastResult,
    history,
    error,
    startTest,
    refreshHistory,
  };
}
