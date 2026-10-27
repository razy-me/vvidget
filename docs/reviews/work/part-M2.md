# Review Findings: M2 Data Persistence & External Services

### [MAJOR] [OPEN] M2-01 Read-Modify-Write Race Condition in `set_widgets_locked` and `set_autostart` Causes Lost Updates
- **Status**: OPEN
- **Where**: `src-tauri/src/config/mod.rs:70-82`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When a user locks widget positions (`set_widgets_locked`) or configures autostart (`set_autostart`), the backend fetches `manager.get_config().await`, updates only that single field in its local clone, and calls `save_config_immediate` / `save_immediate(config)`. If a concurrent operation (such as adding a calendar note, saving a speedtest result, or moving another widget) persists changes via `update_config` between `get_config()` and `save_immediate()`, `save_immediate` blindly overwrites `current_config` and `config.json` with its stale snapshot, permanently discarding the other mutations.
- **Why**: `set_widgets_locked` and `set_autostart` bypass `ConfigManager::update_config` and execute an uncoordinated read-modify-write sequence across asynchronous boundaries.
- **Fix**:
```diff
--- a/src-tauri/src/config/mod.rs
+++ b/src-tauri/src/config/mod.rs
@@ -69,14 +69,18 @@ pub async fn set_widgets_locked<R: Runtime>(
     app: AppHandle<R>,
     locked: bool,
 ) -> Result<(), String> {
-    let mut config = if let Some(manager) = app.try_state::<ConfigManager>() {
-        manager.get_config().await
+    if let Some(win_mgr) = app.try_state::<crate::window::WindowManager>() {
+        win_mgr.set_locked(locked);
+    }
+
+    if let Some(manager) = app.try_state::<ConfigManager>() {
+        let snapshot = manager
+            .update_config(|config| {
+                config.lock_positions = locked;
+                Ok(config.clone())
+            })
+            .await?;
+        let _ = app.emit("config-changed", &snapshot);
+        Ok(())
     } else {
-        load_or_recover_config(&resolve_config_path()).0
-    };
-
-    if let Some(win_mgr) = app.try_state::<crate::window::WindowManager>() {
-        win_mgr.set_locked(locked);
-    }
-
-    config.lock_positions = locked;
-    save_config_immediate(app, config).await
+        let mut config = load_or_recover_config(&resolve_config_path()).0;
+        config.lock_positions = locked;
+        save_config_immediate(app, config).await
+    }
 }
@@ -109,7 +113,12 @@ pub async fn set_autostart<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Res
     // Update config in state as well
     if let Some(manager) = app.try_state::<ConfigManager>() {
-        let mut config = manager.get_config().await;
-        if config.auto_start != enabled {
-            config.auto_start = enabled;
-            let _ = manager.save_immediate(config.clone()).await;
-            let _ = app.emit("config-changed", &config);
-        }
+        let snapshot = manager
+            .update_config(|config| {
+                config.auto_start = enabled;
+                Ok(config.clone())
+            })
+            .await?;
+        let _ = app.emit("config-changed", &snapshot);
     }
```

### [MAJOR] [OPEN] M2-02 Unsynchronized Concurrent Disk Writes Between `save_immediate` and Background Debounce Task
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:310-315`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: When the 500ms debounce timer pops, it dispatches `save_config_atomic(&path, &config_to_save)` on a blocking thread via `tokio::task::spawn_blocking`. If `save_immediate` or `update_config` is called at the same moment, `save_immediate` drops its in-memory write lock and immediately spawns another blocking task to write `config.json`. Both blocking tasks attempt concurrent atomic renames over `config.json`. On Windows NTFS, this triggers transient sharing violations (`ERROR_SHARING_VIOLATION`), or Thread 1's older debounced frame finishes second and overwrites the newer data persisted by `save_immediate`.
- **Why**: Disk persistence tasks in `ConfigManager` are dispatched into `spawn_blocking` without a dedicated mutex or channel to serialize physical filesystem operations.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -271,2 +271,3 @@ pub struct ConfigManager {
     is_dirty: Arc<AtomicBool>,
+    persist_lock: Arc<tokio::sync::Mutex<()>>,
     debounce_tx: mpsc::Sender<()>,
 }
@@ -282,2 +283,3 @@ impl ConfigManager {
         let is_dirty = Arc::new(AtomicBool::new(false));
+        let persist_lock = Arc::new(tokio::sync::Mutex::new(()));
 
         let (debounce_tx, mut debounce_rx) = mpsc::channel::<()>(64);
         let write_path = config_path.clone();
         let loop_config = current_config.clone();
         let loop_dirty = is_dirty.clone();
+        let loop_persist = persist_lock.clone();
 
         tauri::async_runtime::spawn(async move {
@@ -310,4 +312,5 @@ impl ConfigManager {
                         if loop_dirty.swap(false, Ordering::SeqCst) {
+                            let _guard = loop_persist.lock().await;
                             let config_to_save = loop_config.read().await.clone();
                             let path = write_path.clone();
                             let _ = tokio::task::spawn_blocking(move || {
@@ -324,2 +327,3 @@ impl ConfigManager {
             current_config,
             is_dirty,
+            persist_lock,
             debounce_tx,
@@ -369,3 +373,4 @@ impl ConfigManager {
         self.is_dirty.store(false, Ordering::SeqCst);
+        let _guard = self.persist_lock.lock().await;
         let path = self.config_path.clone();
         tokio::task::spawn_blocking(move || save_config_atomic(&path, &config))
```

### [MAJOR] [OPEN] M2-03 Unhandled Error and Silent State Desynchronization in Debounced Disk Save
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:309-316`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In the background debounce task, when the timer fires, `loop_dirty.swap(false, Ordering::SeqCst)` clears the dirty flag BEFORE running `save_config_atomic`. If `save_config_atomic` fails (e.g. disk full, permission denied, or transient antivirus file locking), the return value is discarded (`let _ = tokio::task::spawn_blocking(...)`), no log entry is emitted, and `is_dirty` remains false. The in-memory state and disk state permanently desynchronize without alerting the application or retrying on subsequent updates.
- **Why**: Background debounce loop ignores the `Result` from atomic save and clears the dirty flag unconditionally before knowing whether the save succeeded.
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

### [MINOR] [OPEN] M2-04 Date Whitespace Lookup Divergence in `remove_calendar_note` and `toggle_calendar_note`
- **Status**: OPEN
- **Where**: `src-tauri/src/calendar/mod.rs:44`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: While `add_note_to_map` trims the date parameter before inserting into the `HashMap` (`date_trimmed = date.trim()`), `remove_note_from_map` and `toggle_note_in_map` query `events.get_mut(date)` directly without trimming. If a date string contains leading or trailing whitespace (e.g. `"2026-10-27 "`), the lookup fails, and the note can neither be removed nor marked completed.
- **Why**: Inconsistent input normalization between note insertion (trimmed) and query/deletion (untrimmed).
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

### [MINOR] [OPEN] M2-05 Upload Benchmark Progress Freeze and Low Bandwidth Timeout Failure
- **Status**: OPEN
- **Where**: `src-tauri/src/speedtest/mod.rs:183-236`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: In `run_upload_phase`, the 3.5 MB buffer is sent in a single `body(payload).send().await` call. During upload (which can take 15-20 seconds on modest connections), progress stays frozen at 0.1 with zero interim progress events. Furthermore, on upload speeds below ~1.12 Mbps, the 25-second overall timeout aborts the entire test, discarding already completed ping and download measurements and returning an error.
- **Why**: Upload phase does not stream chunks with progress emissions, and treats upload failure as fatal to the entire benchmark pipeline.
- **Fix**:
```diff
--- a/src-tauri/src/speedtest/mod.rs
+++ b/src-tauri/src/speedtest/mod.rs
@@ -298,18 +298,10 @@ pub async fn run_speedtest<R: Runtime>(
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
-                    download_mbps: None,
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

### [MINOR] [OPEN] M2-06 Debounced Config Drops Unsaved Changes on Application Termination
- **Status**: OPEN
- **Where**: `src-tauri/src/config/storage.rs:288-320`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: MEDIUM
- **Category**: robustness
- **Scenario**: When a user drags or moves a desktop widget, `save_config` dispatches `save_debounced`, resetting the 500ms timer. If the application is closed or restarted within 500ms of the move, the spawned debounce task is terminated on process exit without flushing `is_dirty` config to disk, silently reverting the latest widget positions to their previous values.
- **Why**: `ConfigManager` lacks a synchronous or asynchronous flush method to force-persist pending dirty configuration upon window closure or application exit.
- **Fix**:
```diff
--- a/src-tauri/src/config/storage.rs
+++ b/src-tauri/src/config/storage.rs
@@ -374,2 +374,11 @@ impl ConfigManager {
     }
+
+    pub async fn flush(&self) -> Result<(), String> {
+        if self.is_dirty.swap(false, Ordering::SeqCst) {
+            let config = self.current_config.read().await.clone();
+            let path = self.config_path.clone();
+            tokio::task::spawn_blocking(move || save_config_atomic(&path, &config))
+                .await
+                .map_err(|e| format!("Flush error: {e}"))?
+        } else {
+            Ok(())
+        }
+    }
```

### [MINOR] [OPEN] M2-07 Calendar Note ID Collision on Concurrent or Sub-Millisecond Creation
- **Status**: OPEN
- **Where**: `src-tauri/src/calendar/mod.rs:25-32`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: MEDIUM
- **Category**: bug
- **Scenario**: When notes are added without an explicit ID (e.g. batch creation or rapid input), IDs are generated using `as_millis()`. If two notes are created within the same millisecond, they receive identical IDs (`note_<epoch_millis>`). When the user later attempts to delete or toggle one note, `notes.retain(|n| n.id != note_id)` deletes both notes, or `toggle_note_in_map` modifies only the first duplicate, corrupting note tracking.
- **Why**: ID generation relies solely on low-resolution millisecond timestamps without an atomic sequence counter or nanosecond entropy.
- **Fix**:
```diff
--- a/src-tauri/src/calendar/mod.rs
+++ b/src-tauri/src/calendar/mod.rs
@@ -24,8 +24,10 @@ pub fn add_note_to_map(
         let mut new_note = note;
         if new_note.id.trim().is_empty() {
+            static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
+            let count = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
             new_note.id = format!(
-                "note_{}",
+                "note_{}_{}",
                 std::time::SystemTime::now()
                     .duration_since(std::time::UNIX_EPOCH)
                     .unwrap_or_default()
-                    .as_millis()
+                    .as_nanos(),
+                count
             );
         }
```

### [MINOR] [OPEN] M2-08 Blocking WinRT Geolocation Thread Leak on Tokio Timeout
- **Status**: OPEN
- **Where**: `src-tauri/src/geo/winrt.rs:45-51`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: MEDIUM
- **Category**: performance
- **Scenario**: When Windows Location Services are unresponsive or searching for satellite/Wi-Fi positioning, `get_windows_location` times out after 10 seconds via `tokio::time::timeout`. However, dropping the Tokio `JoinHandle` does not cancel the underlying blocking thread running `winrt::get_geoposition_coords`, which remains blocked on `async_op.get()` for up to 60+ seconds (WinRT's internal default timeout). Repeated queries leak blocking worker threads in Tokio's pool until WinRT eventually aborts.
- **Why**: `winrt::get_geoposition_coords` calls `GetGeopositionAsync().get()` without configuring WinRT's timeout overload (`GetGeopositionAsyncWithAgeAndTimeout`).
- **Fix**:
```diff
--- a/src-tauri/src/geo/winrt.rs
+++ b/src-tauri/src/geo/winrt.rs
@@ -44,3 +44,8 @@ pub fn get_geoposition_coords() -> Result<(f64, f64), String> {
 
-    let async_op = geolocator
-        .GetGeopositionAsync()
+    // Request geoposition with 10s maximum timeout at WinRT level to release the thread
+    let timeout = windows::Foundation::TimeSpan {
+        Duration: 100_000_000, // 10 seconds in 100-nanosecond units
+    };
+    let max_age = windows::Foundation::TimeSpan { Duration: 0 };
+    let async_op = geolocator
+        .GetGeopositionAsyncWithAgeAndTimeout(max_age, timeout)
         .map_err(|e| format!("Failed to request geoposition async: {e}"))?;
```

### [ENHANCEMENT] [OPEN] M2-09 Schema Version Inconsistency in `AppConfig::default()` Triggers Spurious Migrations
- **Status**: OPEN
- **Where**: `src-tauri/src/config/model.rs:240`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: `AppConfig::default()` hardcodes `version: 1`, while the active schema version is 2. Any config serialized from defaults (or missing the `version` key in partial JSON) deserializes as `version: 1`, repeatedly re-triggering schema migration logic and spatial collision resolution in `load_or_recover_config`.
- **Why**: The default constructor was not updated to reflect current schema version 2.
- **Fix**:
```diff
--- a/src-tauri/src/config/model.rs
+++ b/src-tauri/src/config/model.rs
@@ -239,3 +239,3 @@ impl Default for AppConfig {
         Self {
-            version: 1,
+            version: 2,
             lock_positions: false,
```
