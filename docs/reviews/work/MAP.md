# System Architecture Map (`MAP.md`)

## Stack & Core Tech
- **Backend**: Rust 2021, Tauri v2 (`@tauri-apps/api 2.2.0`), `windows` crate (Win32 + WinRT), `sysinfo`, `tokio`, `serde`.
- **Frontend**: React 19, TypeScript 5.7, Vite 6, Tailwind CSS v4, `lucide-react`, `clsx`, `tailwind-merge`.
- **Design Target**: Native Windows 11 Fluent Design System (WinUI 3 / Acrylic / Mica styling, Segoe UI Variable typography).

## Entry Points
- **Backend Root**: `src-tauri/src/main.rs` -> `src-tauri/src/lib.rs::run()`.
- **Frontend Root**: `index.html` -> `src/main.tsx` -> `src/App.tsx`.
- **Window Management**: `src-tauri/src/window/win32.rs` (HWND subclassing, `WS_EX_TOOLWINDOW`, `WS_EX_NOACTIVATE`, DWM).
- **Dock & Grid**: `src/components/docking/DockContainer.tsx`, `src/hooks/useGridDrag.ts` (12x9 desktop snapping grid).

## Trust Boundaries & External IO
- **Tauri IPC Command Gateway**: `src-tauri/src/lib.rs` registers commands for battery, bluetooth, media, speedtest, sysinfo, launcher, calendar, config, and window actions.
- **External Web APIs**: Open-Meteo API (weather & geocoding via `openMeteo.ts`), Cloudflare edge latency & payload test (`speedtest/mod.rs`).
- **Windows Subsystem APIs**: WinRT GeoLocation & GSMTC media controls, Win32 PowerManagement (`GetSystemPowerStatus`), Windows Registry (Game/App scanning for Steam & installed software), Shell execute.
- **Storage**: `%APPDATA%/vvidget/config.json` loaded into memory on startup; mutated through `ConfigManager` with debounced atomic disk persistence.

## Modules & Partitioning
- **M1 (Core Windows Native & Backend Host)**: `src-tauri/src/window/*`, `src-tauri/src/lib.rs`, `src-tauri/src/tray/*`, `src-tauri/src/actions/*`.
- **M2 (Data Persistence & External Services)**: `src-tauri/src/config/*`, `src-tauri/src/speedtest/*`, `src-tauri/src/calendar/*`, `src-tauri/src/geo/*`.
- **M3 (Hardware & System Telemetry Backend)**: `src-tauri/src/battery/*`, `src-tauri/src/bluetooth/*`, `src-tauri/src/sysinfo/*`, `src-tauri/src/media/*`, `src-tauri/src/launcher/*`.
- **M4 (Frontend Shell, Layout, Dragging & Design Tokens)**: `src/App.tsx`, `src/components/layout/*`, `src/components/docking/*`, `src/components/ui/*`, `src/hooks/useGridDrag.ts`, `src/utils/gridCollision.ts`, `src/styles/fluent.css`, `src/index.css`.
- **M5 (System & Hardware Widgets & Hooks)**: `src/widgets/battery/*`, `src/widgets/bluetooth/*`, `src/widgets/resources/*`, `src/widgets/quick-settings/*`, `src/hooks/useBattery.ts`, `src/hooks/useSystemMetrics.ts`, `src/hooks/useMasterVolume.ts`.
- **M6 (Productivity & Media Widgets, Weather Service & Settings)**: `src/widgets/clock/*`, `src/widgets/calendar/*`, `src/widgets/spotify/*`, `src/widgets/weather/*`, `src/widgets/launcher/*`, `src/widgets/speedtest/*`, `src/services/weather/*`, `src/pages/settings/*`, `src/hooks/*`.
