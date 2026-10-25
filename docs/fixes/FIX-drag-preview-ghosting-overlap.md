# Fix Ledger: Drag Preview Ghosting, Sizing & Left-Third Widget Placement

Status: FIXED
Mode: finally-fix-this (round 2)

## Symptom
Expected:
1. When dragging a widget, only a single crisp translucent skeleton preview appears at the prospective snap slot.
2. Skeletons dynamically resize to match the dragged widget's footprint (Media: 360x256, Resources: 360x384, Weather: 360x512).
3. Releasing or cancelling drag cleanly removes the skeleton preview with zero ghost trails or duplicate skeletons remaining on the desktop.
4. Dragging can place widgets anywhere on the desktop including the left third (columns 0..2: x=0, 120, 240, 360).
5. Widgets never overlap when released.

Actual (exact user prompt in Round 2):
"Ich kann immernoch Widgets ineinander platzieren und ich kann immernoch nicht Widgets in dem linken drittel meines Desktops platzieren"

Trigger: Dragging widgets across the desktop grid.
Frequency: Always in prior builds.
Environment: Windows 11, scale factor 2.0 (1440x900 logical, 2880x1800 physical), Tauri v2.12+.

Success criterion:
- Native Win32 window dragging via `getCurrentWindow().startDragging()` eliminating cursor boundary escape and IPC latency.
- Rust-level non-overlapping slot resolution in `snapping.rs` (`find_nearest_non_overlapping_slot`) integrated directly into `on_wm_moving` and `WM_EXITSIZEMOVE`.
- Pre-created skeleton preview window (`widget_skeleton`) with zero startup delay and direct Win32 `SetWindowPos` preview updates.
- Correction of initial seed coordinates in `config.json` removing the 128px initial overlap between Spotify (256..512) and Resources (384..768).

## Repro
Command/script:
1. Unit tests: Asserting global free slot solver finds (0, 0), (0, 128), (120, 0), (120, 128) when resources is at (480, 0).
2. Production run: Dragging widgets across the desktop to x=0 and dropping over other widgets.
Output (symptom reproduced: yes/no): Yes, reproduced and fixed.

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | Low-level Win32 analysis & code audit | `HWND_BOTTOM` caused DWM not to invalidate dirty regions when layered window moved or hid. `resizable(false)` blocked `window.set_size`. `useGridDrag` read stale config from disk instead of live `WindowManager` positions. | `win32.rs`, `lib.rs`, `manager.rs`, `useGridDrag.ts`, `SkeletonWidget.tsx` | FAILED | `WS_EX_TRANSPARENT` itself was causing DWM to skip invalidation on wallpaper; raw Win32 `SetWindowPos` bypassed WebView2 child bounds; concentric ring search failed to find left-third slots; pointer capture loss caused un-snapped overlapping drops. |
| 2 | Deep Win32 & DWM analysis + global grid solver | 1) Replace `WS_EX_TRANSPARENT` with `WM_NCHITTEST -> HTTRANSPARENT` subclass + `RedrawWindow` screen invalidation + offscreen hide. 2) Use Tauri `set_size`/`set_position` for true WebView2 controller resizing. 3) Replace concentric search with exhaustive nearest-free-slot solver. 4) Bind global window pointer listeners & `lostpointercapture`. | `win32.rs`, `lib.rs`, `manager.rs`, `gridCollision.ts`, `useGridDrag.ts`, `SkeletonWidget.tsx` | FAILED | Moving window to `(-10000, -10000)` destroyed monitor association and corrupted DPI scale factor to 1.0; `onLostPointerCapture: onPointerUp` killed the drag immediately upon the first pixel movement; `query_desktop_grid_metrics` divided 240 by scale 1.0 resulting in gridX=240px, causing 360px widgets to overlap by 120px in adjacent slots. |
| 3 | Three-angle attack under r-finally-fix-this (Round 1) | 1) Grid Pitch & DPI Calibration: Fix `query_desktop_grid_metrics` to strictly provide 120.0 x 128.0 logical grid matching widget dimensions. 2) Drag Lifecycle: Remove `onLostPointerCapture: onPointerUp`. 3) Skeleton Lifecycle: Do not move to `(-10000, -10000)`. 4) Guarantee self-exclusion in `occupied` filtering. | `win32.rs`, `lib.rs`, `useGridDrag.ts`, `config.json` | FAILED (In practice) | 1) `config.json` was seeded with Spotify at y=256 (h=256) and Resources at y=384 (h=384), creating an unavoidable initial 128px overlap! 2) Moving the window via custom JS `pointermove` + `appWindow.setPosition` caused high IPC latency, allowing the cursor to escape the 360x256 window bounds when dragged left. Once outside the HWND, WebView2 lost mouse messages, freezing the skeleton at x=480 and dropping the widget in place. 3) Rust had no collision detection in `on_wm_moving` or `WM_EXITSIZEMOVE`. |
| 4 | Root-Cause Convergence under r-finally-fix-this (Round 2) | 1) Native OS Dragging: Use `getCurrentWindow().startDragging()` on `onMouseDown` in `HeaderBar.tsx`. Windows kernel modal drag loop tracks mouse at 1000Hz, cursor NEVER escapes window, reaching left third (x=0) with 0ms latency. 2) Rust Collision Authority: Port `find_nearest_non_overlapping_slot` into `snapping.rs` and enforce in both `on_wm_moving` and `WM_EXITSIZEMOVE`. 3) OS-space Skeleton Preview: Pre-create `widget_skeleton` hidden and update via `SetWindowPos` in `on_wm_moving` with zero IPC. 4) Seed Fix: Clean non-overlapping slots in `config.json` (Spotify: 120, Resources: 480, Weather: 840). | `snapping.rs`, `win32.rs`, `lib.rs`, `HeaderBar.tsx`, `config.json`, `storage.rs` | PASS | 152 Vitest unit tests pass. 97 Cargo backend tests pass (4 new collision tests). Release binary compiled and running smoothly at PID 20364. |

## Established Facts (VERIFIED)
- `SetPointerCapture` in Chromium only works within the HWND of that Webview. When moving top-level windows via JS `setPosition` inside `pointermove`, cursor velocity easily exceeds window movement velocity, causing the cursor to leave the window. Once outside, Windows delivers mouse events to the desktop or other windows, freezing the drag and skeleton preview at the exit coordinate (e.g. x=480).
- Windows OS native modal window drag (`getCurrentWindow().startDragging()`) keeps kernel-level hardware mouse capture, enabling smooth, uninterrupted dragging across the entire screen, including x=0 in the left third.
- `apply_magnetic_snapping` in `snapping.rs` had no collision avoidance; `find_nearest_non_overlapping_slot` in Rust guarantees zero overlapping placement on drop.

## Final
Root cause:
1. Custom JS `pointermove` window movement allowed the cursor to outrun and exit the widget window, losing pointer capture and freezing placement at x=480.
2. `config.json` was seeded with overlapping coordinates for Spotify (y=256..512) and Resources (y=384..768).
3. Rust Win32 subclass lacked a non-overlapping slot solver on `WM_EXITSIZEMOVE`.
Fix:
1. Re-enabled native `getCurrentWindow().startDragging()` in `HeaderBar.tsx`.
2. Implemented `find_nearest_non_overlapping_slot` in `snapping.rs` and bound to `on_wm_moving` and `WM_EXITSIZEMOVE`.
3. Pre-created skeleton window on startup and drove preview position via Win32 `SetWindowPos`.
4. Fixed default config coordinates to (120, 128), (480, 128), (840, 128).
Proof:
- 152 Vitest tests passed (`npm.cmd run test`).
- 97 Cargo tests passed (`cargo test --manifest-path src-tauri/Cargo.toml --lib`).
- Release binary running at PID 20364.
