import type { FC } from "react";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Cpu,
  HardDrive,
  Layers,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { MetricBar } from "./MetricBar";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { formatBytesGb, formatNetworkSpeed, getMetricVariant } from "@/types/resources";
import type { LayoutMode } from "@/types/config";
import { cn } from "@/utils/cn";

export interface ResourceWidgetProps {
  isLocked?: boolean;
  layoutMode?: LayoutMode;
  onToggleLock?: () => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
  className?: string;
}

export const ResourceWidget: FC<ResourceWidgetProps> = ({
  className,
}) => {
  const { metrics, error, refresh } = useSystemMetrics();

  // Identify system drive (typically C:) index in disks array, fallback to 0
  const systemDiskIndex = useMemo(() => {
    if (!metrics || metrics.disks.length === 0) return 0;
    const idx = metrics.disks.findIndex(
      (d) =>
        d.mount_point.toUpperCase().startsWith("C:") ||
        d.mount_point.toUpperCase().includes("C:")
    );
    return idx >= 0 ? idx : 0;
  }, [metrics]);

  const [userSelectedDiskIndex, setUserSelectedDiskIndex] = useState<number | null>(null);

  const activeDiskIndex =
    userSelectedDiskIndex !== null && userSelectedDiskIndex < (metrics?.disks.length ?? 0)
      ? userSelectedDiskIndex
      : systemDiskIndex;

  const activeDisk = useMemo(() => {
    if (!metrics || metrics.disks.length === 0) return null;
    return metrics.disks[activeDiskIndex] ?? metrics.disks[0];
  }, [metrics, activeDiskIndex]);

  const cpuPercent = metrics ? Math.round(metrics.cpu_usage_percent) : 0;
  const cpuVariant = getMetricVariant(cpuPercent);

  const ramUsedGb = metrics ? formatBytesGb(metrics.memory.used_bytes) : "0 GB";
  const ramTotalGb = metrics ? formatBytesGb(metrics.memory.total_bytes) : "0 GB";
  const ramPercent = metrics ? Math.round(metrics.memory.used_percent) : 0;
  const ramVariant = getMetricVariant(ramPercent);

  const diskUsedGb = activeDisk ? formatBytesGb(activeDisk.used_bytes) : "0 GB";
  const diskTotalGb = activeDisk ? formatBytesGb(activeDisk.total_bytes) : "0 GB";
  const diskPercent = activeDisk ? Math.round(activeDisk.used_percent) : 0;
  const diskVariant = getMetricVariant(diskPercent);

  return (
    <Card
      variant="acrylic"
      className={cn(
        "w-full p-3 flex flex-col gap-3 text-[var(--fluent-text-primary)] select-none",
        className
      )}
      data-testid="resource-widget"
    >
      {error && !metrics ? (
        <div className="flex flex-col items-center justify-center p-4 text-center text-xs text-[var(--fluent-text-secondary)] gap-2">
          <AlertTriangle className="w-6 h-6 text-[var(--fluent-error)]" />
          <p className="text-[var(--fluent-text-primary)] font-medium">Failed to collect metrics</p>
          <p className="text-[11px] line-clamp-2">{error}</p>
          <button
            onClick={() => void refresh()}
            className="mt-1 px-3 py-1 text-xs rounded-md bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] hover:bg-[var(--fluent-card-hover)] flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <>
          {/* Section 1: CPU with MetricBar & Top Process */}
          <div className="flex flex-col gap-1.5 bg-[var(--fluent-card-bg)]/40 p-2 rounded-lg">
            <MetricBar
              label="CPU"
              valueDisplay={metrics ? `${metrics.cpu_cores} Cores` : ""}
              percent={cpuPercent}
              icon={<Cpu className="w-3.5 h-3.5 text-sky-400" />}
              variant={cpuVariant}
              detailTooltip={
                metrics && (
                  <div className="text-[11px] space-y-0.5">
                    <div>Usage: {cpuPercent}%</div>
                    <div>Cores: {metrics.cpu_cores}</div>
                    {metrics.top_process_name && (
                      <div>
                        Top Process: {metrics.top_process_name} (
                        {metrics.top_process_cpu !== null && metrics.top_process_cpu !== undefined
                          ? `${Math.round(metrics.top_process_cpu)}%`
                          : "0%"}
                        )
                      </div>
                    )}
                  </div>
                )
              }
            />

            {/* Top Process Indicator */}
            {metrics?.top_process_name && (
              <div className="flex items-center justify-between text-[10px] text-[var(--fluent-text-secondary)] pt-0.5">
                <span className="truncate">Top: {metrics.top_process_name}</span>
                {metrics.top_process_cpu !== null && metrics.top_process_cpu !== undefined && (
                  <span className="tabular-nums shrink-0 ml-1">
                    ({Math.round(metrics.top_process_cpu)}%)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Memory (RAM) */}
          <div className="bg-[var(--fluent-card-bg)]/40 p-2 rounded-lg">
            <MetricBar
              label="Arbeitsspeicher"
              valueDisplay={`${ramUsedGb} / ${ramTotalGb}`}
              percent={ramPercent}
              icon={<Layers className="w-3.5 h-3.5 text-violet-400" />}
              variant={ramVariant}
              detailTooltip={
                metrics && (
                  <div className="text-[11px] space-y-0.5">
                    <div>Belegt: {ramUsedGb}</div>
                    <div>Frei: {formatBytesGb(metrics.memory.free_bytes)}</div>
                    <div>Gesamt: {ramTotalGb}</div>
                  </div>
                )
              }
            />
          </div>

          {/* Section 3: Disk Utilization */}
          {activeDisk && (
            <div className="bg-[var(--fluent-card-bg)]/40 p-2 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {activeDiskIndex === systemDiskIndex ? "Systemlaufwerk" : "Laufwerk"} (
                    {activeDisk.mount_point.replace(/\\$/, "")})
                  </span>
                </div>

                {/* Windows 11 Segmented Control rounded-[5px] */}
                {metrics && metrics.disks.length > 1 && (
                  <div className="flex bg-[var(--fluent-control-bg)] rounded-[5px] p-0.5 gap-0.5">
                    {metrics.disks.map((d, idx) => {
                      const isActive = activeDiskIndex === idx;
                      return (
                        <button
                          key={d.mount_point}
                          type="button"
                          onClick={() => setUserSelectedDiskIndex(idx)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-[5px] transition-colors duration-150 font-medium leading-none",
                            isActive
                              ? "bg-[var(--fluent-accent)] text-white shadow-sm"
                              : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-subtle-hover)]"
                          )}
                        >
                          {d.mount_point.slice(0, 2)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <MetricBar
                label={
                  activeDisk.name && activeDisk.name !== activeDisk.mount_point
                    ? activeDisk.name
                    : `Belegt (${activeDisk.mount_point.slice(0, 2)})`
                }
                valueDisplay={`${diskUsedGb} / ${diskTotalGb}`}
                percent={diskPercent}
                variant={diskVariant}
                detailTooltip={
                  <div className="text-[11px] space-y-0.5">
                    <div>Mount: {activeDisk.mount_point}</div>
                    <div>Belegt: {diskUsedGb}</div>
                    <div>Frei: {formatBytesGb(activeDisk.free_bytes)}</div>
                    <div>Gesamt: {diskTotalGb}</div>
                  </div>
                }
              />
            </div>
          )}

          {/* Section 4: Live Network Throughput */}
          <div className="bg-[var(--fluent-card-bg)]/40 p-2 rounded-lg flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Netzwerk</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <ArrowDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-[var(--fluent-text-secondary)] leading-tight">
                    ↓ Download
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-[var(--fluent-text-primary)]">
                    {formatNetworkSpeed(metrics?.network?.rx_bytes_per_sec ?? 0)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <ArrowUp className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-[var(--fluent-text-secondary)] leading-tight">
                    ↑ Upload
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-[var(--fluent-text-primary)]">
                    {formatNetworkSpeed(metrics?.network?.tx_bytes_per_sec ?? 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
