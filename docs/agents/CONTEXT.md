# CONTEXT (keep ≤300 lines, signatures not implementations)

## Stack & Versions
- **Runtime & Backend**: Tauri v2.12+ (Rust 2021 edition)
- **Frontend Framework**: React 19 + TypeScript 5.7+
- **Bundler & Tooling**: Vite 6.1+
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`) + Windows 11 Fluent Tokens (`src/styles/fluent.css`)
- **Native OS FFI**: `windows` crate v0.58 (GSMTC `Media_Control`, Geolocation, Win32 windowing, DWM Acrylic)
- **Effects & Hardware**: `window-vibrancy` v0.5.2 (Acrylic blur), `sysinfo` v0.33 (system metrics)
- **Type Safety**: `specta` v2.0.0-rc.20 + `tauri-specta` v2.0.0-rc.20
- **Testing**: `vitest` v3.0+ with `@testing-library/react` and `jsdom`

## Commands
- **Install**: `npm.cmd install`
- **Dev**: `npm.cmd run tauri dev` (or `npm.cmd run dev` for web UI preview)
- **Build**: `npm.cmd run build` (runs `tsc && vite build`) & `cargo build --manifest-path src-tauri/Cargo.toml --release`
- **Lint / Typecheck**: `npm.cmd run lint` (runs `tsc --noEmit`) & `cargo check --manifest-path src-tauri/Cargo.toml`
- **Test**: `npm.cmd run test` (runs `vitest run`) & `cargo test --manifest-path src-tauri/Cargo.toml`

## Folder Map
```
c:\Widgetz\
├── docs\agents\               # Specifications, plans, decisions, context
├── src-tauri\
│   ├── Cargo.toml             # Comprehensive dependencies, Windows Win32/WinRT features
│   ├── build.rs               # Tauri build hooks
│   ├── tauri.conf.json        # Tauri v2 configuration (windows, permissions, protocol)
│   ├── capabilities\          # Tauri security capability ACL
│   │   └── default.json
│   ├── icons\                 # Application icons (icon.ico, icon.png)
│   └── src\
│       ├── main.rs            # Entry point for desktop binary
│       └── lib.rs             # Tauri application setup, plugins, modular commands
├── src\
│   ├── main.tsx               # React 19 DOM root mount
│   ├── App.tsx                # Widget shell & multi-widget routing by ?widget=<id>
│   ├── index.css              # Tailwind v4 import & global styles
│   ├── styles\
│   │   └── fluent.css         # Windows 11 Fluent design tokens (Acrylic, Card, Text)
│   ├── utils\
│   │   └── cn.ts              # Class name merging utility (clsx + tailwind-merge)
│   ├── components\
│   │   └── ui\                # Foundational Fluent UI primitives
│   │       ├── Card.tsx       # Translucent frosted panel with 1px stroke
│   │       ├── ProgressBar.tsx# Smooth animated progress bar with variants & a11y
│   │       ├── Badge.tsx      # Pill status badge with variants & icon slot
│   │       ├── Tooltip.tsx    # Elevating floating tooltip
│   │       └── index.ts
│   ├── widgets\
│   │   └── registry.ts        # Widget definitions, dimensions, and metadata
│   └── test\                  # Vitest test setup and test suites
└── vite.config.ts             # Vite + React + Tailwind v4 + Vitest config
```

## Conventions
- **PowerShell / Windows**: Always invoke `npm.cmd` rather than `npm` on this machine.
- **Styling**: Use Windows 11 Fluent tokens (`--fluent-acrylic-bg`, `--fluent-stroke`, Segoe UI Variable). Acrylic backdrop uses native `window-vibrancy` in Rust; CSS provides translucent fallback.
- **Errors**: Rust returns `Result<T, String>` across Tauri IPC. Frontend wraps calls in try/catch or typed specta bindings.
- **Logging**: Use `tauri-plugin-log` via `log::{info, warn, error}`. Logs write to `%APPDATA%/Widgetz/logs/`.
- **Validation**: All IPC and config inputs must be strictly validated before applying.
- **Window Management**: Display widgets must use `WS_EX_TOOLWINDOW` and `WS_EX_NOACTIVATE` to avoid Alt+Tab and focus theft. Settings modal retains standard focus and activation.

## Env Vars
- `VITE_APP_NAME`: Name of the desktop application (default: `Widgetz`).
- `VITE_APP_VERSION`: Semantic version string.

## Shared Types / Schemas
- `WidgetId = "weather" | "spotify" | "resources"`
- `WidgetMetadata`: metadata including dimensions, category, title, description in `src/widgets/registry.ts`.
- `AppConfig`: persisted in `%APPDATA%/Widgetz/config.json`.
- `SystemMetrics`: CPU, RAM, Disk data emitted via Tauri event `metrics-update`.
- `MediaSession`: GSMTC metadata and playback state emitted via `media-metadata-update`.

## Module: UI Primitives (`src/components/ui`)
- `Card`: `<Card variant="acrylic"|"subtle"|"ghost"|"solid" interactive padded>...</Card>`
- `ProgressBar`: `<ProgressBar value={number} max={100} variant="accent"|"success"|"warning"|"error" size="xs"|"sm"|"md"|"lg" showLabel />`
- `Badge`: `<Badge variant="default"|"accent"|"success"|"warning"|"error"|"outline" size="sm"|"md" icon={node}>...</Badge>`
- `Tooltip`: `<Tooltip content={node} position="top"|"bottom"|"left"|"right" delay={200}>...</Tooltip>`
- **Gotchas**: Acrylic requires transparent window background (`bg-transparent` in body) to allow DWM blur through.

## Module: Widget Registry (`src/widgets/registry.ts`)
- `getWidgetMetadata(id: string): WidgetMetadata | undefined`
- `getAllWidgetMetadata(): WidgetMetadata[]`
- **Gotchas**: All new widgets must register default width/height and min bounds in `WIDGET_REGISTRY`.
