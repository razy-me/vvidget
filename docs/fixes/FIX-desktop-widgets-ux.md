# Fix Ledger: Desktop Widgets Window Transparency, Grid Snapping, Dimensions & Dragging
Status: FIXED
Mode: fix-this (round 2)

## Symptom
Expected:
1. Widgets snap magnetically to the Windows Desktop Grid (columns and rows derived from `SM_CXICONSPACING` and `SM_CYICONSPACING`) both while dragging and upon mouse release (`WM_EXITSIZEMOVE`).
2. Widget content fits comfortably without truncation (Spotify Controls media buttons fully visible; Weather Forecast hourly trend cards visible).
3. Dragging a widget works 100% reliably on the first click and drag, regardless of whether the user clicks on the grip handle, icon, or title text.

Actual (exact message/value):
1. Grid snapping was not engaging properly because widget width (340px) is not a multiple of the desktop icon grid width (114px on high-DPI Windows 11). Attempting to snap both left and right edges caused the right edge to constantly override the left edge, shifting the visual anchor away from grid columns. Additionally, `DefSubclassProc` was skipped in `WM_MOVING`, and `WM_EXITSIZEMOVE` did not perform drop snapping.
2. Spotify Controls height (200px) sliced off the media buttons (`|◀ ▶ ⏭`); Weather Forecast height (250px) completely hid the hourly/daily forecast cards.
3. In `HeaderBar.tsx`, child elements (`<Tooltip>`, `<GripHorizontal SVG>`, `<span className="icon">`, `<h2 className="title">`) did not inherit `data-tauri-drag-region` and intercepted mouse clicks. Clicking the grip or title text hit an element without drag handling, working only ~1/3 times when clicking the empty background.

Environment: Windows 11, Tauri v2, WebView2
Success criterion:
- Desktop grid snapping aligns the top-left corner to multiples of `SM_CXICONSPACING` / `SM_CYICONSPACING` with an expanded magnetic threshold (`grid_size / 3`) and snaps cleanly on drop.
- Spotify widget height increased to 240px; Weather widget height increased to 340px; Resources height increased to 270px; self-healing config migration upgrades stored configurations.
- `onMouseDown` with imperative `startDragging()` plus `pointer-events-none` on header icons and text ensures 100% reliable drag initiation on first click.

## Repro
Command: Launch `npx.cmd tauri dev`
Observation: Screenshot (`media_1792889094297_8fd70ee9.png`) showed sliced Spotify playback controls, clipped weather tabs, and user reported grid snapping failing and drag only working 1/3 times.

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | fix-this | 1) `apply_acrylic` creates an opaque rectangular HWND on Windows 11 tool windows; removing it allows WebView2 DirectComposition per-pixel alpha transparency. 2) Padding in `App.tsx` leaves empty window borders. 3) Missing grid snapping in `snapping.rs`. 4) Default coordinates in `model.rs` are top-left on icons and too short. | `win32.rs`, `App.tsx`, `WidgetContainer.tsx`, `model.rs`, `storage.rs`, `snapping.rs`, `manager.rs` | PARTIAL | Transparency fixed cleanly. However, grid snapping had edge interference, dragging was unreliable due to child element hit-testing, and heights were still too small for full content. |
| 2 | fix-this | 1) Snapping: Align top-left corner exclusively (eliminating right/bottom edge conflicts with asymmetric widget dimensions), widen magnetic threshold to `(grid_size / 3)`, call `DefSubclassProc` in `WM_MOVING`, and snap on mouse release in `WM_EXITSIZEMOVE`. 2) Dimensions: Increase Spotify to 240px, Weather to 340px, Resources to 270px, and self-heal existing configs. 3) Dragging: Add `onMouseDown` calling `getCurrentWindow().startDragging()` and `pointer-events-none` on header icons/text. | `HeaderBar.tsx`, `DockContainer.tsx`, `snapping.rs`, `win32.rs`, `model.rs`, `storage.rs` | PASS | All 88 Rust backend tests pass (including new `test_snap_to_desktop_grid_asymmetric_dimensions`). All 129 Vitest frontend tests pass. Frontend production build passes. |

## Established Facts (VERIFIED)
- In WebView2, child DOM elements do not inherit `data-tauri-drag-region`; clicks on un-attributed children (like SVG icons or headings) do not trigger native window dragging unless `pointer-events-none` or imperative `startDragging()` is used.
- When widget width (340px) is not an integer multiple of desktop icon grid width (114px), snapping both right and left edges creates conflicting displacements. Grid snapping must align the top-left corner (`moving.left`, `moving.top`).
- Calling `DefSubclassProc` in `WM_MOVING` allows Windows and downstream handlers to maintain drag coordinate state.
- Applying snapping in `WM_EXITSIZEMOVE` guarantees the window snaps into place on mouse release even after rapid drag gestures.
