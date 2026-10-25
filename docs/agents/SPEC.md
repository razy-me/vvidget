# SPEC

## Original Prompt (verbatim)
Ein lightweight Programm, was nativ wirkende Widgets für den Windows 11 Desktop hinzufügt.
Bisher kannst du schonmal folgende Widgets als "Starter Widgets" einplanen: Wetter, Spotify Playback Controlls, System Ressourcen Nutzung (CPU in %, RAM in GB, Speicher in GB/GB)

## Requirements

### Functional Requirements
- **R1: Desktop Widget Engine, Windowing & Snapping** [functional]
  - Floating, frameless desktop windows featuring genuine Windows 11 Fluent Design styling (native DWM Acrylic blur backdrop via `window-vibrancy` / Tauri window effects, rounded corners `8px/12px`, subtle border stroke, Segoe UI Variable typography).
  - Pinned to desktop level, omitted from Windows Alt+Tab switcher (`WS_EX_TOOLWINDOW`).
  - `WS_EX_NOACTIVATE` applied to display widgets to prevent stealing keyboard/foreground focus from active applications or games.
  - `Win + D` (Show Desktop) minimization protection: widgets remain visible on the desktop surface by hooking `WM_WINDOWPOSCHANGING` or anchoring to the `Progman` / `WorkerW` desktop layer.
  - Hardware-smooth magnetic edge snapping: calculated directly in the native Win32 window procedure via `WM_MOVING` hook modifying `LPRECT` directly in OS memory to prevent React IPC drag jitter.
  - Multi-widget layout: widgets can be positioned independently or docked into a unified desktop dock.

- **R2: Persistent Configuration, System Tray & Settings Lifecycle** [functional]
  - System Tray icon with native context menu: Toggle Lock Positions, Manage/Toggle individual widgets, Layout Mode (Docked vs. Independent), Open Settings, View Logs, Refresh All, Quit.
  - Multi-monitor DPI safety: `WidgetPlacement` persists explicit `LogicalPosition`, `scaleFactor`, and `monitorId` / `monitorName` to prevent jumpy coordinates across different display scalings.
  - Settings window lifecycle: Settings modal is lazy-loaded on demand and completely destroyed on close (`window.destroy()`) to prevent resident WebView2 background memory leaks.
  - Settings window retains standard focus and activation (never applies `WS_EX_NOACTIVATE`), permitting full keyboard interaction for city search and preference inputs.
  - State persistence: widget placement and user preferences saved to `%APPDATA%/Widgetz/config.json` via atomic file replacement (temp file write + rename) with 500ms movement debounce.
  - Auto-start with Windows toggle via official `tauri-plugin-autostart`.

- **R3: Starter Widget — Weather (Wetter)** [functional]
  - Displays current temperature in °C, feels-like temperature, weather condition icon and text (e.g., Clear, Rain, Cloud cover, Snow).
  - Displays location name and high/low daily forecast or hourly trend.
  - Location resolution: Primary query via native Windows Location API (`Windows.Devices.Geolocation`) through Rust WinRT; manual city search powered by Open-Meteo Geocoding API (`geocoding-api.open-meteo.com`) in Settings.
  - Background updates via free Open-Meteo API (no API key required, reliable, rate-limit friendly).
  - Offline / error resilience: displays last known data with a subtle offline indicator if network fails.

- **R4: Starter Widget — Spotify Playback Controls** [functional]
  - Displays current playing track title, artist name, and album cover art.
  - Interactive media control buttons: Play / Pause, Next Track, Previous Track.
  - Decoupled playback events: metadata and album art sent on track change; timeline position (`positionMs`) accompanied by `lastUpdatedSystemTimeMs` allowing the frontend to smoothly interpolate playback progress locally via `requestAnimationFrame` / 1s timer without spamming IPC.
  - Binary album art streaming: cover art served via Custom Tauri URI Protocol (`widgetz://album-art?t=<trackId>`) or cached memory stream instead of multi-megabyte Base64 JSON strings.
  - Integration with Windows Global System Media Transport Controls (GSMTC / WinRT `Windows.Media.Control` API) allowing zero-config control of Spotify (Desktop & Web) and fallback to active system media.
  - Graceful idle state when Spotify is closed or no media is actively playing.

- **R5: Starter Widget — System Resource Utilization (System Ressourcen Nutzung)** [functional]
  - CPU usage displayed in percentage (`xx%`) with real-time mini graph or progress ring/bar.
  - Initialized with `System::new_with_specifics()` (refreshing only CPU, RAM, Disks; excluding heavy full-process iteration) with minimum 200ms initial interval to prevent initial `0.0%` artifact.
  - RAM usage displayed in GB (`Used GB / Total GB` e.g., `8.4 / 16.0 GB` and percentage).
  - Storage / Disk usage displayed in GB/GB (`Used GB / Total GB` e.g., `C: 245 / 512 GB` and percentage) for system drive (and selectable drives).
  - Configurable polling rate (default 1.5s for CPU/RAM, 15s for Disk).

### Non-Functional Requirements
- **R6: Lightweight Performance & Realistic Memory Footprint** [non-functional: performance]
  - Idle CPU usage < 0.3% when not interacting.
  - Working set RAM consumption:
    - **Docked / Single-Window Mode**: < 90 MB RAM total.
    - **Independent Multi-Window Mode**: < 180 MB RAM total.
  - WebView2 memory trimming configured (`ICoreWebView2_13::MemoryUsageTargetLevel = Low`) for idle background widgets.
  - Clean background tick loops with thread sleep / debounce, avoiding UI thread blocking.

- **R7: Native Windows 11 Look & Feel** [non-functional: design]
  - Genuine DWM Acrylic material effect via native Windows compositor (not CSS simulated blur).
  - Rounded corners, subtle 1px border stroke (`rgba(255, 255, 255, 0.08)` / `rgba(0, 0, 0, 0.08)`), Segoe UI Variable typography.
  - Fluid hardware-accelerated animations (hover states, play/pause transition, resource bar smooth easing).

- **R8: Security & Privacy** [non-functional: security]
  - Strict Tauri v2 capability ACL configured in `src-tauri/capabilities/default.json`.
  - No external tracking, telemetry, or unnecessary network calls.
  - Weather queries only contact Open-Meteo.
  - Spotify controls use local OS IPC (GSMTC WinRT), no OAuth tokens or client secrets stored or transmitted.
  - Config file stored securely in user profile AppData with safe atomic serialization.

- **R9: Code Quality, Type Safety & Testability** [non-functional: quality]
  - Auto-generated end-to-end TypeScript types from Rust serde models via `specta` / `tauri-specta` to eliminate type drift.
  - Unit tests for system metrics collector, config serialization, corrupt config recovery, and weather parser.
  - Zero linter or type-checker warnings.

- **R10: Native Desktop Grid Alignment & Smooth Drag-and-Drop Interaction** [functional]
  - Real Windows 11 desktop icon grid metrics: 120 × 98 logical pixels (240 × 196 physical pixels at 200% DPI), with dynamic runtime Win32 `LVM_GETITEMSPACING` query from `Progman`/`WorkerW` -> `SHELLDLL_DefView` -> `SysListView32`.
  - Standardized widget dimensions matching exact integer grid spans:
    - Media Controls: 3 × 3 cells (360 × 294 logical px)
    - System Resources: 3 × 4 cells (360 × 392 logical px)
    - Weather Forecast: 3 × 5 cells (360 × 490 logical px)
  - Smooth 1:1 real-time drag tracking during pointer move (`useGridDrag.ts`), with snap-on-release to the nearest desktop grid cell.
  - Visual elevation feedback while dragging (active shadow / border accent).
  - Screen / work area bounds clamping preventing dragging offscreen or under the taskbar.

## Assumptions
- **A1: Stack Selection** — Tauri v2 (Rust backend + Vite/React 19/Tailwind v4 frontend) leveraging Windows 11's built-in Evergreen WebView2 runtime.
- **A2: Spotify Media Source** — Utilizing Windows 10/11 GSMTC (`Windows.Media.Control`) is superior to Spotify Web API because it requires zero user login, no Spotify Developer API credentials, works completely offline/locally, and has instantaneous response time.
- **A3: Weather Provider** — Open-Meteo API and Open-Meteo Geocoding are selected as the default providers as they are free for non-commercial use, require no API key, and have high uptime.
- **A4: Desktop Layer Placement** — Windows 11 widgets run as tool windows (`WS_EX_TOOLWINDOW`) anchored against `Win + D` minimization, with native `WM_MOVING` edge snapping.

## Out of Scope
- Full music library browsing or playlist selection (playback control and now-playing display only).
- Multi-user remote synchronization or cloud dashboard.
- Legacy Windows 7/8/XP support (targeted specifically at Windows 10/11 Fluent architecture).
