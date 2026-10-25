# TEST REPORT

| R-ID | Area | Tests (file::name) | Status |
|---|---|---|---|
| R1 | core-backend | `window::snapping::tests::test_rect_dimensions` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_to_screen_left_edge` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_to_screen_right_edge` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_to_screen_top_and_bottom_edges` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_to_adjacent_widget` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_to_widget_adjacent_top_and_bottom` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_to_widget_all_four_edges_alignment` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_closest_candidate_chosen` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_flags_selective_edges_and_widgets` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_widget_no_vertical_overlap_does_not_snap_horizontally` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_threshold_zero_or_negative_does_nothing` | Passed |
| R1 | core-backend | `window::snapping::tests::test_snap_disabled_leaves_rect_untouched` | Passed |
| R1 | core-backend | `window::snapping::tests::test_distance_outside_threshold_does_not_snap` | Passed |
| R1 | core-backend | `window::monitor::tests::test_dpi_conversions` | Passed |
| R1 | core-backend | `window::monitor::tests::test_clamp_off_screen_to_the_right` | Passed |
| R1 | core-backend | `window::monitor::tests::test_clamp_negative_coordinates` | Passed |
| R1 | core-backend | `window::monitor::tests::test_clamp_multi_monitor_secondary_left` | Passed |
| R1 | core-backend | `window::monitor::tests::test_clamp_target_larger_than_monitor_dimensions` | Passed |
| R1 | core-backend | `window::monitor::tests::test_clamp_empty_monitors_list` | Passed |
| R1 | core-backend | `window::monitor::tests::test_clamp_furthest_window_selects_closest_monitor` | Passed |
| R1 | core-backend | `window::monitor::tests::test_invalid_scale_factor_fallback` | Passed |
| R1 | core-backend | `window::monitor::tests::test_clamp_logical_position_roundtrip_all_scales` | Passed |
| R1 | core-backend | `window::win32::tests::test_snapping_settings` | Passed |
| R1 | core-backend | `window::win32::tests::test_tracked_windows_registry` | Passed |
| R1 | core-backend | `window::manager::tests::test_window_manager_lock_state` | Passed |
| R1 | core-backend | `window::manager::tests::test_window_manager_snapping_settings` | Passed |
| R1 | core-backend | `window::manager::tests::test_window_manager_widget_tracking_lifecycle` | Passed |
| R1 | core-backend | `window::manager::tests::test_window_manager_concurrent_thread_safety` | Passed |
| R1 | core-backend | `tests::test_window_setup_options_default` | Passed |
| R2 | core-backend | `config::model::tests::test_app_config_starter_widgets_defaults` | Passed |
| R2 | core-backend | `config::model::tests::test_polling_rates_defaults` | Passed |
| R2 | core-backend | `config::model::tests::test_weather_settings_defaults` | Passed |
| R2 | core-backend | `config::model::tests::test_widget_placement_defaults` | Passed |
| R2 | core-backend | `config::model::tests::test_config_serde_roundtrip_complete` | Passed |
| R2 | core-backend | `config::storage::tests::test_save_and_load_roundtrip` | Passed |
| R2 | core-backend | `config::storage::tests::test_missing_file_creates_default` | Passed |
| R2 | core-backend | `config::storage::tests::test_corrupt_config_recovery` | Passed |
| R2 | core-backend | `config::storage::tests::test_empty_file_corrupt_recovery` | Passed |
| R2 | core-backend | `config::storage::tests::test_corrupt_json_type_mismatch_recovery` | Passed |
| R2 | core-backend | `config::storage::tests::test_save_atomic_bare_filename` | Passed |
| R2 | core-backend | `config::storage::tests::test_save_config_atomic_deep_directories` | Passed |
| R2 | core-backend | `config::storage::tests::test_missing_fields_fallback_cleanly_via_serde_default` | Passed |
| R2 | core-backend | `config::storage::tests::test_config_manager_debounced_save` | Passed |
| R2 | core-backend | `config::storage::tests::test_save_immediate_supersedes_debounced` | Passed |
| R2 | core-backend | `config::storage::tests::test_config_manager_concurrent_access` | Passed |
| R2 | core-backend | `config::storage::tests::test_config_manager_reload_from_disk_after_external_change` | Passed |
| R4 | core-backend | `media::model::tests::test_media_models_defaults` | Passed |
| R4 | core-backend | `media::model::tests::test_media_session_serialization` | Passed |
| R4 | core-backend | `media::model::tests::test_media_timeline_edge_cases` | Passed |
| R4 | core-backend | `media::model::tests::test_media_session_partial_json_deserialization` | Passed |
| R4 | core-backend | `media::protocol::tests::test_album_art_cache` | Passed |
| R4 | core-backend | `media::protocol::tests::test_album_art_cache_fifo_eviction` | Passed |
| R4 | core-backend | `media::protocol::tests::test_album_art_cache_overwrite_updates_data_without_duplicating_order` | Passed |
| R4 | core-backend | `media::protocol::tests::test_album_art_cache_concurrent_access` | Passed |
| R4 | core-backend | `media::protocol::tests::test_extract_track_id_from_query_variants` | Passed |
| R4 | core-backend | `media::gsmtc::tests::test_track_hash_consistency` | Passed |
| R4 | core-backend | `media::gsmtc::tests::test_track_hash_uniqueness_different_tracks` | Passed |
| R4 | core-backend | `media::gsmtc::tests::test_track_hash_with_unicode_and_emojis` | Passed |
| R4 | core-backend | `media::gsmtc::tests::test_current_timestamp_nonzero` | Passed |
| R4 | core-backend | `media::gsmtc::tests::test_get_current_media_session_no_crash` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_bytes_to_gb_conversion` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_bytes_to_gb_large_scale` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_disk_metric_calculations` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_disk_metric_edge_cases` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_memory_metric_calculations` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_memory_metric_edge_cases` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_memory_metric_zero_total_safe` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_system_metrics_default` | Passed |
| R5 | core-backend | `sysinfo::model::tests::test_system_metrics_serde_roundtrip` | Passed |
| R5 | core-backend | `sysinfo::tests::test_metrics_collector_collects_valid_data` | Passed |
| R5 | core-backend | `sysinfo::tests::test_cached_handle_updates` | Passed |
| R5 | core-backend | `sysinfo::tests::test_disks_are_sorted_alphabetically` | Passed |
| R5 | core-backend | `sysinfo::tests::test_collector_fast_refresh_without_disks` | Passed |
| R5 | core-backend | `sysinfo::tests::test_collector_concurrent_cached_reads` | Passed |
| R6 | core-backend | `sysinfo::tests::test_collector_fast_refresh_without_disks` | Passed |
| R6 | core-backend | `media::protocol::tests::test_album_art_cache_fifo_eviction` | Passed |
| R6 | core-backend | `config::storage::tests::test_config_manager_debounced_save` | Passed |
| R8 | core-backend | `tests::test_capabilities_acl_strict_security` | Passed |
| R8 | core-backend | `tests::test_default_config_security_no_hardcoded_secrets` | Passed |
| R8 | core-backend | `tests::test_resolve_paths_security` | Passed |
| R9 | core-backend | `tests::test_all_specta_data_models_deserialization_safety` | Passed |
| R9 | core-backend | `geo::tests::test_geo_location_struct` | Passed |
| R9 | core-backend | `geo::tests::test_geo_location_extreme_coordinates` | Passed |
| R9 | core-backend | `geo::tests::test_geo_location_invalid_json` | Passed |
| R1 | widgets-frontend | `src/test/app.test.tsx::App & AppContent Routing > routes to dedicated Resources widget window` | Passed |
| R1 | widgets-frontend | `src/test/app.test.tsx::App & AppContent Routing > routes to dedicated Spotify widget window` | Passed |
| R1 | widgets-frontend | `src/test/app.test.tsx::App & AppContent Routing > routes to dedicated Weather widget window` | Passed |
| R1 | widgets-frontend | `src/test/app.test.tsx::App & AppContent Routing > renders DockContainer when layout_mode is docked` | Passed |
| R1 | widgets-frontend | `src/test/app.test.tsx::App & AppContent Routing > renders multi-widget desktop surface when independent` | Passed |
| R1 | widgets-frontend | `src/test/layout.test.tsx::HeaderBar Component > sets data-tauri-drag-region when not locked` | Passed |
| R1 | widgets-frontend | `src/test/layout.test.tsx::HeaderBar Component > removes data-tauri-drag-region when locked` | Passed |
| R1 | widgets-frontend | `src/test/layout.test.tsx::WidgetContainer Component > renders widget children and header` | Passed |
| R1 | widgets-frontend | `src/test/layout.test.tsx::WidgetContainer Component > applies layoutMode classes for docked vs independent` | Passed |
| R1 | widgets-frontend | `src/components/docking/DockContainer.test.tsx::DockContainer Component > renders dock container` | Passed |
| R1 | widgets-frontend | `src/components/docking/DockContainer.test.tsx::DockContainer Component > switches to independent mode` | Passed |
| R1 | widgets-frontend | `src/test/docking-edge-cases.test.tsx::DockItem Component (R1, R7) > renders header, collapse and hide` | Passed |
| R1 | widgets-frontend | `src/test/docking-edge-cases.test.tsx::DockContainer Edge Cases (R1, R7) > shows empty state when hidden` | Passed |
| R3 | widgets-frontend | `src/widgets/weather/WeatherWidget.test.tsx::WeatherWidget Component > renders current weather details` | Passed |
| R3 | widgets-frontend | `src/widgets/weather/WeatherWidget.test.tsx::WeatherWidget Component > displays offline badge when disconnected` | Passed |
| R3 | widgets-frontend | `src/widgets/weather/WeatherWidget.test.tsx::WeatherWidget Component > switches between hourly and 5-day tabs` | Passed |
| R3 | widgets-frontend | `src/services/weather/openMeteo.test.ts::openMeteo service > parses API response into WeatherData` | Passed |
| R3 | widgets-frontend | `src/services/weather/openMeteo.test.ts::openMeteo service > retrieves and stores cached weather in localStorage` | Passed |
| R3 | widgets-frontend | `src/services/weather/geocoding.test.ts::geocoding service > calls geocoding API and returns city results` | Passed |
| R3 | widgets-frontend | `src/services/weather/wmoCodes.test.ts::wmoCodes > resolves WMO codes into human-readable labels` | Passed |
| R3 | widgets-frontend | `src/test/useWeather.test.ts::useWeather Hook > resolves coordinates via Windows Geolocation` | Passed |
| R3 | widgets-frontend | `src/test/useWeather.test.ts::useWeather Hook > uses explicit coordinates from config` | Passed |
| R3 | widgets-frontend | `src/test/useWeather.test.ts::useWeather Hook > falls back to cached data with isOffline=true` | Passed |
| R3 | widgets-frontend | `src/test/useWeather.test.ts::useWeather Hook > sets error message when network fails and no cache exists` | Passed |
| R4 | widgets-frontend | `src/test/spotify.test.tsx::formatDuration > formats zero and standard timestamps correctly` | Passed |
| R4 | widgets-frontend | `src/test/spotify.test.tsx::TrackProgress Component > renders progress and timestamps properly` | Passed |
| R4 | widgets-frontend | `src/test/spotify.test.tsx::TrackProgress Component > guards against epoch zero` | Passed |
| R4 | widgets-frontend | `src/test/spotify.test.tsx::MediaControls Component > renders controls and handles click events` | Passed |
| R4 | widgets-frontend | `src/test/spotify.test.tsx::SpotifyWidget Component > renders polished idle state when session is inactive` | Passed |
| R4 | widgets-frontend | `src/test/spotify.test.tsx::SpotifyWidget Component > renders active track metadata and controls` | Passed |
| R4 | widgets-frontend | `src/test/spotify.test.tsx::SpotifyWidget Component > falls back to music icon when cover art fails` | Passed |
| R4 | widgets-frontend | `src/test/useMediaPlayback.test.ts::useMediaPlayback Hook > initializes with default session in non-Tauri` | Passed |
| R4 | widgets-frontend | `src/test/useMediaPlayback.test.ts::useMediaPlayback Hook > handles optimistic playPause timeline progress` | Passed |
| R4 | widgets-frontend | `src/test/useMediaPlayback.test.ts::useMediaPlayback Hook > rolls back optimistic playPause on failure` | Passed |
| R4 | widgets-frontend | `src/test/useMediaPlayback.test.ts::useMediaPlayback Hook > handles nextTrack and previousTrack error dispatch` | Passed |
| R5 | widgets-frontend | `src/test/resources.test.tsx::Resource utility functions > converts bytes to gigabytes correctly` | Passed |
| R5 | widgets-frontend | `src/test/resources.test.tsx::MiniGraph component > renders SVG sparkline with correct coordinates` | Passed |
| R5 | widgets-frontend | `src/test/resources.test.tsx::MetricBar component > renders metric label, value and badge percentage` | Passed |
| R5 | widgets-frontend | `src/test/resources.test.tsx::ResourceWidget component > renders CPU, Memory and Disk information` | Passed |
| R5 | widgets-frontend | `src/test/useSystemMetrics.test.ts::useSystemMetrics Hook > initializes with mock data in non-Tauri` | Passed |
| R5 | widgets-frontend | `src/test/useSystemMetrics.test.ts::useSystemMetrics Hook > limits CPU history array to 20 samples maximum` | Passed |
| R5 | widgets-frontend | `src/test/useSystemMetrics.test.ts::useSystemMetrics Hook > handles IPC error and records error message` | Passed |
| R5 | widgets-frontend | `src/test/security-edge-cases.test.tsx::Multi-Disk Interaction in ResourceWidget > switches drives C:, D:, E:` | Passed |
| R5 | widgets-frontend | `src/test/security-edge-cases.test.tsx::Multi-Disk Interaction in ResourceWidget > handles systems with no disks` | Passed |
| R6 | widgets-frontend | `src/test/useSystemMetrics.test.ts::useSystemMetrics Hook > unregisters listener on unmount` | Passed |
| R6 | widgets-frontend | `src/test/useMediaPlayback.test.ts::useMediaPlayback Hook > safely handles refresh in non-Tauri without crashing` | Passed |
| R6 | widgets-frontend | `src/test/useWeather.test.ts::useWeather Hook > aborts pending fetch when hook unmounts` | Passed |
| R7 | widgets-frontend | `src/test/primitives.test.tsx::Card Component > renders acrylic and subtle variants` | Passed |
| R7 | widgets-frontend | `src/test/primitives.test.tsx::ProgressBar Component > renders accessible fluent progress bar` | Passed |
| R7 | widgets-frontend | `src/theme/theme.test.tsx::ThemeProvider & useTheme > applies light and dark mode classes` | Passed |
| R7 | widgets-frontend | `src/test/app.test.tsx::App & AppContent Routing > renders the root App component with ThemeProvider` | Passed |
| R8 | widgets-frontend | `src/test/security-edge-cases.test.tsx::Security & Input Sanitization > escapes XSS in track metadata` | Passed |
| R8 | widgets-frontend | `src/test/security-edge-cases.test.tsx::Security & Input Sanitization > handles corrupted localStorage cache` | Passed |
| R8 | widgets-frontend | `src/test/security-edge-cases.test.tsx::Security & Input Sanitization > handles null/missing payload fields` | Passed |
| R8 | widgets-frontend | `src/test/security-edge-cases.test.tsx::Security & Input Sanitization > handles extreme temperatures & WMO codes` | Passed |
| R9 | widgets-frontend | `src/test/config.test.ts::useConfig hook > loads and updates configuration state` | Passed |
| R9 | widgets-frontend | `src/test/registry.test.ts::registry > provides registered widget metadata` | Passed |
| R9 | widgets-frontend | `src/test/settings.test.tsx::SettingsModal > renders tabs and handles preference inputs` | Passed |

## Bugs found & fixed
| Bug | Root cause | Fix (commit) | Reviewed |
|---|---|---|---|
| `save_config_atomic` and `backup_corrupted_and_reset` fail on bare or relative file paths | `target_path.parent()` returns `Some("")` on paths without directory components; on Windows NTFS, `fs::create_dir_all("")` returns `ArgumentException` / `NotFound` error. | `6710b37` | Pending |
| Unmounted state update and act warnings in `useMediaPlayback` | In non-Tauri environment, `useMediaPlayback` called `refresh()` on mount which unconditionally invoked `get_media_state`, causing unhandled promise rejections and `setIsLoading(false)` on unmounted components. | `c35cc4b` | Pending |

## Coverage summary
- Total `core-backend` tests: 81 passed; 0 failed.
- Total `widgets-frontend` tests: 125 passed; 0 failed across 19 test suites.
- Expanded `widgets-frontend` from 90 baseline tests to 125 tests (+35 tests added).
- Full coverage across:
  - **R1** (Windowing, Snapping & Docking): query route dispatch (`?widget=resources`, `?widget=spotify`, `?widget=weather`, `?view=settings`), docked layout, multi-widget desktop surface, lock toggling, `data-tauri-drag-region` enforcement, dock item collapsible body and empty dock state.
  - **R3** (Weather Widget): current temperature, feels-like, WMO conditions mapping, offline resilience, cached fallback in localStorage, 5-day forecast, 12h trend, Windows Geolocation vs manual city vs coordinate fallback.
  - **R4** (Spotify Controls): media session state, idle vs active presentation, local timeline interpolation, duration formatting, media controls, cover art fallback, optimistic play/pause with rollback.
  - **R5** (System Resources): CPU sparkline graph, RAM and storage GB conversions, multi-drive switching (C:, D:, E:), empty drive array resilience, extreme petabyte sizes.
  - **R6** (Performance & Memory): event listener cleanup on unmount for all hooks (`useMediaPlayback`, `useSystemMetrics`, `useWeather`), abort signal on weather refresh/unmount, non-Tauri preview safety.
  - **R7** (Fluent Design & Theming): light/dark mode DOM tokens, acrylic card styling, Segoe UI typography, smooth progress bars and badges.
  - **R8** (Security & Input Sanitization): strict escaping of malicious XSS payloads in track metadata/artists/albums, resilient handling of corrupted localStorage JSON, missing API attributes, extreme weather codes.
  - **R9** (Code Quality & Types): zero TypeScript errors, zero lint warnings, complete end-to-end integration test coverage.

## Commands to run
- `cargo test --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1`
- `npm.cmd run test`
- `npm.cmd run build`
