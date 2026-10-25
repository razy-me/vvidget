# TODO
Plan Status: APPROVED 2026-10-25   <!-- or: APPROVED <date> -->

## Stack (with justification)
- **Desktop Runtime**: **Tauri v2 (Rust 2021 + Evergreen WebView2)**
  - *Justification*: Unmatched resource efficiency (<90 MB RAM in docked mode, <180 MB in multi-window mode vs 250MB+ for Electron), instant startup, native Win32/WinRT FFI bindings for low-level OS operations (GSMTC, window style flags, tool window manipulation, DWM Acrylic), and built-in Evergreen WebView2 integration on Windows 11.
- **Frontend UI Framework**: **React 19 + TypeScript + Vite**
  - *Justification*: Component-level isolation for each widget, fast HMR development loop, robust TypeScript type safety matching Rust serde types via `tauri-specta`, zero runtime bloat.
- **Styling & Design Tokens**: **Tailwind CSS v4 (`@tailwindcss/vite`) + Custom Fluent Design Tokens**
  - *Justification*: Zero-config Vite integration without separate PostCSS/tailwind config files. Pixel-perfect Windows 11 styling (DWM Acrylic translucent material, rounded corners `8px/12px`, Segoe UI Variable font stack, subtle 1px border strokes), zero-runtime CSS footprint, smooth hardware-accelerated CSS transitions.
- **Backdrop Effect**: **`window-vibrancy` crate (DWM Acrylic)**
  - *Justification*: Windows 11 disables Mica blur on unfocused/inactive (`WS_EX_NOACTIVATE`) windows, causing them to turn into flat gray panels. Acrylic remains translucent and frosted regardless of focus state.
- **Type Safety Pipeline**: **`specta` + `tauri-specta`**
  - *Justification*: Automatically generates TypeScript type definitions and type-safe frontend invoke functions directly from Rust models at build time, eliminating manual type duplication and cross-WP drift.
- **Hardware Metrics**: **`sysinfo` crate (Rust)**
  - *Justification*: Fast, reliable, cross-drive CPU/RAM/Disk polling with <0.1% CPU overhead on a background worker thread using `System::new_with_specifics` (refreshing only CPU, RAM, and Disks, avoiding expensive full-process iteration).
- **Media Controls**: **Windows Runtime (`windows` crate with `Media_Control` APIs)**
  - *Justification*: Native GSMTC integration provides zero-configuration Spotify (Desktop & Web) and system media detection with playback controls and album art streaming, requiring no external OAuth or developer keys.
- **Weather API**: **Open-Meteo API + Open-Meteo Geocoding API + `Windows.Devices.Geolocation`**
  - *Justification*: Primary location resolution via native Windows Location API (zero network lookup), fallback manual city search via Open-Meteo Geocoding API (`geocoding-api.open-meteo.com`), and forecast via Open-Meteo API. Completely free, open-source, no API keys required.
- **Logging & Autostart**: **`tauri-plugin-log` & `tauri-plugin-autostart`**
  - *Justification*: Official, tested Tauri plugins for rotating disk logs in `%APPDATA%/Widgetz/logs/` and clean Windows autostart management without fragile registry hacks.
- **Icons**: **`lucide-react`**
  - *Justification*: Modern, lightweight SVG iconography fitting the clean Windows 11 aesthetic.

## Architecture

The application adopts a decoupled, event-driven architecture between the high-performance Rust backend and the lightweight React frontend widget views:

```mermaid
graph TD
    subgraph Windows 11 OS Layer
        Win32[Win32 API: WM_MOVING Snapping, WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE]
        WinD[Win+D Protection: WM_WINDOWPOSCHANGING Subclassing]
        Vibrancy[window-vibrancy: DWM Acrylic]
        WinRT_Media[WinRT: Windows.Media.Control GSMTC]
        WinRT_Geo[WinRT: Windows.Devices.Geolocation]
        SysAPI[OS Hardware & Disks: sysinfo specific refresh]
        AppFs[%APPDATA%/Widgetz/config.json]
        LogFs[%APPDATA%/Widgetz/logs/widgetz.log]
    end

    subgraph Tauri Core Backend (Rust)
        ACL[Tauri v2 Capabilities: default.json]
        LogPlugin[tauri-plugin-log]
        AutoPlugin[tauri-plugin-autostart]
        TrayMgr[Tray Manager & Context Menu]
        WinMgr[Window Engine & Win32 Hook]
        CfgMgr[Config Manager: Atomic JSON I/O & Safe Fallback]
        SysWorker[System Metrics Poller Worker]
        MediaWorker[GSMTC Media Controller & Custom URI Protocol]
        GeoWorker[Geolocation Controller]
    end

    subgraph WebView2 Presentation Layer (React + Vite)
        SpectaTypes[Auto-generated TS Bindings: bindings.ts]
        Router[Widget Router & Registry]
        UIPrims[UI Primitives: Card, ProgressBar, Badge, Tooltip]
        WeatherW[Weather Widget]
        SpotifyW[Spotify Controls Widget + Client Timeline Interpolation]
        ResourceW[Resource Usage Widget]
        SettingsUI[Settings Modal: Lazy Loaded & Destroyed on Close]
    end

    Win32 --> WinMgr
    WinD --> WinMgr
    Vibrancy --> WinMgr
    WinRT_Media --> MediaWorker
    WinRT_Geo --> GeoWorker
    SysAPI --> SysWorker
    AppFs <--> CfgMgr
    LogPlugin --> LogFs
    ACL --> WinMgr

    TrayMgr <--> WinMgr
    WinMgr --> Router
    CfgMgr <--> Router
    SpectaTypes --> Router
    UIPrims --> WeatherW
    UIPrims --> SpotifyW
    UIPrims --> ResourceW
    SysWorker -->|Tauri Event: metrics-update| ResourceW
    MediaWorker -->|Tauri Event: media-metadata-update| SpotifyW
    MediaWorker -->|Custom URI: widgetz://album-art| SpotifyW
    Router --> WeatherW
    Router --> SpotifyW
    Router --> ResourceW
    TrayMgr -->|On-demand spawn| SettingsUI
```

### Key Architectural Concepts
1. **Multi-Window & Docked Desktop Surface**: Widgets can run as independent frameless, transparent Tauri windows with `WS_EX_TOOLWINDOW` and `WS_EX_NOACTIVATE` (preventing Alt+Tab clutter and focus stealing), or docked into a single unified desktop stack for ultra-low memory usage (<90 MB RAM).
2. **Win + D (Show Desktop) Minimization Protection**: Widgets hook `WM_WINDOWPOSCHANGING` in native Win32 or attach to the desktop worker layer, ensuring widgets remain visible on the desktop canvas when the user minimizes all windows via `Win + D`.
3. **Hardware-Smooth Native Snapping**: Magnetic edge and widget-to-widget snapping is computed directly in the native Win32 window procedure via the `WM_MOVING` message handler, altering the `LPRECT` coordinates in OS memory without React IPC lag or visual jitter.
4. **DWM Acrylic Blur (Overcoming Mica Limitations)**: Mica automatically turns into an opaque gray surface when a window is not active (`WS_EX_NOACTIVATE`). The window engine applies genuine DWM Acrylic through `window-vibrancy`, preserving translucent frosted glass aesthetics.
5. **Decoupled Album Art & Client-Side Timeline Interpolation**:
   - Track progress is not streamed every second from Rust. The frontend interpolates playback position locally from `lastUpdatedSystemTimeMs` + `positionMs` at 60fps while `isPlaying === true`.
   - Album artwork is delivered over a custom Tauri protocol (`widgetz://album-art?t=<trackId>`) directly into the `<img>` element as a binary stream, completely eliminating heavy Base64 JSON IPC overhead.
6. **Settings Window Lifecycle & Input Focus**: The Settings modal is lazily created on demand from the tray menu and completely destroyed (`window.destroy()`) on close to prevent background memory leakage. Settings retains standard focus activation (never `WS_EX_NOACTIVATE`), enabling full keyboard input for city searches.
7. **Multi-Monitor DPI Normalization**: `WidgetPlacement` stores explicit `LogicalPosition`, `scaleFactor`, and `monitorId` / `monitorName`. Window restoration clamps coordinates using `window.available_monitors()` to prevent widgets from spawning off-screen after display reconfiguration.

## Folder Layout
```
c:\Widgetz\
├── docs\
│   └── agents\
│       ├── SPEC.md
│       ├── TODO.md
│       ├── CONTEXT.md
│       └── DECISIONS.md
├── src-tauri\
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities\
│   │   └── default.json
│   ├── icons\
│   └── src\
│       ├── main.rs
│       ├── lib.rs
│       ├── config\
│       │   ├── mod.rs
│       │   ├── model.rs
│       │   └── storage.rs
│       ├── window\
│       │   ├── mod.rs
│       │   ├── win32.rs
│       │   └── manager.rs
│       ├── tray\
│       │   └── mod.rs
│       ├── sysinfo\
│       │   ├── mod.rs
│       │   ├── collector.rs
│       │   └── model.rs
│       ├── media\
│       │   ├── mod.rs
│       │   ├── gsmtc.rs
│       │   ├── protocol.rs
│       │   └── model.rs
│       └── geo\
│           ├── mod.rs
│           └── winrt.rs
├── src\
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── bindings.ts             <!-- Auto-generated by tauri-specta -->
│   ├── types\
│   │   ├── config.ts
│   │   ├── resources.ts
│   │   ├── media.ts
│   │   ├── weather.ts
│   │   └── window.ts
│   ├── styles\
│   │   └── fluent.css
│   ├── components\
│   │   ├── ui\
│   │   │   ├── Card.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Tooltip.tsx
│   │   └── layout\
│   │       ├── WidgetContainer.tsx
│   │       └── HeaderBar.tsx
│   ├── hooks\
│   │   ├── useConfig.ts
│   │   ├── useSystemMetrics.ts
│   │   ├── useMediaPlayback.ts
│   │   └── useWeather.ts
│   ├── services\
│   │   └── weather\
│   │       ├── openMeteo.ts
│   │       ├── geocoding.ts
│   │       └── wmoCodes.ts
│   ├── widgets\
│   │   ├── registry.ts
│   │   ├── resources\
│   │   │   ├── ResourceWidget.tsx
│   │   │   ├── MetricBar.tsx
│   │   │   └── MiniGraph.tsx
│   │   ├── spotify\
│   │   │   ├── SpotifyWidget.tsx
│   │   │   ├── MediaControls.tsx
│   │   │   └── TrackProgress.tsx
│   │   └── weather\
│   │       ├── WeatherWidget.tsx
│   │       ├── HourlyTrend.tsx
│   │       └── DailyForecast.tsx
│   └── pages\
│       └── settings\
│           ├── SettingsModal.tsx
│           └── WidgetToggleList.tsx
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Data Model

### 1. App Configuration (`AppConfig`)
```rust
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WidgetPlacement {
    pub id: String,
    pub visible: boolean,
    pub logical_x: f64,
    pub logical_y: f64,
    pub logical_width: f64,
    pub logical_height: f64,
    pub scale_factor: f64,
    pub monitor_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PollingRates {
    pub resources_cpu_ram_ms: u64, // default: 1500
    pub resources_disk_ms: u64,    // default: 15000
    pub weather_minutes: u64,      // default: 30
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct WeatherSettings {
    pub use_windows_location: bool,
    pub manual_city: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AppConfig {
    pub version: u32,
    pub lock_positions: bool,
    pub always_on_top: bool,
    pub snap_to_edges: bool,
    pub layout_mode: String, // "independent" | "docked"
    pub auto_start: bool,
    pub theme: String, // "auto" | "light" | "dark"
    pub polling_rates: PollingRates,
    pub weather_settings: WeatherSettings,
    pub widgets: std::collections::HashMap<String, WidgetPlacement>,
}
```

### 2. System Resource Metrics (`SystemMetrics`)
```rust
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct DiskMetric {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub used_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct MemoryMetric {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub used_percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct SystemMetrics {
    pub cpu_usage_percent: f32,
    pub cpu_cores: usize,
    pub memory: MemoryMetric,
    pub disks: Vec<DiskMetric>,
    pub timestamp_ms: u64,
}
```

### 3. Media Session (`MediaSession`)
```rust
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct MediaTimeline {
    pub position_ms: u64,
    pub duration_ms: u64,
    pub last_updated_system_time_ms: u64, // Enables client-side interpolation
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct MediaSession {
    pub is_active: bool,
    pub is_playing: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_id: Option<String>,
    pub timeline: MediaTimeline,
    pub album_art_url: Option<String>, // "widgetz://album-art?t=<track_id>"
    pub can_play_pause: bool,
    pub can_skip_next: bool,
    pub can_skip_previous: bool,
    pub source_app: String,
}
```

### 4. Weather Data (`WeatherData`)
```typescript
export interface WeatherCondition {
  code: number;
  label: string;
  iconName: string;
}

export interface WeatherData {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  current: {
    temperatureC: number;
    feelsLikeC: number;
    condition: WeatherCondition;
    humidity: number;
    windSpeedKmh: number;
  };
  forecastDaily: Array<{
    date: string;
    minTempC: number;
    maxTempC: number;
    condition: WeatherCondition;
  }>;
  forecastHourly: Array<{
    time: string;
    tempC: number;
    condition: WeatherCondition;
  }>;
  isOffline: boolean;
  lastUpdated: string;
}
```

## Module Interfaces (Rust Backend & Tauri IPC)

```rust
// Asynchronous Command Signatures (Direct Tokio/WinRT async)
#[tauri::command]
#[specta::specta]
pub async fn load_config() -> Result<AppConfig, String>;

#[tauri::command]
#[specta::specta]
pub async fn save_config(config: AppConfig) -> Result<(), String>;

#[tauri::command]
#[specta::specta]
pub async fn get_system_metrics() -> Result<SystemMetrics, String>;

#[tauri::command]
#[specta::specta]
pub async fn get_media_state() -> Result<MediaSession, String>;

#[tauri::command]
#[specta::specta]
pub async fn media_play_pause() -> Result<(), String>;

#[tauri::command]
#[specta::specta]
pub async fn media_next_track() -> Result<(), String>;

#[tauri::command]
#[specta::specta]
pub async fn media_previous_track() -> Result<(), String>;

#[tauri::command]
#[specta::specta]
pub async fn get_windows_location() -> Result<(f64, f64), String>;

#[tauri::command]
#[specta::specta]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String>;

#[tauri::command]
#[specta::specta]
pub async fn set_widgets_locked(app: AppHandle, locked: bool) -> Result<(), String>;
```

---

## Work Packages

### WP-00 Scaffolding, Complete Dependencies & UI Primitives  [x] status: approved
- **Covers**: R6, R7, R8, R9
- **Owns**:
  - Root config files: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `.gitignore`, `.env.example`
  - Tauri config: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` (initial modular skeleton)
  - UI foundation: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/styles/fluent.css`, `src/components/ui/**` (`Card.tsx`, `ProgressBar.tsx`, `Badge.tsx`, `Tooltip.tsx`), `src/widgets/registry.ts`
  - Documentation: `docs/agents/CONTEXT.md`
- **Depends on**: —
- **Parallel group**: A
- **Acceptance criteria**:
  - `Cargo.toml` comprehensively defines **all** crates and feature flags upfront so Group B/C never touch it:
    - `tauri` v2 (with protocol and devtools features)
    - `windows` v0.58+ with features: `Win32_UI_WindowsAndMessaging`, `Win32_Graphics_Gdi`, `Win32_Foundation`, `Win32_System_LibraryLoader`, `Win32_UI_Shell`, `Media_Control`, `Storage_Streams`, `Devices_Geolocation`
    - `sysinfo` v0.33+, `window-vibrancy` v0.5+, `tauri-plugin-log` v2, `tauri-plugin-autostart` v2
    - `specta` v2, `tauri-specta` v2, `serde`, `serde_json`, `tokio` (full)
  - `src-tauri/capabilities/default.json` properly grants window, event, and custom protocol permissions.
  - Tailwind CSS v4 configured via `@tailwindcss/vite` in `vite.config.ts` (no `postcss.config.js` or `tailwind.config.ts`).
  - Release profile configured in `Cargo.toml` (`opt-level = "z"`, `lto = true`, `panic = "abort"`, `strip = true`).
  - Foundational UI primitives (`Card`, `ProgressBar`, `Badge`, `Tooltip`) styled with Windows 11 Fluent tokens.
  - `npm.cmd run build` and `cargo check` compile cleanly.
  - `docs/agents/CONTEXT.md` populated with stack versions, commands, conventions, module registration patterns, and folder structure.

### WP-01 Desktop Window Engine, Win32 Hooks & Magnetic Snapping  [x] status: approved
- **Covers**: R1, R6, R7
- **Owns**: `src-tauri/src/window/**`, `src/components/layout/**`, `src/types/window.ts`
- **Depends on**: WP-00
- **Parallel group**: B
- **Acceptance criteria**:
  - Frameless, transparent windows created with native DWM Acrylic blur backdrop via `window-vibrancy`.
  - `WS_EX_TOOLWINDOW` and `WS_EX_NOACTIVATE` applied via Win32 API to display widget windows (preventing Alt+Tab clutter and focus stealing).
  - `Win + D` (Show Desktop) minimization protection: sub-classed window proc hooks `WM_WINDOWPOSCHANGING` to suppress minimization.
  - Magnetic edge and widget-to-widget snapping implemented in Rust via the Win32 `WM_MOVING` hook, adjusting `LPRECT` directly in OS memory without React IPC lag or drag jitter.
  - Multi-monitor DPI scaling support: converts logical positions to physical coordinates respecting monitor scale factors.
  - Off-screen protection: coordinates validated and clamped against active display bounds queried via `window.available_monitors()`.

### WP-02 Persistent Configuration, System Tray & Settings Lifecycle  [x] status: approved
- **Covers**: R2, R8, R9
- **Owns**: `src-tauri/src/config/**`, `src-tauri/src/tray/**`, `src/pages/settings/**`, `src/types/config.ts`, `src/hooks/useConfig.ts`
- **Depends on**: WP-00
- **Parallel group**: B
- **Acceptance criteria**:
  - Atomic config write to `%APPDATA%/Widgetz/config.json` with 500ms movement debounce.
  - Corrupt config fallback: if JSON is invalid or unreadable, rename to `.corrupt.<timestamp>` and restore defaults cleanly without crashing.
  - System Tray icon loaded with native context menu: Toggle Lock Positions, Widget visibility toggles, Layout Mode (Independent / Docked), Settings, View Logs, Quit.
  - Settings Modal lifecycle: lazy-loaded on demand from tray, fully destroyed (`window.destroy()`) on close to free WebView2 RAM.
  - Settings Modal uses standard activation/focus (never `WS_EX_NOACTIVATE`), allowing keyboard input for city search and config fields.
  - Autostart with Windows toggle powered by `tauri-plugin-autostart`.
  - Unit tests for JSON config serialization/deserialization and corrupt file recovery.

### WP-03 System Resource Utilization Widget  [x] status: approved
- **Covers**: R5, R6, R7, R9
- **Owns**: `src-tauri/src/sysinfo/**`, `src/widgets/resources/**`, `src/types/resources.ts`, `src/hooks/useSystemMetrics.ts`
- **Depends on**: WP-00
- **Parallel group**: C
- **Acceptance criteria**:
  - Rust collector initializes via `System::new_with_specifics()` refreshing only CPU, RAM, and Disks (excluding full-process iteration).
  - Initial 200ms sleep before first CPU sample to eliminate 0.0% artifacts.
  - Background thread emits metrics updates via Tauri event `metrics-update` (CPU/RAM default 1.5s, Disks 15s).
  - UI uses `Card`, `ProgressBar`, `Badge` from WP-00:
    - CPU percentage with mini trend sparkline.
    - RAM in `Used GB / Total GB` with progress ring/bar and percentage.
    - Disk usage for system drive `C: Used GB / Total GB` and percentage.
  - Idle CPU footprint < 0.2%.
  - Unit tests for sysinfo collector data transformations and byte-to-GB formatting.

### WP-04 Spotify Playback Controls Widget (GSMTC & Custom Protocol)  [x] status: approved
- **Covers**: R4, R6, R7, R8, R9
- **Owns**: `src-tauri/src/media/**`, `src/widgets/spotify/**`, `src/types/media.ts`, `src/hooks/useMediaPlayback.ts`
- **Depends on**: WP-00
- **Parallel group**: C
- **Acceptance criteria**:
  - WinRT GSMTC (`Windows.Media.Control`) listener queries media sessions asynchronously.
  - Priority session filtering: checks for Spotify `SourceAppUserModelId`, falls back to active system media session.
  - Asynchronous IPC commands: `media_play_pause`, `media_next_track`, `media_previous_track` defined as async Tokio futures.
  - Custom URI Protocol `widgetz://album-art?t=<trackId>` serves binary album cover stream directly from memory cache, avoiding Base64 JSON IPC overhead.
  - Decoupled timeline: emits `media-metadata-update` only on track/state changes; frontend `TrackProgress.tsx` smoothly interpolates progress from `lastUpdatedSystemTimeMs` + `positionMs` at 60fps while `isPlaying === true`.
  - Polished idle state when Spotify/media is closed or inactive.
  - Unit/mock tests verifying media session state machine and playback commands.

### WP-05 Weather Widget (Open-Meteo & Geolocation)  [x] status: approved
- **Covers**: R3, R7, R8, R9
- **Owns**: `src-tauri/src/geo/**`, `src/widgets/weather/**`, `src/services/weather/**`, `src/types/weather.ts`, `src/hooks/useWeather.ts`
- **Depends on**: WP-00
- **Parallel group**: C
- **Acceptance criteria**:
  - Primary location lookup via native Windows Location API (`Windows.Devices.Geolocation`) in Rust backend.
  - Manual city search via Open-Meteo Geocoding API (`geocoding-api.open-meteo.com`) in Settings.
  - Weather forecast queries Open-Meteo API for current temperature (°C), feels-like, WMO weather codes, and daily/hourly forecast.
  - Caches last successful weather data; shows subtle offline badge if network fails.
  - UI uses `Card`, `Badge` from WP-00; displays hourly trend and high/low daily temperatures.
  - Unit tests for WMO code mapping, weather response parser, and temperature formatting.

### WP-06 Fluent Design Theme, Snapping & Integration  [x] status: approved
- **Covers**: R1, R6, R7, R9
- **Owns**: `src-tauri/src/lib.rs` (integration pass), `src/App.tsx` (route integration), `src/components/docking/**`, `src/theme/**`
- **Depends on**: WP-01, WP-02, WP-03, WP-04, WP-05
- **Parallel group**: D
- **Acceptance criteria**:
  - Full Windows 11 Fluent aesthetic: DWM Acrylic translucent backdrop with subtle borders (`rgba(255, 255, 255, 0.08)` / `rgba(0, 0, 0, 0.08)`), rounded corners, Segoe UI Variable typography.
  - Auto-adapts to Windows 11 Light/Dark system theme with manual override in settings.
  - Dual layout mode verified: independent multi-window mode AND docked desktop dock mode.
  - Memory budget verified: < 90 MB RAM in docked mode, < 180 MB in multi-window mode.
  - End-to-end multi-widget launch verified from System Tray.

### WP-07 Native Desktop Grid Alignment & Fluid Drag-and-Drop  [x] status: approved
- **Covers**: R10
- **Owns**: `src-tauri/src/window/win32.rs`, `src-tauri/src/window/snapping.rs`, `src-tauri/src/config/model.rs`, `src-tauri/src/config/storage.rs`, `src-tauri/src/lib.rs`, `src/hooks/useGridDrag.ts`, `src/components/layout/HeaderBar.tsx`, `src/components/layout/WidgetContainer.tsx`
- **Depends on**: WP-06
- **Parallel group**: E
- **Acceptance criteria**:
  - Calibrate desktop icon grid to 120 × 98 logical pixels (240 × 196 physical pixels at 200% DPI), with dynamic query `get_desktop_grid_metrics` from Win32 `SysListView32` (`LVM_GETITEMSPACING`).
  - Standardized widget dimensions matching exact integer grid spans:
    - Spotify / Media Controls: 3 × 3 cells (360 × 294 logical px)
    - System Resources: 3 × 4 cells (360 × 392 logical px)
    - Weather Forecast: 3 × 5 cells (360 × 490 logical px)
  - Self-healing configuration migration in `storage.rs` upgrading existing widgets to 120 × 98 grid multiples and new heights.
  - Smooth 1:1 real-time drag tracking during pointer move (`useGridDrag.ts`), with snap-on-release to the nearest desktop grid cell.
  - Visual elevation feedback while dragging (active shadow / border accent).
  - Screen / work area bounds clamping preventing dragging offscreen or under the taskbar.

---

## Phase Status
- [x] Phase 1 Plan  - [x] Phase 2 Build  - [x] Phase 3 Test  - [x] Phase 4 Review

---

## Plan Changelog

### 2026-10-25 — Plan Review Updates (Addressing 6 Runtime & Architecture Realities)
1. **Memory Budget Adjustment & Lazy-Loading**:
   - Adjusted RAM budget to realistic limits: < 90 MB RAM in docked mode, < 180 MB in multi-window mode.
   - Settings window is lazy-loaded on demand and completely destroyed on close (`window.destroy()`) to prevent persistent WebView2 overhead.
   - Configured `ICoreWebView2_13::MemoryUsageTargetLevel = Low` for background widget views.
2. **Win + D & Focus Management**:
   - Protected widgets from `Win + D` minimization by subclassing `WM_WINDOWPOSCHANGING`.
   - `WS_EX_NOACTIVATE` applied strictly to display widgets, preserving normal focus and keyboard interaction on the Settings modal.
3. **DWM Acrylic via `window-vibrancy`**:
   - Switched from Mica to DWM Acrylic blur backdrop, as Windows 11 turns Mica into an opaque gray surface when windows are unfocused.
4. **Decoupled Album Art Protocol & Client-Side Timeline Interpolation**:
   - Added custom Tauri URI protocol `widgetz://album-art` for binary cover streaming, eliminating Base64 JSON IPC overhead.
   - Progress bar interpolates locally in React from `lastUpdatedSystemTimeMs` + `positionMs` at 60fps without high-frequency IPC spam.
5. **End-to-End Type Safety & Dependency Isolation**:
   - Integrated `tauri-specta` / `specta` to generate TypeScript types directly from Rust models at compile time.
   - All crates and `windows` feature flags (`Win32_UI_WindowsAndMessaging`, `Media_Control`, `Devices_Geolocation`, etc.) added upfront to WP-00's `Cargo.toml`.
   - Replaced IP geolocation with native `Windows.Devices.Geolocation` and Open-Meteo Geocoding API.
6. **Tailwind CSS v4 & Native Win32 Snapping**:
   - Upgraded to Tailwind CSS v4 via `@tailwindcss/vite`.
   - Moved magnetic edge and widget-to-widget snapping from React hooks into native Win32 `WM_MOVING` window procedure hook.
   - Optimized `sysinfo` with `System::new_with_specifics()` and a 200ms initial sleep to prevent 0.0% CPU artifacts.
   - Added `src-tauri/capabilities/default.json` to WP-00 ownership.
