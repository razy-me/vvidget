# TODO
Plan Status: APPROVED 2026-10-25

## Architecture & Design
- **Base Widget Resolution**: `resolveBaseWidgetType(widgetId)` extracts base identifiers (`quick_settings_abc` -> `quick_settings`).
- **Data Persistence**: `AppConfig` expanded with `launcher_items`, `quick_settings_instances`, `calendar_events`, `speedtest_history`.
- **Hardware & Native OS Access**:
  - Speedtest: Native async Tokio HTTP worker testing latency and streaming chunks against Cloudflare endpoints.
  - Game Launcher: Native Rust VDF (`libraryfolders.vdf`, `appmanifest_*.acf`) parser and Epic JSON parser + Win32 `ShellExecuteW`.
  - Bluetooth: WinRT `DeviceInformation::FindAllAsyncAqsFilter` filtering Bluetooth devices.
  - Battery: WinRT `Windows.Devices.Power.Battery::AggregateBattery()` with sliding-window capacity drain rate computation.
  - Volume Control: Win32 Core Audio `IMMDeviceEnumerator` -> `IAudioEndpointVolume` for master volume & mute.
  - Network Metrics: `sysinfo::Networks` capturing total transmitted/received bytes per interval.

## Work Packages

### Wave 1: Core Foundation & Existing Widget Polish (Independent / Parallel)
- [x] **WP-01: Multi-Instance Registry, Config Models & IPC Foundation**
  - **Files**: `src/widgets/registry.ts`, `src/types/config.ts`, `src-tauri/src/config/model.rs`, `src-tauri/src/lib.rs`, `src/test/registry.test.ts`
  - **Scope**: Register all 10 widgets (`resources`, `spotify`, `weather`, `speedtest`, `launcher`, `quick_settings`, `calendar`, `clock`, `bluetooth`, `battery`). Add `resolveBaseWidgetType`, default grid placements, config fields for launcher/quick settings/calendar/speedtest, and IPC commands `duplicate_quick_settings_widget` & `remove_widget_instance`.
  - **Acceptance**: `cargo test` and `npm.cmd run test src/test/registry.test.ts` pass with all 10 widgets recognized and dynamic cloning supported.

- [x] **WP-02: Native Design Polish & Upgrades for Spotify (Media Controls)**
  - **Files**: `src-tauri/src/audio/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/spotify/SpotifyWidget.tsx`, `src/widgets/spotify/MediaControls.tsx`, `src/widgets/spotify/TrackProgress.tsx`, `src/test/spotify.test.tsx`
  - **Scope**: Add Win32 `IAudioEndpointVolume` IPC (`get_master_volume`, `set_master_volume`, `toggle_master_mute`). Remove icon colored background; add master volume slider + mute button in footer; clickable timeline seekbar; German locale idle state.
  - **Acceptance**: `npm.cmd run test src/test/spotify.test.tsx` passes; volume slider controls audio in native Windows.

- [x] **WP-03: Native Design Polish & Upgrades for Resources (System Monitor)**
  - **Files**: `src-tauri/src/sysinfo/mod.rs`, `src-tauri/src/sysinfo/model.rs`, `src/widgets/resources/ResourceWidget.tsx`, `src/widgets/resources/MiniGraph.tsx`, `src/widgets/resources/MetricBar.tsx`, `src/test/resources.test.tsx`
  - **Scope**: Add Network I/O (`rx_bytes_per_sec`, `tx_bytes_per_sec`) and Top CPU process detection in `sysinfo`. Remove sub-card border strokes (glass fill only); thinner 1.5px sparkline; pill-shaped disk mount selector; display Network throughput and top process badge.
  - **Acceptance**: `npm.cmd run test src/test/resources.test.tsx` passes with Network I/O and top process visible.

- [x] **WP-04: Native Design Polish & Upgrades for Weather Forecast**
  - **Files**: `src/services/weather/openMeteo.ts`, `src/types/weather.ts`, `src/widgets/weather/WeatherWidget.tsx`, `src/widgets/weather/HourlyTrend.tsx`, `src/widgets/weather/DailyForecast.tsx`, `src/test/weather.test.tsx`
  - **Scope**: Fetch UV index, precipitation probability (`%`), and sunrise/sunset from Open-Meteo. Bare 40×40px weather icon (remove border-box); pill-shaped tab group; remove hourly card borders; add UV badge, rain probability, and sunrise/sunset caption.
  - **Acceptance**: `npm.cmd run test src/test/weather.test.tsx` passes; UV and rain metrics render cleanly.

### Wave 2: New Standalone Widgets (Independent / Parallel)
- [x] **WP-05: Internet Speedtest Widget (`speedtest`)**
  - **Files**: `src-tauri/src/speedtest/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/speedtest/SpeedtestWidget.tsx`, `src/hooks/useSpeedtest.ts`, `src/test/speedtest.test.tsx`
  - **Scope**: Native async Ping/Jitter/Download/Upload testing against Cloudflare speed endpoints with live progress events. Gauge/sparkline visualizer and last 5 test runs history.
  - **Acceptance**: Test suite passes; speedtest runs smoothly without freezing UI or IPC.

- [x] **WP-06: Game & App Launcher Widget (`launcher`)**
  - **Files**: `src-tauri/src/launcher/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/launcher/GameLauncherWidget.tsx`, `src/hooks/useLauncher.ts`, `src/test/launcher.test.tsx`
  - **Scope**: Auto-discovery of Steam (`libraryfolders.vdf`, `appmanifest_*.acf`) & Epic Games (`*.item`) manifests. Add custom apps/URLs dialog. Search filter, category filters, and 1-click launch via `ShellExecuteW` / URI.
  - **Acceptance**: Test suite passes; Steam/Epic manifests parse cleanly without crashes.

- [x] **WP-07: Infinite Quick Settings Widget (`quick_settings`)**
  - **Files**: `src-tauri/src/actions/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/quick-settings/QuickSettingsWidget.tsx`, `src/test/quickSettings.test.tsx`
  - **Scope**: Multi-instance Quick Settings widget with customizable tiles (Sound, Bluetooth, Display, Night Light, Network, Energy, Task Manager, Recycle Bin, Custom Paths) and "+ Duplizieren" button.
  - **Acceptance**: Test suite passes; duplicating spawns independent configured instances.

- [x] **WP-08: Calendar & Clock/Timer Widgets (`calendar`, `clock`)**
  - **Files**: `src/widgets/calendar/CalendarWidget.tsx`, `src/widgets/clock/ClockWidget.tsx`, `src/test/calendar.test.tsx`, `src/test/clock.test.tsx`
  - **Scope**: Calendar with ISO week numbers (KW), today highlight, and per-day notes. Clock with World Clock, Countdown Timer, Stopwatch (laps), and daily Alarms.
  - **Acceptance**: Both calendar and clock unit tests pass.

- [x] **WP-09: Bluetooth Device Manager Widget (`bluetooth`)**
  - **Files**: `src-tauri/src/bluetooth/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/bluetooth/BluetoothWidget.tsx`, `src/test/bluetooth.test.tsx`
  - **Scope**: WinRT Bluetooth device enumeration, connection status, category icon, battery level, quick-link to `ms-settings:bluetooth`. Friendly empty state.
  - **Acceptance**: Test suite passes; gracefully handles missing Bluetooth adapters.

- [x] **WP-10: Laptop Battery & Power Analytics Widget (`battery`)**
  - **Files**: `src-tauri/src/battery/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/battery/BatteryWidget.tsx`, `src/hooks/useBattery.ts`, `src/test/battery.test.tsx`
  - **Scope**: WinRT `Windows.Devices.Power.Battery` integration. Sliding-window drain rate (`%/min`), time remaining until 10%/20%/0%, capacity sparkline, charging mode badge, high-drain warning with top-process name. Auto-hides on desktop systems without batteries.
  - **Acceptance**: Test suite passes; rate calculations and desktop fallback verified.

### Wave 3: Integration & System Handover
- [x] **WP-11: Multi-Window Shell, Dock, Settings & Tray Integration**
  - **Files**: `src/App.tsx`, `src/components/docking/DockContainer.tsx`, `src/pages/settings/SettingsModal.tsx`, `src-tauri/src/tray/mod.rs`, `src/test/app.test.tsx`
  - **Scope**: Wire all 10 widgets + dynamic `quick_settings_<id>` instances into `App.tsx` router, `DockContainer.tsx`, Settings widget gallery, and System Tray menu.
  - **Acceptance**: Full Vitest test suite (`npm.cmd run test`), Cargo test suite (`cargo test`), and `npx.cmd tauri build --no-bundle` succeed.
