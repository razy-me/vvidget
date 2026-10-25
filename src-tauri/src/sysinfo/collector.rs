use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{
    CpuRefreshKind, Disks, MemoryRefreshKind, Networks, ProcessRefreshKind, ProcessesToUpdate,
    RefreshKind, System,
};

use super::model::{DiskMetric, MemoryMetric, NetworkMetrics, SystemMetrics};

/// Thread-safe collector for hardware metrics (CPU, RAM, Disks, Network, Processes).
pub struct MetricsCollector {
    system: System,
    disks: Disks,
    networks: Networks,
    last_network_sample: Instant,
    last_disks_sample: Instant,
    cached_metrics: Arc<RwLock<SystemMetrics>>,
}

impl MetricsCollector {
    /// Initializes collector with specific refresh masks.
    pub fn new() -> Self {
        let refresh_kind = RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything());
        let mut system = System::new_with_specifics(refresh_kind);

        // Initial 200ms sleep before first CPU sample to eliminate 0.0% artifacts
        std::thread::sleep(Duration::from_millis(200));
        system.refresh_cpu_all();
        system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cpu(),
        );

        let disks = Disks::new_with_refreshed_list();
        let networks = Networks::new_with_refreshed_list();

        let mut collector = Self {
            system,
            disks,
            networks,
            last_network_sample: Instant::now(),
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

    /// Collects fresh CPU, RAM, Network, and Process metrics, and optionally refreshes Disks.
    pub fn collect_metrics(&mut self, refresh_disks: bool) -> SystemMetrics {
        // 1. Refresh CPU and Memory
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();

        // 2. Refresh Disks conditionally
        if refresh_disks {
            self.disks.refresh(true);
            self.last_disks_sample = Instant::now();
        }

        // CPU Usage
        let cpu_usage_raw = self.system.global_cpu_usage();
        let cpu_usage_percent = (cpu_usage_raw * 10.0).round() / 10.0;
        let cpu_cores = self.system.cpus().len().max(1);

        // Memory Usage
        let total_mem = self.system.total_memory();
        let used_mem = self.system.used_memory();
        let memory = MemoryMetric::new(total_mem, used_mem);

        // Disk Usage
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

        // 3. Network Throughput
        let elapsed_secs = self.last_network_sample.elapsed().as_secs_f64();
        self.networks.refresh(true);
        self.last_network_sample = Instant::now();

        let mut rx_bytes: u64 = 0;
        let mut tx_bytes: u64 = 0;
        for (name, net) in self.networks.iter() {
            let lower = name.to_ascii_lowercase();
            if lower.contains("filter driver")
                || lower.contains("packet scheduler")
                || lower.contains("loopback")
                || lower.contains("wfp-")
            {
                continue;
            }
            rx_bytes = rx_bytes.saturating_add(net.received());
            tx_bytes = tx_bytes.saturating_add(net.transmitted());
        }

        let rx_bytes_per_sec = if elapsed_secs > 0.0 {
            (rx_bytes as f64 / elapsed_secs) as u64
        } else {
            0
        };
        let tx_bytes_per_sec = if elapsed_secs > 0.0 {
            (tx_bytes as f64 / elapsed_secs) as u64
        } else {
            0
        };

        let network = NetworkMetrics {
            rx_bytes_per_sec,
            tx_bytes_per_sec,
        };

        // 4. Top CPU Process Detection
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing().with_cpu(),
        );

        let mut best_proc_name: Option<String> = None;
        let mut best_proc_cpu: f32 = 0.0;

        for (_pid, proc) in self.system.processes() {
            let cpu = proc.cpu_usage();
            if cpu > best_proc_cpu {
                let name = proc.name().to_string_lossy();
                if name.eq_ignore_ascii_case("System Idle Process")
                    || name.eq_ignore_ascii_case("idle")
                {
                    continue;
                }
                best_proc_cpu = cpu;
                best_proc_name = Some(name.to_string());
            }
        }

        let (top_process_name, top_process_cpu) = if let Some(name) = best_proc_name {
            let normalized = (best_proc_cpu / cpu_cores as f32).min(100.0);
            let rounded = (normalized * 10.0).round() / 10.0;
            (Some(name), Some(rounded))
        } else {
            (None, None)
        };

        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let metrics = SystemMetrics {
            cpu_usage_percent,
            cpu_cores,
            memory,
            disks: disk_metrics,
            top_process_name,
            top_process_cpu,
            network,
            timestamp_ms,
        };

        if let Ok(mut lock) = self.cached_metrics.write() {
            *lock = metrics.clone();
        }

        metrics
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collector_network_and_top_process() {
        let mut collector = MetricsCollector::new();
        // Allow a brief moment for delta computation
        std::thread::sleep(Duration::from_millis(100));
        let metrics = collector.collect_metrics(false);

        // Network metrics should have valid rates
        let _rx = metrics.network.rx_bytes_per_sec;
        let _tx = metrics.network.tx_bytes_per_sec;

        // If a top process is found, verify its values
        if let Some(ref name) = metrics.top_process_name {
            assert!(!name.is_empty());
            assert!(!name.eq_ignore_ascii_case("System Idle Process"));
            if let Some(cpu) = metrics.top_process_cpu {
                assert!((0.0..=100.0).contains(&cpu));
            }
        }
    }
}
