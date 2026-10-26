# 🪟 vvidget — Native Windows 11 Desktop Widgets

**vvidget** ist eine extrem performante, ressourceneffiziente Desktop-Widget-Suite für Windows 11. Entwickelt auf Basis von **Tauri v2 (Rust 2021)** und **React 19 + TypeScript + Tailwind CSS v4**, fügt sie frei platzierbare oder dockbare Widgets mit nativer Windows 11 Fluent Design-Optik (DirectComposition-Transparenz, Mica/Acrylic-Backdrop-Filter, Segoe UI Variable, abgerundete Ecken) direkt auf den Windows-Desktop ein.

---

## ✨ Die 10 nativen Widgets

1. 🌤️ **Wetter (Weather Forecast)**
   - Live-Temperatur (°C), Gefühlte Temperatur, Luftfeuchtigkeit, Windgeschwindigkeit, Regenwahrscheinlichkeit und UV-Index.
   - WMO-Wetterkonditionen mit lokalisierten Beschreibungen und Icons.
   - 12-Stunden-Trend & 5-Tage-Vorhersage mit Segmente-Umschaltung.
   - Automatische Standortermittlung über die native Windows Location API (`Windows.Devices.Geolocation`) oder manuelle Stadtsuche via Open-Meteo Geocoding.
   - 100% kostenfrei, kein API-Key erforderlich mit Offline-Cache-Resilienz.

2. 🎵 **Spotify & Mediensteuerung (Media Controls)**
   - Titel, Interpret, Albumname und Cover-Art.
   - Steuerung: Play / Pause, Vorheriger / Nächster Titel.
   - Flüssiger 60 FPS Fortschrittsbalken mit lokaler Zeitstempel-Interpolation.
   - Integrierter Windows-Master-Lautstärkeregler mit Stummschaltung.
   - **Zero-Config OS-Integration**: Nutzt die native Windows Global System Media Transport Controls API (GSMTC / WinRT) – funktioniert sofort mit Spotify Desktop, Browsern und Media-Playern ohne API-Keys oder Logins.
   - Effizientes Cover-Streaming über Custom Tauri URI-Protokoll (`vvidget://album-art?t=...`).

3. 📊 **Systemressourcen (System Resources)**
   - **CPU**: Gesamtauslastung in % mit Core-Anzahl und Erkennung des Prozesses mit der höchsten Last.
   - **RAM**: Belegter und Gesamtspeicher in GB (`Used / Total GB`) mit Prozent-Fortschrittsbalken.
   - **Systemlaufwerke**: Festplattenbelegung (`Used / Total GB`) mit Umschaltung zwischen primären und sekundären Partitionen (C:, D:, etc.).
   - **Netzwerk**: Live-Durchsatz für Download und Upload in KB/s bzw. MB/s.
   - Hardwarenahes Polling via Rust `sysinfo` mit getrennten Zyklen für minimale CPU-Last (< 0.2%).

4. 🔋 **Batterie & Energiestatus (Battery & Power)**
   - Genaue Ladestandsanzeige in % mit animiertem Lade-/Entladestatus.
   - Kapazitätsverlauf mit SVG-Sparkline und Trendanzeige.
   - Präzise Laufzeitprognosen: Berechnete Restlaufzeit bis 20%, bis 10% und bis vollständiger Entladung.
   - Erkennung von Netzbetrieb (AC) vs. Akkubetrieb und Schnellzugriff auf die Windows-Energieeinstellungen.

5. 📶 **Bluetooth-Geräte (Bluetooth Devices)**
   - WinRT AQS-Geräte-Enumeration für gekoppelte Audio- und Peripheriegeräte (Galaxy Buds, Headsets, Lautsprecher, Controller).
   - Anzeige des Verbindungsstatus und Auslesen von Batterieständen über Windows PnP/AEP.
   - Quick-Action-Buttons und Direktlink zu den Windows-Bluetooth-Einstellungen.

6. 🚀 **Game & App Launcher**
   - Automatische Erkennung installierter Spiele aus Steam- und Epic Games-Bibliotheken mit echten App-Icons.
   - Schnelle Filterung nach Kategorien (*Alle*, *Steam*, *Epic*, *Eigene*).
   - Integrierte Echtzeit-Suche und Start-Buttons via nativer Windows-Shell-Ausführung.
   - Modal zum manuellen Hinzufügen benutzerdefinierter Spiele oder Programme.

7. ⚡ **Internet Speedtest**
   - Cloudflare Edge-Benchmark für Ping (Latenz), Jitter, Download- und Upload-Geschwindigkeit in Mbps.
   - Animierte Tachometer-Anzeige (Gauge) mit Live-Status und Testverlauf.
   - Thread-sichere Ausführung mit Concurrency-Guard gegen überlappende Messungen.

8. 📅 **Kalender & Notizen (Calendar & Notes)**
   - Vollständige Monatsübersicht mit DIN/ISO-Kalenderwochen (KW) und Navigation (*Vorheriger*, *Heute*, *Nächster*).
   - Markierung des aktuellen Tages und Hervorhebung ausgewählter Daten.
   - Integrierte Tagesnotizen: Hinzufügen und Löschen von Erinnerungen mit atomarer Persistenz.

9. ⏰ **Uhr & Timer (Clock & Timers)**
   - WinUI 3 Segmented Tabs: *Uhr*, *Timer*, *Stoppuhr*, *Wecker*.
   - Weltzeituhr mit Zeitzonenauswahl und Umschaltung zwischen Digital- und Analoganzeige.
   - Countdown-Timer mit Presets (1m, 5m, 15m, 30m), Rundenzeiten-Stoppuhr und automatischer Weckalarm.

10. 🎛️ **Schnelleinstellungen (Quick Settings)**
    - Schnellzugriffskacheln für Sound-Einstellungen, Task-Manager, Display, Bluetooth und Netzwerk.
    - Vollständig konfigurierbar: Kacheln können ein-/ausgeblendet und benutzerdefinierte Aktionen hinzugefügt werden.

---

## 🪟 Windows 11 Desktop-Integration

- **Echte DWM / DirectComposition Transparenz**:
  Keine hässlichen eckigen Trauerränder um abgerundete Fenster. WebView2 DirectComposition rendert mit transparentem Alpha-Kanal direkt auf die Desktop-Ebene.
- **Fluent Acrylic & Mica Alt Material**:
  Transparente Ebenen mit nativer Unschärfe (`backdrop-filter: blur(20px) saturate(180%)`) und dezenten 1px-Bordern (`rgba(255, 255, 255, 0.08)`).
- **`Win + D` & `Win + M` Desktopschutz**:
  Natives Win32-Subclassing intercepts `WM_SHOWWINDOW` und minimierte Off-Screen-Koordinaten `(-32000, -32000)`. Die Widgets bleiben wie echte Desktop-Objekte (Rainmeter-Stil) dauerhaft auf dem Desktop verankert.
- **Berührungsfreie Widget-Header**:
  HeaderBars sind fest in den vertikalen Dokumentenfluss integriert (`relative w-full flex-shrink-0`). Keine Überdeckung von Neuladen-Buttons, Tabs oder Eingabefeldern beim Hovern.
- **Desktop-Raster & Magnetisches Einrasten**:
  Widgets rasten im `WM_MOVING`-Handler im OS-Speicher latenzfrei am Desktop-Icon-Raster (120x98 / 160x120px), an Monitorgrenzen und an benachbarten Widgets ein.
- **Dual-Layout-Modus**:
  - *Independent Mode*: Jedes Widget als frei bewegliches Desktop-Fenster.
  - *Docked Mode*: Alle Widgets in einer vertikalen, einklappbaren Sidebar (< 90 MB RAM).
- **System-Tray**:
  Schnellzugriff zum Sperren der Positionen, Umschalten der Modi, Ein-/Ausblenden einzelner Widgets und Öffnen der Einstellungen.

---

## 🛠️ Voraussetzungen

- **Betriebssystem**: Windows 11 (oder Windows 10 Version 1809+)
- **Node.js**: v20+ (v24 empfohlen)
- **Rust Toolchain**: Rust 1.80+ (mit `cargo`)
- **WebView2 Runtime**: In Windows 11 vorinstalliert

---

## 🚀 Installation & Start

1. **Repository klonen / Verzeichnis öffnen**:
   ```powershell
   cd c:\vvidget
   ```

2. **NPM Abhängigkeiten installieren**:
   ```powershell
   npm.cmd install
   ```

3. **Entwicklungsmodus starten**:
   ```powershell
   npx.cmd tauri dev
   ```

4. **Produktions-Build erstellen**:
   ```powershell
   npm.cmd run build
   npx.cmd tauri build
   ```

---

## 🧪 Qualitätssicherung & Testsuite

Das Projekt wird durch eine zweistufige, automatisierte Testsuite mit **409 Tests** abgesichert:

```powershell
# 1. Frontend-Komponenten-, Hook- und Layout-Tests (Vitest)
npm.cmd test
# Ergebnis: 31 Testdateien, 256 Tests bestanden

# 2. Native Rust Backend-Tests (Win32, Snapping, GSMTC, Storage, Concurrency)
cargo test --manifest-path src-tauri/Cargo.toml
# Ergebnis: 153 Tests bestanden

# 3. TypeScript Type-Check & Linter
npm.cmd run lint
# Ergebnis: 0 Fehler
```

---

## 📁 Projektstruktur

```
c:\vvidget\
├── docs\
│   ├── fixes\                   # Issue-Ledger (Win+D, HeaderBar, Border-Fixes)
│   ├── reviews\                 # r-review-findings.md & FIX-LOG.md
│   └── plans\                   # Architektur- und UI-Spezifikationen
├── src-tauri\                   # Nativer Rust Backend Core (Tauri v2)
│   ├── src\
│   │   ├── actions\             # Windows Schnellaktionen & UAC-Handling
│   │   ├── audio\               # Windows Audio Endpoints & Lautstärkeregelung
│   │   ├── battery\             # Akku-Telemetrie & Laufzeitberechnung
│   │   ├── bluetooth\           # WinRT Bluetooth AQS-Enumeration & Batteriestatus
│   │   ├── calendar\            # Kalenderevents & Notizen-Persistenz
│   │   ├── config\              # Atomare JSON-Persistenz (%APPDATA%/vvidget/config.json)
│   │   ├── geo\                 # Windows Location API WinRT-Bindings
│   │   ├── launcher\            # Steam & Epic Games Registry-/VDF-Scanner
│   │   ├── media\               # WinRT GSMTC Media-Session & URI-Streaming
│   │   ├── speedtest\           # Cloudflare Edge Latenz & Bandbreiten-Benchmark
│   │   ├── sysinfo\             # Hardware-Telemetrie (CPU, RAM, Disks, Netzwerk)
│   │   ├── tray\                # Windows System-Tray Menü & Steuerung
│   │   ├── window\              # Win32 Subclassing, Desktop-Raster, Snapping, Win+D Schutz
│   │   └── lib.rs               # Window-Koordination & Tauri-Einstiegspunkt
│   └── Cargo.toml
├── src\                         # React 19 + TypeScript Presentation Layer
│   ├── components\
│   │   ├── ui\                  # Fluent UI Primitives (Card, ProgressBar, Badge, Tooltip)
│   │   ├── layout\              # WidgetContainer & HeaderBar (In-Flow Layout)
│   │   └── docking\             # DockContainer & DockItem
│   ├── widgets\                 # Die 10 Desktop-Widgets
│   │   ├── battery\             # BatteryWidget & Sparkline
│   │   ├── bluetooth\           # BluetoothWidget
│   │   ├── calendar\            # CalendarWidget & ISO-KW Hilfsfunktionen
│   │   ├── clock\               # ClockWidget (Uhr, Timer, Stoppuhr, Wecker)
│   │   ├── launcher\            # GameLauncherWidget
│   │   ├── quick-settings\      # QuickSettingsWidget
│   │   ├── resources\           # ResourceWidget & MetricBar
│   │   ├── speedtest\           # SpeedtestWidget & Gauge
│   │   ├── spotify\             # SpotifyWidget & MediaControls
│   │   └── weather\             # WeatherWidget, Stündlicher Trend & 5-Tage-Vorhersage
│   ├── pages\settings\          # SettingsModal & WidgetToggleList
│   ├── hooks\                   # Reaktive Hooks für alle Widgets und Konfiguration
│   ├── styles\                  # Fluent CSS Design Tokens (Dark & Light)
│   └── App.tsx                  # Routing & Multi-Window Instanzierung
├── package.json
└── vite.config.ts
```

---

## 🔒 Sicherheit & Datenschutz

- **100% lokale Ausführung**: Medien-, Hardware-, Bluetooth- und Batterie-Telemetrie laufen ausschließlich über lokale Windows-APIs (Win32 & WinRT). Es werden keinerlei Telemetrie- oder Nutzerdaten ins Internet übertragen.
- **Keine API-Keys oder Accounts**: Wetter- und Geschwindigkeitsmessungen nutzen offene Schnittstellen (Open-Meteo, Cloudflare Edge) ohne API-Keys oder Registrierung.
- **Strikte Content Security Policy (CSP)**: In `tauri.conf.json` konfiguriert; schützt vor Code-Injections und beschränkt Netzwerkverbindungen auf autorisierte Endpunkte.
- **Atomare Persistenz**: Konfigurationsdateien werden über temporäre Dateien atomar geschrieben (`save_config_atomic`), um Datenverlust bei Systemabstürzen auszuschließen.

---

## 📄 Lizenz

MIT License — Frei verwendbar für private und kommerzielle Zwecke.
