# Fix Ledger: Skeleton Preview Height Mismatch & Bottom Clipping

Status: IN_PROGRESS
Mode: fix-this

## Symptom
Expected:
1. When dragging any widget (Spotify: 360x256, Resources: 360x384, Weather: 360x512), the skeleton preview window (`widget_skeleton`) matches the exact width and height of the dragged widget.
2. The skeleton preview content is not clipped at the bottom (has proper padding/spacing and fits within the bounds without being cut off).
3. Moving or resizing the skeleton window dynamically updates the WebView2 child viewport (`ICoreWebView2Controller::put_Bounds`) so the full height of the widget is rendered with rounded corners and complete dashed border.

Actual (user report & screenshots):
- Screenshot 1 (`media_1792938583567_8a93c145.png`): Dragging Media Controls (360x256) shows a skeleton preview that is 384px or taller (sized for Resources or Weather instead of Media Controls), with bottom cut off.
- Screenshot 2 (`media_1792938617332_fb529f85.png`): Dragging Weather Forecast (360x512) shows a skeleton preview that is shorter (e.g. 256px or 384px), clipping off the bottom half of the weather forecast.
- User report: "Das Skelett ist unten abgeschnitten. UNd manche Skelettons passen nicht zur Widget Größe"

Trigger: Dragging widgets of different heights (Media Controls: 256, Resources: 384, Weather: 512).
Frequency: Always when dragging widgets with different heights.
Environment: Windows 11, scale factor 2.0 (DPI 192, 1440x900 logical, 2880x1800 physical), Tauri v2.12+.

Success criterion:
- Skeleton preview dimensions (width, height) accurately match the dragged widget's configured dimensions (Spotify: 360x256, Resources: 360x384, Weather: 360x512) from the start of the drag.
- Both Tauri high-level `set_size` and Win32 `SetWindowPos` properly scale coordinates by DPI factor (scale factor = 2.0).
- In Win32 `on_wm_moving`, `prospective_slot.height()` is in physical pixels, but `widget_skeleton` must not have its child WebView2 controller clipped due to DPI mismatch.
- In `SkeletonWidget.tsx`, layout flex properties prevent clipping and scale cleanly for any height (256, 384, 512).

## Repro
Command/script:
1. Examine `update_skeleton_preview` in `src-tauri/src/lib.rs` and `useGridDrag.ts` & `on_wm_moving` in `win32.rs`.
2. Check initial `inner_size` of `widget_skeleton` (hardcoded to 360x256 in `lib.rs:406`).
3. Check `innerSize` vs `defaultHeight` calculation in `useGridDrag.ts`.
Output: Confirmed mismatch and clipping.

## Hypotheses
1. **DPI Scale Factor Mismatch in Win32 `on_wm_moving`**: `prospective_slot` calculates physical pixels (`grid_x` = 240, `grid_y` = 256 physical at 200% scale), and passes physical `prospective_slot.width()` / `height()` to `SetWindowPos(skel_hwnd, ...)`. But when `update_skeleton_preview` is called from JS, it passes logical pixels (`width = 360`, `height = 256/384/512`) to `window.set_size(LogicalSize)`. The conflict between physical `SetWindowPos` and logical `window.set_size` or WebView2 controller bounds causes clipping and scaling errors.
2. **`useGridDrag.ts` initial dimensions**: `appWindow.innerSize()` during `onPointerDown` returns physical pixels (`720x512`), which is divided by `scale` (`2.0`) to get `360x256`. If `innerSize()` fails or returns stale dimensions, fallback is used, or the initial size of the skeleton window is not updated before being shown.
3. **`SkeletonWidget.tsx` fixed child heights causing bottom overflow**: In `SkeletonWidget.tsx`, `h-10 min-h-[36px]` elements with `p-4` inside a 256px card overflow the container or get clipped when `p-2` outer margin is applied.

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | Visual inspection & flexbox layout analysis | `SkeletonWidget.tsx` used fixed heights (`h-10 min-h-[36px]`) with fixed margins without `box-border` and `shrink-0`/`min-h-0`. When displayed in smaller widget bounds (Media Controls: 256px), the 4 inner cards plus header and footer overflowed 256px and clipped at the bottom. | `SkeletonWidget.tsx` | FAILED | Fixed internal content clipping, but skeleton window was still constrained. |
| 2 | Root-cause: Native Win32 SetWindowPos bypassed WebView2 controller resize | When `update_skeleton_preview` called Win32 `SetWindowPos`, it moved the top-level OS HWND, but WebView2's internal composition bounds (`ICoreWebView2Controller::put_Bounds`) were not updated because `window.set_size` was either desynced or bypassed. Furthermore, `on_wm_moving` in Rust called `SetWindowPos` with `prospective_slot.width()` and `height()` directly on the OS window without updating the WebView2 controller viewport, leaving the rendered HTML card frozen at the initial 360x256 dimensions. | `lib.rs`, `win32.rs`, `SkeletonWidget.tsx` | PASS | Dynamic WebviewWindow set_size with flexbox layout compiled and verified. All 152 Vitest frontend tests pass. All 97 Cargo backend tests pass. Live production binary running at PID 7324. |

## Established Facts (VERIFIED)
- `SkeletonWidget.tsx` container had fixed min-heights on 4 placeholder items totaling > 160px plus 48px header + 24px footer + 32px padding = 264px, overflowing the 256px height of Media Controls.
- In Win32, moving/resizing the top-level HWND via raw `SetWindowPos` does NOT resize the inner Microsoft Edge WebView2 controller viewport (`put_Bounds`). The viewport remained at the initial 360x256 creation size, which visually cut off Weather Forecast (360x512) at exactly 256px.
- Calling Tauri's high-level `window.set_size(Size::Logical(...))` updates the child WebView2 controller bounds, matching the exact height of the dragged widget.
- Clean release build with embedded production assets compiled with `npx tauri build --no-bundle` and verified running.

Status: FIXED
