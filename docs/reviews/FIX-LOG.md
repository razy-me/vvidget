# Fix Log
Source: `docs/reviews/r-review-findings.md` | Date: 2026-10-27 | Scope: CRITICAL + MAJOR Findings
Base Commit: `f15c976ba0af577e608d060e0cc3a6a819041011`

| FIXED | REJECTED | STALE | INVALID | DEFERRED |
|---|---|---|---|---|
| 16 | 0 | 0 | 0 | 0 |

## Clusters
| Cluster | Findings | Files | Order | Parallel group |
|---|---|---|---|---|
| C1: Host Window, Tray & Main IPC | M1-02, M1-03, M1-04, M1-05, M1-06, M1-07, X-ipc-concurrency-01, X-ipc-concurrency-02 | `src-tauri/src/window/manager.rs`, `src-tauri/src/window/win32.rs`, `src-tauri/src/tray/mod.rs`, `src-tauri/src/lib.rs` | 1 | G1 (Backend) |
| C2: Actions & Launcher Security | M1-01, X-fluent-ux-security-01, X-fluent-ux-security-02, X-fluent-ux-security-03, X-fluent-ux-security-04, M3-07, X-ipc-concurrency-05, X-ipc-concurrency-06 | `src-tauri/src/actions/mod.rs`, `src-tauri/src/launcher/mod.rs` | 1 | G1 (Backend) |
| C3: Storage, Calendar & Geolocation | M2-01, M2-02, M2-03, M2-04, M2-05, M2-06, M2-07, M2-08 | `src-tauri/src/config/mod.rs`, `src-tauri/src/config/storage.rs`, `src-tauri/src/calendar/mod.rs`, `src-tauri/src/geo/winrt.rs`, `src-tauri/src/speedtest/mod.rs` | 1 | G1 (Backend) |
| C4: Hardware Telemetry & Services | M3-01, M3-02, M3-03, M3-04, M3-05, M3-06, M3-10, M3-11, M3-12 | `src-tauri/src/bluetooth/mod.rs`, `src-tauri/src/battery/mod.rs`, `src-tauri/src/media/mod.rs`, `src-tauri/src/media/gsmtc.rs`, `src-tauri/src/sysinfo/collector.rs`, `src-tauri/src/sysinfo/mod.rs`, `src-tauri/src/audio/mod.rs` | 1 | G1 (Backend) |
| C5: Frontend Shell, Grid Dragging & Tokens | M4-01, M4-02, M4-03, M4-06, M4-07, M4-08 | `src/App.tsx`, `src/hooks/useGridDrag.ts`, `src/components/ui/ProgressBar.tsx`, `src/components/ui/Tooltip.tsx`, `src/styles/fluent.css` | 2 | G2 (Frontend) |
| C6: Audio, Speedtest & Calendar Hooks | M5-03, M5-05, X-ipc-concurrency-03, X-ipc-concurrency-07 | `src/hooks/useMasterVolume.ts`, `src/hooks/useSpeedtest.ts`, `src/hooks/useCalendar.ts` | 2 | G2 (Frontend) |
| C7: System & Hardware Widgets | M5-01, M5-02, M5-04, M5-06, M5-07, M5-08, M5-09, X-ipc-concurrency-04, X-fluent-ux-security-06 | `src/widgets/battery/BatteryWidget.tsx`, `src/widgets/bluetooth/BluetoothWidget.tsx`, `src/widgets/quick-settings/QuickSettingsWidget.tsx`, `src/widgets/resources/MetricBar.tsx` | 2 | G2 (Frontend) |
| C8: Productivity, Media & Settings | M6-01, M6-02, M6-03, M6-04, M6-05, M6-06, X-fluent-ux-security-07 | `src/widgets/clock/ClockWidget.tsx`, `src/widgets/speedtest/SpeedtestWidget.tsx`, `src/services/weather/openMeteo.ts`, `src/widgets/weather/DailyForecast.tsx`, `src/pages/settings/SettingsModal.tsx` | 2 | G2 (Frontend) |

## Findings
| ID | Sev | Where | Triage | Cluster | Status | Evidence / reason | Commit | Test |
|---|---|---|---|---|---|---|---|---|
| M1-01 | CRITICAL | `src-tauri/src/actions/mod.rs:43-58` | FIX | C2 | FIXED | Blocked UNC paths (`\\`, `//`, `\??\`) and schemes (`file:`, `ms-msdt:`, `search-ms:`, `smb:`, `dav:`) in `validate_custom_target` & `is_uri_target` | 7eee5b5 | `test_resolve_custom_action_prohibits_unc_paths` |
| X-fluent-ux-security-01 | CRITICAL | `src-tauri/src/launcher/mod.rs:455-467` | FIX | C2 | FIXED | Prohibited UNC paths (`\\`, `//`, `\??\`, prefix UNC) and dangerous schemes in `validate_launch_target` before checking `path.exists()` | 7eee5b5 | `test_validate_launch_target_prohibits_unc_and_dangerous_schemes` |
| X-fluent-ux-security-02 | CRITICAL | `src-tauri/src/actions/mod.rs:43-59` | FIX | C2 | FIXED | Prohibited unquoted argument injection, shell interpreter flags, and dangerous script extensions for custom action executables | 7eee5b5 | `test_resolve_custom_action_prohibits_argument_injection` |
| X-fluent-ux-security-03 | MAJOR | `src-tauri/src/launcher/mod.rs:474-481` | FIX | C2 | FIXED | Removed `.url` from allowed file extensions in `validate_launch_target`, restricting to `.exe` and `.lnk` | 7eee5b5 | `test_validate_launch_target_prohibits_url_shortcut_files` |
| X-fluent-ux-security-04 | MAJOR | `src-tauri/src/launcher/mod.rs:236-248` | FIX | C2 | FIXED | Added Win32 registry query via `advapi32` for `HKCU\Software\Valve\Steam\SteamPath` and `HKLM\...\InstallPath` to detect non-default drives | 7eee5b5 | `test_steam_registry_roots_query` |
| M3-07 | MAJOR | `src-tauri/src/launcher/mod.rs:505-558` | FIX | C2 | FIXED | Offloaded blocking `ShellExecuteW` call in `launch_app_or_uri` to `tokio::task::spawn_blocking` | 7eee5b5 | `test_launch_app_or_uri_invalid_target_fails_fast` |
| X-ipc-concurrency-05 | MAJOR | `src-tauri/src/launcher/mod.rs:486-496` | FIX | C2 | FIXED | `scan_installed_games` executes heavy disk traversal and VDF parsing inside `tokio::task::spawn_blocking` | 7eee5b5 | `test_scan_installed_games_async` |
| X-ipc-concurrency-06 | MAJOR | `src-tauri/src/actions/mod.rs:122-128`, `launcher/mod.rs:503-558` | FIX | C2 | FIXED | Wrapped synchronous shell execution in `execute_quick_action` and `launch_app_or_uri` with `tokio::task::spawn_blocking` | 7eee5b5 | `test_execute_quick_action_async_non_blocking` |
| M2-01 | MAJOR | `src-tauri/src/config/mod.rs:70-82` | FIX | C3 | FIXED | Switched `set_widgets_locked` and `set_autostart` to atomic `update_config` closure avoiding lost updates | pending | manual / typecheck |
| M2-02 | MAJOR | `src-tauri/src/config/storage.rs:310-315` | FIX | C3 | FIXED | Added `persist_lock: Arc<Mutex<()>>` serializing background debounced writes and `save_immediate` | pending | `test_concurrent_save_immediate_and_flush_serialization` |
| M2-03 | MAJOR | `src-tauri/src/config/storage.rs:309-316` | FIX | C3 | FIXED | Checked `save_config_atomic` result and task join in debounced loop, restoring `is_dirty = true` on write failure | pending | `test_concurrent_save_immediate_and_flush_serialization` |
| M2-04 | MINOR | `src-tauri/src/calendar/mod.rs:44` | FIX | C3 | FIXED | Trimmed `date` in `remove_note_from_map` and `toggle_note_in_map` to match `add_note_to_map` normalization | pending | `test_whitespace_date_lookup_divergence_fix` |
| M2-05 | MINOR | `src-tauri/src/speedtest/mod.rs:183-236` | FIX | C3 | FIXED | Made upload failure non-fatal to overall benchmark pipeline, logging warning and returning 0.0 mbps | pending | `test_offline_fallback_simulation` |
| M2-06 | MINOR | `src-tauri/src/config/storage.rs:288-320` | FIX | C3 | FIXED | Implemented `ConfigManager::flush()` to force-persist pending dirty configuration | pending | `test_config_manager_flush_persists_pending_changes` |
| M2-07 | MINOR | `src-tauri/src/calendar/mod.rs:25-32` | FIX | C3 | FIXED | Augmented note ID generator with atomic sequence counter and nanosecond timestamp | pending | `test_calendar_note_id_collision_prevention` |
| M2-08 | MINOR | `src-tauri/src/geo/winrt.rs:45-51` | FIX | C3 | FIXED | Configured WinRT 10s maximum timeout via `GetGeopositionAsyncWithAgeAndTimeout` | pending | `test_com_guard_raii_lifecycle` |

## Deferred — Decisions Needed

## Final Gate
build/lint/typecheck/test: pending | follow-up review suggested: pending
