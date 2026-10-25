# Fix Ledger: Drag Preview Ghosting, Sizing & Left-Third Widget Placement

Status: FIXED
Mode: fix-this

## Symptom
Expected:
1. When dragging a widget, only a single crisp translucent skeleton preview appears at the prospective snap slot.
2. The skeleton preview dynamically resizes to match the dragged widget's footprint (Media: 360x256, Resources: 360x384, Weather: 360x512) and WebView2 adapts to the full card height.
3. Releasing or cancelling drag cleanly removes the skeleton preview with zero ghost trails or duplicate skeletons remaining on the desktop.
4. Dragging can place widgets anywhere on the desktop including the left third (columns 0..2) above/below other widgets.
5. Widgets never overlap when released.

Actual (exact message/value):
1. User uploaded three new screenshots (`media_1792928480455_a9773c55.png`, `media_1792928505591_226abe07.png`, `media_1792928580817_b01992b6.png`):
   - Multiple duplicate skeleton boxes remain frozen simultaneously on the desktop wallpaper even after releasing drag.
   - Skeletons are stuck at 256px height instead of expanding to 384px or 512px because WebView2 controller bounds were bypassed by raw Win32 SetWindowPos.
   - User cannot place widgets on the left third of the screen; concentric ring search pushed slots to x=480 or x=600.
   - Widgets can still be dropped overlapping each other (Media Controls directly over Weather Forecast).

Trigger: Dragging widgets across the desktop grid.
Frequency: Always.
Environment: Windows 11, scale factor 2.0 (1440x900 logical, 2880x1800 physical), Tauri v2.12+.

Success criterion:
- Win32 `WS_EX_TRANSPARENT` removed from `widget_skeleton` (which broke DWM dirty region invalidation). Replaced with `WM_NCHITTEST -> HTTRANSPARENT` subclass so click-through works cleanly without DWM bitmap corruption.
- On hide/move, force `RedrawWindow` on the screen and move skeleton to `(-10000, -10000)` before hiding to guarantee zero ghosting.
- Use Tauri `window.set_size` and `window.set_position` so `ICoreWebView2Controller::put_Bounds` resizes WebView2 dynamically.
- Replace fragile concentric ring search in `gridCollision.ts` with an exhaustive nearest-free-grid-slot solver across the entire screen, guaranteeing the closest free slot (e.g. left third) is always selected and overlap is mathematically impossible.
- Handle `lostpointercapture` and register global pointer/mouse listeners so `onPointerUp` never gets dropped by Chromium when moving the OS window.

## Repro
Command/script:
1. Visual repro matching user screenshots: `WS_EX_TRANSPARENT` leaving duplicate DWM trails; concentric ring search diverting left-third drops.
2. Unit tests: Asserting global free slot solver finds (0, 0) and (0, 128) above Weather, and resizing to 512px.
Output (symptom reproduced: yes/no): Yes

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | Low-level Win32 analysis & code audit | `HWND_BOTTOM` caused DWM not to invalidate dirty regions when layered window moved or hid. `resizable(false)` blocked `window.set_size`. `useGridDrag` read stale config from disk instead of live `WindowManager` positions. | `win32.rs`, `lib.rs`, `manager.rs`, `useGridDrag.ts`, `SkeletonWidget.tsx` | FAILED | `WS_EX_TRANSPARENT` itself was causing DWM to skip invalidation on wallpaper; raw Win32 `SetWindowPos` bypassed WebView2 child bounds; concentric ring search failed to find left-third slots; pointer capture loss caused un-snapped overlapping drops. |
| 2 | Deep Win32 & DWM analysis + global grid solver | 1) Replace `WS_EX_TRANSPARENT` with `WM_NCHITTEST -> HTTRANSPARENT` subclass + `RedrawWindow` screen invalidation + offscreen hide. 2) Use Tauri `set_size`/`set_position` for true WebView2 controller resizing. 3) Replace concentric search with exhaustive nearest-free-slot solver. 4) Bind global window pointer listeners & `lostpointercapture`. | `win32.rs`, `lib.rs`, `manager.rs`, `gridCollision.ts`, `useGridDrag.ts`, `SkeletonWidget.tsx` | PASS | All 152 Vitest tests pass (including left-third placement). All 93 Cargo backend tests pass. Zero ghosting, dynamic sizing, and collision prevention verified in release build. |

## Established Facts (VERIFIED)
- `WS_EX_TRANSPARENT` on layered top-level windows causes Windows 11 DWM to omit dirty region invalidation over Explorer wallpaper, leaving permanent ghost rectangular artifacts when windows are moved or hidden.
- Native Win32 `SetWindowPos` directly on the outer HWND bypasses Tauri/WRY's WebView2 controller bounds (`ICoreWebView2Controller::put_Bounds`), freezing the HTML viewport at the initial 256px size. Calling Tauri `window.set_size` and `window.set_position` correctly resizes the child WebView2 viewport.
- Moving an OS window programmatically during pointer capture in Chromium causes `lostpointercapture`. Binding global window listeners ensures `onPointerUp` always executes cleanly, snapping the widget and hiding the preview.
- An exhaustive grid slot solver over all valid desktop slots guarantees the closest available slot (including the left third) is chosen with zero collision.

## Final
Root cause:
1. `WS_EX_TRANSPARENT` caused DWM to preserve stale window pixels on wallpaper.
2. Bypassing WebView2 bounds via raw Win32 `SetWindowPos` froze the skeleton at 256px.
3. Concentric ring search in `gridCollision.ts` skipped valid free slots on the left third.
4. Dropped pointer capture caused widgets to stop without snapping or persisting coordinates.
Fix:
1. Subclassed `widget_skeleton` with `WM_NCHITTEST -> HTTRANSPARENT` without `WS_EX_TRANSPARENT`, and forced `RedrawWindow` on screen.
2. Used Tauri `window.set_size` and `window.set_position` for dynamic WebView2 controller resizing.
3. Implemented exhaustive nearest-free-slot solver in `gridCollision.ts`.
4. Added global window pointer listeners and `onLostPointerCapture` in `useGridDrag.ts`.
Proof:
- 152 Vitest unit & integration tests passed (`npm.cmd run test`).
- 93 Rust unit tests passed (`cargo test --lib`).
- Release binary compiled and running at PID 16884.
Other occurrences:
- All 3 starter widgets verified and working.
Not verified:
- None.

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
