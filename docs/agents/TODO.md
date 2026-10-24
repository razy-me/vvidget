# TODO
Plan Status: DRAFT — awaiting user approval   <!-- or: APPROVED <date> -->

## Stack (with justification)
- **Desktop Runtime**: **Tauri v2 (Rust 2021 + WebView2)**
  - *Justification*: Unmatched resource efficiency (<50 MB RAM vs 200MB+ for Electron), instant startup, native Win32/WinRT FFI bindings for low-level OS operations (GSMTC, window style flags, tool window manipulation), and built-in Evergreen WebView2 integration on Windows 11.
- **Frontend UI Framework**: **React 19 + TypeScript + Vite**
  - *Justification*: Component-level isolation for each widget, fast HMR development loop, robust TypeScript type safety matching Rust serde types, zero runtime bloat.
- **Styling & Design Tokens**: **Tailwind CSS v3 + Custom Fluent Design Tokens**
  - *Justification*: Pixel-perfect Windows 11 styling (Mica/Acrylic translucent materials, rounded corners `8px/12px`, Segoe UI Variable font stack, subtle 1px border strokes), zero-runtime CSS footprint, smooth hardware-accelerated CSS transitions.
- **Hardware Metrics**: **`sysinfo` crate (Rust)**
  - *Justification*: Fast, reliable, cross-drive CPU/RAM/Disk polling with <0.1% CPU overhead on a background worker thread.
- **Media Controls**: **Windows Runtime (`windows` crate with `Media_Control` APIs)**
  - *Justification*: Native GSMTC integration provides zero-configuration Spotify (Desktop & Web) and system media detection with playback controls and album art streaming, requiring no external OAuth or developer keys.
- **Weather API**: **Open-Meteo API + IP Geolocation Fallback**
  - *Justification*: Completely free, open-source, no API keys required, rate-limit friendly, global WMO weather code support.
- **Logging & Autostart**: **`tauri-plugin-log` & `tauri-plugin-autostart`**
  - *Justification*: Official, tested Tauri plugins for rotating disk logs in `%APPDATA%/Widgetz/logs/` and clean Windows autostart management without fragile registry hacks.
- **Icons**: **`lucide-react`**
  - *Justification*: Modern, lightweight SVG iconography fitting the clean Windows 11 aesthetic.

## Architecture

The application adopts a decoupled architecture between the high-performance Rust backend and the lightweight React frontend widget views:

```mermaid
graph TD
    subgraph Windows 11 OS Layer
        Win32[Win32 API: SetWindowPos, WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE]
        WinRT[WinRT: Windows.Media.Control GSMTC]
        SysAPI[OS Hardware & Disks: sysinfo]
        AppFs[%APPDATA%/Widgetz/config.json]
        LogFs[%APPDATA%/Widgetz/logs/widgetz.log]
    end

    subgraph Tauri Core Backend (Rust)
        LogPlugin[tauri-plugin-log]
        AutoPlugin[tauri-plugin-autostart]
        TrayMgr[Tray Manager & Context Menu]
        WinMgr[Window Engine & Win32 Hook]
        CfgMgr[Config Manager: Atomic JSON I/O & Safe Fallback]
        SysWorker[System Metrics Poller Worker]
        MediaWorker[GSMTC Media Session Controller & COM Guard]
    end

    subgraph WebView2 Presentation Layer (React + Vite)
        Router[Widget Router & Registry]
        UIPrims[UI Primitives: Card, ProgressBar, Badge, Tooltip]
        WeatherW[Weather Widget]
        SpotifyW[Spotify Controls Widget]
        ResourceW[Resource Usage Widget]
        SettingsUI[Settings & Widget Manager Modal]
    end

    Win32 --> WinMgr
    WinRT --> MediaWorker
    SysAPI --> SysWorker
    AppFs <--> CfgMgr
    LogPlugin --> LogFs

    TrayMgr <--> WinMgr
    WinMgr --> Router
    CfgMgr <--> Router
    UIPrims --> WeatherW
    UIPrims --> SpotifyW
    UIPrims --> ResourceW
    SysWorker -->|Tauri Event: metrics-update| ResourceW
    MediaWorker <-->|Tauri IPC & Events| SpotifyW
    Router --> WeatherW
    Router --> SpotifyW
    Router --> ResourceW
    Router --> SettingsUI
```

### Key Architectural Concepts
1. **Multi-Window & Docked Desktop Surface**: Widgets can run as independent frameless, transparent Tauri windows with `WS_EX_TOOLWINDOW` and `WS_EX_NOACTIVATE` to remain off Alt+Tab and prevent focus stealing, or docked into a single unified desktop stack to guarantee memory stays well within the <60MB RAM budget.
2. **Native Event Streaming**: High-frequency metrics (CPU/RAM) and GSMTC playback events are dispatched asynchronously from Rust background threads directly to the frontend via Tauri events (`emit`), eliminating request-polling overhead.
3. **Fail-Safe Persistence with Debouncing**: Window movements are debounced by 500ms before persisting to `%APPDATA%/Widgetz/config.json`. File writing uses atomic replacement (write to temp file, flush, rename). If a corrupted config is detected, it is backed up to `.corrupt.<timestamp>` and default configuration is cleanly restored.
4. **Display Bounds Safety**: Window coordinates are validated against active monitor rectangles via `window.available_monitors()`. Off-screen windows are clamped back to the primary display.
5. **Offline & Graceful Degradation**: Weather and Spotify widgets handle network loss or closed media players with elegant idle/offline UI states.

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
│       └── media\
│           ├── mod.rs
│           ├── gsmtc.rs
│           └── model.rs
├── src\
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
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
│   │   ├── useWindowPosition.ts
│   │   ├── useSystemMetrics.ts
│   │   ├── useMediaPlayback.ts
│   │   └── useWeather.ts
│   ├── services\
│   │   └── weather\
│   │       ├── openMeteo.ts
│   │       ├── geoLookup.ts
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
├── vite.config.ts
├── postcss.config.js
└── tailwind.config.ts
```

## Data Model

### 1. App Configuration (`AppConfig`)
```typescript
export interface WidgetPlacement {
  id: "weather" | "spotify" | "resources";
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppConfig {
  version: number;
  lockPositions: boolean;
  alwaysOnTop: boolean;
  snapToEdges: boolean;
  layoutMode: "independent" | "docked"; // ensures memory budget resilience
  autoStart: boolean;
  theme: "auto" | "light" | "dark";
  pollingRates: {
    resourcesCpuRamMs: number; // default: 1500
    resourcesDiskMs: number;   // default: 15000
    weatherMinutes: number;    // default: 30
  };
  weatherSettings: {
    autoLocation: boolean;
    cachedCity?: string;
    cachedLat?: number;
    cachedLon?: number;
    manualCity?: string;
    latitude?: number;
    longitude?: number;
  };
  widgets: Record<string, WidgetPlacement>;
}
```

### 2. System Resource Metrics (`SystemMetrics`)
```typescript
export interface DiskMetric {
  name: string;
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

export interface SystemMetrics {
  cpuUsagePercent: number;
  cpuCores: number;
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  disks: DiskMetric[];
  timestamp: number;
}
```

### 3. Media Session (`MediaSession`)
```typescript
export interface MediaSession {
  isActive: boolean;
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  trackId?: string;
  timeline: {
    positionMs: number;
    durationMs: number;
  };
  thumbnailBase64?: string;
  canPlayPause: boolean;
  canSkipNext: boolean;
  canSkipPrevious: boolean;
  sourceApp: string; // e.g. "Spotify", "Spotify.exe", "Chrome"
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

## Module Interfaces

### Rust Backend (`src-tauri/src/`)
```rust
// Window Management (src-tauri/src/window/)
pub fn apply_desktop_window_styles(app: &AppHandle, window_label: &str) -> Result<(), String>;
pub fn clamp_window_to_monitors(app: &AppHandle, window_label: &str, x: i32, y: i32, w: u32, h: u32) -> (i32, i32);
pub fn toggle_widget_visibility(app: &AppHandle, widget_id: &str, show: bool) -> Result<(), String>;
pub fn set_widgets_locked(app: &AppHandle, locked: bool) -> Result<(), String>;
pub fn set_widgets_always_on_top(app: &AppHandle, on_top: bool) -> Result<(), String>;

// Configuration (src-tauri/src/config/)
pub fn load_config() -> Result<AppConfig, String>;
pub fn save_config(config: AppConfig) -> Result<(), String>;
pub fn init_config_with_fallback() -> AppConfig;

// Hardware Metrics (src-tauri/src/sysinfo/)
pub fn get_system_metrics() -> Result<SystemMetrics, String>;
pub fn start_metrics_poller(app: AppHandle, interval_ms: u64);

// GSMTC Media (src-tauri/src/media/)
pub fn get_media_state() -> Result<MediaSession, String>;
pub fn media_play_pause() -> Result<(), String>;
pub fn media_next_track() -> Result<(), String>;
pub fn media_previous_track() -> Result<(), String>;
pub fn start_media_listener(app: AppHandle);
```

---

## Work Packages

### WP-00 Scaffolding & UI Primitives  [ ] status: pending
- **Covers**: R6, R7, R8, R9
- **Owns**: Root config files (`package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `.env.example`), `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` (initial modular skeleton), `src/main.tsx`, `src/App.tsx` (initial router shell), `src/index.css`, `src/styles/fluent.css`, `src/components/ui/**` (`Card.tsx`, `ProgressBar.tsx`, `Badge.tsx`, `Tooltip.tsx`), `src/widgets/registry.ts`, `docs/agents/CONTEXT.md`
- **Depends on**: —
- **Parallel group**: A
- **Acceptance criteria**:
  - `npm.cmd run build` and `npm.cmd run typecheck` run clean with zero errors or warnings.
  - `cargo check` and `cargo test` in `src-tauri` compile and pass cleanly.
  - `tauri-plugin-log` configured with rolling log files in `%APPDATA%/Widgetz/logs/`.
  - `tauri-plugin-autostart` integrated into `Cargo.toml` and capabilities.
  - Release profile configured in `Cargo.toml` (`opt-level = "z"`, `lto = true`, `panic = "abort"`, `strip = true`).
  - Foundational UI primitives (`Card`, `ProgressBar`, `Badge`, `Tooltip`) rendered and tested, ready for downstream widgets.
  - `docs/agents/CONTEXT.md` populated with stack versions, commands, conventions, module registration patterns, and folder structure.

### WP-01 Desktop Window Engine & Win32 Integration  [ ] status: pending
- **Covers**: R1, R6, R7
- **Owns**: `src-tauri/src/window/**`, `src/components/layout/**`, `src/hooks/useWindowPosition.ts`, `src/types/window.ts`
- **Depends on**: WP-00
- **Parallel group**: B
- **Acceptance criteria**:
  - Frameless, transparent windows created with Windows 11 Fluent styling.
  - `WS_EX_TOOLWINDOW` and `WS_EX_NOACTIVATE` applied via Win32 API to omit widget windows from Alt+Tab switcher and prevent focus stealing from active apps.
  - Off-screen protection: coordinates validated and clamped against active display bounds queried via `window.available_monitors()`.
  - Desktop-level Z-order management (pinned to desktop or toggleable always-on-top).
  - Smooth dragging via `data-tauri-drag-region` when unlocked; dragging disabled when locked.
  - Position changes debounced by 500ms before persisting to config.
  - Screen edge snapping logic implemented in hook with configurable snap threshold (16px).

### WP-02 Persistent Configuration, System Tray & Autostart  [ ] status: pending
- **Covers**: R2, R8, R9
- **Owns**: `src-tauri/src/config/**`, `src-tauri/src/tray/**`, `src/pages/settings/**`, `src/types/config.ts`, `src/hooks/useConfig.ts`
- **Depends on**: WP-00
- **Parallel group**: B
- **Acceptance criteria**:
  - Config saved safely to `%APPDATA%/Widgetz/config.json` with atomic file replacement (temp file write + rename).
  - Corrupt config fallback: if JSON is invalid or unreadable, rename to `.corrupt.<timestamp>` and restore defaults cleanly without crashing.
  - System Tray icon loaded with native context menu: Toggle Lock Positions, Widget visibility toggles, Layout Mode (Independent / Docked), Settings, View Logs, Quit.
  - Autostart with Windows toggle powered by `tauri-plugin-autostart`.
  - Settings page allowing toggling widgets, polling intervals, theme override, and location preferences.
  - Unit tests for JSON config serialization/deserialization, corrupt file recovery, and atomic writer.

### WP-03 System Resource Utilization Widget  [ ] status: pending
- **Covers**: R5, R6, R7, R9
- **Owns**: `src-tauri/src/sysinfo/**`, `src/widgets/resources/**`, `src/types/resources.ts`, `src/hooks/useSystemMetrics.ts`
- **Depends on**: WP-00
- **Parallel group**: C
- **Acceptance criteria**:
  - Rust collector using `sysinfo` runs on background thread; polls CPU/RAM (default 1.5s) and Disks (default 15s).
  - Metrics emitted to frontend via Tauri event `metrics-update`.
  - UI uses `Card`, `ProgressBar`, `Badge` from WP-00 to display CPU percentage with mini trend sparkline/bar.
  - UI displays RAM in `Used GB / Total GB` with progress ring/bar and percentage.
  - UI displays Disk usage for system drive `C: Used GB / Total GB` and percentage.
  - Idle CPU footprint < 0.2%.
  - Unit tests for sysinfo collector data transformations and byte-to-GB formatting.

### WP-04 Spotify Playback Controls Widget (GSMTC)  [ ] status: pending
- **Covers**: R4, R6, R7, R8, R9
- **Owns**: `src-tauri/src/media/**`, `src/widgets/spotify/**`, `src/types/media.ts`, `src/hooks/useMediaPlayback.ts`
- **Depends on**: WP-00
- **Parallel group**: C
- **Acceptance criteria**:
  - WinRT GSMTC (`Windows.Media.Control`) listener queries media sessions.
  - Session filtering: prioritize sessions where `SourceAppUserModelId` contains "Spotify"; fallback to current active system media session.
  - COM execution and thumbnail stream reading (`IRandomAccessStreamReference`) guarded inside `spawn_blocking` with HRESULT error handling.
  - Extracts track title, artist name, album name, timeline position/duration, and album art (encoded as base64 data URI).
  - IPC commands implemented: `media_play_pause`, `media_next_track`, `media_previous_track`.
  - UI uses `Card`, `ProgressBar` from WP-00; displays track title, artist, album cover, progress bar, and interactive control buttons.
  - Displays polished idle state when Spotify/media is not playing or closed.
  - Unit/mock tests verifying media session state machine and playback commands.

### WP-05 Weather Widget (Open-Meteo & Auto-Location)  [ ] status: pending
- **Covers**: R3, R7, R8, R9
- **Owns**: `src/widgets/weather/**`, `src/services/weather/**`, `src/types/weather.ts`, `src/hooks/useWeather.ts`
- **Depends on**: WP-00
- **Parallel group**: C
- **Acceptance criteria**:
  - Auto-location via IP geo-lookup service with cached coordinates in `AppConfig` and fallback default city (Berlin: 52.5200, 13.4050).
  - Calls Open-Meteo API for current temperature (°C), feels-like, WMO weather codes, and daily/hourly forecast.
  - WMO weather code mapping to localized descriptions and modern weather icons.
  - Caches last successful weather data; shows subtle offline badge if network fails.
  - UI uses `Card`, `Badge` from WP-00; shows hourly preview and high/low daily temperatures.
  - Unit tests for WMO code mapping, weather response parser, and temperature formatting.

### WP-06 Fluent Design Theme, Snapping & Integration  [ ] status: pending
- **Covers**: R1, R6, R7, R9
- **Owns**: `src-tauri/src/lib.rs` (integration pass), `src/App.tsx` (route integration), `src/components/docking/**`, `src/theme/**`
- **Depends on**: WP-01, WP-02, WP-03, WP-04, WP-05
- **Parallel group**: D
- **Acceptance criteria**:
  - Full Windows 11 Fluent aesthetic: Acrylic/Mica translucent backdrop with subtle borders (`rgba(255, 255, 255, 0.08)` / `rgba(0, 0, 0, 0.08)`), rounded corners, Segoe UI Variable typography.
  - Auto-adapts to Windows 11 Light/Dark system theme with manual override in settings.
  - Magnetic widget-to-widget docking and screen-edge snapping.
  - Dual layout mode verified: independent multi-window mode AND docked desktop dock mode.
  - Working set memory consumption verified < 60 MB RAM total.
  - End-to-end multi-widget launch verified from System Tray.

---

## Phase Status
- [x] Phase 1 Plan  - [ ] Phase 2 Build  - [ ] Phase 3 Test  - [ ] Phase 4 Review

---

## Plan Review

### Review Summary
- **Verdict**: APPROVED (All 12 Critic findings resolved)
- **Previous Counts**: 3 CRITICAL, 5 MAJOR, 4 MINOR, 0 ENHANCEMENT
- **Resolution Status**: 100% of findings addressed and incorporated into architecture and work packages.

### Resolution Ledger
1. **[CRITICAL 1 Resolved] File Ownership on Integration Hubs**: WP-00 establishes decoupled registration hooks; WP-06 explicitly owns the final integration pass on `src-tauri/src/lib.rs` and `src/App.tsx`.
2. **[CRITICAL 2 Resolved] UI Primitive Dependencies**: Shifted `src/components/ui/**` into WP-00 Scaffolding, unblocking Group C widgets immediately.
3. **[CRITICAL 3 Resolved] Memory Budget (<60 MB RAM)**: Added Dual Layout Mode ("independent" & "docked") with explicit Phase 3/4 memory profiling to guarantee <60MB footprint.
4. **[MAJOR 4 Resolved] Drag Persistence Debouncing**: Window movements debounced by 500ms before triggering atomic writes to `%APPDATA%/Widgetz/config.json`.
5. **[MAJOR 5 Resolved] Off-Screen Trapping**: Added `clamp_window_to_monitors` checking `window.available_monitors()`.
6. **[MAJOR 6 Resolved] Structured Logging**: Integrated `tauri-plugin-log` with rotating logs in `%APPDATA%/Widgetz/logs/` and Tray shortcut.
7. **[MAJOR 7 Resolved] Config Schema Fallback**: Corrupted config files are backed up to `.corrupt.<timestamp>` and defaults restored safely.
8. **[MAJOR 8 Resolved] WinRT GSMTC Arbitration**: Priority filtering for Spotify `SourceAppUserModelId`, fallback to system media, safe COM apartment handling in `spawn_blocking`.
9. **[MINOR 9 Resolved] Weather Geolocation Cache**: Cached coordinates in `AppConfig` + fallback default city.
10. **[MINOR 10 Resolved] Autostart Plugin**: Adopted official `tauri-plugin-autostart`.
11. **[MINOR 11 Resolved] Focus Stealing**: Added `WS_EX_NOACTIVATE` Win32 flag.
12. **[MINOR 12 Resolved] Release Optimization**: Added `opt-level = "z"`, `lto = true`, `panic = "abort"`, `strip = true` in `Cargo.toml`.
