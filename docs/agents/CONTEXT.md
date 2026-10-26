# CONTEXT (keep ≤300 lines, signatures not implementations)

## Stack & Versions
- **Runtime & Backend**: Tauri v2.12+ (Rust 2021 edition)
- **Frontend Framework**: React 19 + TypeScript 5.7+
- **Bundler & Tooling**: Vite 6.1+
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`) + Windows 11 Fluent Tokens (`src/styles/fluent.css`)
- **Native OS FFI**: `windows` crate v0.58 (GSMTC `Media_Control`, Geolocation, Win32 windowing, DWM Acrylic)
- **Effects & Hardware**: `window-vibrancy` v0.5.2 (Acrylic blur), `sysinfo` v0.33 (system metrics)
- **Type Safety**: `specta` v2.0.0-rc.20 + `tauri-specta` v2.0.0-rc.20
- **Testing**: `vitest` v3.0+ with `@testing-library/react` and `jsdom`

## Commands
- **Install**: `npm.cmd install`
- **Dev**: `npm.cmd run tauri dev` (or `npm.cmd run dev` for web UI preview)
- **Build**: `npm.cmd run build` (runs `tsc && vite build`) & `cargo build --manifest-path src-tauri/Cargo.toml --release`
- **Lint / Typecheck**: `npm.cmd run lint` (runs `tsc --noEmit`) & `cargo check --manifest-path src-tauri/Cargo.toml`
- **Test**: `npm.cmd run test` (runs `vitest run`) & `cargo test --manifest-path src-tauri/Cargo.toml`

## Folder Map
```
c:\vvidget\
├── docs\agents\               # Specifications, plans, decisions, context
├── src-tauri\
│   ├── Cargo.toml             # Comprehensive dependencies, Windows Win32/WinRT features
│   ├── build.rs               # Tauri build hooks
│   ├── tauri.conf.json        # Tauri v2 configuration (windows, permissions, protocol)
│   ├── capabilities\          # Tauri security capability ACL
│   │   └── default.json
│   ├── icons\                 # Application icons (icon.ico, icon.png)
│   └── src\
│       ├── main.rs            # Entry point for desktop binary
│       └── lib.rs             # Tauri application setup, plugins, modular commands
├── src\
│   ├── main.tsx               # React 19 DOM root mount
│   ├── App.tsx                # Widget shell & multi-widget routing by ?widget=<id>
│   ├── index.css              # Tailwind v4 import & global styles
│   ├── styles\
│   │   └── fluent.css         # Windows 11 Fluent design tokens (Acrylic, Card, Text)
│   ├── utils\
│   │   └── cn.ts              # Class name merging utility (clsx + tailwind-merge)
│   ├── components\
│   │   └── ui\                # Foundational Fluent UI primitives
│   │       ├── Card.tsx       # Translucent frosted panel with 1px stroke
│   │       ├── ProgressBar.tsx# Smooth animated progress bar with variants & a11y
│   │       ├── Badge.tsx      # Pill status badge with variants & icon slot
│   │       ├── Tooltip.tsx    # Elevating floating tooltip
│   │       └── index.ts
│   ├── widgets\
│   │   └── registry.ts        # Widget definitions, dimensions, and metadata
│   └── test\                  # Vitest test setup and test suites
└── vite.config.ts             # Vite + React + Tailwind v4 + Vitest config
```

## Conventions
- **PowerShell / Windows**: Always invoke `npm.cmd` rather than `npm` on this machine.
- **Styling**: Use Windows 11 Fluent tokens (`--fluent-acrylic-bg`, `--fluent-stroke`, Segoe UI Variable). Acrylic backdrop uses native `window-vibrancy` in Rust; CSS provides translucent fallback.
- **Errors**: Rust returns `Result<T, String>` across Tauri IPC. Frontend wraps calls in try/catch or typed specta bindings.
- **Logging**: Use `tauri-plugin-log` via `log::{info, warn, error}`. Logs write to `%APPDATA%/vvidget/logs/`.
- **Validation**: All IPC and config inputs must be strictly validated before applying.
- **Window Management**: Display widgets must use `WS_EX_TOOLWINDOW` and `WS_EX_NOACTIVATE` to avoid Alt+Tab and focus theft. Settings modal retains standard focus and activation.

## Env Vars
- `VITE_APP_NAME`: Name of the desktop application (default: `vvidget`).
- `VITE_APP_VERSION`: Semantic version string.

## Shared Types / Schemas
- `WidgetId = "weather" | "spotify" | "resources"`
- `WidgetMetadata`: metadata including dimensions, category, title, description in `src/widgets/registry.ts`.
- `AppConfig`: persisted in `%APPDATA%/vvidget/config.json`.
- `SystemMetrics`: CPU, RAM, Disk data emitted via Tauri event `metrics-update`.
- `MediaSession`: GSMTC metadata and playback state emitted via `media-metadata-update`.

## Module: UI Primitives (`src/components/ui`)
- `Card`: `<Card variant="acrylic"|"subtle"|"ghost"|"solid" interactive padded>...</Card>`
- `ProgressBar`: `<ProgressBar value={number} max={100} variant="accent"|"success"|"warning"|"error" size="xs"|"sm"|"md"|"lg" showLabel />`
- `Badge`: `<Badge variant="default"|"accent"|"success"|"warning"|"error"|"outline" size="sm"|"md" icon={node}>...</Badge>`
- `Tooltip`: `<Tooltip content={node} position="top"|"bottom"|"left"|"right" delay={200}>...</Tooltip>`
- **Gotchas**: Acrylic requires transparent window background (`bg-transparent` in body) to allow DWM blur through.

## Module: Widget Registry (`src/widgets/registry.ts`)
- `getWidgetMetadata(id: string): WidgetMetadata | undefined`
- `getAllWidgetMetadata(): WidgetMetadata[]`
- **Gotchas**: All new widgets must register default width/height and min bounds in `WIDGET_REGISTRY`.

## Module: Persistent Configuration (`src-tauri/src/config`, `src/types/config.ts`, `src/hooks/useConfig.ts`)
- `load_config() -> Result<AppConfig, String>`
- `save_config(config: AppConfig) -> Result<(), String>` (debounced by 500ms for movement, emits `"config-changed"`)
- `save_config_immediate(config: AppConfig) -> Result<(), String>`
- `set_widgets_locked(locked: bool) -> Result<(), String>`
- `get_autostart_status() -> Result<bool, String>` & `set_autostart(enabled: bool) -> Result<(), String>`
- `open_logs_folder() -> Result<(), String>`
- `useConfig()`: React hook with optimistic updates, 500ms debounce placement sync, and cross-window `"config-changed"` event listener.
- **Gotchas**: Corrupt config is automatically archived to `%APPDATA%/vvidget/config.json.corrupt.<timestamp>` and default config restored without panicking.

## Module: System Tray & Settings Lifecycle (`src-tauri/src/tray`, `src/pages/settings`)
- `setup_tray(app: &AppHandle) -> Result<TrayIcon, Error>`: Native tray icon with context menu (Lock, Widgets toggles, Layout mode, Settings, Logs, Quit).
- `open_settings_window(app: &AppHandle)`: Lazily creates or focuses settings window. Window is fully destroyed on close (`window.destroy()`) to release WebView2 RAM.
- `SettingsModal`: Fluent UI modal for system preferences, widget toggles, weather city search, and polling rates.
- **Gotchas**: Settings window retains standard focus and activation (never `WS_EX_NOACTIVATE`) so text input focus works properly for city search.

## Module: Desktop Window Engine & Magnetic Snapping (`src-tauri/src/window`, `src/components/layout`, `src/types/window.ts`)
- `WindowManager::new() -> WindowManager`: Coordinates window lifecycle, active widget registry, coordinate clamping, and snapping.
- `WindowManager::setup_widget_window(window: &WebviewWindow, options: WindowSetupOptions) -> Result<(), String>`:
  - Applies native DWM Acrylic blur backdrop via `window-vibrancy`.
  - Applies `WS_EX_TOOLWINDOW` and `WS_EX_NOACTIVATE` via Win32 API.
  - Subclasses `WM_WINDOWPOSCHANGING` to suppress `SWP_HIDEWINDOW` for `Win + D` (Show Desktop) protection.
  - Hooks `WM_MOVING` for zero-IPC OS-level magnetic edge and widget-to-widget snapping.
  - Clamps initial coordinates against active displays via `available_monitors()`.
- `apply_magnetic_snapping(moving: &mut Rect, work_area: &Rect, other_widgets: &[Rect], config: &SnapConfig) -> SnapResult`: Pure magnetic snapping calculation modifying RECT in OS memory.
- `clamp_to_monitors(target: PhysicalRect, monitors: &[MonitorBounds]) -> PhysicalRect`: Multi-monitor DPI aware position clamping preventing off-screen widgets.
- `HeaderBar`: Fluent header with `data-tauri-drag-region` when unlocked, lock/unlock toggle button, and action controls.
- `WidgetContainer`: Fluent container wrapping widgets with Acrylic material, HeaderBar, and docked/independent layout styling.
- **Gotchas**: Common Controls v6 manifest must be linked via `cargo:rustc-link-arg` in `build.rs` to satisfy `TaskDialogIndirect` symbol requirement in MinGW test harness.

## Module: System Resources Monitor (`src-tauri/src/sysinfo`, `src/widgets/resources`, `src/types/resources.ts`, `src/hooks/useSystemMetrics.ts`)
- `MetricsCollector::new() -> MetricsCollector`: Initializes `System::new_with_specifics` refreshing only CPU and Memory with an initial 200ms sleep to eliminate 0.0% CPU artifacts, and initializes `Disks::new_with_refreshed_list()`.
- `collect_metrics(refresh_disks: bool) -> SystemMetrics`: Refreshes CPU/RAM on every interval (default 1.5s) and Disks on disk interval (default 15s).
- `get_system_metrics() -> Result<SystemMetrics, String>`: Tauri IPC command returning cached system resource snapshot.
- `start_metrics_worker(app, config_manager, shared_metrics)`: Spawns dedicated background worker emitting `metrics-update` events.
- `useSystemMetrics()`: Hook providing real-time metrics, 20-sample CPU history, and error recovery.
- `ResourceWidget`: Windows 11 Fluent widget with CPU sparkline trend (`MiniGraph`), memory utilization ring/bar (`MetricBar`), and primary storage drive stats.
- **Gotchas**: Disks refresh is decoupled from CPU/RAM to maintain <0.2% CPU overhead. Disks in `sysinfo` v0.33 use `disks.refresh(true)` instead of legacy `refresh_list()`.

## Module: Spotify Playback Controls (`src-tauri/src/media`, `src/widgets/spotify`, `src/types/media.ts`, `src/hooks/useMediaPlayback.ts`)
- `get_media_state() -> Result<MediaSession, String>`: Returns current active GSMTC media session with priority filtering for Spotify (`SourceAppUserModelId`).
- `media_play_pause() -> Result<(), String>`: Asynchronous toggle for playback state via GSMTC `TryTogglePlayPauseAsync`.
- `media_next_track() -> Result<(), String>` & `media_previous_track() -> Result<(), String>`: Skip controls via GSMTC async APIs.
- `start_media_monitor(app_handle)`: Background worker monitoring GSMTC session changes and emitting `"media-metadata-update"` events only when metadata/state changes.
- `handle_album_art_protocol`: Custom URI scheme `vvidget://album-art?t=<track_id>` serving binary album artwork streams from in-memory cache, bypassing Base64 JSON overhead.
- `useMediaPlayback()`: React hook with optimistic playback state toggling and `"media-metadata-update"` event listener.
- `TrackProgress`: Decoupled 60fps client-side timeline interpolating current position from `last_updated_system_time_ms` + `position_ms` without IPC spam.
- `MediaControls`: Fluent interactive previous/play/pause/next control buttons with accessible aria labels and state disabling.
- `SpotifyWidget`: Fluent Card featuring album art with fallback, track title, artist, album, live progress, controls, and polished idle state when media is inactive.
- **Gotchas**: Reading `GetSessions` on WinRT requires the `"Foundation_Collections"` feature on the `windows` crate. Thumbnails are read via `DataReader` and cached in-memory with a 30-entry cap to prevent memory bloat.

## Module: Weather Widget & Geolocation (`src-tauri/src/geo`, `src/widgets/weather`, `src/services/weather`, `src/types/weather.ts`, `src/hooks/useWeather.ts`)
- `get_windows_location() -> Result<(f64, f64), String>`: Asynchronous query via native WinRT `Windows.Devices.Geolocation::Geolocator`.
- `fetchWeather(lat, lon, city, country)`: Queries Open-Meteo Forecast API with local `localStorage` caching and offline fallback (`isOffline = true`).
- `searchCity(query, count)`: Fast, keyless city search and coordinate resolution via Open-Meteo Geocoding API (`geocoding-api.open-meteo.com`).
- `getWeatherCondition(wmoCode)`: Maps official WMO weather codes (0-99) to human-readable labels and Lucide icon names.
- `useWeather()`: React hook managing native WinRT/geocoded location resolution, polling interval, offline caching, and manual refresh.
- `WeatherWidget`: Fluent Acrylic card displaying current temperature, feels-like, WMO weather icon/label, humidity %, wind speed km/h, location name, offline badge, and toggleable Hourly Trend (next 12h) and 5-Day Daily Forecast.
- **Gotchas**: In `windows` 0.58, `Geocoordinate` retrieves position via `coordinate.Point()?.Position()?` (deprecated direct `Latitude`/`Longitude` properties were removed). If Windows location services are disabled, `useWeather` falls back to manual city geocoding or default coordinates without crashing.

## Module: Fluent Design Theme, Snapping & Integration (`src/theme`, `src/components/docking`, `src/App.tsx`, `src-tauri/src/lib.rs`)
- `ThemeProvider`: Context provider auto-detecting Windows 11 light/dark mode via `window.matchMedia` with manual override ("auto" | "light" | "dark") and applying `.theme-light` / `.theme-dark` DOM tokens.
- `useTheme()`: React hook returning `{ theme, resolvedTheme, setTheme, toggleTheme }`.
- `DockContainer`: Unified desktop dock surface hosting active widgets (`resources`, `spotify`, `weather`), draggable via header with `data-tauri-drag-region`, lock toggle, layout switcher, and individual collapsible `DockItem` sections.
- `AppContent` & `App`: Multi-window query route dispatcher (`?widget=resources`, `?widget=spotify`, `?widget=weather`, `?view=settings`, or default dock/surface).
- `open_widget_window(app, widget_id)`: Launches independent WebviewWindow for specified widget with acrylic blur, Win+D protection, and magnetic snapping.
- `close_widget_window(app, widget_id)`: Destroys independent widget window and unregisters Win32 snapping tracker.
- `sync_widget_windows(app)`: Coordinates active windows between Docked mode (single window) and Independent mode (multi-window), keeping working set RAM strictly within budget (<90 MB docked, <180 MB independent).
- **Gotchas**: To avoid macro export collisions in `lib.rs`, IPC commands are contained within `pub mod integration` and re-exported. All display windows apply transparent background to allow OS DWM Acrylic blur backdrop through.

## Module: Native Desktop Grid Alignment & Fluid Drag-and-Drop (`src-tauri/src/window/win32.rs`, `src-tauri/src/window/snapping.rs`, `src/hooks/useGridDrag.ts`)
- `get_desktop_grid_metrics() -> DesktopGridMetrics`: Dynamic live Win32 query via `SendMessageW(hwnd, LVM_GETITEMSPACING, 0, 0)` on `Progman`/`WorkerW` -> `SHELLDLL_DefView` -> `SysListView32` with fallback to 120 × 98 logical px (240 × 196 physical px @ 200% DPI).
- `SnapConfig::default()`: Configured to 120 × 98 with `SnapConfig::with_dpi(scale)` for multi-monitor scaling.
- Standardized grid widget sizes:
  - Spotify: 3 × 3 cells (360.0 × 294.0 logical px)
  - Resources: 3 × 4 cells (360.0 × 392.0 logical px)
  - Weather: 3 × 5 cells (360.0 × 490.0 logical px)
- Self-healing config migration in `storage.rs`: Migrates legacy/off-grid dimensions and positions to 120.0 and 98.0 multiples.
- `useGridDrag({ widgetId, isLocked, onPositionChange, onDragStateChange })`: Smooth 1:1 real-time drag tracking on pointer move via `setPosition(new LogicalPosition(targetX, targetY))`, work-area bounds clamping preventing offscreen dragging, and snap-on-release on pointer up to nearest grid cell `Math.round(targetX / gridX) * gridX`.
- `HeaderBar` & `WidgetContainer`: Visual elevation and focus styling (`border-[var(--fluent-accent)]`, elevated shadow, `cursor-grabbing`, `data-dragging="true"`).
- **Gotchas**: Desktop listview handle can reside in `WorkerW` when wallpaper slideshows are active, requiring iteration across top-level WorkerW windows if `Progman` does not directly host `SHELLDLL_DefView`.





