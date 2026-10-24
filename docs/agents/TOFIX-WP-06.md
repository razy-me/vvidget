# TOFIX WP-06 — Round 1
Diff: 5457b2dc6721e227ea0d65ab22f3ad87861bae7a..6f9d4d63b155ae033346f690d2dce5e7a6a9848a   Verdict: CHANGES_REQUESTED

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | MAJOR | docs/agents/CONTEXT.md:137 | Weather module documentation clobbered: WP-06 replaced the entire `## Module: Weather Widget & Geolocation` section instead of appending the new WP-06 section. | Restore the Weather Widget documentation section and append the WP-06 module documentation. | fixed |
| 2 | MAJOR | docs/agents/DECISIONS.md:190 | Decision D-027 clobbered: `## D-027 Open-Meteo & Native Windows Geolocation...` was overwritten by `D-028` instead of appending, violating the append-only rule. | Restore D-027 and append D-028 at the end of the file. | fixed |
| 3 | MAJOR | src-tauri/src/lib.rs:118 | `sync_widget_windows` does not hide `main` window in independent mode: `main` window remains visible displaying a squished 3-column canvas while 3 separate widget windows also spawn, running 4 windows and duplicate widgets. | In `sync_widget_windows`, hide `main` window (`if let Some(main) = app.get_webview_window("main") { let _ = main.hide(); }`) when running in independent mode. | fixed |
| 4 | MAJOR | src-tauri/src/lib.rs:218 | `sync_widget_windows` is never called on app startup: only registered as a `config-changed` listener. Default independent layout mode does not spawn floating widget windows on launch. | Call `sync_widget_windows(app.handle().clone())` asynchronously inside the Tauri `.setup()` hook. | fixed |
| 5 | MAJOR | src/components/docking/DockItem.tsx:26 | `DockItem` does not sync with `defaultCollapsed` prop updates: clicking "Collapse all widgets" / "Expand all widgets" in `DockContainer` fails to update already-mounted dock items because React `useState` does not re-initialize on prop changes. | Add `useEffect(() => { setIsCollapsed(defaultCollapsed); }, [defaultCollapsed]);` in `DockItem.tsx` so toolbar expand/collapse toggles take effect. | fixed |
| 6 | MINOR | src-tauri/src/lib.rs:72 | Hardcoded `dark_mode: true` in `open_widget_window` and `setup` ignores user theme setting (`config.theme`), applying dark acrylic tint even in light mode. | Pass `dark_mode: config.theme != "light"` to `WindowSetupOptions`. | fixed |
| 7 | MINOR | src-tauri/src/lib.rs:205 | `main` dock window setup uses `no_activate: false`, causing focus theft from foreground applications whenever user interacts with the desktop dock. | Set `no_activate: true` for the main dock window in `WindowSetupOptions`. | fixed |
| 8 | MINOR | src-tauri/src/lib.rs:242 | Leftover scaffolding dummy test `test_skeleton` (`assert_eq!(2 + 2, 4);`). | Remove `test_skeleton`. | fixed |

## Questioned Decisions
- **D-028 Window layout sync vs main window visibility**: The decision states `sync_widget_windows` coordinates active windows between docked (<90 MB RAM) and independent mode (<180 MB RAM), but the implementation left `main` unhidden during independent mode, causing duplicate widget mounting and risking exceeding the RAM budget.
  - *Response & Resolution*: Fixed. `sync_widget_windows` now explicitly invokes `main.hide()` when running in independent mode, ensuring only individual widget windows are rendered. D-028 has also been updated in `DECISIONS.md`.

## Previously rejected items — judgement
None (Round 1).
