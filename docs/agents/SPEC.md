# SPEC

## Original Prompt (verbatim)
Ein lightweight Programm, was nativ wirkende Widgets für den Windows 11 Desktop hinzufügt.
Bisher kannst du schonmal folgende Widgets als "Starter Widgets" einplanen: Wetter, Spotify Playback Controlls, System Ressourcen Nutzung (CPU in %, RAM in GB, Speicher in GB/GB)

## Requirements

### Functional Requirements
- **R1: Desktop Widget Engine & Windowing** [functional]
  - Floating, frameless desktop windows for widgets featuring Windows 11 Fluent Design styling (Mica/Acrylic translucent backdrop, 8px/12px border radius, subtle border stroke, Segoe UI Variable typography).
  - Pinned to desktop level (or toggleable always-on-top/desktop mode), omitted from Windows Alt+Tab switcher (`WS_EX_TOOLWINDOW`).
  - Smooth drag-and-drop repositioning with optional screen edge snapping.
  - Position lock toggle: when locked, widgets ignore drag events and cannot be accidentally moved.
  - Multi-widget layout: widgets can be positioned independently or docked.

- **R2: Persistent Configuration & System Tray** [functional]
  - System Tray icon with native context menu: Toggle Lock Positions, Manage/Toggle individual widgets, Open Settings, Refresh All, Quit.
  - State persistence: widget screen coordinates, visibility, and user preferences saved to a clean local JSON config file (`%APPDATA%/Widgetz/config.json`).
  - Auto-start with Windows optional toggle via Registry/Startup folder.

- **R3: Starter Widget — Weather (Wetter)** [functional]
  - Displays current temperature in °C, feels-like temperature, weather condition icon and text (e.g., Clear, Rain, Cloud cover, Snow).
  - Displays location name and high/low daily forecast or hourly trend.
  - Zero-configuration auto-location detection (via IP geo-lookup) with fallback manual city search.
  - Background updates via free Open-Meteo API (no API key required, reliable, rate-limit friendly).
  - Offline / error resilience: displays last known data with a subtle offline indicator if network fails.

- **R4: Starter Widget — Spotify Playback Controls** [functional]
  - Displays current playing track title, artist name, and album cover art.
  - Interactive media control buttons: Play / Pause, Next Track, Previous Track.
  - Playback progress bar with elapsed time and total duration.
  - Integration with Windows Global System Media Transport Controls (GSMTC / WinRT `Windows.Media.Control` API) allowing zero-config control of Spotify (Desktop & Web) and fallback to active system media.
  - Graceful idle state when Spotify is closed or no media is actively playing.

- **R5: Starter Widget — System Resource Utilization (System Ressourcen Nutzung)** [functional]
  - CPU usage displayed in percentage (`xx%`) with real-time mini graph or progress ring/bar.
  - RAM usage displayed in GB (`Used GB / Total GB` e.g., `8.4 / 16.0 GB` and percentage).
  - Storage / Disk usage displayed in GB/GB (`Used GB / Total GB` e.g., `C: 245 / 512 GB` and percentage) for system drive (and selectable drives).
  - Efficient background hardware monitoring using native Rust `sysinfo` or Windows Performance APIs.
  - Configurable polling rate (default 1.5s for CPU/RAM, 15s for Disk).

### Non-Functional Requirements
- **R6: Lightweight Performance & Resource Footprint** [non-functional: performance]
  - Idle CPU usage < 0.5% when not interacting.
  - Total working set RAM consumption < 60 MB total for the widget process.
  - Clean background tick loops with thread sleep / debounce, avoiding UI thread blocking.

- **R7: Native Windows 11 Look & Feel** [non-functional: design]
  - Pixel-perfect Windows 11 Fluent Design aesthetic: translucent acrylic/mica material, rounded corners, drop shadows, Segoe UI Variable text hierarchy, dark mode and light mode matching Windows system theme.
  - Fluid animations (hover states, play/pause transition, resource bar smooth easing).

- **R8: Security & Privacy** [non-functional: security]
  - No external tracking, telemetry, or unnecessary network calls.
  - Weather queries only contact Open-Meteo.
  - Spotify controls use local OS IPC (GSMTC WinRT), no OAuth tokens or client secrets stored or transmitted.
  - Config file stored securely in user profile AppData with safe serialization (atomic write).

- **R9: Code Quality & Testability** [non-functional: quality]
  - Modular architecture with clean separation between Rust native OS backend (windowing, sysinfo, GSMTC, config) and UI widget presentation layer.
  - Unit tests for system metrics collector, config serialization, and weather parser.
  - Zero linter or type-checker warnings.

## Assumptions
- **A1: Stack Selection** — Tauri v2 (Rust backend + Vite/TypeScript frontend) is chosen because it leverages Windows 11's built-in Evergreen WebView2 runtime, resulting in minimal binary size (~10MB), ultra-low memory footprint (~35-50MB RAM compared to 200MB+ for Electron), and direct access to native Windows WinRT APIs (GSMTC, Win32 window flags, Acrylic blur).
- **A2: Spotify Media Source** — Utilizing Windows 10/11 GSMTC (`Windows.Media.Control`) is superior to Spotify Web API because it requires zero user login, no Spotify Developer API credentials, works completely offline/locally, and has instantaneous response time.
- **A3: Weather Provider** — Open-Meteo API is selected as the default provider as it is free for non-commercial use, requires no API key, provides hourly & daily weather data globally, and supports WMO weather interpretation codes.
- **A4: Desktop Layer Placement** — Windows 11 widgets can run as tool windows (`WS_EX_TOOLWINDOW`) on the desktop level so they do not clutter the Alt+Tab switcher or taskbar, with the option to drag, snap, or lock in place.

## Out of Scope
- Full music library browsing or playlist selection (playback control and now-playing display only).
- Multi-user remote synchronization or cloud dashboard.
- Legacy Windows 7/8/XP support (targeted specifically at Windows 10/11 Fluent architecture).
