# Review Findings

### [MAJOR] BACKEND-01 Fix `SWP_HIDEWINDOW` stripping in `widget_subclass_proc` to allow `main.hide()` in independent mode
- **Where**: `src-tauri/src/window/win32.rs:195`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When user runs in independent multi-window mode, `main.hide()` is called, but `WM_WINDOWPOSCHANGING` unconditionally removes `SWP_HIDEWINDOW`. The main dock window remains visible alongside floating widgets, doubling RAM consumption.
- **Why**: Windows `Win+D` minimization protection was implemented by indiscriminately stripping `SWP_HIDEWINDOW` for all windows.
- **Fix**: Check if programmatic hide is requested or skip `SWP_HIDEWINDOW` suppression for the `main` dock window when in independent layout mode.

### [MAJOR] BACKEND-02 Persist dragged widget window coordinates to `config.json` on `WM_EXITSIZEMOVE`
- **Where**: `src-tauri/src/window/win32.rs:126`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: spec
- **Scenario**: User drags floating widget to a custom desktop position; upon app restart or toggle, widget position is reset because movement was never written to config.
- **Why**: Snapping and dragging are processed in native Win32 window procedure, but final coordinates are never forwarded to `ConfigManager::save_debounced`.
- **Fix**: Hook `WM_EXITSIZEMOVE` in `widget_subclass_proc`, extract client/window coordinates, convert to logical units, and dispatch to `save_debounced`.

### [MAJOR] BACKEND-03 Add RAII `ComGuard` for WinRT background operations
- **Where**: `src-tauri/src/geo/winrt.rs:5`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: WinRT calls on background threads fail with `0x800401F0` (`CO_E_NOTINITIALIZED`).
- **Why**: Tokio worker threads and background monitoring loops do not initialize COM multithreaded apartments before invoking WinRT APIs.
- **Fix**: Implement an RAII `ComGuard` calling `CoInitializeEx(None, COINIT_MULTITHREADED)` and `CoUninitialize()` on drop, wrapping all WinRT background operations.

### [MAJOR] BACKEND-04 Configure strict Content Security Policy in `tauri.conf.json`
- **Where**: `src-tauri/tauri.conf.json:26`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: If external weather JSON or media tags contain malicious content, the lack of CSP could expose the WebView2 context.
- **Why**: CSP was set to `null` during scaffolding.
- **Fix**: Define strict CSP allowing `'self'`, `widgetz:`, and whitelisted Open-Meteo domains.

### [MAJOR] FRONTEND-01 Define missing CSS tokens in `fluent.css`
- **Where**: `src/styles/fluent.css:3`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Elements referencing `--fluent-control-bg` and `--fluent-control-active` render with transparent backgrounds, breaking tab highlights, hover states, and weather loading skeletons.
- **Why**: The tokens were used across `SettingsModal.tsx` and `WeatherWidget.tsx` but omitted from `fluent.css`.
- **Fix**: Define `--fluent-control-bg` and `--fluent-control-active` in `:root` and `.theme-light`.

### [MAJOR] FRONTEND-02 Clear stale coordinates when saving manual city in `SettingsModal.tsx`
- **Where**: `src/pages/settings/SettingsModal.tsx:139`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User enters a new city in settings, but because `latitude` and `longitude` are not cleared, `useWeather.ts` prioritizes the existing coordinates and silently continues fetching weather for the old city.
- **Why**: `handleCitySearchSubmit` updated `manual_city` but did not reset `latitude` and `longitude` to `null`.
- **Fix**: Set `latitude: null, longitude: null` when submitting a new manual city.

### [MAJOR] FRONTEND-03 Remove duplicate headers in `DockContainer` for `ResourceWidget`
- **Where**: `src/widgets/resources/ResourceWidget.tsx:68`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: architecture
- **Scenario**: In docked mode, `ResourceWidget` renders a nested `WidgetContainer` with an inner `HeaderBar` inside the `DockItem`, duplicating title and lock controls.
- **Why**: `ResourceWidget` encapsulated `WidgetContainer` internally instead of rendering pure content like `SpotifyWidget` and `WeatherWidget`.
- **Fix**: Refactor `ResourceWidget` to render pure widget content and let `App.tsx` handle `WidgetContainer` in independent mode.

### [MINOR] FRONTEND-04 Prevent false offline badge flash on startup
- **Where**: `src/services/weather/openMeteo.ts:113`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: App launch always flashes "Offline" badge momentarily because `getCachedWeather()` forcibly sets `isOffline = true`.
- **Why**: Cache retrieval mutates the cached object with `isOffline = true`.
- **Fix**: Preserve `isOffline: false` in cache read; set offline status only on network failure in `useWeather`.

### [MINOR] FRONTEND-05 Fix `Tooltip` timer overwrite race condition
- **Where**: `src/components/ui/Tooltip.tsx:31`
- **Source**: `review-major` (2026-10-25)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Rapid mouseenter/focus events overwrite `timeoutRef.current`, leaving orphaned timers that trigger unwanted popups.
- **Why**: `showTooltip` did not clear existing timer before setting a new one.
- **Fix**: Call `clearTimeout(timeoutRef.current)` in `showTooltip`.
