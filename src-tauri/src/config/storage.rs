use crate::config::model::AppConfig;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
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
    let parent = target_path.parent().unwrap_or_else(|| Path::new("."));
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
            eprintln!("Warning: could not write default config to {:?}: {}", target_path, e);
        }
        return (default_config, false);
    }

    match fs::read_to_string(target_path) {
        Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
            Ok(parsed) => (parsed, false),
            Err(parse_err) => {
                eprintln!(
                    "Config file at {:?} is corrupted: {}. Backing up and restoring defaults.",
                    target_path, parse_err
                );
                backup_corrupted_and_reset(target_path)
            }
        },
        Err(read_err) => {
            eprintln!(
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

    let corrupt_name = format!("config.json.corrupt.{}", timestamp);
    let corrupt_path = target_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(corrupt_name);

    if let Err(e) = fs::rename(target_path, &corrupt_path) {
        eprintln!(
            "Failed to rename corrupted config {:?} to {:?}: {}",
            target_path, corrupt_path, e
        );
    }

    let default_config = AppConfig::default();
    if let Err(e) = save_config_atomic(target_path, &default_config) {
        eprintln!(
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
    debounce_tx: mpsc::Sender<AppConfig>,
}

impl ConfigManager {
    /// Initializes the ConfigManager with the standard or custom file path.
    /// Spawns a dedicated Tokio task that coalesces rapid updates (500ms debounce).
    pub fn new(config_path: PathBuf) -> Self {
        let (initial_config, _recovered) = load_or_recover_config(&config_path);
        let current_config = Arc::new(RwLock::new(initial_config));

        let (debounce_tx, mut debounce_rx) = mpsc::channel::<AppConfig>(64);
        let write_path = config_path.clone();

        tokio::spawn(async move {
            let mut pending_save: Option<AppConfig> = None;
            let sleep_duration = Duration::from_millis(500);
            let sleep = tokio::time::sleep(sleep_duration);
            tokio::pin!(sleep);
            let mut timer_active = false;

            loop {
                tokio::select! {
                    msg = debounce_rx.recv() => {
                        match msg {
                            Some(new_config) => {
                                pending_save = Some(new_config);
                                sleep.as_mut().reset(tokio::time::Instant::now() + sleep_duration);
                                timer_active = true;
                            }
                            None => break, // Channel closed
                        }
                    }
                    _ = &mut sleep, if timer_active => {
                        timer_active = false;
                        if let Some(config_to_save) = pending_save.take() {
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
            *lock = config.clone();
        }
        self.debounce_tx
            .send(config)
            .await
            .map_err(|e| format!("Failed to dispatch debounced config: {}", e))
    }

    /// Saves the configuration immediately to disk (bypassing debounce).
    pub async fn save_immediate(&self, config: AppConfig) -> Result<(), String> {
        {
            let mut lock = self.current_config.write().await;
            *lock = config.clone();
        }
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

        // Wait for debounce period (500ms + buffer)
        tokio::time::sleep(Duration::from_millis(650)).await;

        // Verify disk has updated value
        let (disk_config, _) = load_or_recover_config(&path);
        assert_eq!(disk_config.snap_to_edges, false);

        let _ = fs::remove_dir_all(&dir);
    }
}
