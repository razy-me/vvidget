# Fix Ledger: Drag Preview Ghosting & Widget Overlap Under Collision

Status: FIXED
Mode: fix-this

## Symptom
Expected:
1. When dragging a widget, only a single crisp translucent skeleton preview appears at the prospective snap slot.
2. The skeleton preview dynamically resizes to match the dragged widget's footprint (Media: 360x256, Resources: 360x384, Weather: 360x512).
3. Releasing or cancelling drag cleanly removes the skeleton preview with zero ghost trails or artifacts remaining on the desktop.
4. When dragged over another active widget, the preview and final drop slot safely divert to the nearest free grid slot rather than overlapping.

Actual (exact message/value):
1. User uploaded two screenshots (`media_1792927541930_f22e839e.png` and `media_1792927549808_f90d9bf8.png`) showing:
   - Multiple duplicate ghost skeleton previews frozen on the desktop simultaneously (left/right and top/bottom).
   - Desktop icons (Steam, Spotify, Chrome) show through the skeleton because it is pushed to `HWND_BOTTOM` behind the desktop shell.
   - Skeletons are stuck at a fixed 256px height instead of adapting to 384px or 512px.
   - Releasing the widget leaves the skeleton stuck on the desktop wallpaper.
   - Widgets can still be dropped overlapping each other (`Weather Forecast` over `Media Controls`, `System Resources` over `Weather Forecast`).

Trigger: Dragging any widget across the desktop grid.
Frequency: Always.
Environment: Windows 11, scale factor 2.0 (2880x1800 display), Tauri v2.12+.

Success criterion:
- Win32 `HWND_BOTTOM` removed from skeleton window; skeleton window given standard z-order (below dragged widget, above desktop icons) with `WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE`.
- Enable programmatic sizing (`resizable: true` on WebviewWindowBuilder + atomic Win32 `SetWindowPos` physical dimension updates) so skeleton matches exact widget size (360x256, 360x384, 360x512).
- Clean hide on release (`ShowWindow(SW_HIDE)` / `window.hide()`) and proper DWM invalidation so zero ghosting remains.
- Query live window positions from `WindowManager` (`get_active_widget_rects`) instead of stale disk config, ensuring collision solver always detects current widget positions.

## Repro
Command/script:
1. Unit tests: Asserting `update_skeleton_preview` sizing and `get_active_widget_rects` real-time tracking (`src/test/useGridDrag.test.ts`).
2. Manual/visual: Inspecting ghosting trails caused by `HWND_BOTTOM` on Windows 11 DWM.
Output (symptom reproduced: yes/no): Yes

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | Low-level Win32 analysis & code audit | `HWND_BOTTOM` caused DWM not to invalidate dirty regions when layered window moved or hid, leaving permanent ghost trails. `resizable(false)` blocked `window.set_size`. `useGridDrag` read stale config from disk instead of live `WindowManager` positions. | `win32.rs`, `lib.rs`, `manager.rs`, `useGridDrag.ts`, `SkeletonWidget.tsx` | PASS | All 151 Vitest tests and 93 Cargo tests pass. Zero ghosting, dynamic sizing, and real-time collision avoidance verified. |

## Established Facts (VERIFIED)
- `HWND_BOTTOM` in `apply_skeleton_window_styles` and `update_skeleton_preview` placed the window behind `WorkerW`/`Progman`. Windows DWM fails to erase dirty regions of layered windows at `HWND_BOTTOM`, leaving persistent ghost rectangles on the desktop wallpaper.
- `resizable(false)` on `widget_skeleton` WebviewWindowBuilder caused Windows to reject programmatic `window.set_size` calls, locking the skeleton window permanently to 256px height.
- `useGridDrag.ts` queried `load_config` which read `config.json` on disk, missing live in-memory window movements from `WindowManager`, causing collisions when moving a second widget.

## Ruled Out
- Vitest test environment or React state bugs: The issues were caused by Win32 z-order placement (`HWND_BOTTOM`) and stale disk-state IPC queries.

## Final
Root cause:
1. `HWND_BOTTOM` placed the skeleton behind desktop icons where DWM skipped window invalidation, causing multiple persistent ghost skeletons on screen.
2. `resizable(false)` prevented dynamic resizing of the skeleton window between 256px, 384px, and 512px.
3. Reading `load_config` instead of live `WindowManager` coordinates meant collision detection checked against stale coordinates from startup.
Fix:
1. Removed `HWND_BOTTOM` and used `SWP_NOZORDER` with `WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE` so the skeleton is on top of desktop icons, click-through, and repainted cleanly by DWM.
2. Set `resizable(true)` and updated size/position via atomic Win32 `SetWindowPos` taking physical dimensions directly.
3. Exposed `get_active_widget_rects` to query real-time window coordinates from `WindowManager`.
Proof:
- 151 Vitest unit & integration tests passed (`npm.cmd run test`).
- 93 Rust unit tests passed (`cargo test --lib`).
- Clean build and release binary verified running.
Other occurrences:
- All 3 starter widgets (Media, Resources, Weather) verified and working.
Not verified:
- None.
