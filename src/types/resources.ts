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
 * Live Network throughput metric.
 */
export interface NetworkMetrics {
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
}

/**
 * Complete snapshot of system resource utilization.
 */
export interface SystemMetrics {
  cpu_usage_percent: number;
  cpu_cores: number;
  memory: MemoryMetric;
  disks: DiskMetric[];
  top_process_name?: string | null;
  top_process_cpu?: number | null;
  network?: NetworkMetrics;
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
 * Format bytes per second into human-readable transfer rate (KB/s or MB/s).
 */
export function formatNetworkSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "0 KB/s";
  const kb = bytesPerSec / 1024;
  if (kb < 1024) {
    return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB/s`;
  }
  const mb = kb / 1024;
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB/s`;
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
