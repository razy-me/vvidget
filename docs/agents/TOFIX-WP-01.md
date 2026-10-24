# TOFIX WP-01 — Round 1

Diff: 847ac3b51e0ba009e9a094f0b62d4d120c5d588e..9833e722323ec48d6928aeb65f1f9ea91be57c8a   Verdict: APPROVED

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | MINOR | src/types/window.ts:3-14 | Duplicated type definitions: `LayoutMode` and `WidgetPlacement` are declared independently in both `src/types/window.ts` and `src/types/config.ts`. | Import `WidgetPlacement` and `LayoutMode` from `@/types/config` instead of redefining them in `window.ts`. | fixed |
| 2 | MINOR | src-tauri/src/window/win32.rs:219-224 | Standard Win32 documentation states that an application processing and altering coordinates during `WM_MOVING` should return `TRUE` (`LRESULT(1)`) rather than delegating to `DefSubclassProc`. | Return `LRESULT(1)` directly after executing `on_wm_moving` in `widget_subclass_proc`. | fixed |
| 3 | ENHANCEMENT | src-tauri/src/window/manager.rs:75 | `WindowManager::locked` atomic flag is not synchronized when `set_widgets_locked` is executed in `src-tauri/src/config/mod.rs`. | Inject `State<WindowManager>` into `set_widgets_locked` to synchronize the atomic flag with `AppConfig.lock_positions`. | fixed |
| 4 | ENHANCEMENT | src-tauri/src/window/win32.rs:54 | Programmatic window repositions (via `window.set_position()`) do not update `TRACKED_WINDOWS` until an active user drag occurs. | Add a method on `WindowManager` to update `TRACKED_WINDOWS` when programmatic placement changes are applied. | fixed |

## Questioned Decisions
- **D-024 (Native MinGW Linker Resource Manifest & Subclassing Snapping)**: Agreed. Linking `libresource.a` in `build.rs` prevents the `STATUS_ENTRYPOINT_NOT_FOUND` entrypoint failure in MinGW `cargo test` runs, while zero-IPC Win32 memory `WM_MOVING` adjustments provide smooth snapping.

## Previously rejected items — judgement
None (Round 1).
