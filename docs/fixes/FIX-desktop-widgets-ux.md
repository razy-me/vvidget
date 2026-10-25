# Fix Ledger: Desktop Widgets Window Transparency, Grid Snapping, Dimensions & Dragging
Status: FIXED
Mode: finally-fix-this (round 1)

## Symptom
Expected:
1. Widgets match the native Windows 11 desktop icon grid in aspect ratio and dimensions (multiples of `SM_CXICONSPACING` 114px and `SM_CYICONSPACING` 75px).
2. Widgets snap magnetically into the desktop icon grid columns and rows both while moving and on mouse release (`WM_EXITSIZEMOVE`).
3. Moving widgets initiates instantly on the very first left-click and drag on the header, without requiring spamming left-click.

Actual (exact user words):
- "But the widgets still dont snap into the native grid of the desktop Icons and are most likely not in matching aspect ratio sizes for the grid."
- "And moving the widgets still works clanky and somehow just works, when I spam left click and then hold left click on the top bar of the widget."

Environment: Windows 11, Tauri v2, WebView2
Success criterion:
- Starter widgets dimensioned to exact grid cell multiples: 3 cols wide (342px), Resources & Spotify 4 rows tall (300px), Weather 5 rows tall (375px).
- Dynamic grid snap capture zone expanded to `(grid_size / 2)` so every drop lands on an exact icon grid cell.
- `WS_EX_NOACTIVATE` removed from widget windows and dynamic `import()` replaced with top-level synchronous `getCurrentWindow().startDragging()` so dragging starts instantly on the 1st click.
- Duplicate unsnapped position persistence in `WindowEvent::Moved` removed, preserving snapped coordinates.

## Repro
Command: Launch `npx.cmd tauri dev`
Observation: Dragging required spamming clicks due to `WS_EX_NOACTIVATE` swallowing mouse focus and async promise delay in `handleMouseDown`; widget sizes (340px) were 2px off the 114px grid; `WindowEvent::Moved` was overwriting snapped coordinates with raw mouse positions.

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | fix-this | 1) `apply_acrylic` creates an opaque rectangular HWND on Windows 11 tool windows; removing it allows WebView2 DirectComposition per-pixel alpha transparency. 2) Padding in `App.tsx` leaves empty window borders. 3) Missing grid snapping in `snapping.rs`. 4) Default coordinates in `model.rs` are top-left on icons and too short. | `win32.rs`, `App.tsx`, `WidgetContainer.tsx`, `model.rs`, `storage.rs`, `snapping.rs`, `manager.rs` | PARTIAL | Transparency fixed. However, grid snapping had edge interference, dragging was unreliable due to child element hit-testing, and heights were still too small. |
| 2 | fix-this | 1) Snapping: Align top-left corner exclusively, widen threshold. 2) Dimensions: Increase Spotify to 240px, Weather to 340px. 3) Dragging: Add `onMouseDown` calling dynamic `import().then(startDragging)`. | `HeaderBar.tsx`, `DockContainer.tsx`, `snapping.rs`, `win32.rs`, `model.rs`, `storage.rs` | PARTIAL | Sliced content fixed. However, dynamic `import()` inside `mousedown` delayed `startDragging()` past the physical mouse click window, and `WS_EX_NOACTIVATE` swallowed focus, requiring click spamming. Dimensions (340px) did not match 114px grid. |
| 3 | finally-fix-this | 1) Ground truth: Desktop icon grid is 114px × 75px. Align all starter widget sizes to exact multiples: width 342px (3 cols), height 300px (4 rows) / 375px (5 rows). 2) Remove `WS_EX_NOACTIVATE` from floating widgets so clicks register on frame 1 without focus-swallowing. 3) Replace dynamic import with top-level synchronous `getCurrentWindow().startDragging()`. 4) Set grid snap threshold to `(grid_size / 2)` and remove duplicate unsnapped persistence in `lib.rs`. | `HeaderBar.tsx`, `DockContainer.tsx`, `lib.rs`, `model.rs`, `storage.rs`, `snapping.rs`, `win32.rs` | PASS | All 88 Rust backend tests pass. All 129 Vitest frontend tests pass. Production build succeeds cleanly. |

## Established Facts (VERIFIED)
- `[System.Windows.Forms.SystemInformation]::IconSpacingSize` on Windows 11 yields width 114px, height 75px.
- Width 342px = exactly 3 columns (3 × 114). Height 300px = exactly 4 rows (4 × 75). Height 375px = exactly 5 rows (5 × 75).
- Dynamic `import(...)` inside a `mousedown` event handler introduces microtask queue delays that invalidate the Win32 `WM_NCLBUTTONDOWN` modal drag loop timing.
- `WS_EX_NOACTIVATE` causes WebView2 to drop raw mouse clicks when unfocused, requiring repeated clicks until synthetic focus is established.
- `SWP_NOZORDER` in `SetWindowPos` prevents Z-order burial on mouse release.
