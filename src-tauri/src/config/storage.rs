use crate::config::model::AppConfig;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, RwLock};

/// Returns the primary application configuration directory (%APPDATA%/Widgetz).
pub fn resolve_app_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("Widgetz")
    } else if let Ok(home) = std::env::var("USERPROFILE") {
        PathBuf::from(home).join("AppData").join("Roaming").join("Widgetz")
    } else {
        PathBuf::from(".").join(".widgetz")
    }
}

/// Returns the path to the config file (%APPDATA%/Widgetz/config.json).
pub fn resolve_config_path() -> PathBuf {
    resolve_app_dir().join("config.json")
}

/// Returns the directory where rotating log files are saved (%APPDATA%/Widgetz/logs).
pub fn resolve_logs_dir() -> PathBuf {
    resolve_app_dir().join("logs")
}

/// Saves an `AppConfig` atomically by writing to a temporary sibling file and renaming.
pub fn save_config_atomic(target_path: &Path, config: &AppConfig) -> Result<(), String> {
    let parent = match target_path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    };
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create config directory {:?}: {}", parent, e))?;

    let json_bytes = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize AppConfig to JSON: {}", e))?;

    let now_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_file_name = format!(
        ".config.tmp.{}_{}",
        std::process::id(),
        now_nanos
    );
    let tmp_path = parent.join(tmp_file_name);

    // 1. Write to temporary file
    {
        let mut file = File::create(&tmp_path)
            .map_err(|e| format!("Failed to create temporary file {:?}: {}", tmp_path, e))?;
        file.write_all(json_bytes.as_bytes())
            .map_err(|e| format!("Failed to write to temporary config {:?}: {}", tmp_path, e))?;
        file.sync_all()
            .map_err(|e| format!("Failed to sync temporary config {:?}: {}", tmp_path, e))?;
    }

    // 2. Atomically rename temporary file over target file
    // On Windows NTFS, standard fs::rename replaces existing files atomically if destination exists.
    if let Err(err) = fs::rename(&tmp_path, target_path) {
        // Fallback for Windows in case of transient sharing violation: try remove + rename
        if target_path.exists() {
            let _ = fs::remove_file(target_path);
        }
        if let Err(rename_err) = fs::rename(&tmp_path, target_path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(format!(
                "Failed to rename temp file {:?} to {:?}: initial err: {}, final err: {}",
                tmp_path, target_path, err, rename_err
            ));
        }
    }

    Ok(())
}

/// Loads configuration from `target_path`.
/// If the file does not exist, writes default configuration and returns it.
/// If the file contains invalid/corrupted JSON, backs it up to `.corrupt.<timestamp>`
/// and restores default configuration safely without crashing.
pub fn load_or_recover_config(target_path: &Path) -> (AppConfig, bool) {
    if !target_path.exists() {
        let default_config = AppConfig::default();
        if let Err(e) = save_config_atomic(target_path, &default_config) {
            log::warn!("Could not write default config to {:?}: {}", target_path, e);
        }
        return (default_config, false);
    }

    match fs::read_to_string(target_path) {
        Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
            Ok(mut parsed) => {
                // Self-healing migration: upgrade to exact desktop icon grid aspect ratios and dimensions (120x128)
                let mut upgraded = false;
                for (id, placement) in parsed.widgets.iter_mut() {
                    if id == "resources" && ((placement.logical_width - 360.0).abs() > 0.1 || (placement.logical_height - 384.0).abs() > 0.1) {
                        placement.logical_width = 360.0;
                        placement.logical_height = 384.0;
                        upgraded = true;
                    }
                    if id == "spotify" && ((placement.logical_width - 360.0).abs() > 0.1 || (placement.logical_height - 256.0).abs() > 0.1) {
                        placement.logical_width = 360.0;
                        placement.logical_height = 256.0;
                        upgraded = true;
                    }
                    if id == "weather" && ((placement.logical_width - 360.0).abs() > 0.1 || (placement.logical_height - 512.0).abs() > 0.1) {
                        placement.logical_width = 360.0;
                        placement.logical_height = 512.0;
                        upgraded = true;
                    }

                    // Quantize any off-grid coordinates to exact multiples of the desktop icon grid (120x128)
                    let snapped_x = (placement.logical_x / 120.0).round() * 120.0;
                    let snapped_y = (placement.logical_y / 128.0).round() * 128.0;
                    if (placement.logical_x - snapped_x).abs() > 0.1 || (placement.logical_y - snapped_y).abs() > 0.1 {
                        placement.logical_x = snapped_x;
                        placement.logical_y = snapped_y;
                        upgraded = true;
                    }
                }

                // Self-healing collision resolution: ensure no visible widgets overlap on startup
                let mut keys: Vec<String> = parsed.widgets.keys().cloned().collect();
                keys.sort();
                let mut occupied: Vec<(String, f64, f64, f64, f64)> = Vec::new();
                for id in keys {
                    let placement = match parsed.widgets.get_mut(&id) {
                        Some(p) => p,
                        None => continue,
                    };
                    if !placement.visible {
                        continue;
                    }
                    let mut x = placement.logical_x;
                    let mut y = placement.logical_y;
                    let w = placement.logical_width;
                    let h = placement.logical_height;

                    let overlaps = occupied.iter().any(|(_, ox, oy, ow, oh)| {
                        x < ox + ow - 2.0 && x + w > ox + 2.0 && y < oy + oh - 2.0 && y + h > oy + 2.0
                    });

                    if overlaps {
                        let mut found = false;
                        for r in 1i32..=15i32 {
                            for dx in -r..=r {
                                for dy in -r..=r {
                                    if dx.abs() != r && dy.abs() != r {
                                        continue;
                                    }
                                    let cand_x = (x + dx as f64 * 120.0).max(0.0);
                                    let cand_y = (y + dy as f64 * 128.0).max(0.0);
                                    let cand_overlaps = occupied.iter().any(|(_, ox, oy, ow, oh)| {
                                        cand_x < ox + ow - 2.0 && cand_x + w > ox + 2.0 && cand_y < oy + oh - 2.0 && cand_y + h > oy + 2.0
                                    });
                                    if !cand_overlaps {
                                        placement.logical_x = cand_x;
                                        placement.logical_y = cand_y;
                                        x = cand_x;
                                        y = cand_y;
                                        upgraded = true;
                                        found = true;
                                        break;
                                    }
                                }
                                if found {
                                    break;
                                }
                            }
                            if found {
                                break;
                            }
                        }
                    }
                    occupied.push((id.clone(), x, y, w, h));
                }

                if upgraded {
                    let _ = save_config_atomic(target_path, &parsed);
                }
                (parsed, false)
            }
            Err(parse_err) => {
                log::error!(
                    "Config file at {:?} is corrupted: {}. Backing up and restoring defaults.",
                    target_path, parse_err
                );
                backup_corrupted_and_reset(target_path)
            }
        },
        Err(read_err) => {
            log::error!(
                "Failed to read config file at {:?}: {}. Backing up and restoring defaults.",
                target_path, read_err
            );
            backup_corrupted_and_reset(target_path)
        }
    }
}

fn backup_corrupted_and_reset(target_path: &Path) -> (AppConfig, bool) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let parent = match target_path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    };
    let file_stem = target_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("config.json");
    let corrupt_name = format!("{}.corrupt.{}", file_stem, timestamp);
    let corrupt_path = parent.join(corrupt_name);

    if let Err(e) = fs::rename(target_path, &corrupt_path) {
        log::error!(
            "Failed to rename corrupted config {:?} to {:?}: {}",
            target_path, corrupt_path, e
        );
    }

    let default_config = AppConfig::default();
    if let Err(e) = save_config_atomic(target_path, &default_config) {
        log::error!(
            "Failed to write fresh default config to {:?}: {}",
            target_path, e
        );
    }

    (default_config, true)
}

/// Thread-safe Configuration Manager with debounced persistent writes.
#[derive(Clone)]
pub struct ConfigManager {
    config_path: PathBuf,
    current_config: Arc<RwLock<AppConfig>>,
    is_dirty: Arc<AtomicBool>,
    debounce_tx: mpsc::Sender<()>,
}

impl ConfigManager {
    /// Initializes the ConfigManager with the standard or custom file path.
    /// Spawns a dedicated Tokio task that coalesces rapid updates (500ms debounce).
    pub fn new(config_path: PathBuf) -> Self {
        let (initial_config, _recovered) = load_or_recover_config(&config_path);
        let current_config = Arc::new(RwLock::new(initial_config));
        let is_dirty = Arc::new(AtomicBool::new(false));

        let (debounce_tx, mut debounce_rx) = mpsc::channel::<()>(64);
        let write_path = config_path.clone();
        let loop_config = current_config.clone();
        let loop_dirty = is_dirty.clone();

        tauri::async_runtime::spawn(async move {
            let sleep_duration = Duration::from_millis(500);
            let sleep = tokio::time::sleep(sleep_duration);
            tokio::pin!(sleep);
            let mut timer_active = false;

            loop {
                tokio::select! {
                    msg = debounce_rx.recv() => {
                        match msg {
                            Some(()) => {
                                sleep.as_mut().reset(tokio::time::Instant::now() + sleep_duration);
                                timer_active = true;
                            }
                            None => break, // Channel closed
                        }
                    }
                    _ = &mut sleep, if timer_active => {
                        timer_active = false;
                        // Always save the latest in-memory state if marked dirty, preventing
                        // stale debounced frames from overwriting save_immediate changes.
                        if loop_dirty.swap(false, Ordering::SeqCst) {
                            let config_to_save = loop_config.read().await.clone();
                            let path = write_path.clone();
                            let _ = tokio::task::spawn_blocking(move || {
                                save_config_atomic(&path, &config_to_save)
                            }).await;
                        }
                    }
                }
            }
        });

        Self {
            config_path,
            current_config,
            is_dirty,
            debounce_tx,
        }
    }

    /// Returns a clone of the current in-memory AppConfig.
    pub async fn get_config(&self) -> AppConfig {
        self.current_config.read().await.clone()
    }

    /// Queues an updated configuration with 500ms debounce (ideal for window dragging).
    pub async fn save_debounced(&self, config: AppConfig) -> Result<(), String> {
        {
            let mut lock = self.current_config.write().await;
            *lock = config;
        }
        self.is_dirty.store(true, Ordering::SeqCst);
        self.debounce_tx
            .send(())
            .await
            .map_err(|e| format!("Failed to dispatch debounced config signal: {}", e))
    }

    /// Saves the configuration immediately to disk (bypassing debounce and superseding pending saves).
    pub async fn save_immediate(&self, config: AppConfig) -> Result<(), String> {
        {
            let mut lock = self.current_config.write().await;
            *lock = config.clone();
        }
        // Clear dirty flag so any subsequent debounce timer pop will not overwrite with stale data
        self.is_dirty.store(false, Ordering::SeqCst);
        let path = self.config_path.clone();
        tokio::task::spawn_blocking(move || save_config_atomic(&path, &config))
            .await
            .map_err(|e| format!("Task join error during save_immediate: {}", e))?
    }

    /// Reloads configuration from disk.
    pub async fn reload_from_disk(&self) -> (AppConfig, bool) {
        let (config, recovered) = load_or_recover_config(&self.config_path);
        let mut lock = self.current_config.write().await;
        *lock = config.clone();
        self.is_dirty.store(false, Ordering::SeqCst);
        (config, recovered)
    }

    pub fn get_path(&self) -> &Path {
        &self.config_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("widgetz_test_{}_{}", std::process::id(), nanos));
        let _ = fs::create_dir_all(&path);
        path
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let dir = create_test_dir();
        let path = dir.join("config.json");

        let mut config = AppConfig::default();
        config.theme = "dark".to_string();
        config.lock_positions = true;

        save_config_atomic(&path, &config).expect("Atomic save failed");
        assert!(path.exists());

        let (loaded, recovered) = load_or_recover_config(&path);
        assert!(!recovered);
        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.lock_positions, true);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_missing_file_creates_default() {
        let dir = create_test_dir();
        let path = dir.join("subfolder").join("config.json");

        assert!(!path.exists());
        let (loaded, recovered) = load_or_recover_config(&path);
        assert!(!recovered);
        assert!(path.exists());
        assert_eq!(loaded.version, 1);
        assert_eq!(loaded.widgets.len(), 3);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_corrupt_config_recovery() {
        let dir = create_test_dir();
        let path = dir.join("config.json");

        // Write corrupt JSON
        fs::write(&path, b"{ this is corrupt json!").unwrap();

        let (loaded, recovered) = load_or_recover_config(&path);
        assert!(recovered, "Expected recovery flag to be true");
        assert_eq!(loaded.version, 1);
        assert!(path.exists());

        // Verify that a backup file .corrupt.<timestamp> exists in the folder
        let entries: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();

        assert!(
            entries.iter().any(|name| name.contains("config.json.corrupt.")),
            "Corrupt backup file was not created. Entries: {:?}",
            entries
        );

        // Subsequent load should read the valid restored default file cleanly
        let (second_load, second_recovered) = load_or_recover_config(&path);
        assert!(!second_recovered);
        assert_eq!(second_load.version, 1);

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn test_config_manager_debounced_save() {
        let dir = create_test_dir();
        let path = dir.join("debounced_config.json");

        let manager = ConfigManager::new(path.clone());
        let mut config = manager.get_config().await;
        config.snap_to_edges = false;

        manager.save_debounced(config).await.unwrap();

        // Memory should reflect change immediately
        let in_memory = manager.get_config().await;
        assert_eq!(in_memory.snap_to_edges, false);

        // Wait for debounce period (500ms + buffer) with polling
        let mut disk_updated = false;
        for _ in 0..30 {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let (disk_config, _) = load_or_recover_config(&path);
            if !disk_config.snap_to_edges {
                disk_updated = true;
                break;
            }
        }
        assert!(disk_updated, "Disk should have updated value within debounce window");

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn test_save_immediate_supersedes_debounced() {
        let dir = create_test_dir();
        let path = dir.join("supersede_config.json");

        let manager = ConfigManager::new(path.clone());

        // Queue a debounced update with theme = "light"
        let mut debounced_config = manager.get_config().await;
        debounced_config.theme = "light".to_string();
        manager.save_debounced(debounced_config).await.unwrap();

        // Immediately follow with an immediate update with theme = "dark"
        let mut immediate_config = manager.get_config().await;
        immediate_config.theme = "dark".to_string();
        manager.save_immediate(immediate_config).await.unwrap();

        // Disk should immediately be "dark"
        let (disk1, _) = load_or_recover_config(&path);
        assert_eq!(disk1.theme, "dark");

        // Wait past the debounce duration (500ms + buffer)
        tokio::time::sleep(Duration::from_millis(650)).await;

        // Disk should STILL be "dark", not overwritten by the earlier debounced update
        let (disk2, _) = load_or_recover_config(&path);
        assert_eq!(disk2.theme, "dark");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_missing_fields_fallback_cleanly_via_serde_default() {
        let dir = create_test_dir();
        let path = dir.join("partial_config.json");

        // Partial JSON missing polling_rates, weather_settings, and some top-level fields
        let partial_json = r#"{
            "version": 1,
            "theme": "dark"
        }"#;
        fs::write(&path, partial_json.as_bytes()).unwrap();

        let (loaded, recovered) = load_or_recover_config(&path);
        assert!(!recovered, "Partial valid JSON should not be marked as corrupted");
        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.layout_mode, "independent"); // Default applied
        assert_eq!(loaded.polling_rates.resources_cpu_ram_ms, 1500); // Default applied
        assert!(loaded.widgets.contains_key("resources")); // Default widgets populated

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_atomic_bare_filename() {
        let dir = create_test_dir();
        let config = AppConfig::default();
        let bare_path = dir.join("bare_config.json");

        // Save via relative path within test dir
        let res = save_config_atomic(&bare_path, &config);
        assert!(res.is_ok(), "Failed to save config with bare/direct path: {:?}", res);
        assert!(bare_path.exists());

        let (loaded, recovered) = load_or_recover_config(&bare_path);
        assert!(!recovered);
        assert_eq!(loaded.version, 1);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_empty_file_corrupt_recovery() {
        let dir = create_test_dir();
        let path = dir.join("empty_config.json");

        // Create empty file (0 bytes)
        fs::write(&path, b"").unwrap();
        assert_eq!(fs::metadata(&path).unwrap().len(), 0);

        let (loaded, recovered) = load_or_recover_config(&path);
        assert!(recovered, "Expected 0-byte file to be treated as corrupt and recovered");
        assert_eq!(loaded.version, 1);
        assert!(path.exists());

        // Check corrupt backup file was generated
        let entries: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert!(
            entries.iter().any(|name| name.contains(".corrupt.")),
            "Corrupt backup file was not created for empty config. Entries: {:?}",
            entries
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_corrupt_json_type_mismatch_recovery() {
        let dir = create_test_dir();
        let path = dir.join("type_mismatch.json");

        // Write JSON with invalid type for integer field
        fs::write(&path, br#"{"version": "should_be_number", "theme": 123}"#).unwrap();

        let (loaded, recovered) = load_or_recover_config(&path);
        assert!(recovered, "Expected type mismatch JSON to be recovered");
        assert_eq!(loaded.version, 1);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_config_atomic_deep_directories() {
        let dir = create_test_dir();
        let deep_path = dir.join("level1").join("level2").join("level3").join("deep_config.json");

        let config = AppConfig::default();
        let res = save_config_atomic(&deep_path, &config);
        assert!(res.is_ok(), "Atomic save failed in deep directory: {:?}", res);
        assert!(deep_path.exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn test_config_manager_concurrent_access() {
        let dir = create_test_dir();
        let path = dir.join("concurrent_config.json");

        let manager = ConfigManager::new(path.clone());

        // Launch multiple concurrent tasks reading and writing
        let mut handles = Vec::new();
        for i in 0..10 {
            let mgr = manager.clone();
            handles.push(tokio::spawn(async move {
                let mut cfg = mgr.get_config().await;
                cfg.theme = format!("theme-{}", i);
                let _ = mgr.save_debounced(cfg).await;
                let read_back = mgr.get_config().await;
                assert!(!read_back.theme.is_empty());
            }));
        }

        for h in handles {
            h.await.unwrap();
        }

        // Wait past debounce duration to verify stability (up to 2 seconds under test load)
        let mut success = false;
        for _ in 0..20 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(cfg) = serde_json::from_str::<AppConfig>(&content) {
                    if cfg.theme.starts_with("theme-") {
                        success = true;
                        break;
                    }
                }
            }
        }
        assert!(success, "Debounced config should be written to disk");

        let _ = fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn test_config_manager_reload_from_disk_after_external_change() {
        let dir = create_test_dir();
        let path = dir.join("reload_config.json");

        let manager = ConfigManager::new(path.clone());
        assert_eq!(manager.get_config().await.theme, "auto");

        // Modify file externally on disk
        let mut external_cfg = AppConfig::default();
        external_cfg.theme = "custom-external-theme".to_string();
        save_config_atomic(&path, &external_cfg).unwrap();

        // Reload into manager
        let (reloaded, recovered) = manager.reload_from_disk().await;
        assert!(!recovered);
        assert_eq!(reloaded.theme, "custom-external-theme");
        assert_eq!(manager.get_config().await.theme, "custom-external-theme");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_self_healing_migration_to_120_98_grid() {
        let dir = create_test_dir();
        let path = dir.join("legacy_grid_config.json");

        // Write legacy config with older dimensions (310.5x338) and off-grid positions
        let legacy_json = r#"{
            "version": 1,
            "theme": "dark",
            "widgets": {
                "resources": {
                    "id": "resources",
                    "visible": true,
                    "logical_x": 828.0,
                    "logical_y": 84.5,
                    "logical_width": 310.5,
                    "logical_height": 338.0,
                    "scale_factor": 1.0
                },
                "spotify": {
                    "id": "spotify",
                    "visible": true,
                    "logical_x": 828.0,
                    "logical_y": 512.0,
                    "logical_width": 310.5,
                    "logical_height": 253.5,
                    "scale_factor": 1.0
                },
                "weather": {
                    "id": "weather",
                    "visible": true,
                    "logical_x": 517.5,
                    "logical_y": 84.5,
                    "logical_width": 310.5,
                    "logical_height": 422.5,
                    "scale_factor": 1.0
                }
            }
        }"#;
        fs::write(&path, legacy_json.as_bytes()).unwrap();

        let (loaded, recovered) = load_or_recover_config(&path);
        assert!(!recovered);

        let res = &loaded.widgets["resources"];
        assert_eq!(res.logical_width, 360.0);
        assert_eq!(res.logical_height, 384.0);
        assert_eq!(res.logical_x, 840.0); // 828.0 / 120.0 = 6.9 -> round to 7 * 120.0 = 840.0
        assert_eq!(res.logical_y, 128.0); // 84.5 / 128.0 = 0.66 -> round to 1 * 128.0 = 128.0

        let spotify = &loaded.widgets["spotify"];
        assert_eq!(spotify.logical_width, 360.0);
        assert_eq!(spotify.logical_height, 256.0);

        let weather = &loaded.widgets["weather"];
        assert_eq!(weather.logical_width, 360.0);
        assert_eq!(weather.logical_height, 512.0);

        let _ = fs::remove_dir_all(&dir);
    }
}
