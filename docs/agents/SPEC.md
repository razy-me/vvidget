# SPEC

## Original Prompt (verbatim)
/r-plan-it Neue Widgets, neben dem Media Control, Wetter und System Monitor.
Ich habe folgende Ideen:
- Internet Speedtest (Download, Upload und Ping)
- Game Launcher (Interaktives Widget, wo man custom Anwendungen hinzufügen kann und neue Games automatisch hinzugefügt werden)
- Schnelleinstellungen (Ein grundwidget, welches man unendlich oft duplizieren kann, um dort Einstellungen zu hinterlegen, damit man nicht immer in den Einstellungen danach suchen muss)
- Kalender
- Timer, Uhr, Stoppuhr, Wecker usw.
- Bluetooth Geräte Manager

Zudem können dir gerne noch verbesserungen an den aktuellen 3 Widgets einfallen und mehr IDeen für neue WIdgets.

Feedback:
Entferne deine Bonus Widgets bitte, die brauche ich beide nicht.
Überlege dir aber Design Verbesserungen für die bestehenden 3 Widgets. Bedenke aber, dass die Widgets so sehr wie ein natives Windows Feature aussehen sollen wie nur möglich.
Baue noch ein neues Widget ein, welches es aber exklusiv für Laptop Systeme gibt. Energieverbrauch der Batterie. Damit ich live sehen kann, wie viel %/min verbraucht wird, wie lange die Batterie noch hält, bis sie auf 10% runter ist und sowas.
Dann setz den Plan nun um.

## Requirements

### Functional Requirements
- **R1: Dynamic & Multi-Instance Widget Registry** [functional]
  - Supports base widget types: `resources`, `spotify`, `weather`, `speedtest`, `launcher`, `quick_settings`, `calendar`, `clock`, `bluetooth`, `battery`.
  - Supports infinite cloneable instances of Quick Settings (`quick_settings_<id>`) in `AppConfig`, `sync_widget_windows`, `App.tsx`, `DockContainer`, Tray, and `SettingsModal`.
  - Provides `resolveBaseWidgetType(widgetId: string): BaseWidgetId` helper.
  - IPC commands: `duplicate_quick_settings_widget` and `remove_widget_instance`.

- **R2: Native Windows 11 Design Polish for Existing 3 Widgets** [functional: design]
  - *All Widgets*: Removal of colored box wrappers around icons; removal of 1px border strokes on inner sub-cards (subtle glass fill only); pill-shaped tab group / segmented controls instead of standalone colored buttons; clean 3-tier text hierarchy.
  - *Media Controls (`spotify`)*: Master system volume slider + mute toggle in footer (via Win32 `IAudioEndpointVolume`); clickable seek timeline; German locale text ("Keine Wiedergabe aktiv").
  - *System Resources (`resources`)*: Live Network I/O throughput (`↓ Download / ↑ Upload` MB/s via `sysinfo::Networks`); top CPU-consuming process badge ("Top: process.exe (xx%)"); thinner 1.5px sparklines matching Windows 11 Task Manager; pill-shaped disk mount selector.
  - *Weather Forecast (`weather`)*: Precipitation probability (`%`) badge; UV Index badge with color levels; Sunrise / Sunset indicator via Open-Meteo API; bare 40×40px weather condition icon without border box; attribution moved to subtle watermark.

- **R3: Internet Speedtest Widget (`speedtest`, 360×256)** [functional]
  - Live measurements of Ping (ms), Jitter (ms), Download (Mbps), and Upload (Mbps) using Cloudflare / LibreSpeed endpoints.
  - Live speed gauge & sparkline progress visualization during tests.
  - History of last 5 test runs persisted in config.

- **R4: Game & App Launcher Widget (`launcher`, 360×384)** [functional]
  - Auto-discovery of installed Steam games (`libraryfolders.vdf`, `appmanifest_*.acf`) and Epic Games (`*.item` manifests).
  - Ability to add custom `.exe` apps, paths, or web URLs with custom names and icons.
  - Search filter, category filtering, and 1-click execution via `ShellExecuteW` / `steam://rungameid/<id>`.

- **R5: Infinite Quick Settings Widget (`quick_settings` & `quick_settings_<id>`, 360×256)** [functional]
  - Customizable tile grid for system toggles and deep links: Sound, Bluetooth, Display, Night Light, Network, Energy, Task Manager, Recycle Bin, and custom paths.
  - Clone button ("+ Klonen" / "+ Duplizieren") to spawn independent desktop widget windows, each with its own saved title and pinned tiles.

- **R6: Calendar & Agenda Widget (`calendar`, 360×384)** [functional]
  - Interactive monthly calendar grid with ISO week numbers (KW), month navigation, and today highlight.
  - Per-day quick notes / reminders stored in `AppConfig` (`calendar_events`).

- **R7: Clock, Timer, Stopwatch & Alarm Widget (`clock`, 360×384)** [functional]
  - Tabbed interface:
    - *World Clock*: Digital & analog display with configurable timezone.
    - *Timer*: Presets + custom countdown with audio/visual notification.
    - *Stopwatch*: Millisecond accuracy with lap recording.
    - *Alarms*: Configurable daily reminders.

- **R8: Bluetooth Device Manager Widget (`bluetooth`, 360×256)** [functional]
  - Enumerates paired and connected Bluetooth devices via WinRT `Windows.Devices.Bluetooth` / `DeviceInformation`.
  - Shows connection status, category icon, battery level (if reported), and quick-link to `ms-settings:bluetooth`.
  - Friendly empty state when Bluetooth is off or no adapter is present.

- **R9: Laptop Battery & Power Analytics Widget (`battery`, 360×384) [Laptop-Exclusive]** [functional]
  - Detected and shown only on battery-powered devices via WinRT `Windows.Devices.Power.Battery`. Completely absent / hidden on desktop systems.
  - Live drain rate in `%/min` calculated over a sliding window (e.g. "−0.28 %/min").
  - Multi-horizon runtime projections: Estimated time remaining until 10%, 20%, and 0%.
  - 20-sample battery capacity sparkline of the last 10 minutes.
  - Charging status badge (Charging ⚡, Discharging 🔋, Full ✓).
  - High drain warning banner (> 1.5 %/min) showing the top CPU consumer process.
  - Quick link to `ms-settings:powersleep`.

- **R10: Complete Multi-Window, Dock & Settings Integration** [functional]
  - All new widgets and `quick_settings_<id>` instances integrated seamlessly into:
    - `App.tsx` multi-window route handler
    - `DockContainer.tsx` unified dock mode
    - `SettingsModal.tsx` widget gallery with toggles and clone buttons
    - Windows System Tray menu with visibility checkboxes.

### Non-Functional Requirements
- **R11: Windows 11 Fluent Design & Native Fidelity** [non-functional: UX]
  - Strictly follows Windows 11 Fluent Design tokens (`--fluent-acrylic-bg`, `--fluent-stroke`, `--fluent-card-bg`, Segoe UI Variable).
  - Strictly aligned to the 120×128 native desktop icon grid.
  - Invisible overhead: Hidden widgets are not mounted as background WebviewWindows.
