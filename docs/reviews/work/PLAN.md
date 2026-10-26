# Review Execution Plan (`PLAN.md`)

## Scope & Tier
- **Target**: Entire `vvidget` repository (Rust Backend + React/TS Frontend + Windows 11 Fluent Design System)
- **Scope Size**: 104 source files, ~20,756 LOC
- **Tier**: Tier 3 (Full Repository Audit)
- **Budget**: 11 subagents total (Cap: 17)

## Partitions & Fractions

| ID | Name | Paths | LOC | Risk | Lens | Status |
|---|---|---|---|---|---|---|
| M1 | Core Windows Native & Backend Host | `src-tauri/src/window/*`, `src-tauri/src/lib.rs`, `src-tauri/src/tray/*`, `src-tauri/src/actions/*` | ~4,200 | HIGH | F1 (dual_lens: true) | done |
| M2 | Data Persistence & External Services | `src-tauri/src/config/*`, `src-tauri/src/speedtest/*`, `src-tauri/src/calendar/*`, `src-tauri/src/geo/*` | ~2,100 | MEDIUM | F1 | done |
| M3 | Hardware & System Telemetry Backend | `src-tauri/src/battery/*`, `src-tauri/src/bluetooth/*`, `src-tauri/src/sysinfo/*`, `src-tauri/src/media/*`, `src-tauri/src/launcher/*` | ~3,300 | HIGH | F1 (dual_lens: true) | done |
| M4 | Frontend Shell, Docking & Design Tokens | `src/App.tsx`, `src/components/layout/*`, `src/components/docking/*`, `src/components/ui/*`, `src/hooks/useGridDrag.ts`, `src/utils/gridCollision.ts`, `src/styles/fluent.css`, `src/index.css` | ~2,200 | MEDIUM | F1 | done |
| M5 | System & Hardware Widgets & Hooks | `src/widgets/battery/*`, `src/widgets/bluetooth/*`, `src/widgets/resources/*`, `src/widgets/quick-settings/*`, `src/hooks/useBattery.ts`, `src/hooks/useSystemMetrics.ts`, `src/hooks/useMasterVolume.ts` | ~2,400 | MEDIUM | F1 | done |
| M6 | Productivity & Media Widgets & Settings | `src/widgets/clock/*`, `src/widgets/calendar/*`, `src/widgets/spotify/*`, `src/widgets/weather/*`, `src/widgets/launcher/*`, `src/widgets/speedtest/*`, `src/services/weather/*`, `src/pages/settings/*` | ~4,500 | MEDIUM | F1 | done |
| X1 | Cross-Cutting: IPC & Concurrency Contracts | All `src-tauri/src/**` Tauri commands vs `src/hooks/**` & `src/types/**` | Cross | HIGH | F2 | done |
| X2 | Cross-Cutting: Win11 Fluent UX & Screenshot Audit | All widgets UI, CSS tokens, Segoe typography, screenshot visual flaws | Cross | MEDIUM | F2 | done |
| V1 | Verification of Severe Findings | All CRITICAL and MAJOR findings from above | Cross | HIGH | F3 | pending |
