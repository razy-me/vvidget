# TEST REPORT

| R-ID | Tests (file::name) | Status |
|------|-------------------|--------|
| R1 | `src-tauri/src/window/win32.rs::tests::test_enable_current_thread_eco_qos` | PASSED |
| R1 | `src-tauri/src/lib.rs::tests::test_cross_module_power_state_worker_scaling_and_suspension` | PASSED |
| R1 | `src-tauri/src/sysinfo/mod.rs::tests::test_metrics_collector_collects_valid_data` | PASSED |
| R2 | `src-tauri/src/power/mod.rs::tests::test_power_state_default` | PASSED |
| R2 | `src-tauri/src/power/mod.rs::tests::test_should_sample_matrix` | PASSED |
| R2 | `src-tauri/src/power/mod.rs::tests::test_interval_multiplier_rules` | PASSED |
| R2 | `src-tauri/src/power/mod.rs::tests::test_state_change_detection` | PASSED |
| R2 | `src-tauri/src/power/mod.rs::tests::test_power_manager_accessors_and_snapshot` | PASSED |
| R2 | `src-tauri/src/window/webview_power.rs::tests::test_is_suspendable_widget_window` | PASSED |
| R2 | `src-tauri/src/window/webview_power.rs::tests::test_widgets_suspended_flag_transitions` | PASSED |
| R2 | `src-tauri/src/lib.rs::tests::test_webview_power_suspension_filtering` | PASSED |
| R2 | `src-tauri/src/lib.rs::tests::test_cross_module_power_state_worker_scaling_and_suspension` | PASSED |
| R3 | `src-tauri/src/sysinfo/collector.rs::tests::test_collect_metrics_with_options_cached_process` | PASSED |
| R3 | `src-tauri/src/sysinfo/collector.rs::tests::test_collector_network_and_top_process` | PASSED |
| R3 | `src-tauri/src/sysinfo/mod.rs::tests::test_collector_decoupled_process_refresh` | PASSED |
| R3 | `src-tauri/src/sysinfo/mod.rs::tests::test_collector_fast_refresh_without_disks` | PASSED |
| R3 | `src-tauri/src/media/mod.rs::tests::test_calculate_media_poll_interval_active_vs_idle` | PASSED |
| R3 | `src-tauri/src/media/gsmtc.rs::tests::test_calculate_media_poll_interval_ac` | PASSED |
| R3 | `src-tauri/src/media/gsmtc.rs::tests::test_calculate_media_poll_interval_battery` | PASSED |
| R3 | `src-tauri/src/media/gsmtc.rs::tests::test_calculate_media_poll_interval_energy_saver` | PASSED |
| R3 | `src-tauri/src/media/gsmtc.rs::tests::test_resolve_media_target_window` | PASSED |
| R3 | `src/test/useSystemMetrics.test.ts::limits CPU history array to 20 samples maximum` | PASSED |
| R4 | `src-tauri/src/audio/notify.rs::tests::test_audio_volume_update_serialization` | PASSED |
| R4 | `src-tauri/src/battery/mod.rs::tests::test_query_winrt_battery_report_safe_com_initialization` | PASSED |
| R4 | `src-tauri/src/battery/mod.rs::tests::test_sparkline_gating_60s_or_delta` | PASSED |
| R4 | `src/test/useMasterVolume.test.ts::updates volume and mute state immediately upon audio-volume-update event (WP-04)` | PASSED |
| R4 | `src/test/useMasterVolume.test.ts::periodically refreshes volume and mute state via 60000ms heartbeat fallback (WP-04)` | PASSED |
| R4 | `src/test/useMasterVolume.test.ts::pauses polling when document is hidden (WP-04)` | PASSED |
| R4 | `src/test/battery.test.tsx::updates battery status immediately upon battery-update event (WP-04)` | PASSED |
| R4 | `src/test/battery.test.tsx::pauses battery polling when document is hidden (WP-04)` | PASSED |
| R4 | `src/test/eventSinkIntegration.test.tsx::propagates native audio-volume-update push events to SpotifyWidget UI without timer polling` | PASSED |
| R4 | `src/test/eventSinkIntegration.test.tsx::propagates native battery-update push events to BatteryWidget UI without timer polling` | PASSED |
| R4 | `src/test/eventSinkIntegration.test.tsx::verifies 60s fallback heartbeat sync and document.hidden suspension across both event sinks` | PASSED |
| R5 | `src/test/app.test.tsx::routes to dedicated widget windows (lazy route splitting across all 10 widgets)` | PASSED |
| R5 | `src/test/app.test.tsx::renders DockContainer when layout_mode is docked` | PASSED |
| R5 | `src/test/skeletonWidget.test.tsx::renders skeleton window view when ?view=skeleton` | PASSED |
| R5 | `vite.config.ts::manualChunks rollup build emitting isolated widget & vendor chunks` | PASSED |
| R6 | `src/test/clock.test.tsx::pauses ClockFace ticks when document is hidden` | PASSED |
| R6 | `src/test/clock.test.tsx::displays digital time, weekday in German, and toggles between digital and analog` | PASSED |
| R6 | `src/test/useWeather.test.ts::reuses cached coordinates within 24h TTL without invoking native geolocation` | PASSED |
| R6 | `src/test/useWeather.test.ts::pauses interval polling when document is hidden` | PASSED |
| R6 | `src/test/primitives.test.tsx::ProgressBar and Card compositing & discrete transition properties` | PASSED |
| R7 | `src-tauri/src/lib.rs::tests::test_capabilities_acl_strict_security` | PASSED |
| R7 | `src-tauri/src/lib.rs::tests::test_default_config_security_no_hardcoded_secrets` | PASSED |
| R7 | `src-tauri/src/lib.rs::tests::test_all_specta_data_models_deserialization_safety` | PASSED |

## Bugs found & fixed

| Bug | Root cause | Fix (commit) | Reviewed |
|-----|------------|--------------|----------|
| Missing cross-module verification between PowerState, worker scaling, and WebView2 suspension | Unit tests evaluated power, webview suspension, and worker sleep intervals in module isolation without end-to-end integration proof | Added `test_cross_module_power_state_worker_scaling_and_suspension` in `src-tauri/src/lib.rs` covering AC/Battery/Energy Saver multipliers and suspension window filtering | Yes |
| Missing event sink propagation integration test from native push events to UI components | Unit tests verified isolated hook callbacks but lacked multi-module verification that `audio-volume-update` and `battery-update` events update `SpotifyWidget` and `BatteryWidget` UI elements without polling | Created `src/test/eventSinkIntegration.test.tsx` testing instant UI reactivity, zero polling invocations, 60s fallback sync, and `document.hidden` pause | Yes |

## Coverage summary

- **Rust Backend**:
  - `vvidget_lib`: 187 tests passing (100% pass rate, 0 failures, 0 ignored).
  - All 7 core requirements (R1 through R7) covered with unit and integration tests.
  - Windows COM callbacks, WinRT event handlers, EcoQoS scheduling, and WebView2 controller suspension covered.
- **Frontend & React 19**:
  - `Vitest`: 33 test files passing, 294 tests passing (100% pass rate, 0 failures, 0 ignored).
  - `TypeScript / Lint`: 0 type errors across whole repository (`tsc --noEmit` passed).
  - `Vite Build`: 100% clean production build generating 10 isolated lazy widget chunks, shared vendor chunks, and settings view chunk.

## Commands to run

- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm.cmd run lint`
- `npm.cmd run test`
- `npm.cmd run build`
