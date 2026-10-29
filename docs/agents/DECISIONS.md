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
- **Decision**: Store JSON configuration in `%APPDATA%/vvidget/config.json` using atomic file replacement (write to `.tmp` file and rename).
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
- **Decision**: Use `tauri-plugin-log` with file rotation in `%APPDATA%/vvidget/logs/` and automatically recover from corrupted configs by archiving to `.corrupt.<timestamp>` and restoring defaults.
- **Alternatives considered**:
  1. *Standard stdout/eprintln*: Logs are lost when running as a detached GUI process without a console.
  2. *Crash on malformed config*: Bricks the app until user manually deletes AppData files.
- **Reason / trade-offs**: Production-grade diagnostics and resilient self-healing.


## D-013 Realistic WebView2 Memory Footprint & Dual-Mode / Lazy-Loading (Plan Review, Orchestrator)
- **Decision**: Update RAM budgets to realistic levels (<90 MB RAM for docked/single-window mode, <180 MB for independent multi-window mode), lazy-load and destroy the Settings window (`window.destroy()`), and configure `ICoreWebView2_13::MemoryUsageTargetLevel = Low`.
- **Alternatives considered**:
  1. *Keeping rigid <60MB for multi-window*: Unrealistic with Chromium architecture, leads to false test failures.
  2. *Keeping Settings window hidden in memory*: Wastes 40MB+ RAM permanently for a window rarely opened.
- **Reason / trade-offs**: Reflects real-world WebView2 process model realities while keeping background resource usage strictly minimal.

## D-014 Win+D Desktop Anchoring & Scoped Focus Activation (Plan Review, Orchestrator)
- **Decision**: Hook `WM_WINDOWPOSCHANGING` / anchor to Progman/WorkerW to prevent `Win + D` minimization. Apply `WS_EX_NOACTIVATE` strictly to background display widgets, never to SettingsModal.
- **Alternatives considered**:
  1. *Unconditional WS_EX_NOACTIVATE*: Blocks user text input for city search in weather and settings.
  2. *Standard popup window*: Completely minimized every time user presses Win+D.
- **Reason / trade-offs**: Allows widgets to live permanently on the desktop without losing keyboard interactivity in modal inputs.

## D-015 DWM Acrylic Material via window-vibrancy (Plan Review, Orchestrator)
- **Decision**: Use `window-vibrancy` to activate Windows 11 DWM Acrylic blur backdrop rather than Mica or CSS-simulated blur.
- **Alternatives considered**:
  1. *Mica*: Windows 11 disables Mica blur on unfocused/inactive (`WS_EX_NOACTIVATE`) windows, causing them to turn into flat gray panels.
  2. *CSS backdrop-filter*: Only blurs inside the WebView2 canvas, cannot blur the desktop behind transparent window chrome.
- **Reason / trade-offs**: Acrylic provides consistent translucent frosted glass effect regardless of window focus state.

## D-016 Album Art Custom URI Protocol & Client-Side Timeline Interpolation (Plan Review, Orchestrator)
- **Decision**: Serve album art through a custom Tauri protocol (`vvidget://album-art?t=<trackId>`) and interpolate playback progress in React from `lastUpdatedSystemTimeMs` + `positionMs`.
- **Alternatives considered**:
  1. *Base64 serialization over JSON IPC every second*: Massive JSON serialization overhead and GC pressure.
  2. *High-frequency GSMTC polling*: GSMTC does not fire regular progress ticks, wasting CPU.
- **Reason / trade-offs**: Smooth 60fps progress bar animation with near-zero IPC overhead and zero memory churn.

## D-017 Type Generation via tauri-specta (Plan Review, Orchestrator)
- **Decision**: Use `specta` / `tauri-specta` in `Cargo.toml` to automatically export TypeScript definitions from Rust models on build.
- **Alternatives considered**:
  1. *Manual parallel TS type authoring*: High risk of field naming or optionality drift across parallel work packages.
- **Reason / trade-offs**: Compile-time guarantee of type contract alignment between Rust backend and React frontend.

## D-018 Upfront Complete Cargo.toml Dependencies in WP-00 (Plan Review, Orchestrator)
- **Decision**: Specify all required crates and `windows` feature flags upfront in WP-00 Scaffolding.
- **Alternatives considered**:
  1. *Letting each WP modify Cargo.toml*: Causes git merge conflicts during parallel execution of Group B and Group C.
- **Reason / trade-offs**: Zero parallel merge friction; coder subagents only work on their assigned Rust source modules.

## D-019 Tailwind CSS v4 via @tailwindcss/vite (Plan Review, Orchestrator)
- **Decision**: Adopt Tailwind CSS v4 using `@tailwindcss/vite` without legacy `postcss.config.js` or `tailwind.config.ts`.
- **Alternatives considered**:
  1. *Tailwind CSS v3*: Requires separate config files and slower PostCSS pipeline.
- **Reason / trade-offs**: Simpler project root, faster build times, native CSS-first configuration.

## D-020 Native Win32 WM_MOVING Snapping (Plan Review, Orchestrator)
- **Decision**: Perform screen edge and widget-to-widget snapping inside the Win32 window procedure by intercepting `WM_MOVING` and adjusting `LPRECT`.
- **Alternatives considered**:
  1. *React hook dragging*: Suffers from IPC latency and jitter during active mouse drag.
- **Reason / trade-offs**: Instantaneous, hardware-smooth snapping handled directly by the OS window manager.

## D-021 Asset Protocol and Icon Manifest Resource Provisioning (WP-00, Coder)
- **Decision**: Enabled `security.assetProtocol = { enable: true }` in `tauri.conf.json` to align with the `tauri` `protocol-asset` feature flag, and generated compliant Windows multi-size `.ico` icon assets in `src-tauri/icons/icon.ico` via `System.Drawing`.
- **Alternatives considered**:
  1. *Removing protocol-asset*: Breaks binary album art custom protocol streaming required in WP-04.
  2. *Leaving icon.ico missing until packaging*: Causes `tauri-build` to fail immediately on Windows during resource generation.
- **Reason / trade-offs**: Allows both custom protocol asset serving and Windows PE binary resource compilation to proceed without warnings or build errors.

## D-022 Debounced Configuration Persistence & Self-Healing Corrupt Recovery (WP-02, Coder)
- **Decision**: Combine frontend optimistic state updates with a synchronized 500ms debounce in `ConfigManager` tracking an atomic `is_dirty` flag and persisting the latest in-memory state on timer pop, superseded immediately by `save_immediate`. Schema robustness is reinforced with `#[serde(default)]` and `Default` implementations across all models, alongside atomic temp file replacement and automatic archiving of corrupt JSON to `.corrupt.<timestamp>` with clean default fallback.
- **Alternatives considered**:
  1. *Immediate synchronous file I/O on every coordinate change*: Causes intense disk thrashing during drag operations.
  2. *Uncoordinated pending_save queue*: Risk of stale debounced writes overwriting recent immediate user preference edits.
  3. *Crashing on corrupt or partial config*: Leaves the application unbootable if a power loss or malformed edit occurs.
- **Reason / trade-offs**: Prevents disk I/O bottlenecks while guaranteeing robust data preservation, race-free immediate overrides, and fault-tolerant self-healing.

## D-023 Lazy Settings Window Destruction on Close & Standard Activation (WP-02, Coder)
- **Decision**: Spawn the Settings window on demand from tray click/IPC, unminimize and focus if already open, hook `CloseRequested` to invoke `window.destroy()`, and explicitly preserve standard Win32 focus activation (omitting `WS_EX_NOACTIVATE`).
- **Alternatives considered**:
  1. *Hiding the settings window instead of destroying*: Retains ~40MB RAM resident in WebView2 indefinitely.
  2. *Applying WS_EX_NOACTIVATE to settings*: Prevents keyboard focus for text inputs such as manual city search.
  3. *Failing to unminimize before focusing*: Leaves the window minimized in the Windows taskbar on reopen.
- **Reason / trade-offs**: Conforms strictly to memory footprint guidelines while ensuring full keyboard usability and reliable window restore.

## D-024 Native MinGW Linker Resource Manifest & Subclassing Snapping (WP-01, Coder)
- **Decision**: Link the Windows application resource archive `libresource.a` containing the Common Controls v6 manifest via `cargo:rustc-link-arg` in `build.rs` to satisfy `TaskDialogIndirect` symbol requirements across both bin and test executables on `x86_64-pc-windows-gnu`. Implement magnetic edge and inter-widget snapping inside `WM_MOVING` directly in Win32 memory and suppress `SWP_HIDEWINDOW` in `WM_WINDOWPOSCHANGING` for `Win + D` desktop permanence.
- **Alternatives considered**:
  1. *React IPC dragging/snapping*: Introduces 16-50ms IPC round-trip latency and visual jitter during active mouse drag.
  2. *Standard popup window*: Minimized on `Win + D` and shows in Alt+Tab switcher.
  3. *Embedding manifest only in release packaging*: Causes `cargo test` to fail at process initialization with `0xc0000139 (STATUS_ENTRYPOINT_NOT_FOUND)` on MinGW toolchains.
- **Reason / trade-offs**: Delivers 60fps tear-free native drag snapping with zero IPC overhead, protects desktop permanence, and enables automated unit test execution on Windows GNU toolchains.

## D-025 System Resource Metrics Collection & Decoupled Polling (WP-03, Coder)
- **Decision**: Initialize `System::new_with_specifics` refreshing strictly CPU and RAM, execute an initial 200ms sleep before first CPU sample to eliminate 0.0% artifacts, and decouple Disk polling (15s) from CPU/RAM polling (1.5s). Retain an in-memory `SharedMetricsState` (`Arc<RwLock<SystemMetrics>>`) in Tauri runtime for non-blocking instantaneous `get_system_metrics` responses while emitting `metrics-update` events from the background thread.
- **Alternatives considered**:
  1. *Refreshing all system data including full process trees*: Drastically increases CPU usage (>3%) and violates the <0.2% idle CPU requirement.
  2. *Polling on demand from frontend via IPC `setInterval`*: Causes IPC latency and unnecessary thread wakeups.
  3. *Sampling CPU without initial 200ms delta*: Produces an initial false 0.0% reading in the UI.
- **Reason / trade-offs**: Provides instantaneous UI rendering upon widget launch with zero initial 0.0% glitch, sub-0.2% CPU overhead, and adaptive background event streaming.

## D-026 GSMTC Priority Session Arbitration & Binary URI Protocol Streaming (WP-04, Coder)
- **Decision**: Prioritize Spotify sessions by inspecting `SourceAppUserModelId` with fallback to `GetCurrentSession()` and the first available active playback session. Deliver album art through a custom Tauri URI protocol `vvidget://album-art?t=<trackId>` backed by an in-memory `OnceLock<Mutex<HashMap<String, AlbumArtData>>>` capped at 30 items, and decouple playback timeline updates by locally interpolating `position_ms` at 60fps via `requestAnimationFrame` on the client rather than polling IPC. Add `"Foundation_Collections"` to `windows` crate features in `Cargo.toml` to support `GetSessions()` vector traversal.
- **Alternatives considered**:
  1. *Streaming Base64 artwork through JSON IPC*: Emits multi-megabyte strings through IPC on every track change, causing severe serialization overhead and garbage collection pauses.
  2. *Polling GSMTC playback position every second via IPC*: Constant wakeups and IPC traffic for simple linear time progression.
  3. *Unbounded album artwork caching*: Memory leak if hundreds of songs are played over days.
- **Reason / trade-offs**: Zero IPC overhead for smooth 60fps timeline progression, native binary image streaming directly into standard HTML `<img>` elements with browser HTTP cache headers, and priority control of Spotify without requiring OAuth tokens.

## D-027 Open-Meteo & Native Windows Geolocation with Offline Cache Resilience (WP-05, Coder)
- **Decision**: Use WinRT `Windows.Devices.Geolocation::Geolocator` via `tokio::task::spawn_blocking` extracting coordinates through `coordinate.Point()?.Position()?` with graceful error fallback to Open-Meteo Geocoding API (`searchCity`) or saved coordinates. Cache latest successful weather forecast in `localStorage` under `vvidget_weather_cache` and automatically serve cached forecast with `isOffline = true` and visual warning badge when network or API fails.
- **Alternatives considered**:
  1. *Third-party IP geolocation API (ipinfo/ip-api)*: Rate limited, sends device IP to external ad/analytics networks, and inaccurate on VPNs.
  2. *Failing completely on network outage*: Widget disappears or shows an uninformative crash error.
  3. *Blocking main UI thread during WinRT Geolocation*: Freezes window frame if Windows Location prompt or permission check waits.
- **Reason / trade-offs**: Privacy-first zero-key architecture using OS-level geolocation, instant offline resilience showing last known temperatures, and non-blocking asynchronous execution.

## D-028 Windows 11 Fluent Theme System & Unified Docking Surface Integration (WP-06, Coder)
- **Decision**: Integrate automatic theme detection using `window.matchMedia("(prefers-color-scheme: dark)")` with manual theme override ("auto" | "light" | "dark") and dynamic `.theme-light` / `.theme-dark` DOM token toggling. Provide a dual-layout execution model supporting both a unified single-window `DockContainer` (<90 MB RAM working set) and independent multi-window mode (<180 MB RAM working set) coordinated via `sync_widget_windows` in Rust and responsive `AppContent` route dispatching (`?widget=<id>` or default). In independent mode, the `main` window is explicitly hidden to eliminate duplicate widget rendering and prevent exceeding the RAM budget. Group integration IPC commands in `pub mod integration` in `lib.rs` to prevent macro namespace conflicts while registering all media, sysinfo, geo, config, and window commands.
- **Alternatives considered**:
  1. *Hardcoding Dark theme only*: Fails Windows 11 Fluent Design guidelines for users using Light mode or high contrast.
  2. *Forcing only independent multi-window mode*: Exceeds RAM budgets on low-spec systems running multiple WebView2 instances when a unified dock fits comfortably under 90MB.
  3. *Leaving main window open in independent mode*: Renders duplicate widgets in both the main window and floating windows, wasting resident WebView2 memory.
- **Reason / trade-offs**: Delivers authentic Windows 11 Fluent aesthetic and adaptability, satisfies memory constraints, and provides seamless switching between desktop dock and floating widgets.

## D-029 Native Desktop Grid Alignment & Dynamic ListView Spacing FFI (WP-07, Coder)
- **Decision**: Query the real Windows 11 desktop icon grid spacing at runtime using Win32 `SendMessageW(hwnd, LVM_GETITEMSPACING, 0, 0)` on the Explorer `SysListView32` control (traversing `Progman` and fallback `WorkerW` windows), with a calibrated fallback of 120 × 98 logical pixels (240 × 196 physical pixels at 200% DPI). Standardize starter widgets to integer grid spans: Spotify 3×3 (360×294), Resources 3×4 (360×392), Weather 3×5 (360×490), and introduce self-healing configuration migration in `storage.rs` to normalize legacy positions and dimensions.
- **Alternatives considered**:
  1. *Hardcoding legacy 103.5 × 84.5 spacing*: Results in subtle alignment drift against actual Windows 11 desktop icon positions across various display scales.
  2. *Only querying `GetSystemMetrics(SM_CXICONSPACING)`*: SM_CXICONSPACING reflects icon spacing metrics from classic shell dialogs which do not always match the Explorer modern desktop ListView item spacing.
- **Reason / trade-offs**: Delivers authentic native Windows 11 desktop icon grid alignment that automatically adapts to the user's desktop icon metrics and display DPI while ensuring predictable layout geometry.

## D-030 Fluid 1:1 Pointer Tracking with Snap-on-Release & Visual Elevation (WP-07, Coder)
- **Decision**: Replace discrete grid-step dragging in `useGridDrag` with smooth 1:1 real-time cursor tracking on `pointermove` using `appWindow.setPosition(new LogicalPosition(targetX, targetY))`, clamp movements against the combined multi-monitor virtual desktop work area queried via `availableMonitors()` (converting physical work areas to logical coordinates via each monitor's scaleFactor, falling back to `currentMonitor()`), snap to nearest grid cell `Math.round(targetX / gridX) * gridX` on `pointerup`, guard drag initiation with an `isDown` / `active` state machine preventing quick-click teleportation to `(0, 0)`, and broadcast `"config-changed"` on position saves. Cache `DesktopGridMetrics` with a 2-second TTL and validate `SendMessageW` bounds to protect high-frequency `WM_MOVING` callbacks. Apply dynamic visual elevation (`data-dragging="true"`, `scale-[1.01]`, accent ring and elevated shadow) in `HeaderBar` and `WidgetContainer`.
- **Alternatives considered**:
  1. *Snapping on pointer down*: Causes jarring coordinate jumps when user merely clicks or starts dragging a widget.
  2. *Quantizing on every move event*: Produces stepped/choppy dragging visuals that feel sluggish and unresponsive compared to native desktop windows.
  3. *Single-monitor clamping*: Traps widgets on a single screen and prevents cross-display movement in multi-monitor setups.
  4. *Unchecked synchronous SendMessageW per WM_MOVING*: Floods Windows Explorer message queues at 100+ calls/sec during drag.
- **Reason / trade-offs**: Delivers seamless multi-monitor fluid movement, tear-free 60fps tracking without cross-process IPC bottlenecks, eliminates click teleportation race conditions, and maintains global config state coherence across all windows.

## D-031 Strict Execution Security & Non-Blocking Win32 IPC (Fixer C2)
- **Decision**: In `actions/mod.rs` and `launcher/mod.rs`, prohibit all UNC network paths (`\\`, `//`, `\??\`, `file:`, `smb:`, `dav:`) to prevent outbound SMB NetNTLM credential leaks. Disallow space-delimited argument injection for executable targets unless resolving to an existing absolute file on disk, reject dangerous script extensions (`.bat`, `.cmd`, `.vbs`, `.ps1`, `.url`), and query the Windows Registry (`HKCU\Software\Valve\Steam\SteamPath` and `HKLM\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`) directly via `advapi32` to discover Steam libraries on non-default drives. Offload blocking Win32 `ShellExecuteW` calls to `tokio::task::spawn_blocking` to prevent starving the async reactor thread.
- **Alternatives considered**:
  1. *Allowing .url files*: Risks arbitrary protocol handlers and script execution bypassing the URI scheme allowlist.
  2. *Allowing unquoted paths with arbitrary command-line arguments*: Exposes Win32 ShellExecute parameter injection vulnerabilities.
  3. *Calling ShellExecuteW synchronously on async worker threads*: Freezes Tokio reactor for seconds when SmartScreen, Defender, or sleeping drives delay execution.
- **Reason / trade-offs**: Provides complete isolation against remote credential leaks and command execution exploits while keeping async IPC responsiveness high and supporting custom Steam installations across any drive.

## D-032 Concurrency Guards & Error Recovery in Core Hooks (Fixer C6)
- **Decision**: In `useMasterVolume`, introduce `isMutedRef` updated synchronously on drag to guard against duplicate `toggle_master_mute` calls during rapid volume adjustments while muted, and add a periodic 3000ms background polling interval to stay synchronized with external hardware volume changes. In `useSpeedtest`, add an `isDisposed` cancellation pattern to immediately invoke unlisten callbacks if the component unmounts while asynchronous listener registrations are in flight. In `useCalendar`, catch IPC errors in `addNote`, `removeNote`, and `toggleNote`, set error state, and roll back local optimistic state by re-fetching the canonical snapshot from `get_calendar_events`.
- **Alternatives considered**:
  1. *Relying on React state for mute toggling*: Causes multiple rapid slider events in the same render tick to fire duplicate `toggle_master_mute` calls that immediately re-mute audio.
  2. *Ignoring unmount during async event listener import/listen*: Permanently leaks Tauri event listeners in the event manager when components mount and unmount rapidly.
  3. *Swallowing IPC errors silently in calendar hook*: Causes optimistic UI desynchronization where notes appear created or deleted in the frontend despite failing backend persistence.
- **Reason / trade-offs**: Eliminates race conditions in volume unmuting, prevents memory leaks on component unmount, and guarantees eventual consistency and actionable error feedback for calendar operations.

## D-033 Frontend Shell, Grid Dragging Optimization & Fluent Design Tokens (Fixer C5)
- **Decision**: In `useGridDrag`, eliminate duplicate event listener registrations on `document` and redundant `mouseup` listeners, call `e.stopPropagation()` on header pointer move to prevent dual execution via window event bubbling, and clamp `setPosition` IPC calls to deduplicate unchanged coordinates. Calculate multi-monitor virtual desktop bounds using the current window's scale factor `s` rather than per-display scale factors to preserve true logical desktop boundaries. Guard all accesses to `config.widgets` across `AppContent` and `DockContainer` with optional chaining (`config.widgets?.`) to prevent crashes during empty or partial configuration synchronization. Add accessible light-theme status tokens (`--fluent-success`, `--fluent-warning`, `--fluent-error`) in `fluent.css` satisfying WCAG AA contrast. In `Tooltip`, guard popup rendering with `Boolean(content)` to prevent empty styled containers on empty string or null. In `ProgressBar`, sanitize non-finite values (`NaN`, `Infinity`) falling back safely to `min` to ensure compliant ARIA attributes and clean percentage display.
- **Alternatives considered**:
  1. *Keeping listeners on document and window*: Triple-registers listeners during pointer movement at 1000Hz, flooding the Tauri backend with redundant IPC calls.
  2. *Dividing monitor coordinates by individual display scale factor*: Creates artificial coordinate overlap and shrinks available virtual desktop drag boundaries on secondary displays.
  3. *Unchecked property access on config.widgets*: Throws unhandled TypeError on startup when configuration is loaded asynchronously or partially hydrated.
- **Reason / trade-offs**: Delivers smooth, low-latency 60fps widget dragging with minimal IPC overhead, prevents UI crashes on uninitialized config, and ensures accessible, valid Fluent UI component rendering across all theme variants.









## D-034 Build, Profile and WebView Flags Hardening (WP-01)
- **Decision**: Remove `devtools` from default dependencies in `src-tauri/Cargo.toml` and gate it under `[features] debug = ["tauri/devtools"]`. Trim `tokio` features to `["rt-multi-thread", "macros", "time", "sync"]`. Add Win32 features (`Win32_System_Threading`, `Win32_System_RemoteDesktop`). Set `codegen-units = 1` under `[profile.release]`. Export `pub const WEBVIEW_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,TranslateUI"` in `src-tauri/src/window/mod.rs` and apply consistently across all `WebviewWindowBuilder` instances and `tauri.conf.json`. Synchronize manager test execution mutating global positions lock using RAII `TEST_MUTEX`.
- **Alternatives considered**:
  1. *Keeping devtools always enabled*: Leaves Chromium devtools server and inspection overhead in production release binaries.
  2. *Leaving tokio with "full"*: Compiles unnecessary subsystems into the binary.
  3. *Per-window differing browser arguments*: Causes WebView2 process creation failure if windows sharing the same user data folder disagree on browser arguments.
- **Reason / trade-offs**: Substantially reduces release binary footprint, compile times, and WebView2 background memory consumption while ensuring robust multi-window stability.

## D-035 OS Power State & EcoQoS Engine (WP-02)
- **Decision**: Implement enable_current_thread_eco_qos() utilizing Win32 SetThreadInformation with ThreadPowerThrottling (THREAD_POWER_THROTTLING_EXECUTION_SPEED) to force background workers onto Efficiency (E) cores. Create a dedicated background thread running an HWND_MESSAGE window registering for OS power notifications (GUID_CONSOLE_DISPLAY_STATE, GUID_ACDC_POWER_SOURCE, GUID_ENERGY_SAVER_STATUS) via RegisterPowerSettingNotification and session changes (WTSRegisterSessionNotification). Query SHQueryUserNotificationState on a 5-second timer (SetTimer) to detect D3D fullscreen apps or presentation mode. Expose thread-safe PowerState (atomic bools) and PowerManager in Tauri managed state, emitting power-state-changed events only on actual state transitions.
- **Alternatives considered**:
  1. *Polled WMI / PowerShell queries for power state*: Extremely heavy CPU overhead (>3–5% CPU) and latency.
  2. *Async Tokio timer polling for display/session status*: Misses instantaneous OS power events and causes unnecessary C-state wakeups.
  3. *Global process-level EcoQoS*: Degrades foreground UI responsiveness if applied indiscriminately to WebView2 render threads.
- **Reason / trade-offs**: Native Win32 message-only window consumes zero CPU while idle in GetMessageW, responds instantly to lock/display-off/unplug events, and provides thread-level EcoQoS scheduling without impacting UI performance.

## D-036 Demand-Driven Sysinfo Telemetry & Decoupled Process Scans (WP-03)
- **Decision**: Force the sysinfo background thread onto E-cores using `enable_current_thread_eco_qos()`. Gate metrics collection against OS display/session/fullscreen state (`power_state.should_sample()`) and widget visibility (`resources` or `battery`). Scale sampling interval by `power_state.interval_multiplier()`, decouple the heavy process table scan (`refresh_processes_specifics`) to run at most once every 4500ms * multiplier retaining cached `(top_process_name, top_process_cpu)`, and route IPC events using targeted `app.emit_to` (`main` in docked mode, `widget_resources` and `widget_battery` in independent mode) rather than global broadcast.
- **Alternatives considered**:
  1. *Scanning all system processes on every 1.5s tick*: Heavy CPU usage (>1-2%) and continuous power drain on laptops.
  2. *Broadcasting metrics-update globally to all 10 WebView windows*: Forces deserialization and JS event loops in inactive/hidden widget processes.
  3. *Stopping metrics worker completely when hidden*: Requires complex lifecycle thread restart synchronization when widgets toggle visibility; a 3.0s idle sleep loop achieves identical zero CPU overhead without thread management complexity.
- **Reason / trade-offs**: Eliminates 100% of telemetry wakeups when screen is off, session is locked, or widgets are hidden, reduces background process scanning CPU footprint by >70%, and prevents IPC spam across isolated WebView2 processes.

## D-037 Media Monitor Eco-Backoff & Event Gating (WP-05)
- **Decision**: Configure `media-monitor` background worker thread with `enable_current_thread_eco_qos()` to pin polling to Efficiency (E) cores. In the monitor loop, gate sampling on `power_state.should_sample()` and Spotify widget visibility (`config.widgets.get("spotify")`), sleeping for 3.0s and continuing when suppressed. During active playback, poll at `500ms * power_state.interval_multiplier()`; when media is paused or inactive, back off polling to `2000ms * power_state.interval_multiplier()` to minimize idle COM wakeups. Route `media-metadata-update` events via targeted `emit_to` (`main` in docked mode, `widget_spotify` in independent mode) rather than global broadcast. In `gsmtc.rs`, check session count and inspect `Title()` / `Artist()` HSTRING emptiness before string allocations or controls queries, returning `MediaSession::default()` cleanly with zero heap allocations when inactive.
- **Alternatives considered**:
  1. *Continuous 500ms polling when paused or idle*: Unnecessary COM cross-process wakeups and C-state interruptions when no audio is playing.
  2. *Global IPC broadcast of media updates*: Awakens all widget WebViews (weather, clock, resources, etc.) to deserialize media payloads they don't consume.
  3. *Unconditionally allocating strings for empty media properties*: Heap thrashing on every poll cycle when no media is active.
- **Reason / trade-offs**: Eliminates 100% of GSMTC COM queries when display is off, session is locked, or Spotify widget is hidden; backs off idle polling by 4x-12x when inactive; restricts IPC events strictly to consuming windows; and eliminates redundant string allocations during idle states.

## D-038 Native Push Telemetry for Audio & Battery (WP-04)
- **Decision**: Replace active timer polling for master volume and battery status with native OS push telemetry. Implement Win32 COM `IAudioEndpointVolumeCallback` on the default audio endpoint to push `audio-volume-update` events (`{ volume, is_muted }`) immediately upon system volume or mute changes. Hook WinRT `Battery::AggregateBattery().ReportUpdated` with a dedicated EcoQoS worker thread emitting `battery-update` events with `BatteryStatus` when battery state changes (with 10s fallback when discharging, 15s when charging, and 30s when full/plugged in). In frontend hooks `useMasterVolume` and `useBattery`, subscribe to push events, relax polling fallback intervals from 2.5s/3.0s to a 60.0s safety heartbeat, and pause polling completely when `document.hidden` is true.
- **Alternatives considered**:
  1. *Retaining 2500ms and 3000ms frontend setInterval polling*: Causes continuous timers and IPC wakeups even when battery and audio endpoints are completely stationary.
  2. *WMI / Win32 polling loop for audio*: Generates CPU spikes and latency when volume is changed via keyboard media keys.
  3. *Eliminating fallback polling entirely*: If a device changes default audio endpoints or a driver misses an update event, UI could fall out of sync. A 60s safety heartbeat provides 100% resilience with near-zero power draw.
- **Reason / trade-offs**: Delivers sub-100ms instant reaction to physical volume keys and power state transitions, reduces idle frontend polling timers by >95%, and pauses all background polling when widgets or displays are hidden.

## D-039 WebView2 Fullscreen & Display Suspension (WP-06)
- **Decision**: Implement `set_widgets_suspended<R>(app, suspended)` and `set_window_suspended<R>(window, suspended)` in `src-tauri/src/window/webview_power.rs`. When `suspended == true` (fullscreen game, presentation mode, display off, or session locked), iterate all active webview windows via `app.webview_windows()`, skip `"settings"` window and non-widget windows, and call `ICoreWebView2Controller::SetIsVisible(false)` via `with_webview`. This halts Chromium frame rendering, GPU compositing, and DWM presentation. When `suspended == false`, call `SetIsVisible(true)` and trigger immediate refresh via `trigger_resume_refresh(app)` emitting `"metrics-update"` (from cached `SharedMetricsState`), `"battery-update"`, and `"media-metadata-update"`. In `lib.rs`, listen to `"power-state-changed"` events and transition suspension state whenever `power_state.should_sample()` changes.
- **Alternatives considered**:
  1. *Win32 ShowWindow(SW_HIDE) on parent window*: Interacts with vvidget's Win+D subclass hook (`is_allow_hide`) and causes window flicker/layout recalculations.
  2. *Destroying and recreating WebViews on fullscreen/sleep*: Extreme latency on resume (hundreds of milliseconds to reload React/DOM), losing transient UI state.
  3. *Unconditionally polling for fullscreen state in JS frontend*: Inefficient, wastes CPU, and cannot reliably query Win32 D3D fullscreen state.
- **Reason / trade-offs**: `ICoreWebView2Controller::SetIsVisible(false)` is the official Microsoft API to suspend WebView2 compositing without destroying DOM or state, reducing GPU/CPU compositing overhead to 0% during 3D gaming or display sleep, while resuming instantaneously with fresh telemetry snapshots upon return.


## D-040 Frontend Lazy Route-Splitting & Memory Reduction (WP-07)
- **Decision**: Centralize `isTauri()` runtime detection and `safeInvoke<T>(cmd, args)` in `src/utils/tauri.ts` using static imports from `@tauri-apps/api/core`, replacing duplicated dynamic import promises in hooks across the codebase (`useConfig`, `useLauncher`, `useCalendar`, `useSpeedtest`, `useSystemMetrics`, `useBattery`, `useMasterVolume`). In `src/App.tsx`, convert all widget components, `SettingsModal`, and `SkeletonWidget` to dynamic `React.lazy` imports wrapped in `<Suspense fallback={null}>`. In `vite.config.ts`, configure `rollupOptions.output.manualChunks` to split individual widget families (`widget-resources`, `widget-spotify`, `widget-weather`, `widget-speedtest`, `widget-launcher`, `widget-bluetooth`, `widget-battery`, `widget-calendar`, `widget-clock`, `widget-quick-settings`, `view-settings`) and vendor libraries into dedicated chunks.
- **Alternatives considered**:
  1. *Keeping monolithic single frontend bundle*: Every independent WebView window loads and compiles JavaScript bytecode for all 10 widgets simultaneously, wasting ~40–60 MB RAM per window.
  2. *Retaining dynamic imports inside every individual hook*: Duplicates promise allocation and runtime resolution across multiple hooks without type or mock isolation.
- **Reason / trade-offs**: Independent widget windows only load, parse, and evaluate the minimal JavaScript bytecode required for that specific widget, significantly reducing initial memory working set per window while standardizing IPC invocation across all hooks.

## D-041 CSS Compositor, Render & Timer Hygiene (WP-08)
- **Decision**:
  1. Eliminate all leftover `backdrop-blur*` classes from `HeaderBar`, `Tooltip`, `GameLauncherWidget`, and `App.tsx` (frosted blur effect is natively handled by Windows DWM Acrylic material and CSS variable opacity, eliminating compositor pixel shader repaints).
  2. Replace all occurrences of generic `transition-all` across `src/components`, `src/widgets`, and settings pages with discrete compositor-friendly CSS properties (`transition-colors`, `transition-opacity`, `transition-transform`, or `transition-[color,background-color,border-color,opacity,transform]`), and optimize `ProgressBar` to `transition-[width]` rather than full layout `transition-all`.
  3. Extract the 1-second ticking clock face into an isolated `React.memo`'d `ClockFace` subcomponent in `src/widgets/clock/ClockFace.tsx`, keeping 1-second `currentTime` state local to `ClockFace` so that timer, stopwatch, and presets state trees in `ClockWidget` do not re-render every second; align tick updates with `setTimeout(1000 - now % 1000)` on second boundaries; pause ticks when `document.hidden` is true.
  4. In `src-tauri/src/geo/mod.rs`, ensure geolocation queries use asynchronous WinRT `get()` without thread sleep loops. In `src/hooks/useWeather.ts`, cache resolved coordinates in `localStorage` with a 24-hour TTL (`GEO_COORDS_CACHE_TTL_MS`), and pause weather polling when `document.hidden` is true or `navigator.onLine` is false.
- **Alternatives considered**:
  1. *Keeping transition-all*: Causes browser engine to calculate transitions across all CSS properties on every DOM state change, triggering layout recalculations and GPU compositor thrashing.
  2. *Leaving currentTime in top-level ClockWidget*: Forces entire timer/stopwatch/presets tree to reconcile and re-render every 1,000ms.
  3. *Querying Windows geolocation on every 30-minute weather poll*: Wakes native OS GPS/Wi-Fi positioning service repeatedly for a static desktop/notebook location.
- **Reason / trade-offs**: Minimizes GPU and CPU compositor repaints, isolates clock render frequency strictly to `ClockFace`, eliminates unnecessary native geolocation battery drain on stationary devices, and pauses all periodic polling when windows or displays are hidden.

