# Fix Ledger: Desktop Widgets Window Transparency, Grid Snapping, Dimensions & Dragging
Status: FIXED
Mode: finally-fix-this (round 2)

## Symptom
Expected:
1. Widgets move EXCLUSIVELY along the native Windows Desktop Grid (discrete columns and rows of 114px x 75px), just like desktop icons with "Align icons to grid" enabled.
2. Widgets cannot be moved freely around to arbitrary non-grid floating pixel positions; every movement strictly snaps to discrete grid coordinates ($n \times 114, m \times 75$), occupying multiple grid positions (3 columns x 4 rows for Resources and Spotify, 3 columns x 5 rows for Weather).
3. Any existing off-grid coordinates in `%APPDATA%/Widgetz/config.json` are automatically quantized to the desktop grid on startup.

Actual (exact user words):
- "Du bekommst es wirklich nicht hin, dass die Widgets an das native Desktop Grid snappen oder? Ich kann sie immer noch frei herum bewegen, das will ich aber nicht, ich will sie, wie die normalen Desktop Icons auch, nur in einem Raster bewegen können. Dabei sollen die Widgets logischerweise mehrere Raster PPositionen einnehmen, da sie ja auch größer als nur einr Raster Position sind."

Environment: Windows 11, Tauri v2, WebView2
Success criterion:
- Independent widgets bypass the continuous free-floating Win32 OS caption drag (`HTCAPTION` / `data-tauri-drag-region`) and use dedicated grid-quantized pointer dragging (`useGridDrag`).
- As the user drags the mouse, the widget jumps from grid cell to grid cell (114px horizontally, 75px vertically) with pointer capture, making free-floating arbitrary movement physically impossible.
- Instant atomic persistence via `save_widget_position` on mouse release and startup auto-quantization of legacy coordinates in `storage.rs`.

## Repro
Command: Launch `npx.cmd tauri dev`
Observation: User dragged Spotify widget and it floated continuously to arbitrary coordinates (`x=293, y=61.5`) overlapping other widgets instead of jumping cell-by-cell in the desktop icon grid.

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | fix-this | 1) Remove `apply_acrylic` for transparency. 2) Remove padding in `App.tsx`. 3) Add desktop grid to `snapping.rs`. | `win32.rs`, `App.tsx`, `WidgetContainer.tsx`, `model.rs` | PARTIAL | Transparency fixed. Content still cramped. |
| 2 | fix-this | 1) Expand heights. 2) Top-level synchronous `startDragging()` in `HeaderBar.tsx`. 3) Align sizes to grid multiples (342x300, 342x375). | `HeaderBar.tsx`, `snapping.rs`, `model.rs`, `storage.rs` | PARTIAL | Heights and aspect ratios resolved. However, `startDragging()` / `data-tauri-drag-region` triggers Windows OS `HTCAPTION` continuous free-floating movement, which allows the user to place widgets at arbitrary floating pixels rather than constraining movement strictly to the icon grid. |
| 3 | finally-fix-this | 1) Replace OS free-float drag (`HTCAPTION` / `data-tauri-drag-region`) on independent widgets with dedicated discrete grid-quantized dragging hook `useGridDrag` (pointer capture + 114x75 step quantization via `LogicalPosition`). 2) Add `save_widget_position` command for immediate atomic position persistence on drop. 3) Automatically quantize any existing off-grid coordinates in `storage.rs` on startup. | `useGridDrag.ts`, `HeaderBar.tsx`, `WidgetContainer.tsx`, `window.ts`, `lib.rs`, `storage.rs`, `layout.test.tsx` | PASS | All 88 Rust backend tests pass. All 130 Vitest frontend tests pass. Frontend production build passes. Free-float movement eliminated; widgets move exclusively in discrete desktop icon grid steps. |

## Established Facts (VERIFIED)
- Win32 OS native window dragging (`WM_NCLBUTTONDOWN` with `HTCAPTION` via `data-tauri-drag-region` or `startDragging()`) is fundamentally designed for continuous pixel-by-pixel floating movement. DWM hardware composition bypasses client quantization during active dragging.
- To achieve behavior identical to desktop icons ("nur in einem Raster bewegen"), independent widgets must not use OS free-float dragging; they must use discrete grid-quantized pointer movement (`useGridDrag`) where the window position is strictly quantized to $\text{col} \times 114$ and $\text{row} \times 75$.
- Stored config in `%APPDATA%/Widgetz/config.json` contained arbitrary float values (`293.0`, `61.5`); auto-quantization in `load_or_recover_config` snaps them on startup to `(342.0, 75.0)`.
