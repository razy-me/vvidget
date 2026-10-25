import type { SpeedtestResult } from "./config";

export type SpeedtestStage = "idle" | "ping" | "download" | "upload" | "complete" | "error";
export type SpeedtestStatus = "idle" | "running" | "done" | "error";

export interface SpeedtestProgress {
  stage: string;
  progress: number;
  current_mbps: number;
  ping_ms?: number | null;
  jitter_ms?: number | null;
  download_mbps?: number | null;
  upload_mbps?: number | null;
  error?: string | null;
}

export interface UseSpeedtestReturn {
  status: SpeedtestStatus;
  stage: SpeedtestStage;
  progress: number;
  currentMbps: number;
  liveMetrics: {
    ping_ms: number | null;
    jitter_ms: number | null;
    download_mbps: number | null;
    upload_mbps: number | null;
  };
  lastResult: SpeedtestResult | null;
  history: SpeedtestResult[];
  error: string | null;
  startTest: () => Promise<SpeedtestResult | null>;
  refreshHistory: () => Promise<void>;
}
