# Angle A: Premise Attack - Drag Mechanism & Boundary Escape

## Core Finding
The premise that custom JavaScript pointer drag (`useGridDrag.ts` calling `appWindow.setPosition(new LogicalPosition(targetX, targetY))`) can drive desktop window movement is fundamentally flawed for independent multi-window apps.

## Verified Mechanism of Failure
1. In Chromium/WebView2, `setPointerCapture` only captures pointer events within the HWND of that Webview.
2. When the user grabs the header at x=480 and drags swiftly towards x=0 (the left third of the screen):
   - The IPC call `appWindow.setPosition` has ~15ms latency per frame.
   - The physical mouse cursor outruns the window.
   - The cursor leaves the window bounds (x < 480).
   - Windows sends `WM_MOUSELEAVE` / `WM_CAPTURECHANGED` to WebView2.
   - Pointer events cease firing.
   - The drag operation is effectively frozen: `lastTargetX` remains 480, skeleton preview remains at 480, and the window never moves into the left third.
3. Upon release, the user releases the mouse button over the desktop or another window. WebView2 does not get a normal pointerup, or executes pointerup with `lastTargetX=480`, dropping the widget right where it started (overlapping whatever is at x=480).

## Fix
Replace JS-based window movement for independent widgets with native window dragging (`data-tauri-drag-region` / `getCurrentWindow().startDragging()`). The Windows OS kernel tracks the mouse globally at 1000Hz, ensuring the cursor never escapes the window, drag latency is 0ms, and movement to x=0 (the left third) is completely uninhibited.
