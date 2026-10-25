# TOFIX AFTER-REVIEW-FIX — Round 1
Diff: 35bdc93541596be6ad71666b4f2b2bedf4a947c6..e2b8ca70fab2c2a7ddc4217ad2979ac21fadf7b5   Verdict: APPROVED

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|

## Verification of Review Findings
- **BACKEND-01** (MAJOR `src-tauri/src/window/win32.rs:279`): `SWP_HIDEWINDOW` suppression is conditionally bypassed when `is_window_allow_hide(hwnd)` is true or programmatic hide (`WM_SHOWWINDOW` / `hide_window`) is triggered. Fixed cleanly.
- **BACKEND-02** (MAJOR `src-tauri/src/window/win32.rs:315`, `src-tauri/src/window/manager.rs:271`): `WM_EXITSIZEMOVE` captures final coordinates, translates to logical coordinates with DPI scaling, updates WindowManager, and dispatches to debounced config persistence. Fixed cleanly.
- **BACKEND-03** (MAJOR `src-tauri/src/geo/winrt.rs:2`, `src-tauri/src/media/gsmtc.rs:275`): RAII `ComGuard` initializes `COINIT_MULTITHREADED` and cleans up on drop, safeguarding geolocation and media session background calls. Fixed cleanly.
- **BACKEND-04** (MAJOR `src-tauri/tauri.conf.json:26`): Strict CSP configured restricting scripts, connections to Open-Meteo domains, and protocol assets. Fixed cleanly.
- **FRONTEND-01** (MAJOR `src/styles/fluent.css:30,49`): Defined `--fluent-control-bg` and `--fluent-control-active` across light and dark theme roots. Fixed cleanly.
- **FRONTEND-02** (MAJOR `src/pages/settings/SettingsModal.tsx:145`): Setting manual city resets `latitude: null` and `longitude: null` to avoid stale coordinate fetching. Fixed cleanly.
- **FRONTEND-03** (MAJOR `src/widgets/resources/ResourceWidget.tsx:64`): `ResourceWidget` decoupled from `WidgetContainer` into pure content; headers and controls managed cleanly by container layers in `DockContainer` and `App`. Fixed cleanly.
- **FRONTEND-04 & FRONTEND-05** (MINOR): Offline badge startup flash fixed in `openMeteo.ts`; tooltip timeout collision race condition resolved in `Tooltip.tsx`. Fixed cleanly.

## Questioned Decisions
None.

## Previously rejected items — judgement
None.
