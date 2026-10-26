# Plan: Widget Suite Expansion & Native Design Polish
**Date**: 2026-10-25 | **Mode**: `r-plan-it` (Compact) | **Status**: DRAFT

## 1. Goal & Requirements
- **Outcome**: Expand vvidget from 3 to 10 modular desktop widgets (including infinite-instance Quick Settings and a laptop-exclusive Battery widget) and polish all existing widgets to match native Windows 11 Widget Board design language.
- **Requirements**:
  - `R1`: **Dynamic & Multi-Instance Widget Registry**: Support widget types (`resources`, `spotify`, `weather`, `speedtest`, `launcher`, `quick_settings`, `calendar`, `clock`, `bluetooth`, `battery`) plus infinite cloneable instances (`quick_settings_<id>`) in `AppConfig`, `sync_widget_windows`, `App.tsx`, `DockContainer`, Tray, and `SettingsModal`.
  - `R2`: **Native Windows 11 Design Polish for Existing 3 Widgets** (see Section 2 "Design Upgrades" below):
    - *Media Controls (`spotify`)*: System volume slider + mute toggle in footer, clickable seek timeline, German locale for idle text.
    - *System Resources (`resources`)*: Live Network I/O throughput (`↓ MB/s` / `↑ MB/s`), Top CPU process badge, GPU utilization (if available via `sysinfo`), optional battery/charging status on laptops.
    - *Weather Forecast (`weather`)*: Precipitation probability (`%`), UV Index badge, Sunrise/Sunset times via Open-Meteo `daily` fields.
  - `R3`: **Internet Speedtest Widget (`speedtest`, 360×256)**: Real-time Ping/Jitter, Download (Mbps), Upload (Mbps) gauge with sparkline via native Cloudflare/LibreSpeed HTTP streams, plus 5-run history.
  - `R4`: **Game & App Launcher Widget (`launcher`, 360×384)**: Auto-discovers Steam (`libraryfolders.vdf` / `appmanifest_*.acf`) and Epic Games (`*.item` manifests), allows custom `.exe` / URL additions, 1-click launch via `ShellExecuteW` / `steam://rungameid/<id>`.
  - `R5`: **Infinite Quick Settings Widget (`quick_settings` & `quick_settings_<id>`, 360×256)**: Cloneable widget with custom title and pinned tile shortcuts (`ms-settings:*` deep links, Task Manager, Recycle Bin, Power Plans, custom commands). "+" button in header or settings to duplicate.
  - `R6`: **Calendar & Agenda Widget (`calendar`, 360×384)**: Interactive monthly grid with ISO week numbers (KW), today highlight, persistent per-day quick notes/reminders stored in `AppConfig`.
  - `R7`: **Clock, Timer, Stopwatch & Alarm Widget (`clock`, 360×384)**: Tabbed: World Clock, Countdown Timer (with presets + custom input, audio/visual notification), Stopwatch with laps, daily Alarms.
  - `R8`: **Bluetooth Device Manager Widget (`bluetooth`, 360×256)**: Paired/connected BT devices via WinRT `Windows.Devices.Bluetooth`/`DeviceInformation`, connection status, category icon, battery level, and quick-open `ms-settings:bluetooth`.
  - `R9`: **🔋 Laptop Battery & Power Analytics Widget (`battery`, 360×384) — Exklusiv für Laptops**: Wird nur angezeigt/erstellt wenn eine Batterie via WinRT `Windows.Devices.Power.Battery` erkannt wird. Enthält:
    - **Live Entladerate**: `%/min` Berechnung via gleitendes 60s-Fenster über `System::Global.chargeRateInMilliwatts` — z.B. „−0.28 %/min".
    - **Laufzeit-Prognosen**: Geschätzte Restzeit bis 10%, 20% und 0% — berechnet aus aktueller Rate + aktueller Kapazität (z.B. „noch ~2h 15min bis 10%").
    - **Live-Kapazitätssparkline**: 20-Messpunkte-Graph der letzten 10 Minuten (0–100%), ähnlich dem CPU-Sparkline im Resources-Widget.
    - **Lademodus-Badge**: „Charging ⚡", „Discharging 🔋", „Plugged In (Full) ✓" — Farbe: grün/amber/blau.
    - **Energie-Effizienz-Score**: Durchschnittliche Entladerate der letzten 30 Minuten vs. aktuelle Rate als einfacher „Besser / Schlechter als üblich"-Indikator.
    - **Tiefschlaf-Warnung**: Wenn Rate > 1.5 %/min (ungewöhnlich hoher Verbrauch) erscheint ein Hinweis mit dem Top-CPU-Prozess als Verursacher.
    - **Schnellzugriff**: Button → öffnet `ms-settings:powersleep` (Windows Energieoptionen).
- **Non-Goals**: Kernel-level temperature drivers (Ring-0), proprietary cloud sync, third-party OAuth, Audio Mixer widget, Notes/Clipboard widget. Battery widget wird auf Desktop-Systemen ohne Akku NICHT angezeigt (kein Fehler, einfach unsichtbar/absent).
- **Assumptions**: `A1`: All widgets use 120×128 grid (360×256, 360×384, or 360×512). `A2`: External URI/command execution is strictly allowlisted. `A3`: German locale for user-facing default text.

---

## 2. Native Windows 11 Design Upgrades (Existing 3 Widgets)

### Design Philosophy
The Windows 11 Widget Board and native apps (Settings, Task Manager, Clock) follow these principles that vvidget currently deviates from in small but noticeable ways:

1. **No colored icon backgrounds**: Native Windows uses bare monochrome or subtle accent-tinted icons directly — never colored icon circles/boxes (the current `bg-emerald-500/10` wrapper around the music icon, or the `bg-white/5` border-box around the weather icon are non-native patterns).
2. **Segoe Fluent Icons weight**: Windows uses `Segoe Fluent Icons` font-weight and sizing consistently — Lucide icons are close but some are too thick/bold compared to native.
3. **Section cards without visible borders**: Windows 11 uses subtle `rgba(255,255,255,0.04)` fill cards without visible 1px stroke borders in dark mode — the current `border border-[var(--fluent-stroke)]` on every sub-card (CPU section, Memory section, Hourly weather cards) adds visual weight that native widgets don't have.
4. **Pill-shaped tab switchers**: Windows 11 uses a rounded pill container (`bg-[var(--fluent-control-bg)] rounded-full p-0.5`) with the active tab as a filled pill — not individual standalone buttons with accent background.
5. **Temperature & hero numbers**: Windows Weather uses `Segoe UI Variable Display` at `font-weight: 300` (light) for the hero temperature — the current implementation is close but could use explicit `font-light` tracking.
6. **Progress bars**: Windows Task Manager uses thin 2px accent bars without rounded ends for utilization — current ProgressBar is slightly too thick.
7. **Consistent text hierarchy**: Native Windows uses exactly 3 tiers: 12px semibold (labels), 12px regular (values), 10px secondary (captions) — the current mix of 10px/11px/12px/13px creates subtle inconsistency.

### Specific Changes per Widget

#### Media Controls (`spotify`)
| Change | Before | After (Native) |
|---|---|---|
| Source app icon wrapper | `bg-emerald-500/10 rounded-md` colored box | Bare icon, no background wrapper — icon directly with `text-[var(--fluent-text-secondary)]` |
| Status badge | Colored `Badge` component ("Playing" / "Paused") | Subtle `text-[10px] text-[var(--fluent-text-secondary)] uppercase` plain text label (like native "Now Playing" in Windows media overlay) |
| Album art corners | `rounded-lg` (8px) | `rounded-xl` (12px) — matching Windows 11 media cards |
| Controls: Play button | Standalone `bg-[var(--fluent-accent)]` circle | Slightly larger (40px), with `backdrop-blur` and `ring-1 ring-white/10` for glass effect like native media flyout |
| **NEW: Volume slider** | Not present | Horizontal slider in footer: system master volume via Win32 `IAudioEndpointVolume`, mute toggle icon, 0-100 range |
| **NEW: Seek bar** | Non-interactive progress display | Clickable/draggable timeline (pointer events enabled on progress bar) with hover time preview |
| Idle state text | English ("No Media Playing") | German ("Keine Wiedergabe aktiv") or system locale |

#### System Resources (`resources`)
| Change | Before | After (Native) |
|---|---|---|
| Section card borders | `border border-[var(--fluent-stroke-subtle)]` | Remove border, keep only `bg-[var(--fluent-card-bg)]/40 rounded-lg` fill (like Task Manager cards) |
| CPU sparkline | 30px height, thick 2.5px stroke | 24px height, 1.5px stroke with sharper line (matching Task Manager mini-graphs) |
| Disk mount selector buttons | Colored accent `bg-[var(--fluent-accent)]` pill | Pill tab group in `bg-[var(--fluent-control-bg)] rounded-full p-0.5` container (native tab switcher pattern) |
| **NEW: Network I/O row** | Not present | New section: `↓ Download / ↑ Upload` throughput in MB/s via `sysinfo::Networks`, with dual mini-sparkline |
| **NEW: Top process badge** | Not present | Below CPU section: "Top: chrome.exe (12%)" showing highest CPU consumer from `sysinfo::Process` |
| **NEW: Battery row** (laptop) | Not present | Conditional section (only shown when battery detected): charge %, charging/discharging icon, estimated time remaining |
| Badge percentage | Colored `Badge` with rounded corners | Monochrome `text-xs tabular-nums font-semibold` inline with subtle color only at warning/error thresholds |

#### Weather Forecast (`weather`)
| Change | Before | After (Native) |
|---|---|---|
| Weather icon container | `bg-white/5 border border-[var(--fluent-stroke)] rounded-2xl p-2` box | Bare icon directly, larger (40×40px), no background/border wrapper — matching native Windows Weather widget |
| Humidity/Wind stat cards | `bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] rounded-lg` | Remove border, use `bg-[var(--fluent-card-bg)]/50 rounded-lg` only (subtler glass) |
| Tab switcher (Hourly/5 Days) | Two individual buttons with `bg-[var(--fluent-accent)]/15` | Pill tab bar: outer `bg-[var(--fluent-control-bg)] rounded-full p-0.5 flex`, active tab `bg-[var(--fluent-card-bg)] rounded-full shadow-sm` (Windows 11 segmented control) |
| Hourly forecast cards | Cards with `border border-[var(--fluent-stroke)]` per hour | Remove per-card borders, use clean vertical columns with subtle separator line between items |
| **NEW: Precipitation probability** | Not present | `🌧 45%` badge below humidity/wind row — data from Open-Meteo `hourly.precipitation_probability` |
| **NEW: UV Index** | Not present | `☀ UV 6` badge with color coding (green/yellow/orange/red) from Open-Meteo `daily.uv_index_max` |
| **NEW: Sunrise / Sunset** | Not present | `↑ 07:12 ↓ 17:45` subtle caption row from Open-Meteo `daily.sunrise` / `daily.sunset` |
| Attribution "Open-Meteo" | Shown inline next to tabs | Move to bottom-right corner as `text-[9px]` watermark |

---

## 3. File Touchpoints & Work Breakdown
| ID | Action | File / Module | Change Summary | Depends On | Verify / Test Criterion |
|---|---|---|---|---|---|
| WP-01 | EDIT | `src/widgets/registry.ts`, `src/types/config.ts`, `src-tauri/src/config/model.rs`, `src-tauri/src/lib.rs` | Expand `WidgetId` to 9 widget types + `resolveBaseWidgetType()` for `quick_settings_<id>` cloning; add default grid-aligned placements & config schemas; add `duplicate_quick_settings_widget` & `remove_widget_instance` IPC | - | `cargo test` & `registry.test.ts` validate all 9 metadata entries |
| WP-02 | EDIT | `src/widgets/spotify/SpotifyWidget.tsx`, `src/widgets/spotify/MediaControls.tsx`, `src/widgets/spotify/TrackProgress.tsx`, `src-tauri/src/audio/mod.rs` | Native design polish (remove icon backgrounds, pill-style badges, glass play button); add Win32 volume slider (`IAudioEndpointVolume`); add clickable seek bar; German idle text | WP-01 | `spotify.test.tsx` passes; volume IPC rust tests pass |
| WP-03 | EDIT | `src/widgets/resources/ResourceWidget.tsx`, `src/widgets/resources/MiniGraph.tsx`, `src/widgets/resources/MetricBar.tsx`, `src-tauri/src/sysinfo/` | Remove section borders, thinner sparkline, pill disk selector; add Network I/O (`sysinfo::Networks`), top process badge, and conditional battery row | WP-01 | `resources.test.tsx` passes; `SystemMetrics` type extended with network + battery |
| WP-04 | EDIT | `src/widgets/weather/WeatherWidget.tsx`, `src/widgets/weather/HourlyTrend.tsx`, `src/widgets/weather/DailyForecast.tsx`, `src/services/weather/openMeteo.ts`, `src/types/weather.ts` | Remove icon/card borders, pill tab switcher; add precipitation %, UV index, sunrise/sunset from Open-Meteo API; move attribution to watermark | WP-01 | `weather.test.tsx` passes; API response parsing includes new fields |
| WP-05 | ADD | `src-tauri/src/speedtest/mod.rs`, `src/widgets/speedtest/SpeedtestWidget.tsx`, `src/hooks/useSpeedtest.ts` | Native async Ping, Download & Upload measurement via Cloudflare speed endpoints with live progress events, gauge/sparkline visualization, and 5-run history | WP-01 | `speedtest.test.tsx` & Rust unit tests verify calculation & error recovery |
| WP-06 | ADD | `src-tauri/src/launcher/mod.rs`, `src/widgets/launcher/GameLauncherWidget.tsx`, `src/hooks/useLauncher.ts` | Steam (`libraryfolders.vdf`/`appmanifest_*.acf`) & Epic Games manifest scanner, custom app/URL addition modal, search/filter, and native process/URI launcher | WP-01 | `launcher.test.tsx` & Rust manifest parser tests pass |
| WP-07 | ADD | `src-tauri/src/actions/mod.rs`, `src/widgets/quick-settings/QuickSettingsWidget.tsx` | Multi-instance Quick Settings with customizable tile grid and "+ Duplicate" button | WP-01 | `quickSettings.test.tsx` verifies tile toggling, customization, instance cloning |
| WP-08 | ADD | `src/widgets/calendar/CalendarWidget.tsx`, `src/widgets/clock/ClockWidget.tsx` | Calendar with month nav, ISO week numbers, per-day notes; Clock with World Clock, Timer, Stopwatch (laps), Alarms | WP-01 | `calendar.test.tsx` & `clock.test.tsx` verify date math, timer, note persistence |
| WP-09 | ADD | `src-tauri/src/bluetooth/mod.rs`, `src/widgets/bluetooth/BluetoothWidget.tsx` | WinRT Bluetooth device enumeration, connection status, battery level, quick-open `ms-settings:bluetooth` | WP-01 | `bluetooth.test.tsx` & Rust fallback tests pass |
| WP-10 | ADD | `src-tauri/src/battery/mod.rs`, `src/widgets/battery/BatteryWidget.tsx`, `src/hooks/useBattery.ts` | WinRT `Windows.Devices.Power.Battery` polling (2s interval), sliding-window %/min drain rate calculation, multi-horizon time-remaining projections (to 10%/20%/0%), capacity sparkline (20 samples), charge-mode badge, efficiency indicator, high-drain warning with top-process name; widget auto-hides/absent on systems without battery | WP-01 | `battery.test.tsx` verifies: rate calc, projections, no-battery graceful hide; Rust unit tests for drain rate sliding window |
| WP-11 | EDIT | `src/App.tsx`, `src/components/docking/DockContainer.tsx`, `src/pages/settings/SettingsModal.tsx`, `src-tauri/src/tray/mod.rs` | Wire all new widgets + dynamic `quick_settings_*` instances into router, dock, settings gallery, and tray | WP-02..10 | Full `vitest run` & `cargo test` green; `tauri build --no-bundle` succeeds |

## 4. Premortem (Edge Cases, Security, Performance)
- **Callers / Breaking Impact**: Existing `config.json` files merge new default widgets seamlessly via `#[serde(default)]` without data loss.
- **Edge Cases & Error Handling**:
  - *No Bluetooth adapter*: Returns empty device list with friendly "Kein Bluetooth-Adapter" state and deep-link to `ms-settings:bluetooth`.
  - *Steam/Epic not installed*: `scan_installed_games` returns `Ok(vec![])`.
  - *Speedtest offline*: Aborts within 5s timeout, preserves previous history.
  - *No battery on desktop*: Battery widget wird schlicht nicht als Fenster geöffnet und nicht im Tray-Menü angezeigt — kein Fehler, kein leeres Widget.
- **Security & Performance**:
  - *Security*: `launch_app_or_uri` and `execute_quick_action` validate against shell injection; only `ms-settings:`, `steam://rungameid/`, `com.epicgames.launcher://`, or existing local file paths allowed.
  - *Performance*: Hidden widgets are not spawned as WebviewWindows. New widgets default to `visible: false` so baseline RAM stays unchanged until user-enabled.

## 5. Verification Plan
- **Verification Commands**:
  - `npm.cmd run lint`
  - `npm.cmd run test`
  - `cargo test --manifest-path src-tauri/Cargo.toml --lib`
  - `npx.cmd tauri build --no-bundle`
- **Key Scenarios**:
  1. **Native Design Consistency**: All 3 existing widgets render without colored icon backgrounds, without visible card borders on sub-sections, with pill-style tab switchers, and with proper text hierarchy (12px/12px/10px tiers).
  2. **Multi-Instance Quick Settings**: Cloning creates `quick_settings_<id>`, opens independent snapped window, persists pinned shortcuts independently.
  3. **Upgraded Data**: Media volume slider adjusts system volume; Resources shows Network I/O + top process; Weather shows UV, rain %, sunrise/sunset.
  4. **New Widget Suite**: Speedtest, Game Launcher, Calendar, Clock/Timer, Bluetooth, und Battery (Laptop) rendern in Fluent Acrylic auf 120×128 Grid.
