import type { FC } from "react";
import { useMemo, useState } from "react";
import { Cpu, HardDrive, Layers, RefreshCw, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MiniGraph } from "./MiniGraph";
import { MetricBar } from "./MetricBar";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";
import { formatBytesGb, getMetricVariant } from "@/types/resources";
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
  const { metrics, cpuHistory, error, refresh } = useSystemMetrics();

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
          {/* Section 1: CPU with MiniGraph sparkline */}
          <div className="flex flex-col gap-1.5 bg-[var(--fluent-card-bg)]/40 p-2 rounded-lg border border-[var(--fluent-stroke-subtle)]">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-medium">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>CPU</span>
                {metrics && (
                  <span className="text-[10px] text-[var(--fluent-text-secondary)]">
                    ({metrics.cpu_cores} Cores)
                  </span>
                )}
              </div>
              <Badge
                variant={cpuVariant}
                size="sm"
                className="tabular-nums font-semibold min-w-[42px] justify-center"
              >
                {cpuPercent}%
              </Badge>
            </div>

            {/* Sparkline Trend */}
            <MiniGraph
              data={cpuHistory}
              variant={cpuVariant}
              height={30}
              className="mt-0.5 rounded"
            />
          </div>

          {/* Section 2: Memory (RAM) */}
          <div className="bg-[var(--fluent-card-bg)]/40 p-2 rounded-lg border border-[var(--fluent-stroke-subtle)]">
            <MetricBar
              label="Memory"
              valueDisplay={`${ramUsedGb} / ${ramTotalGb}`}
              percent={ramPercent}
              icon={<Layers className="w-3.5 h-3.5 text-violet-400" />}
              variant={ramVariant}
              detailTooltip={
                metrics && (
                  <div className="text-[11px] space-y-0.5">
                    <div>Used: {ramUsedGb}</div>
                    <div>Free: {formatBytesGb(metrics.memory.free_bytes)}</div>
                    <div>Total: {ramTotalGb}</div>
                  </div>
                )
              }
            />
          </div>

          {/* Section 3: Disk Utilization */}
          {activeDisk && (
            <div className="bg-[var(--fluent-card-bg)]/40 p-2 rounded-lg border border-[var(--fluent-stroke-subtle)]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Storage ({activeDisk.mount_point.replace(/\\$/, "")})
                  </span>
                </div>

                {metrics && metrics.disks.length > 1 && (
                  <div className="flex gap-1">
                    {metrics.disks.map((d, idx) => (
                      <button
                        key={d.mount_point}
                        onClick={() => setUserSelectedDiskIndex(idx)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                          activeDiskIndex === idx
                            ? "bg-[var(--fluent-accent)] text-white font-medium"
                            : "bg-[var(--fluent-card-bg)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]"
                        }`}
                      >
                        {d.mount_point.slice(0, 2)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <MetricBar
                label={activeDisk.name !== activeDisk.mount_point ? activeDisk.name : "System Drive"}
                valueDisplay={`${diskUsedGb} / ${diskTotalGb}`}
                percent={diskPercent}
                variant={diskVariant}
                detailTooltip={
                  <div className="text-[11px] space-y-0.5">
                    <div>Mount: {activeDisk.mount_point}</div>
                    <div>Used: {diskUsedGb}</div>
                    <div>Free: {formatBytesGb(activeDisk.free_bytes)}</div>
                    <div>Total: {diskTotalGb}</div>
                  </div>
                }
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
};
