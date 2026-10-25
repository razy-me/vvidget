# Fix Ledger: Drag Preview Ghosting, Sizing & Left-Third Widget Placement

Status: FIXED
Mode: finally-fix-this

## Symptom
Expected:
1. When dragging a widget, only a single crisp translucent skeleton preview appears at the prospective snap slot.
2. Skeletons dynamically resize to match the dragged widget's footprint (Media: 360x256, Resources: 360x384, Weather: 360x512).
3. Releasing or cancelling drag cleanly removes the skeleton preview with zero ghost trails or duplicate skeletons remaining on the desktop.
4. Dragging can place widgets anywhere on the desktop including the left third (columns 0..2) above/below other widgets.
5. Widgets never overlap when released.

Actual (exact message/value):
- User uploaded screenshots (`media_1792930718942_7b4f2acd.png` and `media_1792930714324_b561678c.png`):
  1. User cannot place widgets in the left third of the desktop; skeleton preview was stuck at x=480 while cursor dragged to x=20.
  2. Widgets could still be dropped overlapping each other (Weather directly over Resources at x=240/480).

Trigger: Dragging widgets across the desktop grid.
Frequency: Always.
Environment: Windows 11, scale factor 2.0 (1440x900 logical, 2880x1800 physical), Tauri v2.12+.

Success criterion:
- Enforce strict 120.0 x 128.0 logical desktop grid metrics across backend and frontend, eliminating the DPI virtualization error where `logical_x` became 240.0.
- Remove `onLostPointerCapture: onPointerUp` so pointer movement is never aborted when native OS window moves.
- Filter out current widget ID from occupied list in frontend to guarantee zero self-collision.
- Remove `(-10000, -10000)` off-screen hiding in `hide_skeleton_preview` which caused scale factor loss.

## Repro
Command/script:
1. Unit tests: Asserting global free slot solver finds (0, 0), (0, 128), (120, 0), (120, 128) when resources is at (480, 0).
2. Production run: Dragging Weather Forecast to left third and dropping next to Resources without overlap.
Output (symptom reproduced: yes/no): Yes

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | Low-level Win32 analysis & code audit | `HWND_BOTTOM` caused DWM not to invalidate dirty regions when layered window moved or hid. `resizable(false)` blocked `window.set_size`. `useGridDrag` read stale config from disk instead of live `WindowManager` positions. | `win32.rs`, `lib.rs`, `manager.rs`, `useGridDrag.ts`, `SkeletonWidget.tsx` | FAILED | `WS_EX_TRANSPARENT` itself was causing DWM to skip invalidation on wallpaper; raw Win32 `SetWindowPos` bypassed WebView2 child bounds; concentric ring search failed to find left-third slots; pointer capture loss caused un-snapped overlapping drops. |
| 2 | Deep Win32 & DWM analysis + global grid solver | 1) Replace `WS_EX_TRANSPARENT` with `WM_NCHITTEST -> HTTRANSPARENT` subclass + `RedrawWindow` screen invalidation + offscreen hide. 2) Use Tauri `set_size`/`set_position` for true WebView2 controller resizing. 3) Replace concentric search with exhaustive nearest-free-slot solver. 4) Bind global window pointer listeners & `lostpointercapture`. | `win32.rs`, `lib.rs`, `manager.rs`, `gridCollision.ts`, `useGridDrag.ts`, `SkeletonWidget.tsx` | FAILED | Moving window to `(-10000, -10000)` destroyed monitor association and corrupted DPI scale factor to 1.0; `onLostPointerCapture: onPointerUp` killed the drag immediately upon the first pixel movement; `query_desktop_grid_metrics` divided 240 by scale 1.0 resulting in gridX=240px, causing 360px widgets to overlap by 120px in adjacent slots. |
| 3 | Three-angle attack under r-finally-fix-this | 1) Grid Pitch & DPI Calibration: Fix `query_desktop_grid_metrics` to strictly provide 120.0 x 128.0 logical grid matching widget dimensions. 2) Drag Lifecycle: Remove `onLostPointerCapture: onPointerUp` so window movement doesn't kill drag; listen on window + document. 3) Skeleton Lifecycle: Do not move to `(-10000, -10000)`; use `ShowWindow(SW_HIDE)` + `window.hide()`. 4) Guarantee self-exclusion in `occupied` filtering. | `win32.rs`, `lib.rs`, `useGridDrag.ts`, `config.json` | PASS | 152 Vitest unit tests pass. 93 Cargo backend tests pass. Zero compiler warnings. Release build verified. Left-third placement and zero overlap mathematically and visually verified. |

## Established Facts (VERIFIED)
- `GetDC(HWND(0))` in Win32 without PerMonitorV2 manifest returns 96 DPI (scale 1.0) on Windows 11 even on a 200% scaling display. `SendMessageW(LVM_GETITEMSPACING)` returned physical pixels (240px), resulting in `logical_x = 240.0` instead of `120.0`. Since widgets are 360px wide, adjacent 240px slots overlapped by 120px.
- Calling `SetWindowPos` on the native OS window during pointer capture in Chromium causes Chromium to fire `lostpointercapture`. Binding `onLostPointerCapture: onPointerUp` killed the drag prematurely as soon as the window moved, freezing the skeleton preview at the starting position and dropping the widget un-snapped.
- Moving `widget_skeleton` to `(-10000, -10000)` causes `scale_factor()` to fallback to 1.0 because there is no monitor at negative coordinates, corrupting subsequent `set_position` logical-to-physical conversions.

## Final
Root cause:
1. `onLostPointerCapture: onPointerUp` in `useGridDrag.ts` terminated the drag as soon as the window moved, leaving the skeleton frozen at x=480 and dropping the widget in place.
2. `query_desktop_grid_metrics` evaluated `logical_x = 240.0` (DPI scale miscalculation), making grid slots 240px wide instead of 120px. 360px widgets in adjacent slots overlapped by 120px and skipped column 1 (120px) in the left third.
3. Skeleton off-screen movement to `(-10000, -10000)` corrupted monitor DPI scaling.
Fix:
1. Removed `onLostPointerCapture: onPointerUp` and bound listeners to window + document.
2. Calibrated grid metrics strictly to 120.0 x 128.0 logical pixels.
3. Cleaned up skeleton hiding with `ShowWindow(SW_HIDE)` without moving offscreen.
4. Filtered `widgetId` in frontend to guarantee zero self-collision.
Proof:
- 152 Vitest unit tests passed (`npm.cmd run test`).
- 93 Rust unit tests passed (`cargo test --lib`).
- Clean release build with 0 warnings.
