# TODO
Plan Status: APPROVED 2026-10-26

## Overview & Scope: Native Windows 11 UI/UX Overhaul (PLAN-gemini-argon-ui-overhaul.md)
Based on Gemini 4 Argon audit feedback: 5 Work Packages addressing system-level styling, full German localization, layout flex/collision fixes, and widget-specific features (Bluetooth connect toggle, GSMTC cover blur, Steam/App icons, Speedtest interactive gauge).

### Work Packages

- [x] **WP-01: System Design Foundations & Header Restyle**
  - **Files**: `src/styles/fluent.css`, `src/components/ui/Tooltip.tsx`, `src/components/layout/WidgetContainer.tsx`, `src/components/layout/HeaderBar.tsx`, `src-tauri/src/window/win32.rs`
  - **Scope**:
    - Floating hover-only `HeaderBar` (`opacity-0 group-hover:opacity-100 transition-opacity`, overlaid absolute or zero-height relative so card content gets full vertical height).
    - `Tooltip` wrapper fix (`w-full` / flex-ready instead of forced `inline-flex` collapsing full-width children).
    - Adjust `--fluent-acrylic-bg` opacity to 0.56 for subtle desktop bleed-through.
    - DWM rounded corner and backdrop styling in `win32.rs`.
  - **Acceptance**: `npm.cmd test -- layout primitives` passes.

- [x] **WP-02: Weather & Battery Localization and Polish**
  - **Files**: `src/services/weather/wmoCodes.ts`, `src/widgets/weather/WeatherWidget.tsx`, `src/widgets/weather/HourlyTrend.tsx`, `src/widgets/weather/DailyForecast.tsx`, `src/types/battery.ts`, `src/widgets/battery/BatteryWidget.tsx`, `src/widgets/battery/BatterySparkline.tsx`, plus tests.
  - **Scope**:
    - Full German weather translations (e.g., "Bedeckt", "Gefühlt", "Regen", "Luftfeuchtigkeit", "Stündlicher Trend", "5-Tage-Vorhersage").
    - WinUI 3 segmented control tabs (`rounded-[6px]`) for Hourly / Daily.
    - Lower Open-Meteo attribution opacity to 0.35.
    - Battery German badges ("Wird entladen", "Wird geladen", "Voll geladen").
    - Battery sparkline placeholder state ("Sammle Daten...") with soft gradient when `<= 1` sample.
  - **Acceptance**: `npm.cmd test -- WeatherWidget battery wmoCodes` passes.

- [x] **WP-03: Resources Flex & Typography Fix + Media Cover Blur**
  - **Files**: `src/widgets/resources/ResourceWidget.tsx`, `src/widgets/resources/MetricBar.tsx`, `src-tauri/src/media/gsmtc.rs`, `src/widgets/spotify/SpotifyWidget.tsx`, plus tests.
  - **Scope**:
    - Fix `MetricBar` text collision with `justify-between` and German labels ("Arbeitsspeicher", "Systemlaufwerk"). Unify CPU/RAM/Storage 3-bar layout.
    - In `gsmtc.rs`, provide direct data URL fallback for `album_art_url`.
    - In `SpotifyWidget`, add dynamic soft-blurred cover backdrop (`blur(40px) opacity-15`).
  - **Acceptance**: `npm.cmd test -- resources spotify` passes.

- [x] **WP-04: Bluetooth Battery & Quick-Toggle + Speedtest Polish**
  - **Files**: `src-tauri/src/bluetooth/mod.rs`, `src-tauri/src/lib.rs`, `src/widgets/bluetooth/BluetoothWidget.tsx`, `src/widgets/speedtest/SpeedtestWidget.tsx`, plus tests.
  - **Scope**:
    - Reduce top header padding in `BluetoothWidget` so 2 devices fit without scrollbar clipping.
    - Enhanced battery level extraction in `bluetooth/mod.rs` and hover "Trennen / Verbinden" action.
    - Fix `SpeedtestWidget` bottom card padding/clipping and add interactive Play button overlay in gauge circle.
  - **Acceptance**: `cargo test bluetooth` and `npm.cmd test -- bluetooth speedtest` pass.

- [x] **WP-05: Launcher Icons & Compact Search + Calendar/Clock Polish**
  - **Files**: `src-tauri/src/config/model.rs`, `src-tauri/src/launcher/mod.rs`, `src/types/config.ts`, `src/widgets/launcher/GameLauncherWidget.tsx`, `src/widgets/calendar/CalendarWidget.tsx`, `src/widgets/clock/ClockWidget.tsx`, plus tests.
  - **Scope**:
    - In `GameLauncherWidget`, remove duplicate inner title and move `+` button next to the search input.
    - Extract real Steam library icons into `icon_url` / load app icon.
    - In `CalendarWidget`, embed `+` button inside note input with accent color.
    - In `ClockWidget`, show icon-only on inactive tabs with tooltips and remove duplicate bottom timezone text.
  - **Acceptance**: `cargo test launcher` and `npm.cmd test -- launcher calendar clock` pass.

## Review & Verification Gates
- [x] **Phase 4: Tier 1 Change Review & Test Suite Pass**
  - `npm.cmd run lint` (0 errors)
  - `npm.cmd test` (29 test files, 234 passed)
  - `cargo test --manifest-path src-tauri/Cargo.toml` (137 passed)
- [x] **Phase 5: Release Build Verification**
  - `npm.cmd run build` (tsc + vite passed)
