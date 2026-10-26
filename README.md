# 🪟 vvidget — Lightweight Windows 11 Native Desktop Widgets

**vvidget** ist eine extrem ressourceneffiziente, native Desktop-Widget-Anwendung für Windows 11. Entwickelt auf Basis von **Tauri v2 (Rust 2021)** und **React 19 + TypeScript + Tailwind CSS v4**, fügt sie frei platzierbare oder dockbare Widgets mit echter Windows 11 Fluent Design-Optik (DWM Acrylic, Segoe UI Variable, abgerundete Ecken) direkt auf den Desktop ein.

---

## ✨ Features & Starter-Widgets

1. 🌤️ **Wetter (Weather Widget)**:
   - Live-Temperatur (°C), Gefühlte Temperatur, Luftfeuchtigkeit, Windgeschwindigkeit.
   - WMO-Wetterkonditionen mit lokalisierten Icons & Beschreibungen.
   - 12-Stunden-Trend & 5-Tage-Wettervorhersage.
   - Standortermittlung über die native Windows Location API (`Windows.Devices.Geolocation`) oder manuelle Stadtsuche via Open-Meteo Geocoding.
   - 100% kostenfrei, kein API-Key erforderlich (Open-Meteo API) mit Offline-Cache-Resilienz.

2. 🎵 **Spotify Playback Controls**:
   - Titel, Interpret, Albumname und Cover-Art.
   - Steuerung: Play / Pause, Vorheriger / Nächster Titel.
   - Flüssiger 60 FPS Fortschrittsbalken mit lokaler Zeitstempel-Interpolation.
   - **Zero-Config OS-Integration**: Nutzt die native Windows Global System Media Transport Controls API (GSMTC / WinRT) – funktioniert sofort mit Spotify Desktop und Web ohne Spotify Developer API-Keys oder OAuth-Logins!
   - Effizientes binäres Album-Art Streaming über Custom Tauri URI-Protokoll (`vvidget://album-art?t=...`).

3. 📊 **Systemressourcen (System Resource Utilization)**:
   - **CPU**: Auslastung in % mit Mini-Trend-Sparkline.
   - **RAM**: Belegter und Gesamtspeicher in GB (`Used / Total GB`) mit Prozent-Badge.
   - **Speicher**: Festplattenbelegung in GB (`C: Used / Total GB`) mit Umschaltmöglichkeit auf weitere Laufwerke.
   - Hardwarenahes, asynchrones Polling via Rust `sysinfo` mit getrennten Taktzyklen (CPU/RAM 1.5s, Disk 15s) für minimalste CPU-Last (< 0.2%).

4. 🪟 **Desktop-Integration & Windows 11 Ergonomie**:
   - **Echtes DWM Acrylic Material**: Transluzentes Milchglas über `window-vibrancy`.
   - **Kein Alt+Tab-Clutter & kein Fokusklau**: Ausgestattet mit `WS_EX_TOOLWINDOW` und `WS_EX_NOACTIVATE`.
   - **`Win + D` (Desktop anzeigen) Schutz**: Spezielles Win32-Subclassing verhindert das versehentliche Minimieren der Widgets beim Anzeigen des Desktops.
   - **Natives Win32-Snapping**: Magnetisches Einrasten an Bildschirmkanten und benachbarten Widgets wird im `WM_MOVING`-Message-Handler direkt im OS-Speicher ohne IPC-Latenz berechnet.
   - **Dual-Layout-Modus**:
     - *Independent Mode*: Jedes Widget als frei bewegliches, eigenständiges Desktop-Fenster.
     - *Docked Mode*: Alle Widgets in einer vertikalen, einklappbaren Desktop-Leiste mit ultrakompaktem Speicherbedarf (< 90 MB RAM).
   - **System-Tray**: Schnellzugriff zum Sperren von Positionen, Umschalten der Widgets/Modi, Öffnen der Einstellungen und Anzeigen der Logs.
   - **Resiliente Persistenz**: Automatische Speicherung aller Positionen in `%APPDATA%/vvidget/config.json` mit 500ms Debounce, atomarer Dateischreibung und automatischer `.corrupt`-Wiederherstellung.

---

## 🛠️ Voraussetzungen

- **Betriebssystem**: Windows 11 (oder Windows 10 Version 1809+)
- **Node.js**: v20+ (v24 empfohlen)
- **Rust Toolchain**: Rust 1.80+ (mit `cargo`)
- **WebView2 Runtime**: In Windows 11 standardmäßig vorinstalliert

---

## 🚀 Installation & Start

1. **Repository klonen / Verzeichnis öffnen**:
   ```powershell
   cd c:\Widgetz
   ```

2. **NPM Abhängigkeiten installieren**:
   ```powershell
   npm.cmd install
   ```

3. **Entwicklungsmodus starten**:
   ```powershell
   # Startet den Vite Dev-Server und die native Tauri v2 Desktop-Applikation
   npx.cmd tauri dev
   ```

4. **Produktions-Build erstellen**:
   ```powershell
   npm.cmd run build
   npx.cmd tauri build
   ```

---

## 🧪 Tests ausführen

Das Projekt verfügt über eine umfassende, zweistufige Testsuite mit **86 Rust-Unit/Integrationstests** und **129 React/Vitest-Tests**:

```powershell
# 1. Frontend-Komponenten-, Hook- und Routing-Tests ausführen
npm.cmd run test

# 2. Native Rust-Tests (Windowing, GSMTC, sysinfo, Config-Storage) ausführen
cargo test --manifest-path src-tauri/Cargo.toml --lib

# 3. Linter und TypeScript Type-Check
npm.cmd run lint
```

---

## 📁 Projektstruktur

```
c:\Widgetz\
├── docs\
│   ├── agents\                  # Spezifikationen, Architekturentscheidungen und Testberichte
│   │   ├── SPEC.md              # Anforderungskatalog R1–R9
│   │   ├── TODO.md              # Work Packages und Phasenstatus
│   │   ├── CONTEXT.md           # Architektur- und Schnittstellenhandbuch
│   │   ├── DECISIONS.md         # ADR-Log (D-001 bis D-028)
│   │   └── TEST-REPORT.md       # Detaillierter Testmatrix-Bericht (215 Tests)
│   └── reviews\
│       └── review-findings.md   # Triage-Protokoll des unabhängigen Code-Audits
├── src-tauri\                   # Nativer Rust Backend Core (Tauri v2)
│   ├── capabilities\            # Tauri v2 ACL-Sicherheitsberechtigungen
│   │   └── default.json
│   ├── src\
│   │   ├── config\              # Atomare JSON-Persistenz & Fallbacks
│   │   ├── window\              # Win32 Subclassing, Acrylic & Snapping
│   │   ├── tray\                # System-Tray-Menü & Lazy Window Spawner
│   │   ├── sysinfo\             # Hardware-Metriken (CPU/RAM/Disk)
│   │   ├── media\               # WinRT GSMTC Spotify-Integration & Custom URI
│   │   ├── geo\                 # Windows Location API WinRT Bindings
│   │   └── lib.rs               # Window-Koordination & Tauri-Einstiegspunkt
│   └── Cargo.toml
├── src\                         # React 19 + TypeScript Presentation Layer
│   ├── components\
│   │   ├── ui\                  # Fluent UI Primitives (Card, ProgressBar, Badge, Tooltip)
│   │   ├── layout\              # WidgetContainer & HeaderBar
│   │   └── docking\             # DockContainer & DockItem
│   ├── widgets\                 # Starter-Widgets
│   │   ├── weather\             # WeatherWidget & Vorhersage-Komponenten
│   │   ├── spotify\             # SpotifyWidget & MediaControls
│   │   └── resources\           # ResourceWidget & MiniGraph
│   ├── pages\settings\          # Lazy-loaded SettingsModal
│   ├── hooks\                   # useConfig, useWeather, useMediaPlayback, useSystemMetrics
│   ├── services\weather\        # Open-Meteo Client & WMO-Codes
│   └── App.tsx                  # ErrorBoundary & Query-Routing
└── package.json
```

---

## 🔒 Sicherheit & Datenschutz

- **Lokale Ausführung**: Spotify- und Systemmetriken werden ausschließlich über lokale OS-Schnittstellen (WinRT GSMTC und Performance-Zähler) verarbeitet. Es werden keine Nutzerdaten übertragen.
- **Keine API-Keys**: Die Wetterabfrage erfolgt direkt gegen die freie Open-Meteo API ohne Registrierung oder Weitergabe persönlicher Daten.
- **Strikte Content Security Policy (CSP)**: In `tauri.conf.json` konfiguriert; verhindert Code-Injections und beschränkt Netzwerkverbindungen auf autorisierte Endpunkte.
- **Atomare Persistenz**: Konfigurationsdateien werden über temporäre Zwischendateien atomar ersetzt, um Datenkorruption bei Stromausfall oder plötzlichem Neustart auszuschließen.

---

## 📄 Lizenz

MIT License — Frei verwendbar für private und kommerzielle Zwecke.
