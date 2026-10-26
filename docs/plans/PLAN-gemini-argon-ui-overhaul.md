# Plan: Native Windows 11 UI/UX Overhaul (Gemini 4 Argon Audit)
**Date**: 2026-10-26 | **Mode**: `r-plan-it` (Compact) | **Status**: DRAFT

## 1. Goal & Requirements
- **Outcome**: Achieve a 100% native Windows 11 (WinUI 3 / Fluent) look and feel by implementing all 5 system-level design enhancements and all 9 widget-specific improvements from the Gemini 4 Argon UI/UX review.
- **Requirements**:
  - `R1` (Hover-Only Outer Header & De-Duplication): Make outer `HeaderBar` (drag handle, lock, settings) invisible by default (`opacity-0 pointer-events-none`) and fade in smoothly (`group-hover:opacity-100 group-hover:pointer-events-auto`) on widget hover or while dragging (`isDragging`), overlayed cleanly without stealing vertical space. Remove redundant inner title headers in `GameLauncherWidget` and compact inner headers in `BluetoothWidget` and `SpeedtestWidget`.
  - `R2` (100% German Localization): Unify all UI strings to German across `WeatherWidget`, `wmoCodes.ts`, `HourlyTrend`, `DailyForecast`, `BatteryWidget`, `types/battery.ts`, `ResourceWidget`, `SpotifyWidget`, and `HeaderBar`.
  - `R3` (Typography & Flex Collision Fixes): Fix `Tooltip` wrapper in `src/components/ui/Tooltip.tsx` (`w-full flex` support instead of hardcoded `inline-flex`) so `MetricBar` in `ResourceWidget` stretches 100% width with `justify-between`, eliminating `Memory13.4 GB` and `System Drive175.7 GB` text collisions. Fix `ClockWidget` tab bar spacing (`Stoppuhr` / `Wecker` collision).
  - `R4` (Native WinUI 3 Segmented Controls): Replace web-style `rounded-full` pill tabs with native WinUI 3 segmented controls (`rounded-[5px]` / `rounded-md`, subtle track, crisp selection indicator) in `WeatherWidget`, `GameLauncherWidget`, `ResourceWidget`, and `ClockWidget`.
  - `R5` (Win11 DWM Acrylic / Mica Backdrop): Enable translucent desktop bleed-through by lowering `--fluent-acrylic-bg` opacity (`rgba(28, 28, 30, 0.56)`) and applying Windows 11 `DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_ROUND` + `DWMWA_SYSTEMBACKDROP_TYPE` in `win32.rs::apply_acrylic_effect`.
  - `R6` (Weather & Battery Polish): Lower `Open-Meteo` watermark opacity to `0.35`. In `BatteryWidget` / `BatterySparkline`, show a subtle `"Sammle Daten..."` placeholder with soft gradient when `capacity_history.length <= 1` and translate badges (`"Wird entladen"`, `"Wird geladen"`, `"Voll geladen"`).
  - `R7` (Bluetooth Clipping, Battery & Quick Connect/Disconnect): Reduce top bar padding in `BluetoothWidget` so 2 device cards fit without clipping; query additional WinRT/PnP battery properties (e.g., HandsFree/GATT/AEP fallback) in `bluetooth/mod.rs`; add a hover quick-action button (`Trennen` / `Verbinden`) on each device card via new Tauri command `toggle_bluetooth_device(id, connect)`.
  - `R8` (Media Controls Album Cover & Dynamic Blur): Fix `vvidget://` custom URI scheme URL resolution on Windows WebView2 (`http://vvidget.localhost/album-art?t=...` + fallback `data:` URL in `gsmtc.rs`) so GSMTC album covers always render, and add a dynamic blurred album-art backdrop (`blur(40px) opacity-15`) inside `SpotifyWidget`.
  - `R9` (Speedtest, Launcher Icons, Calendar & Clock Polish): Fix `SpeedtestWidget` bottom sub-card clipping (`py-1`, flexible height) and add interactive Play/Hover overlay inside the center gauge circle. In `GameLauncherWidget`, move `+` button next to the search bar and load real Steam/Exe icons (`icon_data_url` extracted in `launcher/mod.rs` from Steam `appcache/librarycache` or exe icon). In `CalendarWidget`, embed the `+` submit icon inside the right side of the note input using `--fluent-accent`. In `ClockWidget`, show icon-only on inactive tabs (with tooltip) + icon+text on the active tab, and remove the duplicate bottom timezone footer.
- **Non-Goals**: Changing the 12x9 desktop grid snapping math or introducing heavy external i18n runtime libraries.
- **Assumptions**: `A1`: German (`de-DE`) is the unified primary UI language across all widgets, matching Calendar, Clock, Speedtest, Bluetooth, and Launcher.

## 2. Technical Design & Contracts
- **Chosen Approach**: Fix layout/CSS primitives at the root (`Tooltip`, `WidgetContainer`, `HeaderBar`, `fluent.css`) first so all 9 widgets immediately gain vertical space and proper flex justification, then enhance the Rust Tauri IPC commands (`bluetooth`, `media`, `launcher`, `win32`) and update each widget's UI and tests.
- **Interfaces / Types / Signatures**:
  - `src-tauri/src/bluetooth/mod.rs`: `#[tauri::command] pub async fn toggle_bluetooth_device(device_id: String, connect: bool) -> Result<bool, String>`
  - `src-tauri/src/config/model.rs` & `src/types/config.ts`: Add `pub icon_url: Option<String>` to `LauncherItem` (populated from Steam `librarycache/<appid>_icon.jpg` or local `.ico`/`.png` as `data:image/...;base64,...`).
  - `src-tauri/src/media/gsmtc.rs`: Serve `album_art_url` directly as `data:{mime};base64,{b64}` (or `http://vvidget.localhost/album-art?t={id}`) to avoid Windows WebView2 `vvidget://` custom scheme origin blocking.
  - `src-tauri/src/window/win32.rs`: `apply_acrylic_effect` invokes `DwmSetWindowAttribute` with `DWMWA_WINDOW_CORNER_PREFERENCE` (`DWMWCP_ROUND = 2`) and `DWMWA_SYSTEMBACKDROP_TYPE` (`DWMSBT_TRANSIENTWINDOW = 3`).
- **Data / State Flow**: `WinRT / Steam Cache -> Rust IPC / Event -> React Hook -> Fluent Card UI`.

## 3. File Touchpoints & Work Breakdown
| ID | Action | File / Module | Change Summary | Depends On | Verify / Test Criterion |
|---|---|---|---|---|---|
| WP-01 | EDIT | `src/styles/fluent.css`, `src/components/ui/Tooltip.tsx`, `src/components/layout/WidgetContainer.tsx`, `src/components/layout/HeaderBar.tsx`, `src-tauri/src/window/win32.rs` | Hover-only floating `HeaderBar` (`opacity-0 group-hover:opacity-100`), fix `Tooltip` `w-full` flex wrapper, DWM Acrylic backdrop + translucent `--fluent-acrylic-bg` | - | `npm.cmd test -- layout primitives` |
| WP-02 | EDIT | `src/services/weather/wmoCodes.ts`, `src/widgets/weather/WeatherWidget.tsx`, `src/widgets/weather/HourlyTrend.tsx`, `src/widgets/weather/DailyForecast.tsx`, `src/types/battery.ts`, `src/widgets/battery/BatteryWidget.tsx`, `src/widgets/battery/BatterySparkline.tsx` | Full German localization for Weather & Battery, WinUI segmented tabs (`rounded-[5px]`), Open-Meteo `opacity-35`, `"Sammle Daten..."` sparkline state for `<= 1` sample | WP-01 | `npm.cmd test -- WeatherWidget battery wmoCodes` |
| WP-03 | EDIT | `src/widgets/resources/ResourceWidget.tsx`, `src/widgets/resources/MetricBar.tsx`, `src-tauri/src/media/gsmtc.rs`, `src/widgets/spotify/SpotifyWidget.tsx` | Fix `ResourceWidget` label/value collisions & unify 3-bar layout + German labels; fix GSMTC cover data URI & add `blur(40px) opacity-15` dynamic cover background in `SpotifyWidget` | WP-01 | `npm.cmd test -- resources spotify` |
| WP-04 | EDIT | `src-tauri/src/bluetooth/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/bluetooth/BluetoothWidget.tsx`, `src/widgets/speedtest/SpeedtestWidget.tsx` | Fix Bluetooth 2-card clipping, add PnP battery fallback + `toggle_bluetooth_device` hover button; fix Speedtest sub-card clipping & add interactive center gauge Play button | WP-01 | `cargo test bluetooth` & `npm.cmd test -- bluetooth speedtest` |
| WP-05 | EDIT | `src-tauri/src/config/model.rs`, `src-tauri/src/launcher/mod.rs`, `src/types/config.ts`, `src/widgets/launcher/GameLauncherWidget.tsx`, `src/widgets/calendar/CalendarWidget.tsx`, `src/widgets/clock/ClockWidget.tsx` | Remove redundant Launcher header, move `+` to search bar, load real Steam/App icons; embed Calendar `+` inside input; fix Clock tab collision (icon-only inactive tabs) & remove duplicate bottom timezone | WP-01 | `cargo test launcher` & `npm.cmd test -- launcher calendar clock` |

## 4. Premortem (Edge Cases, Security, Performance)
- **Callers / Breaking Impact**: Existing Vitest tests assert specific English strings (e.g. `"Overcast"`, `"Feels like"`, `"Discharging"`, `"Hourly"`, `"5 Days"`). All affected test files (`WeatherWidget.test.tsx`, `wmoCodes.test.ts`, `battery.test.tsx`, `resources.test.tsx`, `spotify.test.tsx`, `clock.test.tsx`, `launcher.test.tsx`) must be updated in lockstep with their components.
- **Edge Cases & Error Handling**:
  - Locked widgets still allow hovering to reveal the unlock button in `HeaderBar`.
  - Missing Steam icon cache or missing GSMTC thumbnail gracefully falls back to initials / music icon without broken `<img />` tags.
  - `DwmSetWindowAttribute` on older Windows 10 builds ignores unsupported attributes without failing window creation.
- **Security & Performance**: No continuous CSS `@keyframes` in idle states (preserving `< 1.5%` WebView2 GPU idle budget from `PERF-webview2-gpu-idle-load.md`). Static `blur(40px)` on a single `<img>` in `SpotifyWidget` is cached as a static bitmap texture by Chromium.

## 5. Verification Plan
- **Verification Commands**:
  - `npm.cmd run lint`
  - `npm.cmd run test`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
- **Key Scenarios**:
  1. Hovering a widget smoothly fades in `HeaderBar`; leaving fades it out while freeing ~32px vertical space for inner cards (no clipping in Bluetooth or Speedtest).
  2. `MetricBar` in `ResourceWidget` renders label left-aligned and detail + percentage right-aligned (`w-full justify-between`), and `ClockWidget` tabs never collide.
  3. `SpotifyWidget` renders the real GSMTC album cover + blurred ambient backdrop, and `GameLauncherWidget` renders real Steam icons alongside the compact search/+ bar.
