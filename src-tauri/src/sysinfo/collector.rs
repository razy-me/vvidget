use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};

use super::model::{DiskMetric, MemoryMetric, SystemMetrics};

/// Thread-safe collector for hardware metrics (CPU, RAM, Disks).
pub struct MetricsCollector {
    system: System,
    disks: Disks,
    last_disks_sample: Instant,
    cached_metrics: Arc<RwLock<SystemMetrics>>,
}

impl MetricsCollector {
    /// Initializes collector with specific refresh masks (excluding process iteration).
    pub fn new() -> Self {
        let refresh_kind = RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything());
        let mut system = System::new_with_specifics(refresh_kind);

        // Initial 200ms sleep before first CPU sample to eliminate 0.0% artifacts
        std::thread::sleep(Duration::from_millis(200));
        system.refresh_cpu_all();

        let disks = Disks::new_with_refreshed_list();

        let mut collector = Self {
            system,
            disks,
            last_disks_sample: Instant::now(),
            cached_metrics: Arc::new(RwLock::new(SystemMetrics::default())),
        };

        let initial = collector.collect_metrics(true);
        if let Ok(mut lock) = collector.cached_metrics.write() {
            *lock = initial;
        }

        collector
    }

    /// Access the shared cached metrics reference.
    pub fn cached_handle(&self) -> Arc<RwLock<SystemMetrics>> {
        self.cached_metrics.clone()
    }

    /// Read latest cached metrics snapshot without blocking.
    pub fn get_cached(&self) -> SystemMetrics {
        self.cached_metrics
            .read()
            .map(|m| m.clone())
            .unwrap_or_default()
    }

    /// Collects fresh CPU & Memory metrics, and optionally refreshes Disks.
    pub fn collect_metrics(&mut self, refresh_disks: bool) -> SystemMetrics {
        // Refresh only CPU and Memory (zero process iteration overhead)
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();

        if refresh_disks {
            self.disks.refresh(true);
            self.last_disks_sample = Instant::now();
        }

        // 1. CPU Usage
        let cpu_usage_raw = self.system.global_cpu_usage();
        let cpu_usage_percent = (cpu_usage_raw * 10.0).round() / 10.0;
        let cpu_cores = self.system.cpus().len().max(1);

        // 2. Memory Usage
        let total_mem = self.system.total_memory();
        let used_mem = self.system.used_memory();
        let memory = MemoryMetric::new(total_mem, used_mem);

        // 3. Disk Usage
        let mut disk_metrics = Vec::new();
        for disk in self.disks.list() {
            let name = disk.name().to_string_lossy().to_string();
            let mount_point = disk.mount_point().to_string_lossy().to_string();
            let total_space = disk.total_space();
            let available_space = disk.available_space();

            disk_metrics.push(DiskMetric::new(
                if name.is_empty() { mount_point.clone() } else { name },
                mount_point,
                total_space,
                available_space,
            ));
        }

        // Sort disks alphabetically by mount point (e.g. C:\ before D:\)
        disk_metrics.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));

        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let metrics = SystemMetrics {
            cpu_usage_percent,
            cpu_cores,
            memory,
            disks: disk_metrics,
            timestamp_ms,
        };

        if let Ok(mut lock) = self.cached_metrics.write() {
            *lock = metrics.clone();
        }

        metrics
    }
}
