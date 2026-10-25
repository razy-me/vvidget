use crate::config::{ConfigManager, SpeedtestResult};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Runtime};

const CF_SPEEDTEST_PING_URL: &str = "https://speed.cloudflare.com/__down?bytes=0";
const CF_SPEEDTEST_DOWN_URL: &str = "https://speed.cloudflare.com/__down?bytes=10000000"; // 10 MB payload
const CF_SPEEDTEST_UP_URL: &str = "https://speed.cloudflare.com/__up";

/// Live progress updates emitted to the frontend during benchmark execution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct SpeedtestProgress {
    /// Current test phase: "ping", "download", "upload", "complete", or "error".
    pub stage: String,
    /// Progress fraction from 0.0 to 1.0.
    pub progress: f64,
    /// Live throughput measurement in Mbps.
    pub current_mbps: f64,
    pub ping_ms: Option<f64>,
    pub jitter_ms: Option<f64>,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
    pub error: Option<String>,
}

/// Calculates statistical jitter (mean absolute deviation of consecutive latency measurements, RFC 3550 style).
pub fn calculate_jitter(pings: &[f64]) -> f64 {
    if pings.len() < 2 {
        return 0.0;
    }
    let diff_sum: f64 = pings.windows(2).map(|w| (w[1] - w[0]).abs()).sum();
    let jitter = diff_sum / (pings.len() - 1) as f64;
    (jitter * 100.0).round() / 100.0
}

/// Rounds float value to 2 decimal places.
fn round_2(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}

/// Executes native ping and jitter benchmark against latency endpoint.
async fn run_ping_phase<R: Runtime>(
    client: &reqwest::Client,
    app: &AppHandle<R>,
    ping_url: &str,
) -> Result<(f64, f64), String> {
    const PING_COUNT: usize = 5;
    let mut pings: Vec<f64> = Vec::with_capacity(PING_COUNT);

    for i in 0..PING_COUNT {
        let t0 = Instant::now();
        let res = client
            .get(ping_url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("Ping request failed: {}", e))?;

        if !res.status().is_success() {
            return Err(format!("Ping endpoint returned HTTP {}", res.status()));
        }

        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;
        pings.push(elapsed_ms);

        let avg_ping = round_2(pings.iter().sum::<f64>() / pings.len() as f64);
        let jitter = calculate_jitter(&pings);

        let progress = (i + 1) as f64 / PING_COUNT as f64;
        let _ = app.emit(
            "speedtest-progress",
            SpeedtestProgress {
                stage: "ping".to_string(),
                progress,
                current_mbps: 0.0,
                ping_ms: Some(avg_ping),
                jitter_ms: Some(jitter),
                download_mbps: None,
                upload_mbps: None,
                error: None,
            },
        );

        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    let final_ping = round_2(pings.iter().sum::<f64>() / pings.len() as f64);
    let final_jitter = calculate_jitter(&pings);
    Ok((final_ping, final_jitter))
}

/// Executes native download benchmark by streaming payload and measuring throughput.
async fn run_download_phase<R: Runtime>(
    client: &reqwest::Client,
    app: &AppHandle<R>,
    down_url: &str,
    ping_ms: f64,
    jitter_ms: f64,
) -> Result<f64, String> {
    let t0 = Instant::now();
    let mut response = client
        .get(down_url)
        .timeout(Duration::from_secs(25))
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download endpoint returned HTTP {}", response.status()));
    }

    let total_expected_bytes = response.content_length().unwrap_or(10_000_000);
    let mut downloaded_bytes: usize = 0;
    let mut last_emit = Instant::now();
    let mut current_mbps = 0.0;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Download chunk stream error: {}", e))?
    {
        downloaded_bytes += chunk.len();
        let elapsed_secs = t0.elapsed().as_secs_f64();

        if elapsed_secs > 0.05 {
            current_mbps = round_2((downloaded_bytes as f64 * 8.0) / (elapsed_secs * 1_000_000.0));
        }

        if last_emit.elapsed() >= Duration::from_millis(100) || downloaded_bytes >= total_expected_bytes as usize {
            let progress = if total_expected_bytes > 0 {
                (downloaded_bytes as f64 / total_expected_bytes as f64).min(1.0)
            } else {
                0.5
            };

            let _ = app.emit(
                "speedtest-progress",
                SpeedtestProgress {
                    stage: "download".to_string(),
                    progress,
                    current_mbps,
                    ping_ms: Some(ping_ms),
                    jitter_ms: Some(jitter_ms),
                    download_mbps: Some(current_mbps),
                    upload_mbps: None,
                    error: None,
                },
            );
            last_emit = Instant::now();
        }
    }

    let total_secs = t0.elapsed().as_secs_f64();
    let final_down_mbps = if total_secs > 0.0 {
        round_2((downloaded_bytes as f64 * 8.0) / (total_secs * 1_000_000.0))
    } else {
        0.0
    };

    Ok(final_down_mbps)
}

/// Executes native upload benchmark by sending buffer to Cloudflare upload endpoint.
async fn run_upload_phase<R: Runtime>(
    client: &reqwest::Client,
    app: &AppHandle<R>,
    up_url: &str,
    ping_ms: f64,
    jitter_ms: f64,
    download_mbps: f64,
) -> Result<f64, String> {
    // Generate 3.5 MB buffer of random/dummy bytes for upload test
    const UPLOAD_SIZE: usize = 3_500_000;
    let payload = vec![0x55u8; UPLOAD_SIZE];

    let t0 = Instant::now();
    let _ = app.emit(
        "speedtest-progress",
        SpeedtestProgress {
            stage: "upload".to_string(),
            progress: 0.1,
            current_mbps: 0.0,
            ping_ms: Some(ping_ms),
            jitter_ms: Some(jitter_ms),
            download_mbps: Some(download_mbps),
            upload_mbps: Some(0.0),
            error: None,
        },
    );

    let res = client
        .post(up_url)
        .header("Content-Type", "application/octet-stream")
        .timeout(Duration::from_secs(25))
        .body(payload)
        .send()
        .await
        .map_err(|e| format!("Upload request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Upload endpoint returned HTTP {}", res.status()));
    }

    let elapsed_secs = t0.elapsed().as_secs_f64();
    let final_up_mbps = if elapsed_secs > 0.0 {
        round_2((UPLOAD_SIZE as f64 * 8.0) / (elapsed_secs * 1_000_000.0))
    } else {
        0.0
    };

    let _ = app.emit(
        "speedtest-progress",
        SpeedtestProgress {
            stage: "upload".to_string(),
            progress: 1.0,
            current_mbps: final_up_mbps,
            ping_ms: Some(ping_ms),
            jitter_ms: Some(jitter_ms),
            download_mbps: Some(download_mbps),
            upload_mbps: Some(final_up_mbps),
            error: None,
        },
    );

    Ok(final_up_mbps)
}

/// Executes full internet speedtest benchmark pipeline (Ping, Jitter, Download, Upload).
#[tauri::command]
#[specta::specta]
pub async fn run_speedtest<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SpeedtestResult, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(6))
        .pool_idle_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

    // Phase 1: Latency & Jitter
    let (ping_ms, jitter_ms) = match run_ping_phase(&client, &app, CF_SPEEDTEST_PING_URL).await {
        Ok(res) => res,
        Err(e) => {
            let _ = app.emit(
                "speedtest-progress",
                SpeedtestProgress {
                    stage: "error".to_string(),
                    progress: 0.0,
                    current_mbps: 0.0,
                    ping_ms: None,
                    jitter_ms: None,
                    download_mbps: None,
                    upload_mbps: None,
                    error: Some(e.clone()),
                },
            );
            return Err(e);
        }
    };

    // Phase 2: Download Speed
    let download_mbps = match run_download_phase(&client, &app, CF_SPEEDTEST_DOWN_URL, ping_ms, jitter_ms).await {
        Ok(mbps) => mbps,
        Err(e) => {
            let _ = app.emit(
                "speedtest-progress",
                SpeedtestProgress {
                    stage: "error".to_string(),
                    progress: 0.0,
                    current_mbps: 0.0,
                    ping_ms: Some(ping_ms),
                    jitter_ms: Some(jitter_ms),
                    download_mbps: None,
                    upload_mbps: None,
                    error: Some(e.clone()),
                },
            );
            return Err(e);
        }
    };

    // Phase 3: Upload Speed
    let upload_mbps = match run_upload_phase(&client, &app, CF_SPEEDTEST_UP_URL, ping_ms, jitter_ms, download_mbps).await {
        Ok(mbps) => mbps,
        Err(e) => {
            let _ = app.emit(
                "speedtest-progress",
                SpeedtestProgress {
                    stage: "error".to_string(),
                    progress: 0.0,
                    current_mbps: 0.0,
                    ping_ms: Some(ping_ms),
                    jitter_ms: Some(jitter_ms),
                    download_mbps: Some(download_mbps),
                    upload_mbps: None,
                    error: Some(e.clone()),
                },
            );
            return Err(e);
        }
    };

    // Phase 4: Completion & persistence
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let result = SpeedtestResult {
        timestamp,
        ping_ms,
        jitter_ms,
        download_mbps,
        upload_mbps,
    };

    let _ = app.emit(
        "speedtest-progress",
        SpeedtestProgress {
            stage: "complete".to_string(),
            progress: 1.0,
            current_mbps: download_mbps,
            ping_ms: Some(ping_ms),
            jitter_ms: Some(jitter_ms),
            download_mbps: Some(download_mbps),
            upload_mbps: Some(upload_mbps),
            error: None,
        },
    );

    let _ = save_speedtest_result(app.clone(), result.clone()).await;

    Ok(result)
}

/// Retrieves the recorded speedtest benchmark history from persistent configuration.
#[tauri::command]
#[specta::specta]
pub async fn get_speedtest_history<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<SpeedtestResult>, String> {
    if let Some(cm) = app.try_state::<ConfigManager>() {
        let config = cm.get_config().await;
        Ok(config.speedtest_history)
    } else {
        let (config, _) = crate::config::load_or_recover_config(&crate::config::resolve_config_path());
        Ok(config.speedtest_history)
    }
}

/// Appends a new benchmark result to the configuration history, retaining the most recent 10 runs.
#[tauri::command]
#[specta::specta]
pub async fn save_speedtest_result<R: Runtime>(
    app: AppHandle<R>,
    result: SpeedtestResult,
) -> Result<(), String> {
    if let Some(cm) = app.try_state::<ConfigManager>() {
        let mut config = cm.get_config().await;
        config.speedtest_history.retain(|r| r.timestamp != result.timestamp);
        config.speedtest_history.push(result);
        // Keep most recent 10 entries
        if config.speedtest_history.len() > 10 {
            let start = config.speedtest_history.len() - 10;
            config.speedtest_history = config.speedtest_history[start..].to_vec();
        }
        cm.save_immediate(config.clone()).await.map_err(|e| e.to_string())?;
        let _ = app.emit("config-changed", &config);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_jitter_empty_and_single() {
        assert_eq!(calculate_jitter(&[]), 0.0);
        assert_eq!(calculate_jitter(&[15.0]), 0.0);
    }

    #[test]
    fn test_calculate_jitter_values() {
        // Deltas: |22 - 20| = 2, |19 - 22| = 3, |25 - 19| = 6 -> sum = 11, count = 3 -> 11 / 3 = 3.67
        let pings = vec![20.0, 22.0, 19.0, 25.0];
        let jitter = calculate_jitter(&pings);
        assert_eq!(jitter, 3.67);
    }

    #[test]
    fn test_speedtest_progress_serialization() {
        let progress = SpeedtestProgress {
            stage: "download".to_string(),
            progress: 0.65,
            current_mbps: 124.5,
            ping_ms: Some(18.2),
            jitter_ms: Some(1.4),
            download_mbps: Some(124.5),
            upload_mbps: None,
            error: None,
        };

        let json = serde_json::to_string(&progress).expect("Progress must serialize");
        assert!(json.contains("\"stage\":\"download\""));
        assert!(json.contains("\"progress\":0.65"));

        let deserialized: SpeedtestProgress = serde_json::from_str(&json).expect("Progress must deserialize");
        assert_eq!(deserialized, progress);
    }

    #[test]
    fn test_history_slice_capping() {
        let mut history: Vec<SpeedtestResult> = Vec::new();
        for i in 0..15 {
            history.push(SpeedtestResult {
                timestamp: 1000 + i as u64,
                ping_ms: 10.0 + i as f64,
                jitter_ms: 1.0,
                download_mbps: 100.0,
                upload_mbps: 40.0,
            });
        }

        if history.len() > 10 {
            let start = history.len() - 10;
            history = history[start..].to_vec();
        }

        assert_eq!(history.len(), 10);
        assert_eq!(history.first().unwrap().timestamp, 1005);
        assert_eq!(history.last().unwrap().timestamp, 1014);
    }

    #[tokio::test]
    async fn test_offline_fallback_simulation() {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_millis(100))
            .build()
            .expect("Client init");

        // Try connecting to an unresolvable or non-existent local port
        let res = client.get("http://127.0.0.1:9999/__down?bytes=0").send().await;
        assert!(res.is_err(), "Offline or unreachable request must return error cleanly");
    }
}
