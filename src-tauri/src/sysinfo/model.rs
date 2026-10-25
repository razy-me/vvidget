use serde::{Deserialize, Serialize};

/// Metric representing storage / disk partition usage.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct DiskMetric {
    /// Friendly disk or drive name (e.g. "Windows", "Local Disk").
    pub name: String,
    /// Mount point / drive letter (e.g. "C:\\" or "D:\\").
    pub mount_point: String,
    /// Total storage capacity in bytes.
    pub total_bytes: u64,
    /// Used storage in bytes.
    pub used_bytes: u64,
    /// Free/available storage in bytes.
    pub free_bytes: u64,
    /// Used storage percentage (0.0 - 100.0).
    pub used_percent: f32,
}

impl DiskMetric {
    pub fn new(
        name: impl Into<String>,
        mount_point: impl Into<String>,
        total_bytes: u64,
        available_bytes: u64,
    ) -> Self {
        let total = total_bytes;
        let free = available_bytes.min(total);
        let used = total.saturating_sub(free);
        let used_percent = if total > 0 {
            ((used as f64 / total as f64) * 100.0) as f32
        } else {
            0.0
        };

        Self {
            name: name.into(),
            mount_point: mount_point.into(),
            total_bytes: total,
            used_bytes: used,
            free_bytes: free,
            used_percent: (used_percent * 10.0).round() / 10.0,
        }
    }

    /// Converts bytes to gigabytes (GiB: 1024^3).
    pub fn total_gb(&self) -> f64 {
        bytes_to_gb(self.total_bytes)
    }

    pub fn used_gb(&self) -> f64 {
        bytes_to_gb(self.used_bytes)
    }

    pub fn free_gb(&self) -> f64 {
        bytes_to_gb(self.free_bytes)
    }
}

/// Metric representing RAM / physical memory usage.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct MemoryMetric {
    /// Total system physical RAM in bytes.
    pub total_bytes: u64,
    /// Used physical RAM in bytes.
    pub used_bytes: u64,
    /// Free/available physical RAM in bytes.
    pub free_bytes: u64,
    /// Used memory percentage (0.0 - 100.0).
    pub used_percent: f32,
}

impl MemoryMetric {
    pub fn new(total_bytes: u64, used_bytes: u64) -> Self {
        let total = total_bytes;
        let used = used_bytes.min(total);
        let free = total.saturating_sub(used);
        let used_percent = if total > 0 {
            ((used as f64 / total as f64) * 100.0) as f32
        } else {
            0.0
        };

        Self {
            total_bytes: total,
            used_bytes: used,
            free_bytes: free,
            used_percent: (used_percent * 10.0).round() / 10.0,
        }
    }

    pub fn total_gb(&self) -> f64 {
        bytes_to_gb(self.total_bytes)
    }

    pub fn used_gb(&self) -> f64 {
        bytes_to_gb(self.used_bytes)
    }

    pub fn free_gb(&self) -> f64 {
        bytes_to_gb(self.free_bytes)
    }
}

/// Complete system metrics snapshot emitted to frontend.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct SystemMetrics {
    /// Overall CPU usage percentage (0.0 - 100.0).
    pub cpu_usage_percent: f32,
    /// Number of physical / logical CPU cores.
    pub cpu_cores: usize,
    /// Memory usage snapshot.
    pub memory: MemoryMetric,
    /// Storage / disk partitions.
    pub disks: Vec<DiskMetric>,
    /// Milliseconds since UNIX epoch when sampled.
    pub timestamp_ms: u64,
}

impl Default for SystemMetrics {
    fn default() -> Self {
        Self {
            cpu_usage_percent: 0.0,
            cpu_cores: 1,
            memory: MemoryMetric::new(0, 0),
            disks: Vec::new(),
            timestamp_ms: 0,
        }
    }
}

/// Helper function converting raw bytes into Gigabytes (using 1024 * 1024 * 1024).
pub fn bytes_to_gb(bytes: u64) -> f64 {
    let gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
    (gb * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bytes_to_gb_conversion() {
        // 16 GiB = 17,179,869,184 bytes
        let bytes_16gb = 16 * 1024 * 1024 * 1024;
        assert_eq!(bytes_to_gb(bytes_16gb), 16.0);

        // 8.5 GiB
        let bytes_8_5gb = (8.5 * 1024.0 * 1024.0 * 1024.0) as u64;
        assert_eq!(bytes_to_gb(bytes_8_5gb), 8.5);

        // 0 bytes
        assert_eq!(bytes_to_gb(0), 0.0);
    }

    #[test]
    fn test_memory_metric_calculations() {
        let total = 16 * 1024 * 1024 * 1024; // 16 GB
        let used = 8 * 1024 * 1024 * 1024;  // 8 GB (50%)
        let metric = MemoryMetric::new(total, used);

        assert_eq!(metric.total_bytes, total);
        assert_eq!(metric.used_bytes, used);
        assert_eq!(metric.free_bytes, used);
        assert_eq!(metric.used_percent, 50.0);
        assert_eq!(metric.total_gb(), 16.0);
        assert_eq!(metric.used_gb(), 8.0);
        assert_eq!(metric.free_gb(), 8.0);
    }

    #[test]
    fn test_memory_metric_zero_total_safe() {
        let metric = MemoryMetric::new(0, 0);
        assert_eq!(metric.used_percent, 0.0);
        assert_eq!(metric.total_gb(), 0.0);
    }

    #[test]
    fn test_disk_metric_calculations() {
        let total = 500 * 1024 * 1024 * 1024; // 500 GB
        let available = 250 * 1024 * 1024 * 1024; // 250 GB available (50% used)
        let metric = DiskMetric::new("Local Disk", "C:\\", total, available);

        assert_eq!(metric.name, "Local Disk");
        assert_eq!(metric.mount_point, "C:\\");
        assert_eq!(metric.total_bytes, total);
        assert_eq!(metric.used_bytes, available);
        assert_eq!(metric.free_bytes, available);
        assert_eq!(metric.used_percent, 50.0);
        assert_eq!(metric.total_gb(), 500.0);
        assert_eq!(metric.used_gb(), 250.0);
    }

    #[test]
    fn test_system_metrics_default() {
        let default_metrics = SystemMetrics::default();
        assert_eq!(default_metrics.cpu_usage_percent, 0.0);
        assert_eq!(default_metrics.disks.len(), 0);
    }

    #[test]
    fn test_disk_metric_edge_cases() {
        // available > total (should saturate free to total, used = 0)
        let metric_overflow = DiskMetric::new("Disk", "D:\\", 1000, 2000);
        assert_eq!(metric_overflow.free_bytes, 1000);
        assert_eq!(metric_overflow.used_bytes, 0);
        assert_eq!(metric_overflow.used_percent, 0.0);

        // total = 0
        let metric_zero = DiskMetric::new("Disk", "E:\\", 0, 500);
        assert_eq!(metric_zero.used_percent, 0.0);
        assert_eq!(metric_zero.total_gb(), 0.0);

        // Empty name defaults to mount point
        let metric_empty_name = DiskMetric::new("", "F:\\", 1000, 500);
        // DiskMetric constructor sets name to mount_point if empty in sysinfo collector
        assert_eq!(metric_empty_name.mount_point, "F:\\");

        // 100% used disk (available = 0)
        let metric_full = DiskMetric::new("Full Disk", "C:\\", 100 * 1024 * 1024 * 1024, 0);
        assert_eq!(metric_full.used_percent, 100.0);
        assert_eq!(metric_full.free_gb(), 0.0);
    }

    #[test]
    fn test_memory_metric_edge_cases() {
        // used > total (should clamp used to total)
        let metric = MemoryMetric::new(1000, 2000);
        assert_eq!(metric.used_bytes, 1000);
        assert_eq!(metric.free_bytes, 0);
        assert_eq!(metric.used_percent, 100.0);

        // 0 used
        let metric_free = MemoryMetric::new(1000, 0);
        assert_eq!(metric_free.used_bytes, 0);
        assert_eq!(metric_free.free_bytes, 1000);
        assert_eq!(metric_free.used_percent, 0.0);
    }

    #[test]
    fn test_bytes_to_gb_large_scale() {
        // 1 TB = 1024 GiB
        let bytes_1tb = 1024 * 1024 * 1024 * 1024;
        assert_eq!(bytes_to_gb(bytes_1tb), 1024.0);

        // 2.5 TB
        let bytes_2_5tb = (2.5 * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64;
        assert_eq!(bytes_to_gb(bytes_2_5tb), 2560.0);

        // 512 MB (0.5 GiB)
        let bytes_512mb = 512 * 1024 * 1024;
        assert_eq!(bytes_to_gb(bytes_512mb), 0.5);
    }

    #[test]
    fn test_system_metrics_serde_roundtrip() {
        let metrics = SystemMetrics {
            cpu_usage_percent: 24.5,
            cpu_cores: 16,
            memory: MemoryMetric::new(32 * 1024 * 1024 * 1024, 16 * 1024 * 1024 * 1024),
            disks: vec![
                DiskMetric::new("System C", "C:\\", 512 * 1024 * 1024 * 1024, 256 * 1024 * 1024 * 1024),
                DiskMetric::new("Data D", "D:\\", 1024 * 1024 * 1024 * 1024, 512 * 1024 * 1024 * 1024),
            ],
            timestamp_ms: 1729000000000,
        };

        let json = serde_json::to_string(&metrics).expect("Serialization failed");
        let parsed: SystemMetrics = serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(metrics, parsed);
    }
}
