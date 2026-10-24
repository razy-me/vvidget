# DECISIONS (append-only)

## D-001 Technology Stack Selection: Tauri v2 + Rust + Vite/TypeScript (Phase 0, Orchestrator)
- **Decision**: Use Tauri v2 with a Rust native core and a Vite + TypeScript + Tailwind CSS UI layer utilizing Windows 11 Fluent Design styling.
- **Alternatives considered**:
  1. *Electron*: Much easier web-based development, but heavy RAM usage (typically 200MB - 400MB) and large installer size (>120MB), violating the core requirement "lightweight Programm".
  2. *Pure Rust GUI (egui / Slint / Iced)*: Very low memory footprint, but implementing genuine Windows 11 Mica/Acrylic material, CSS backdrop filters, SVG weather icons, and fluid animations is significantly more complex and harder to maintain than modern web components on Evergreen WebView2.
  3. *C# / WinUI 3 (WPF / Windows App SDK)*: Native Windows UI, but .NET SDK is not installed on this machine (`dotnet --version` reports no SDKs), and WinUI 3 has known packaging and XAML desktop widget positioning friction.
- **Reason / trade-offs**: Tauri v2 uses the OS-native WebView2 already built into Windows 11, giving ~40MB RAM usage, instantaneous startup, full access to Rust Win32/WinRT crates for GSMTC and performance monitoring, and rapid pixel-perfect Windows 11 UI rendering.

## D-002 Spotify Playback Integration via GSMTC (Phase 0, Orchestrator)
- **Decision**: Integrate Spotify controls through the native Windows Global System Media Transport Controls (GSMTC / WinRT `Windows.Media.Control`).
- **Alternatives considered**:
  1. *Spotify Web API (OAuth2)*: Requires user to create a Spotify Developer app, enter Client ID / Secret, log in via OAuth in a browser, and requires an active internet connection even when playing local files.
  2. *Local Spotify Web Helper / AppleScript-equivalent IPC*: Unstable, deprecated by Spotify, prone to breakage across desktop updates.
- **Reason / trade-offs**: GSMTC is built into Windows 11. It allows querying current track, artist, album art stream, timeline/playback position, and dispatching Play/Pause/Next/Previous directly to Spotify Desktop (or browser tab) with zero user configuration or network latency.

## D-003 Weather Data Source: Open-Meteo API (Phase 0, Orchestrator)
- **Decision**: Use Open-Meteo API with client-side IP-based geocoding fallback for default weather and manual city search.
- **Alternatives considered**:
  1. *OpenWeatherMap*: Requires an API key and credit card registration for 3.0 API.
  2. *AccuWeather / WeatherAPI*: Strict rate limits and requires user API keys.
- **Reason / trade-offs**: Open-Meteo is completely free, open-source, requires zero API keys, provides comprehensive hourly/daily forecast data with WMO weather codes, and has high uptime.

## D-004 Widget Window Architecture: Multi-Window vs Single Transparent Desktop Overlay (Phase 0, Orchestrator)
- **Decision**: Provide independent Tauri frameless windows per active widget (or a unified desktop surface with detachable windows), coordinated via a central Tray Manager in Rust.
- **Alternatives considered**:
  1. *Single full-screen transparent desktop canvas*: Captures all mouse clicks across the entire desktop unless complex transparent hit-testing/click-through mask is used.
  2. *Separate independent borderless windows*: Each widget has its own lightweight window that can be dragged, minimized, or placed anywhere without blocking mouse clicks between widgets.
- **Reason / trade-offs**: Independent borderless windows give true native desktop widget behavior (similar to Windows Vista gadgets, Rainmeter, or macOS widgets) where empty desktop spaces retain normal Windows desktop click/drag interactions.


## D-005 Win32 Window Styles & Alt+Tab Omission (P1, Planner)
- **Decision**: Use `SetWindowLongPtrW` with `WS_EX_TOOLWINDOW` and manage Z-order via `SetWindowPos` to omit desktop widgets from Windows Alt+Tab and taskbar.
- **Alternatives considered**:
  1. *Reparenting to Windows Explorer WorkerW / Progman desktop window*: Fragile across Windows 11 updates and breaks standard WebView2 mouse events and dragging.
  2. *Standard popup window*: Stays in Alt+Tab switcher and clutters user task switcher.
- **Reason / trade-offs**: `WS_EX_TOOLWINDOW` is the official Windows API mechanism for utility floating widgets, ensuring clean desktop presence without hook fragility.

## D-006 Background System Metrics Polling Strategy (P1, Planner)
- **Decision**: Execute `sysinfo` queries on a dedicated background Rust thread and push updates via Tauri events (`emit`) to the frontend.
- **Alternatives considered**:
  1. *Frontend periodic IPC requests (`invoke` every second)*: Generates IPC round-trip overhead and blocks frontend event loop if backend hangs.
  2. *WMI / PowerShell queries*: Massive CPU overhead (>5% CPU) and latency (>500ms per query).
- **Reason / trade-offs**: Dedicated background thread with native `sysinfo` delivers sub-millisecond metric collection and <0.1% CPU consumption.

## D-007 Atomic Config Persistence in AppData (P1, Planner)
- **Decision**: Store JSON configuration in `%APPDATA%/Widgetz/config.json` using atomic file replacement (write to `.tmp` file and rename).
- **Alternatives considered**:
  1. *Direct file overwriting*: Risks corrupted / 0-byte configuration files if the app or machine crashes mid-write.
  2. *SQLite embedded database*: Over-engineered for a simple desktop widget configuration object (<5KB).
- **Reason / trade-offs**: Atomic file replacement provides complete data integrity with zero dependency bloat.


## D-008 UI Primitive Foundations in WP-00 Scaffolding (Phase 1, Orchestrator)
- **Decision**: Place shared UI primitives (`Card`, `ProgressBar`, `Badge`, `Tooltip`) in WP-00 Scaffolding instead of WP-06.
- **Alternatives considered**:
  1. *Leaving in WP-06*: Blocks Group C widget developers or forces temporary stubs.
  2. *Allowing each widget to build its own primitives*: Violates DRY and causes visual inconsistencies across widgets.
- **Reason / trade-offs**: Provides tested, ready-to-use Windows 11 Fluent design building blocks for all widget coders upfront.

## D-009 Dual Layout Mode: Independent Windows & Docked Desktop Surface (Phase 1, Orchestrator)
- **Decision**: Architect the layout engine to support both independent floating multi-windows and a docked desktop surface.
- **Alternatives considered**:
  1. *Multi-window only*: Risk of exceeding the <60MB working set RAM budget under multi-WebView2 instances on some machines.
  2. *Single canvas only*: Cannot position widgets on completely opposite corners of the screen without covering empty desktop areas.
- **Reason / trade-offs**: Dual mode offers the best of both worlds: full multi-window freedom with an optimized single-process dock option for extreme low-spec/low-RAM scenarios.

## D-010 Window Movement Debounce & Display Bounds Clamping (Phase 1, Orchestrator)
- **Decision**: Debounce window coordinate writes by 500ms and clamp saved coordinates against active monitor bounds via `window.available_monitors()`.
- **Alternatives considered**:
  1. *Writing config on every move event*: I/O thrashing during drag operations.
  2. *Unchecked coordinate restore*: Widgets spawn off-screen if monitors are disconnected or resolution drops.
- **Reason / trade-offs**: Guarantees buttery smooth drag performance and ensures widgets are never lost off-screen.

## D-011 WinRT GSMTC Session Arbitration & COM Guarding (Phase 1, Orchestrator)
- **Decision**: Filter GSMTC sessions prioritizing Spotify's `SourceAppUserModelId`, fallback to active system media session, and execute WinRT calls inside `spawn_blocking` with COM guard.
- **Alternatives considered**:
  1. *Strict Spotify-only hardcoded check*: Breaks if Spotify is running in web browser or updated binary name changes.
  2. *Running WinRT COM on main UI thread*: Can freeze window rendering on slow album art stream retrieval.
- **Reason / trade-offs**: Robust, thread-safe media detection with zero UI hitching.

## D-012 Structured Logging with tauri-plugin-log & Safe Config Fallback (Phase 1, Orchestrator)
- **Decision**: Use `tauri-plugin-log` with file rotation in `%APPDATA%/Widgetz/logs/` and automatically recover from corrupted configs by archiving to `.corrupt.<timestamp>` and restoring defaults.
- **Alternatives considered**:
  1. *Standard stdout/eprintln*: Logs are lost when running as a detached GUI process without a console.
  2. *Crash on malformed config*: Bricks the app until user manually deletes AppData files.
- **Reason / trade-offs**: Production-grade diagnostics and resilient self-healing.
