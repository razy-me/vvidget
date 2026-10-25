import { useMemo } from "react";
import type { FC } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Gauge,
  Loader2,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useSpeedtest } from "@/hooks/useSpeedtest";
import type { SpeedtestResult } from "@/types/config";
import type { UseSpeedtestReturn } from "@/types/speedtest";

export interface SpeedtestWidgetProps {
  initialHistory?: SpeedtestResult[];
  hookOverride?: UseSpeedtestReturn;
  className?: string;
}

export const SpeedtestWidget: FC<SpeedtestWidgetProps> = ({
  initialHistory,
  hookOverride,
  className = "",
}) => {
  const internalHook = useSpeedtest({ initialHistory });
  const {
    status,
    stage,
    progress,
    currentMbps,
    liveMetrics,
    lastResult,
    history,
    error,
    startTest,
  } = hookOverride ?? internalHook;

  const isRunning = status === "running";

  // Stage label in German for Windows 11 Fluent UI
  const stageLabel = useMemo(() => {
    switch (stage) {
      case "ping":
        return "Ping & Jitter prüfen...";
      case "download":
        return "Download testen...";
      case "upload":
        return "Upload testen...";
      case "complete":
        return "Test abgeschlossen";
      case "error":
        return "Fehler beim Test";
      default:
        return "Bereit";
    }
  }, [stage]);

  // Display value for primary gauge
  const displaySpeed = useMemo(() => {
    if (isRunning) {
      return currentMbps > 0 ? currentMbps.toFixed(1) : "0.0";
    }
    if (lastResult?.download_mbps !== undefined) {
      return lastResult.download_mbps.toFixed(1);
    }
    return "--";
  }, [isRunning, currentMbps, lastResult]);

  // SVG Progress Ring calculations (radius 36, circumference ~226.2)
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(Math.max(progress, 0), 1) * circumference);

  // Sparkline history normalized against max download speed
  const maxDown = useMemo(() => {
    if (!history.length) return 100;
    const maxVal = Math.max(...history.map((h) => h.download_mbps), 10);
    return maxVal;
  }, [history]);

  return (
    <Card
      variant="acrylic"
      className={`w-[360px] h-[256px] p-3 text-[var(--fluent-text-primary)] font-['Segoe_UI_Variable_Text',_'Segoe_UI',_sans-serif] flex flex-col justify-between select-none overflow-hidden ${className}`}
      data-testid="speedtest-widget"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between h-6">
        <div className="flex items-center gap-1.5">
          <Gauge className="w-4 h-4 text-[var(--fluent-accent)]" />
          <span className="text-xs font-semibold tracking-wide">Internet Speedtest</span>
        </div>
        <div
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition-colors ${
            isRunning
              ? "bg-[var(--fluent-accent-subtle)] text-[var(--fluent-accent)]"
              : status === "error"
              ? "bg-red-500/20 text-red-400"
              : "bg-white/5 text-[var(--fluent-text-secondary)]"
          }`}
          data-testid="speedtest-stage-badge"
        >
          {stageLabel}
        </div>
      </div>

      {/* Main Section: Gauge + Readout */}
      <div className="relative flex items-center justify-center my-1">
        <div className="relative w-24 h-24 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            {/* Background Track */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              className="stroke-white/10 fill-none"
              strokeWidth="5"
            />
            {/* Live Progress Ring */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              className={`fill-none transition-all duration-200 ${
                isRunning ? "stroke-[var(--fluent-accent)]" : "stroke-[var(--fluent-accent)]/60"
              }`}
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>

          {/* Central Live Speed Readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span
              className={`text-2xl font-bold tracking-tight leading-none ${
                isRunning ? "animate-pulse text-[var(--fluent-accent)]" : ""
              }`}
              data-testid="speedtest-speed-value"
            >
              {displaySpeed}
            </span>
            <span className="text-[10px] uppercase font-semibold text-[var(--fluent-text-secondary)] mt-0.5">
              Mbps
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Grid: Ping/Jitter, Download, Upload (Zero border sub-cards) */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* Ping & Jitter */}
        <div
          className="bg-[var(--fluent-card-bg)] rounded-md px-2 py-1.5 flex flex-col justify-between"
          data-testid="metric-ping"
        >
          <div className="flex items-center gap-1 text-[10px] text-[var(--fluent-text-secondary)] font-medium">
            <Wifi className="w-3 h-3 text-[var(--fluent-accent)]" />
            <span>Ping</span>
          </div>
          <div className="text-xs font-semibold mt-0.5 truncate">
            {liveMetrics.ping_ms !== null
              ? `${liveMetrics.ping_ms.toFixed(0)} ms`
              : lastResult
              ? `${lastResult.ping_ms.toFixed(0)} ms`
              : "--"}
          </div>
          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">
            Jitter:{" "}
            {liveMetrics.jitter_ms !== null
              ? `${liveMetrics.jitter_ms.toFixed(1)} ms`
              : lastResult
              ? `${lastResult.jitter_ms.toFixed(1)} ms`
              : "--"}
          </div>
        </div>

        {/* Download Speed */}
        <div
          className="bg-[var(--fluent-card-bg)] rounded-md px-2 py-1.5 flex flex-col justify-between"
          data-testid="metric-download"
        >
          <div className="flex items-center gap-1 text-[10px] text-[var(--fluent-text-secondary)] font-medium">
            <ArrowDown className="w-3 h-3 text-[var(--fluent-success)]" />
            <span>Download</span>
          </div>
          <div className="text-xs font-semibold mt-0.5 truncate text-[var(--fluent-text-primary)]">
            {liveMetrics.download_mbps !== null
              ? `${liveMetrics.download_mbps.toFixed(1)}`
              : lastResult
              ? `${lastResult.download_mbps.toFixed(1)}`
              : "--"}{" "}
            <span className="text-[9px] font-normal text-[var(--fluent-text-secondary)]">Mbps</span>
          </div>
          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Cloudflare Edge</div>
        </div>

        {/* Upload Speed */}
        <div
          className="bg-[var(--fluent-card-bg)] rounded-md px-2 py-1.5 flex flex-col justify-between"
          data-testid="metric-upload"
        >
          <div className="flex items-center gap-1 text-[10px] text-[var(--fluent-text-secondary)] font-medium">
            <ArrowUp className="w-3 h-3 text-[var(--fluent-accent)]" />
            <span>Upload</span>
          </div>
          <div className="text-xs font-semibold mt-0.5 truncate text-[var(--fluent-text-primary)]">
            {liveMetrics.upload_mbps !== null
              ? `${liveMetrics.upload_mbps.toFixed(1)}`
              : lastResult
              ? `${lastResult.upload_mbps.toFixed(1)}`
              : "--"}{" "}
            <span className="text-[9px] font-normal text-[var(--fluent-text-secondary)]">Mbps</span>
          </div>
          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Speed test payload</div>
        </div>
      </div>

      {/* Error notification if any */}
      {error && (
        <div className="text-[10px] text-red-400 truncate bg-red-500/10 rounded px-1.5 py-0.5">
          {error}
        </div>
      )}

      {/* Bottom Footer: Action Button & History Sparkline */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--fluent-stroke)]">
        {/* Action Button */}
        <button
          type="button"
          disabled={isRunning}
          onClick={() => void startTest()}
          className="h-7 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 bg-[var(--fluent-accent)] text-black hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer shadow-sm"
          data-testid="speedtest-start-button"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Wird getestet...</span>
            </>
          ) : lastResult ? (
            <>
              <RefreshCw className="w-3 h-3" />
              <span>Erneut testen</span>
            </>
          ) : (
            <>
              <Activity className="w-3 h-3" />
              <span>Test starten</span>
            </>
          )}
        </button>

        {/* History Sparkline / Last 5 Runs */}
        <div
          className="flex items-center gap-1.5 h-7 px-2 rounded-md bg-[var(--fluent-card-bg)] text-[10px]"
          data-testid="speedtest-history"
        >
          <span className="text-[var(--fluent-text-tertiary)] text-[9px] uppercase font-semibold">
            Verlauf
          </span>
          {history.length > 0 ? (
            <div className="flex items-end gap-1 h-4">
              {history.map((item, idx) => {
                const heightPct = Math.max(
                  15,
                  Math.min(100, Math.round((item.download_mbps / maxDown) * 100))
                );
                return (
                  <div
                    key={`${item.timestamp}-${idx}`}
                    title={`${new Date(item.timestamp * 1000).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}: ${item.download_mbps.toFixed(1)} Mbps`}
                    className="w-1.5 bg-[var(--fluent-accent)]/80 hover:bg-[var(--fluent-accent)] rounded-t-sm transition-all"
                    style={{ height: `${heightPct}%` }}
                    data-testid={`history-bar-${idx}`}
                  />
                );
              })}
            </div>
          ) : (
            <span className="text-[var(--fluent-text-tertiary)] italic text-[9px]">Keine Daten</span>
          )}
        </div>
      </div>
    </Card>
  );
};
