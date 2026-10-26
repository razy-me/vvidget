# Fix Log
Source: `docs/reviews/r-review-findings.md` | Date: 2026-10-26 | Scope: CRITICAL + MAJOR (42 findings)
Base Commit: `597d12488d6c8deccbeb626ef23b984f723f49b0`

| FIXED | REJECTED | STALE | INVALID | DEFERRED |
|---|---|---|---|---|
| 14 | 0 | 0 | 0 | 0 |

## Clusters
| Cluster | Findings | Files | Order | Parallel group |
|---|---|---|---|---|
| C1: Host Window & Win32 Integration | M1-01, M1-02, M1-03, M1-04, M1-05, M1-06, M1-07, X1-06 | `src-tauri/src/window/win32.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/actions/mod.rs` | 1 | G1 (Backend) |
| C2: Storage, Persistence & Geolocation | M2-01, M2-02, M2-03, M2-04, M2-05, M2-06 | `src-tauri/src/config/storage.rs`, `src-tauri/src/calendar/mod.rs`, `src-tauri/src/geo/winrt.rs`, `src-tauri/src/speedtest/mod.rs` | 1 | G1 (Backend) |
| C3: Hardware & System Services | M3-02, M3-03, M3-04, M3-05, M3-06, M3-07, M3-08, X1-04, X1-05 | `src-tauri/src/bluetooth/mod.rs`, `src-tauri/src/battery/mod.rs`, `src-tauri/src/media/gsmtc.rs`, `src-tauri/src/launcher/mod.rs`, `src-tauri/src/sysinfo/mod.rs` | 1 | G1 (Backend) |
| C4: Fluent Styling, Shell & Grid Collision | M4-02, M4-03, M4-04, M4-05, M4-06, X2-01 | `src/styles/fluent.css`, `src/utils/gridCollision.ts`, `src/components/layout/HeaderBar.tsx`, `src/components/docking/DockItem.tsx` | 2 | G2 (Frontend) |
| C5: State Hooks & Core Integration | X1-01, X1-02, X1-03, M5-05, M6-05 | `src/hooks/useConfig.ts`, `src/hooks/useCalendar.ts`, `src/hooks/useMasterVolume.ts` | 2 | G2 (Frontend) |
| C6: Widget UI Polish & WinUI Controls | M5-01, M5-02, M5-03, M5-04, M6-02, M6-03, M6-04, M6-06 | `src/widgets/battery/BatterySparkline.tsx`, `src/widgets/resources/ResourceWidget.tsx`, `src/widgets/bluetooth/BluetoothWidget.tsx`, `src/widgets/quick-settings/QuickSettingsWidget.tsx`, `src/widgets/launcher/GameLauncherWidget.tsx`, `src/widgets/speedtest/SpeedtestWidget.tsx`, `src/widgets/clock/ClockWidget.tsx` | 2 | G2 (Frontend) |

## Findings
| ID | Sev | Where | Triage | Cluster | Status | Evidence / reason | Commit | Test |
|---|---|---|---|---|---|---|---|---|
| M1-01 | CRITICAL | `src-tauri/src/window/win32.rs:492` | VALID | C1 | FIXED | Scoped hide_window prevents shell WM_SHOWWINDOW(FALSE) self-defeat | e24fbbe | `test_allow_hide_logic` |
| M1-02 | CRITICAL | `src-tauri/src/window/win32.rs:306` | VALID | C1 | FIXED | Replaced synchronous erase and update with RDW_INVALIDATE \| RDW_ALLCHILDREN | e24fbbe | `invalidate_screen_rect` |
| M1-03 | MAJOR | `src-tauri/src/actions/mod.rs:73` | VALID | C1 | FIXED | Unified taskmgr to use ShellExecuteW avoiding UAC error 740 | e24fbbe | `test_resolve_predefined_system_actions` |
| M1-04 | MAJOR | `src-tauri/src/lib.rs:188` | VALID | C1 | FIXED | Re-registered main window with WindowManager when switching back to docked mode | e24fbbe | `test_window_setup_options_default` |
| M1-05 | MAJOR | `src-tauri/src/actions/mod.rs:95` | VALID | C1 | FIXED | Prohibited UNC/SMB paths starting with \ or // preventing NetNTLM leak | e24fbbe | `test_resolve_custom_action_prohibits_unc_paths` |
| M1-06 | MAJOR | `src-tauri/src/lib.rs:120` | VALID | C1 | FIXED | Removed unsnapped async WindowEvent::Moved race listener | e24fbbe | `test_window_manager_handle_window_moved_persists_config` |
| M1-07 | MAJOR | `src-tauri/src/window/win32.rs:175` | VALID | C1 | FIXED | Decoupled grid metrics from primary monitor GetDC | e24fbbe | `test_desktop_grid_metrics_dimensions` |
| X1-06 | MAJOR | `src-tauri/src/lib.rs:382` | VALID | C1 | FIXED | Removed duplicate open_widget_window in duplicate_quick_settings_widget | e24fbbe | `sync_widget_windows` listener |
| M2-01 | CRITICAL | `src-tauri/src/config/storage.rs:86` | VALID | C2 | FIXED | Removed destructive target deletion fallback; cleans temp and preserves target | f6a4f75 | `test_save_config_atomic_preserves_target_file_on_atomic_failure` |
| M2-02 | MAJOR | `src-tauri/src/calendar/mod.rs:88` | VALID | C2 | FIXED | Added atomic update_config to ConfigManager eliminating read-modify-write race | f6a4f75 | `test_config_manager_update_config_atomicity` |
| M2-03 | MAJOR | `src-tauri/src/config/storage.rs:170` | VALID | C2 | FIXED | Prevented IO read error from invoking corrupt backup and default reset | f6a4f75 | `test_io_read_error_does_not_reset_target_file` |
| M2-04 | MAJOR | `src-tauri/src/config/storage.rs:215` | VALID | C2 | FIXED | Scoped grid migration to version < 2; preserved multi-monitor negative coords | f6a4f75 | `test_version_2_custom_dimensions_and_negative_coords_preserved` |
| M2-05 | MAJOR | `src-tauri/src/speedtest/mod.rs:231` | VALID | C2 | FIXED | Added atomic SpeedtestGuard rejecting concurrent benchmark executions | f6a4f75 | `test_speedtest_concurrency_guard` |
| M2-06 | MAJOR | `src-tauri/src/geo/winrt.rs:45` | VALID | C2 | FIXED | Wrapped blocking WinRT geolocation in 10s tokio timeout preventing worker thread hang | f6a4f75 | `test_geolocation_timeout_wrapper` |
| M3-02 | MAJOR | `src-tauri/src/battery/mod.rs:160` | VALID | C3 | OPEN | | | |
| M3-03 | CRITICAL | `src-tauri/src/bluetooth/mod.rs:135` | VALID | C3 | OPEN | | | |
| M3-04 | MAJOR | `src-tauri/src/bluetooth/mod.rs:226` | VALID | C3 | OPEN | | | |
| M3-05 | MAJOR | `src-tauri/src/media/gsmtc.rs:180` | VALID | C3 | OPEN | | | |
| M3-06 | MAJOR | `src-tauri/src/media/gsmtc.rs:310` | VALID | C3 | OPEN | | | |
| M3-07 | MAJOR | `src-tauri/src/launcher/mod.rs:518` | VALID | C3 | OPEN | | | |
| M3-08 | MAJOR | `src-tauri/src/launcher/mod.rs:460` | VALID | C3 | OPEN | | | |
| X1-04 | MAJOR | `src-tauri/src/launcher/mod.rs:488` | VALID | C3 | OPEN | | | |
| X1-05 | MAJOR | `src-tauri/src/sysinfo/mod.rs:28` | VALID | C3 | OPEN | | | |
| M4-02 | MAJOR | `src/utils/gridCollision.ts:48` | VALID | C4 | OPEN | | | |
| M4-03 | MAJOR | `src/components/layout/HeaderBar.tsx:45` | VALID | C4 | OPEN | | | |
| M4-04 | MAJOR | `src/components/docking/DockItem.tsx:55` | VALID | C4 | OPEN | | | |
| M4-05 | MAJOR | `src/components/docking/DockItem.tsx:88` | VALID | C4 | OPEN | | | |
| M4-06 | MAJOR | `src/styles/fluent.css:42` | VALID | C4 | OPEN | | | |
| X2-01 | MAJOR | `src/styles/fluent.css:56` | VALID | C4 | OPEN | | | |
| X1-01 | MAJOR | `src/hooks/useConfig.ts:68` | VALID | C5 | OPEN | | | |
| X1-02 | MAJOR | `src/hooks/useConfig.ts:69` | VALID | C5 | OPEN | | | |
| X1-03 | MAJOR | `src/hooks/useCalendar.ts:68` | VALID | C5 | OPEN | | | |
| M5-05 | MAJOR | `src/hooks/useMasterVolume.ts:50` | VALID | C5 | OPEN | | | |
| M6-05 | MAJOR | `src/hooks/useCalendar.ts:70` | VALID | C5 | OPEN | | | |
| M5-01 | MAJOR | `src/widgets/battery/BatterySparkline.tsx:49` | VALID | C6 | OPEN | | | |
| M5-02 | MAJOR | `src/widgets/resources/ResourceWidget.tsx:85` | VALID | C6 | OPEN | | | |
| M5-03 | MAJOR | `src/widgets/bluetooth/BluetoothWidget.tsx:110` | VALID | C6 | OPEN | | | |
| M5-04 | MAJOR | `src/widgets/quick-settings/QuickSettingsWidget.tsx:140` | VALID | C6 | OPEN | | | |
| M6-02 | MAJOR | `src/widgets/speedtest/SpeedtestWidget.tsx:210` | VALID | C6 | OPEN | | | |
| M6-03 | MAJOR | `src/widgets/launcher/GameLauncherWidget.tsx:180` | VALID | C6 | OPEN | | | |
| M6-04 | MAJOR | `src/widgets/launcher/GameLauncherWidget.tsx:260` | VALID | C6 | OPEN | | | |
| M6-06 | MAJOR | `src/widgets/clock/ClockWidget.tsx:320` | VALID | C6 | OPEN | | | |

## Deferred — Decisions Needed

## Final Gate
build/lint/typecheck/test: pending | follow-up review suggested: no
