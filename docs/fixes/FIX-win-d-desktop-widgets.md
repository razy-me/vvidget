# Fix: Widgets Disappear on Windows + D (`FIX-win-d-desktop-widgets.md`)

- **Status**: FIXED
- **Mode**: `r-fix-this`
- **Date**: 2026-10-26
- **Base Commit**: `0f87044`
- **Fix Commit**: `HEAD`

## 4. Final Gate
- `cargo test --manifest-path src-tauri/Cargo.toml`: 153/153 passed (including `test_win_d_protection_subclass_proc`).
- `npm.cmd test`: 256/256 passed.
- `npm.cmd run lint`: 0 errors.

## 1. Symptom & Success Criterion
- **Actual**:
  When the user presses `Win + D` ("Show Desktop") or clicks the "Show Desktop" taskbar button, all desktop widgets vanish from view until `Win + D` is pressed a second time.
- **Expected**:
  Desktop widgets must remain pinned and visible on the desktop wallpaper canvas during `Win + D` (Show Desktop), just like native desktop widgets or Rainmeter.
- **Trigger**: Pressing `Win + D` on the keyboard or clicking the "Show Desktop" button in Windows taskbar.
- **Frequency**: 100% reproducible on every `Win + D` press.
- **Environment**: Windows 11 / Windows 10, Tauri v2, Win32 subclass.
- **Success Criterion**:
  1. `WM_SHOWWINDOW(FALSE, ...)` sent by the OS during `Win + D` is intercepted and vetoed when `!is_window_allow_hide`.
  2. `WM_WINDOWPOSCHANGING` intercepts both `SWP_HIDEWINDOW` and off-screen minimization coordinates (`x <= -30000 || y <= -30000`), enforcing `SWP_NOMOVE | SWP_NOSIZE` and `hwndInsertAfter = HWND_BOTTOM`.
  3. Programmatic hides via `hide_window()` continue to work cleanly.
  4. All unit and integration tests pass.

## 2. Hypotheses
- **H1 (OS ShowWindow & Minimization Coordinate Leak)**:
  When the Windows Shell executes "Show Desktop" (`Win + D`), it sends `WM_SHOWWINDOW(FALSE, 0)` and `WM_WINDOWPOSCHANGING` with `winpos.x = -32000, winpos.y = -32000` and `SWP_HIDEWINDOW`.
  In `widget_subclass_proc`:
  - `WM_SHOWWINDOW` is forwarded directly to `DefSubclassProc`, where `DefWindowProc` hides the window.
  - `WM_WINDOWPOSCHANGING` strips `SWP_HIDEWINDOW`, but omits `SWP_NOMOVE | SWP_NOSIZE`, so Windows executes the move to `(-32000, -32000)`.
  Vetoing `WM_SHOWWINDOW` when `!is_window_allow_hide` AND enforcing `(winpos.flags & !SWP_HIDEWINDOW) | SWP_NOMOVE | SWP_NOSIZE` when minimized coordinates or `SWP_HIDEWINDOW` are passed will completely prevent the window from hiding or moving off-screen.

## 3. Attempt Ledger
### Attempt 1: Intercept `WM_SHOWWINDOW` & Clamp Minimized Off-Screen Coordinates in `win32.rs`
- **Hypothesis**: H1
- **Changes**:
  1. In `widget_subclass_proc` in `src-tauri/src/window/win32.rs`:
     - Under `WM_WINDOWPOSCHANGING`: check if `(winpos.flags & SWP_HIDEWINDOW).0 != 0 || winpos.x <= -30000 || winpos.y <= -30000`. If `!is_window_allow_hide(hwnd.0 as isize)`, strip `SWP_HIDEWINDOW`, apply `winpos.flags |= SWP_NOMOVE | SWP_NOSIZE`, and set `winpos.hwndInsertAfter = HWND_BOTTOM`.
     - Under `WM_SHOWWINDOW`: if `wparam.0 == 0 && !is_window_allow_hide(hwnd.0 as isize)`, return `LRESULT(0)` immediately without calling `DefSubclassProc`.
  2. Add regression tests in `src-tauri/src/window/win32.rs`.
