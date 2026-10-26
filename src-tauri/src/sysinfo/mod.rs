pub mod collector;
pub mod model;

use std::sync::{Arc, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub use collector::MetricsCollector;
pub use model::{bytes_to_gb, DiskMetric, MemoryMetric, NetworkMetrics, SystemMetrics};
use crate::config::ConfigManager;

/// Shared state type for caching latest sampled system metrics.
pub type SharedMetricsState = Arc<RwLock<SystemMetrics>>;

/// Command returning current system resource utilization snapshot.
#[tauri::command]
#[specta::specta]
pub async fn get_system_metrics<R: Runtime>(app: AppHandle<R>) -> Result<SystemMetrics, String> {
    if let Some(state) = app.try_state::<SharedMetricsState>() {
        if let Ok(guard) = state.read() {
            if guard.timestamp_ms > 0 {
                return Ok(guard.clone());
            }
        }
    }

    // Fallback if worker state not yet initialized or unpopulated
    tokio::task::spawn_blocking(|| {
        let mut collector = MetricsCollector::new();
        collector.collect_metrics(true)
    })
    .await
    .map_err(|e| format!("Metrics fallback collection failed: {}", e))
}

/// Spawns background worker thread periodically polling CPU, RAM, and Disk metrics.
/// Emits `metrics-update` events to all active Tauri webview windows.
pub fn start_metrics_worker<R: Runtime>(
    app: AppHandle<R>,
    config_manager: ConfigManager,
    mut collector: MetricsCollector,
) -> std::thread::JoinHandle<()> {
    std::thread::Builder::new()
        .name("vvidget-sysinfo-worker".to_string())
        .spawn(move || {
            let mut last_disk_check = std::time::Instant::now();

            log::info!("System metrics background worker started");

            loop {
                let config = tauri::async_runtime::block_on(config_manager.get_config());
                let cpu_ram_interval = Duration::from_millis(
                    config.polling_rates.resources_cpu_ram_ms.max(500),
                );
                let disk_interval = Duration::from_millis(
                    config.polling_rates.resources_disk_ms.max(1000),
                );

                let should_refresh_disks = last_disk_check.elapsed() >= disk_interval;
                if should_refresh_disks {
                    last_disk_check = std::time::Instant::now();
                }

                let metrics = collector.collect_metrics(should_refresh_disks);

                if let Err(err) = app.emit("metrics-update", &metrics) {
                    log::trace!("Could not emit metrics-update event: {}", err);
                }

                std::thread::sleep(cpu_ram_interval);
            }
        })
        .expect("failed to spawn sysinfo background worker thread")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_collector_collects_valid_data() {
        let mut collector = MetricsCollector::new();
        let metrics = collector.collect_metrics(true);

        // Basic sanity checks
        assert!(metrics.cpu_cores >= 1);
        assert!(metrics.cpu_usage_percent >= 0.0 && metrics.cpu_usage_percent <= 100.0);
        assert!(metrics.memory.total_bytes > 0);
        assert!(metrics.memory.used_bytes <= metrics.memory.total_bytes);
        assert!(metrics.memory.used_percent >= 0.0 && metrics.memory.used_percent <= 100.0);
        assert!(metrics.timestamp_ms > 0);

        // Disks check: On windows, at least one drive (usually C:) should be present
        if !metrics.disks.is_empty() {
            let system_disk = &metrics.disks[0];
            assert!(!system_disk.mount_point.is_empty());
            assert!(system_disk.total_bytes > 0);
            assert!(system_disk.used_percent >= 0.0 && system_disk.used_percent <= 100.0);
        }
    }

    #[test]
    fn test_cached_handle_updates() {
        let mut collector = MetricsCollector::new();
        let handle = collector.cached_handle();
        
        let initial_ts = handle.read().unwrap().timestamp_ms;
        assert!(initial_ts > 0);

        std::thread::sleep(Duration::from_millis(10));
        let updated = collector.collect_metrics(false);
        assert!(updated.timestamp_ms >= initial_ts);

        let cached_ts = handle.read().unwrap().timestamp_ms;
        assert_eq!(cached_ts, updated.timestamp_ms);
    }

    #[test]
    fn test_disks_are_sorted_alphabetically() {
        let mut collector = MetricsCollector::new();
        let metrics = collector.collect_metrics(true);

        if metrics.disks.len() > 1 {
            for i in 0..(metrics.disks.len() - 1) {
                assert!(metrics.disks[i].mount_point <= metrics.disks[i + 1].mount_point);
            }
        }
    }

    #[test]
    fn test_collector_fast_refresh_without_disks() {
        let mut collector = MetricsCollector::new();
        let start = std::time::Instant::now();
        let _ = collector.collect_metrics(false);
        let elapsed = start.elapsed();
        // CPU, RAM, Network & Process refresh should remain well within polling interval (< 150ms)
        assert!(elapsed < Duration::from_millis(150), "Metrics refresh too slow: {:?}", elapsed);
    }

    #[test]
    fn test_collector_concurrent_cached_reads() {
        let collector = MetricsCollector::new();
        let handle = collector.cached_handle();

        let mut threads = Vec::new();
        for _ in 0..8 {
            let h = handle.clone();
            threads.push(std::thread::spawn(move || {
                for _ in 0..50 {
                    let m = h.read().unwrap();
                    assert!(m.timestamp_ms > 0);
                }
            }));
        }

        for t in threads {
            t.join().unwrap();
        }
    }

    #[tokio::test]
    async fn test_metrics_fallback_spawn_blocking() {
        let res = tokio::task::spawn_blocking(|| {
            let mut collector = MetricsCollector::new();
            collector.collect_metrics(true)
        })
        .await;
        assert!(res.is_ok());
        let metrics = res.unwrap();
        assert!(metrics.timestamp_ms > 0);
    }
}
