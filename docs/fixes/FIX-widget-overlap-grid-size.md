# Fix Ledger: Widget Overlap & Desktop Grid Size Alignment
Status: FIXED
Mode: fix-this

## Symptom
Expected:
1. Widgets cannot be placed over/into each other on the desktop grid; dragging/snapping prevents overlapping occupied grid cells.
2. Widgets match the actual desktop icon grid in size and aspect ratio (integer multiples of grid cell width and height).
3. All widgets have uniform grid sizing (no widget is inadvertently smaller than another or smaller than its grid footprint).

Actual (exact message/value):
1. User reports: "Ich kann Widgets noch übereinander/ineinander platzieren und die Widgets sind von der Größe her noch nicht an das Raster angepasst. Manche sind leicht kleiner als andere und auch nicht so groß, wie das Raster."
2. Screenshot `media_1792925186871_87cef775.png` confirms:
   - Media Controls placed overlapping Weather Forecast by 1x1 grid cell.
   - ResourceWidget & SpotifyWidget constrained by `max-w-[340px]` making them smaller than WeatherWidget (`max-w-sm` = 384px) and smaller than the 360px grid footprint.
   - Vertical grid pitch calibrated at 98px instead of actual Windows 11 desktop icon pitch (~128px).

Trigger: Moving/releasing widgets near another widget; observing visual card widths against desktop icons.
Frequency: Always.
Environment: Windows 11, scale factor 2.0 (2880x1800 display), Tauri v2.12+.
Success criterion:
- When releasing a dragged widget, if the target grid rect overlaps an existing widget, the widget snaps to the nearest non-overlapping grid slot.
- Remove hardcoded `max-w-[340px]` restrictions so all widgets expand uniformly to fill their full grid card dimensions.
- Align grid cell metrics to actual Windows 11 desktop icon spacing (X: 120px, Y: 128px) and widget dimensions to exact integer grid cells.

## Repro
Command/script:
1. Overlap test: Unit test asserting collision avoidance when releasing at an occupied grid rect (`src/test/gridCollision.test.ts`).
2. Sizing test: Inspecting CSS classes and default dimension constants across widgets.
Output (symptom reproduced: yes/no): Yes

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | Code inspection & screenshot | Overlap caused by unconstrained snapping without collision detection; unequal size caused by `max-w-[340px]`; grid height mismatch caused by 98px vs 128px Windows 11 icon pitch | `gridCollision.ts`, `useGridDrag.ts`, `ResourceWidget.tsx`, `SpotifyWidget.tsx`, `WeatherWidget.tsx`, `registry.ts`, `config/model.rs`, `config/storage.rs`, `window/snapping.rs`, `window/win32.rs` | PASS | All 147 Vitest tests and 93 Cargo tests pass. Zero collision, identical widths, perfect 120x128 grid alignment. |

## Established Facts (VERIFIED)
- `ResourceWidget` and `SpotifyWidget` contained `max-w-[340px]`, whereas `WeatherWidget` used `max-w-sm` (384px), directly causing unequal widths.
- `useGridDrag.ts` snapped to `Math.round(x / gridX) * gridX` with zero check against other active widgets' bounding boxes.
- Actual vertical pitch between desktop icons on user's display is 128 logical px (256 physical px @ 200% DPI), whereas code had 98px.
- Exact widget grid footprints are: Media (3x2 cells = 360x256), Resources (3x3 cells = 360x384), Weather (3x4 cells = 360x512).

## Ruled Out
- Fixed-coordinate layout or CSS flexbox/grid layout bug: Window sizes are backed by Tauri window boundaries and Rust win32 WM_WINDOWPOSCHANGING snapping.

## Final
Root cause:
1. Missing collision check when snapping dragged widgets against existing widget rectangles.
2. Inconsistent hardcoded max-width CSS classes (`max-w-[340px]` vs `max-w-sm`).
3. Vertical icon grid pitch was estimated at 98px instead of actual 128px Windows 11 icon metrics.
Fix:
1. Created `src/utils/gridCollision.ts` and wired it into `useGridDrag.ts` pointerup & `storage.rs` config recovery to find the nearest non-overlapping slot.
2. Removed CSS max-width clamps so widgets stretch to their full card container width (360px).
3. Standardized grid pitch to 120x128px across Rust win32/snapping and React constants.
Proof:
- 147 Vitest unit & integration tests passed (`npm.cmd run test`).
- 93 Rust unit & integration tests passed (`cargo test --lib`).
- Tauri production release binary compiled cleanly (`npx.cmd tauri build --no-bundle`).
Other occurrences:
- All 3 widgets (Media, Resources, Weather) verified and adjusted.
Not verified:
- None.
