# Review Findings: M2 Data Persistence & External Services

### [CRITICAL] [OPEN] M2-01 Destructive Non-Atomic Fallback in `save_config_atomic` Deletes Both Target and Temp File on Transient Lock
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:86-98`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: During atomic save, if `fs::rename(&tmp_path, target_path)` fails due to a transient file lock or sharing violation (e.g. antivirus scanning `config.json` or concurrent write), the fallback deletes `target_path` via `fs::remove_file(target_path)`. If the subsequent rename still fails, line 92 deletes `tmp_path`. Both the existing configuration and the new configuration are permanently wiped out from disk, leaving the user with complete data loss on next launch.
- **Why**: `save_config_atomic` attempts an uncoordinated non-atomic delete-and-rename fallback when atomic replacement fails, and deletes the temporary file upon secondary failure instead of preserving either file.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -86,13 +86,9 @@ pub fn save_config_atomic(target_path: &Path, config: &AppConfig) -> Result<(),
     if let Err(err) = fs::rename(&tmp_path, target_path) {
-        // Fallback for Windows in case of transient sharing violation: try remove + rename
-        if target_path.exists() {
-            let _ = fs::remove_file(target_path);
-        }
-        if let Err(rename_err) = fs::rename(&tmp_path, target_path) {
-            let _ = fs::remove_file(&tmp_path);
-            return Err(format!(
-                "Failed to rename temp file {:?} to {:?}: initial err: {}, final err: {}",
-                tmp_path, target_path, err, rename_err
-            ));
-        }
+        let _ = fs::remove_file(&tmp_path);
+        return Err(format!(
+            "Failed to atomically replace config {:?} with {:?}: {}",
+            target_path, tmp_path, err
+        ));
     }
```

### [MAJOR] [OPEN] M2-02 Read-Modify-Write Race Condition in Configuration Mutators Causes Silent Lost Updates
- **Status**: OPEN
- **Where**: `src-tauri/src/calendar/mod.rs:88-93`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Two concurrent operations (e.g. toggling two calendar notes quickly, or saving a speedtest result while dragging a widget) both call `cm.get_config().await`, modify their separate in-memory clones, and then call `cm.save_immediate(config)`. The second caller completely overwrites `current_config` and disk with its snapshot, silently discarding the changes made by the first caller.
- **Why**: `ConfigManager` exposes disconnected read (`get_config()`) and write (`save_immediate()`) operations with no atomic mutate closure (e.g. `update_config<F>`), leaving a wide TOCTOU read-modify-write window.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -330,2 +330,16 @@ impl ConfigManager {
     pub async fn get_config(&self) -> AppConfig {
         self.current_config.read().await.clone()
     }
+
+    pub async fn update_config<F, R>(&self, f: F) -> Result<R, String>
+    where
+        F: FnOnce(&mut AppConfig) -> Result<R, String>,
+    {
+        let (result, snapshot) = {
+            let mut lock = self.current_config.write().await;
+            let res = f(&mut *lock)?;
+            (res, lock.clone())
+        };
+        self.save_immediate(snapshot).await?;
+        Ok(result)
+    }
```

### [MAJOR] [OPEN] M2-03 Transient Read Errors Treated as Corruption Trigger Destructive Default Reset
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:220-226`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: If reading `config.json` fails due to a transient OS error (e.g. `PermissionDenied` or `SharingViolation` from backup tools, file indexers, or antivirus), `load_or_recover_config` branches to `Err(read_err)` and calls `backup_corrupted_and_reset`. It attempts to rename the valid user configuration to `.corrupt.<timestamp>` and replaces it with empty default settings.
- **Why**: IO read errors (`Err(read_err)`) are conflated with JSON parsing/deserialization errors (`Err(parse_err)`), treating temporary filesystem lockouts as irrecoverable file corruption.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -220,7 +220,4 @@ pub fn load_or_recover_config(target_path: &Path) -> (AppConfig, bool) {
         Err(read_err) => {
-            log::error!(
-                "Failed to read config file at {:?}: {}. Backing up and restoring defaults.",
-                target_path, read_err
-            );
-            backup_corrupted_and_reset(target_path)
+            log::error!("IO error reading config file at {:?}: {}. Using defaults in-memory.", target_path, read_err);
+            (AppConfig::default(), false)
         }
```

### [MAJOR] [OPEN] M2-04 Hardcoded Dimension and Coordinate Clamping Resets User Customizations and Multi-Monitor Layouts
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:121-149`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: 1) On every launch or `reload_from_disk()`, any widget width or height that does not match the hardcoded values (e.g. resources 320x360) is overwritten back to the hardcoded default, destroying user resize customizations. 2) The collision detection spiral clamps candidate coordinates with `.max(0.0)`. In Windows multi-monitor setups where a secondary monitor is positioned to the left or above the primary monitor (negative virtual coordinates, e.g. `x = -1920`), widgets are forcefully clamped to `0.0`, breaking multi-monitor placement. 3) Collision detection ignores `monitor_id`, moving widgets on separate displays if their relative local coordinates match.
- **Why**: One-time migration code was embedded unconditionally inside `load_or_recover_config` without schema version checking or monitor-aware spatial partitioning.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -118,6 +118,7 @@ pub fn load_or_recover_config(target_path: &Path) -> (AppConfig, bool) {
             Ok(mut parsed) => {
-                // Self-healing migration: upgrade to 12x9 desktop grid dimensions (160x120)
                 let mut upgraded = false;
+                if parsed.version < 2 {
+                    // One-time self-healing migration: upgrade schema v1 to 12x9 grid
                 for (id, placement) in parsed.widgets.iter_mut() {
@@ -150,2 +151,3 @@ pub fn load_or_recover_config(target_path: &Path) -> (AppConfig, bool) {
                 }
+                parsed.version = 2;
+                }
```

### [MAJOR] [OPEN] M2-05 Lack of Concurrency Guard in `run_speedtest` Causes Interleaved Progress Events and Erroneous Metrics
- **Status**: OPEN
- **Where**: `src-tauri/src/speedtest/mod.rs:231-334`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: If a user clicks "Start Speedtest" twice or triggers it concurrently across multiple windows, two benchmark routines run simultaneously against Cloudflare. They emit conflicting `speedtest-progress` events on the same channel, causing the frontend UI to flicker erratically between stages, and corrupt throughput metrics due to socket contention.
- **Why**: `run_speedtest` lacks an atomic guard or lock (e.g. `AtomicBool` or `tokio::sync::Mutex`) to reject or serialize concurrent speedtest runs.
- **Fix**:
```diff
--- a/src-tauri/src/speedtest/mod.rs
+++ b/src-tauri/src/speedtest/mod.rs
@@ -1,2 +1,3 @@
 use crate::config::{ConfigManager, SpeedtestResult};
+use std::sync::atomic::{AtomicBool, Ordering};
 use serde::{Deserialize, Serialize};
@@ -4,2 +5,4 @@
 use tauri::{AppHandle, Emitter, Manager, Runtime};
+
+static SPEEDTEST_RUNNING: AtomicBool = AtomicBool::new(false);
@@ -233,2 +236,5 @@ pub async fn run_speedtest<R: Runtime>(
 ) -> Result<SpeedtestResult, String> {
+    if SPEEDTEST_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
+        return Err("Speedtest is already running".to_string());
+    }
+    let _guard = scopeguard::guard((), |_| SPEEDTEST_RUNNING.store(false, Ordering::SeqCst));
```

### [MAJOR] [OPEN] M2-06 Unbounded Blocking WinRT Geolocation Call Lacks Timeout and Starves Tokio Worker Threads
- **Status**: OPEN
- **Where**: `src-tauri/src/geo/winrt.rs:45-51`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When Windows Location Services are disabled, denied by user privacy permissions, or searching for satellite/Wi-Fi positioning, `async_op.get()` synchronously blocks the thread for the system default duration (up to 60+ seconds). Because `spawn_blocking` has no timeout, it ties up a Tokio blocking pool thread and hangs the frontend weather/geo query.
- **Why**: WinRT's `GetGeopositionAsync()` is called synchronously via `.get()` without a timeout or Tokio `tokio::time::timeout` guard on the task handle.
- **Fix**:
```diff
--- a/src-tauri/src/geo/mod.rs
+++ b/src-tauri/src/geo/mod.rs
@@ -14,5 +14,7 @@ pub struct GeoLocation {
 pub async fn get_windows_location() -> Result<(f64, f64), String> {
-    tokio::task::spawn_blocking(winrt::get_geoposition_coords)
-        .await
-        .map_err(|e| format!("Geolocation task failed to join: {e}"))?
+    tokio::time::timeout(
+        std::time::Duration::from_secs(10),
+        tokio::task::spawn_blocking(winrt::get_geoposition_coords)
+    ).await
+    .map_err(|_| "Geolocation request timed out after 10s".to_string())?
+    .map_err(|e| format!("Geolocation task failed to join: {e}"))?
 }
```

### [MINOR] [OPEN] M2-07 Date Whitespace Divergence in `remove_calendar_note` and `toggle_calendar_note` Prevents Note Deletion/Toggle
- **Status**: OPEN
- **Where**: `src-tauri/src/calendar/mod.rs:41-50`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: While `add_note_to_map` trims the date parameter before inserting into the `HashMap` (`date_trimmed = date.trim()`), `remove_note_from_map` and `toggle_note_in_map` use `events.get_mut(date)` directly without trimming. If a date string contains leading or trailing whitespace (e.g. `"2026-10-26 "`), the lookup fails, and the note cannot be removed or toggled.
- **Why**: Inconsistent normalization between insertion (trimmed) and query/deletion (untrimmed).
- **Fix**:
```diff
--- a/src-tauri/src/calendar/mod.rs
+++ b/src-tauri/src/calendar/mod.rs
@@ -43,3 +43,3 @@ pub fn remove_note_from_map(
 ) {
-    if let Some(notes) = events.get_mut(date) {
+    if let Some(notes) = events.get_mut(date.trim()) {
         notes.retain(|n| n.id != note_id);
@@ -57,3 +57,3 @@ pub fn toggle_note_in_map(
 ) {
-    if let Some(notes) = events.get_mut(date) {
+    if let Some(notes) = events.get_mut(date.trim()) {
         if let Some(note) = notes.iter_mut().find(|n| n.id == note_id) {
```

### [MINOR] [OPEN] M2-08 Upload Benchmark Progress Freeze and Low Bandwidth Timeout Failure
- **Status**: OPEN
- **Where**: `src-tauri/src/speedtest/mod.rs:173-206`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In `run_upload_phase`, the 3.5 MB buffer is dispatched in a single `body(payload).send().await` call. During upload (which can take 15-20 seconds on modest connections), progress stays frozen at 0.1 with zero interim progress events. Furthermore, on upload speeds below ~1.12 Mbps, the 25-second overall timeout aborts the entire test, discarding already completed ping and download measurements.
- **Why**: Upload phase does not stream chunks with progress emissions, and treats upload failure as fatal to the entire benchmark pipeline.
- **Fix**:
```diff
--- a/src-tauri/src/speedtest/mod.rs
+++ b/src-tauri/src/speedtest/mod.rs
@@ -282,18 +282,10 @@ pub async fn run_speedtest<R: Runtime>(
     // Phase 3: Upload Speed
-    let upload_mbps = match run_upload_phase(&client, &app, CF_SPEEDTEST_UP_URL, ping_ms, jitter_ms, download_mbps).await {
+    let upload_mbps = match run_upload_phase(&client, &app, CF_SPEEDTEST_UP_URL, ping_ms, jitter_ms, download_mbps).await
+    {
         Ok(mbps) => mbps,
         Err(e) => {
-            let _ = app.emit(
-                "speedtest-progress",
-                SpeedtestProgress {
-                    stage: "error".to_string(),
-                    progress: 0.0,
-                    current_mbps: 0.0,
-                    ping_ms: Some(ping_ms),
-                    jitter_ms: Some(jitter_ms),
-                    download_mbps: Some(download_mbps),
-                    upload_mbps: None,
-                    error: Some(e.clone()),
-                },
-            );
-            return Err(e);
+            log::warn!("Speedtest upload phase failed: {}", e);
+            0.0
         }
     };
```

### [MINOR] [OPEN] M2-09 Debounced Config Drops Unsaved Changes on Application Termination
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:287-318`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: MEDIUM
- **Category**: robustness
- **Scenario**: When a user drags a widget, `save_config` dispatches `save_debounced`, resetting the 500ms timer. If the application is closed within 500ms of the move, the spawned debounce task is aborted by process exit without flushing `is_dirty` config to disk, silently losing the latest widget positions.
- **Why**: `ConfigManager` lacks a flush method or lifecycle hook to save dirty configuration on window close or process termination.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -367,2 +367,11 @@ impl ConfigManager {
     }
+
+    pub async fn flush(&self) -> Result<(), String> {
+        if self.is_dirty.swap(false, Ordering::SeqCst) {
+            let config = self.current_config.read().await.clone();
+            let path = self.config_path.clone();
+            tokio::task::spawn_blocking(move || save_config_atomic(&path, &config))
+                .await
+                .map_err(|e| format!("Flush error: {e}"))?
         } else {
             Ok(())
         }
     }
```

### [MINOR] [OPEN] M2-10 Unhandled Error and Silent State Desync in Debounce Task Disk Save
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:308-314`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In the background debounce task, when the timer fires, `loop_dirty.swap(false, Ordering::SeqCst)` clears the dirty flag BEFORE running `save_config_atomic`. If `save_config_atomic` fails (e.g. disk full, permission denied), the return value is discarded (`let _ = tokio::task::spawn_blocking(...)`), no log entry is written, and `is_dirty` remains false. The memory and disk states permanently desynchronize without notifying the app.
- **Why**: Background debounce loop ignores `Result` from atomic save and clears dirty flag prematurely without retry on error.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -308,6 +308,10 @@ impl ConfigManager {
                         if loop_dirty.swap(false, Ordering::SeqCst) {
                             let config_to_save = loop_config.read().await.clone();
                             let path = write_path.clone();
-                            let _ = tokio::task::spawn_blocking(move || {
+                            let res = tokio::task::spawn_blocking(move || {
                                 save_config_atomic(&path, &config_to_save)
                             }).await;
+                            if let Ok(Err(e)) = res {
+                                log::error!("Debounced config write failed: {}", e);
+                                loop_dirty.store(true, Ordering::SeqCst);
+                            }
                         }
```
