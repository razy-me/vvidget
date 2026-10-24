/**
 * Storage / Disk drive metric.
 */
export interface DiskMetric {
  name: string;
  mount_point: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
}

/**
 * RAM / Physical memory metric.
 */
export interface MemoryMetric {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
}

/**
 * Complete snapshot of system resource utilization.
 */
export interface SystemMetrics {
  cpu_usage_percent: number;
  cpu_cores: number;
  memory: MemoryMetric;
  disks: DiskMetric[];
  timestamp_ms: number;
}

/**
 * Convert bytes to Gigabytes (GiB = 1024^3).
 */
export function bytesToGb(bytes: number, decimals: number = 1): number {
  if (bytes <= 0) return 0;
  const gb = bytes / (1024 * 1024 * 1024);
  const factor = Math.pow(10, decimals);
  return Math.round(gb * factor) / factor;
}

/**
 * Format bytes into readable "X.X GB" string.
 */
export function formatBytesGb(bytes: number, decimals: number = 1): string {
  return `${bytesToGb(bytes, decimals).toFixed(decimals)} GB`;
}

/**
 * Determine Fluent status variant (accent, warning, error) based on percentage threshold.
 */
export function getMetricVariant(
  percent: number,
  warningThreshold: number = 80,
  dangerThreshold: number = 90
): "accent" | "warning" | "error" {
  if (percent >= dangerThreshold) return "error";
  if (percent >= warningThreshold) return "warning";
  return "accent";
}
