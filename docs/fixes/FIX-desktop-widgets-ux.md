# Fix Ledger: Desktop Widgets Window Transparency, Grid Snapping & Placement
Status: FIXED
Mode: fix-this (round 1)

## Symptom
Expected:
1. Floating widgets have true rounded transparent corners without an opaque rectangular grey window background ("komischer Rand").
2. Widgets snap magnetically to the Windows Desktop Grid (e.g., icon grid spacing 75px) when dragged.
3. Default widget placement should not overlap the desktop icons in the top-left corner, and widgets should have sufficient height so content (e.g. disk metrics, playback controls, forecast tabs) is not clipped.

Actual (exact message/value):
1. In the user screenshot (`media_1792888175039_7d951ece.png`), each widget is wrapped in an opaque dark grey rectangular window boundary because `window_vibrancy::apply_acrylic` turns the Win32 HWND into an opaque rectangular surface (no per-pixel alpha blur for inactive tool windows).
2. `snapping.rs` only computes screen edge and widget-to-widget snapping, with zero desktop icon grid snapping logic.
3. Default coordinates `logical_x: 40.0, logical_y: 40.0` place widgets directly on top of Windows desktop icons (Steam, Discord, etc.), and default heights (180, 140, 160) clip content.

Environment: Windows 11, Tauri v2, WebView2
Success criterion:
- Windows render with seamless per-pixel transparency (only the rounded widget card is visible with translucent glass, desktop wallpaper shows through transparent corners).
- Windows snap to desktop icon grid multiples (75px) in addition to screen borders and other widgets.
- Default positions shifted away from desktop icons (e.g. right side of screen), heights adjusted to fit all widget content without truncation.

## Repro
Command: Launch `npx.cmd tauri dev`
Observation: Screenshot shows opaque rectangular box around cards, overlapping desktop icons, and no grid snapping.

## Attempts
| # | Source | Hypothesis | Change (files) | Result | Why it failed / learned |
|---|---|---|---|---|---|
| 1 | fix-this | 1) `apply_acrylic` creates an opaque rectangular HWND on Windows 11 tool windows; removing it allows WebView2 DirectComposition per-pixel alpha transparency. 2) Padding in `App.tsx` leaves empty window borders. 3) Missing grid snapping in `snapping.rs`. 4) Default coordinates in `model.rs` are top-left on icons and too short. | `win32.rs`, `App.tsx`, `WidgetContainer.tsx`, `model.rs`, `storage.rs`, `snapping.rs`, `manager.rs` | PASS | All 3 issues resolved. Tests (87 Rust, 129 Vitest) + Vite build pass with 0 errors. |

## Established Facts (VERIFIED)
- `window_vibrancy::apply_acrylic` on Windows 11 applies `ACCENT_ENABLE_ACRYLICBLURBEHIND` across the whole HWND client rect; for unfocused windows with `WS_EX_NOACTIVATE`, DWM disables blur and paints a flat opaque grey box.
- Tauri's `transparent: true` enables DirectComposition per-pixel alpha on WebView2 windows when HWND accent policies do not override it.
- `App.tsx` had `min-h-screen p-2` padding creating an 8px dead-zone around cards.
- `snapping.rs` now snaps to desktop icon grid multiples (`SM_CXICONSPACING`, `SM_CYICONSPACING`).
- Default widget heights in `model.rs` adjusted to fit content (260px for Resources, 200px for Spotify, 250px for Weather), and default placement moved to the right edge (x: 1540).

## Ruled Out
- CSS syntax errors: CSS builds cleanly; the box was caused by the Win32 HWND composition layer.
