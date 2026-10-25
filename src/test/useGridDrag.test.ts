import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useGridDrag,
  DESKTOP_GRID_LOGICAL_X,
  DESKTOP_GRID_LOGICAL_Y,
} from "@/hooks/useGridDrag";
import { getCurrentWindow, availableMonitors } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/window", () => {
  const setPositionMock = vi.fn().mockResolvedValue(undefined);
  const outerPositionMock = vi.fn().mockResolvedValue({ x: 120, y: 98 });
  const innerSizeMock = vi.fn().mockResolvedValue({ width: 360, height: 294 });
  const scaleFactorMock = vi.fn().mockResolvedValue(1.0);
  const currentMonitorMock = vi.fn().mockResolvedValue({
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1.0,
    workArea: {
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1080 },
    },
  });
  const availableMonitorsMock = vi.fn().mockResolvedValue([
    {
      name: "Display 1",
      position: { x: 0, y: 0 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1.0,
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
      },
    },
  ]);

  return {
    getCurrentWindow: () => ({
      setPosition: setPositionMock,
      outerPosition: outerPositionMock,
      innerSize: innerSizeMock,
      scaleFactor: scaleFactorMock,
    }),
    currentMonitor: currentMonitorMock,
    availableMonitors: availableMonitorsMock,
    LogicalPosition: class {
      x: number;
      y: number;
      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
      }
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("useGridDrag Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports calibrated default grid cell metrics 120.0 x 98.0", () => {
    expect(DESKTOP_GRID_LOGICAL_X).toBe(120.0);
    expect(DESKTOP_GRID_LOGICAL_Y).toBe(98.0);
  });

  it("starts in non-dragging state and updates on pointer down/up", async () => {
    const handleDragState = vi.fn();
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "spotify",
        onDragStateChange: handleDragState,
      })
    );

    expect(result.current.isDragging).toBe(false);

    // Pointer down
    await act(async () => {
      await result.current.dragProps.onPointerDown({
        button: 0,
        screenX: 200,
        screenY: 200,
        pointerId: 1,
        target: document.createElement("div"),
        currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    expect(result.current.isDragging).toBe(true);
    expect(handleDragState).toHaveBeenCalledWith(true);

    // Pointer up
    await act(async () => {
      await result.current.dragProps.onPointerUp({
        pointerId: 1,
        currentTarget: { releasePointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    expect(result.current.isDragging).toBe(false);
    expect(handleDragState).toHaveBeenCalledWith(false);
  });

  it("performs smooth 1:1 real-time drag tracking on pointer move", async () => {
    const onPosChange = vi.fn();
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "resources",
        onPositionChange: onPosChange,
      })
    );

    const appWindow = getCurrentWindow();

    // Mouse down at screen (200, 200), initial window position (120, 98)
    await act(async () => {
      await result.current.dragProps.onPointerDown({
        button: 0,
        screenX: 200,
        screenY: 200,
        pointerId: 1,
        target: document.createElement("div"),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    // Move by +35px horizontally and +45px vertically
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 235,
        screenY: 245,
      } as unknown as React.PointerEvent);
    });

    // 1:1 real-time tracking: 120 + 35 = 155, 98 + 45 = 143
    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 155, y: 143 })
    );
    expect(onPosChange).toHaveBeenCalledWith(155, 143);
  });

  it("snaps to nearest grid cell on release on pointerup", async () => {
    const onPosChange = vi.fn();
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "weather",
        gridX: 120.0,
        gridY: 98.0,
        onPositionChange: onPosChange,
      })
    );

    const appWindow = getCurrentWindow();

    // Mouse down at (100, 100), window at (120, 98)
    await act(async () => {
      await result.current.dragProps.onPointerDown({
        button: 0,
        screenX: 100,
        screenY: 100,
        pointerId: 1,
        target: document.createElement("div"),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    // Move to (100 + 130, 100 + 105) -> raw (250, 203)
    // 250 / 120 = 2.083 -> Math.round is 2 -> 240.0
    // 203 / 98 = 2.071 -> Math.round is 2 -> 196.0
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 230,
        screenY: 205,
      } as unknown as React.PointerEvent);
    });

    // Release mouse
    await act(async () => {
      await result.current.dragProps.onPointerUp({
        pointerId: 1,
        currentTarget: { releasePointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    // Snapped to exact grid cell (240, 196)
    expect(appWindow.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 240, y: 196 })
    );
    expect(invoke).toHaveBeenCalledWith("save_widget_position", {
      widgetId: "weather",
      logicalX: 240,
      logicalY: 196,
    });
  });

  it("clamps coordinates within screen work area bounds preventing off-screen dragging", async () => {
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "spotify",
      })
    );

    const appWindow = getCurrentWindow();

    await act(async () => {
      await result.current.dragProps.onPointerDown({
        button: 0,
        screenX: 500,
        screenY: 500,
        pointerId: 1,
        target: document.createElement("div"),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    // Attempt to drag far off the screen left and top (e.g. -2000px)
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: -2000,
        screenY: -2000,
      } as unknown as React.PointerEvent);
    });

    // Clamped to minimum monitor left/top (0, 0)
    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 0 })
    );

    // Attempt to drag far beyond screen right (1920 - 360 = 1560)
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 9999,
        screenY: 9999,
      } as unknown as React.PointerEvent);
    });

    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1560, y: 786 })
    );
  });

  it("does not drag when isLocked is true", async () => {
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "spotify",
        isLocked: true,
      })
    );

    await act(async () => {
      await result.current.dragProps.onPointerDown({
        button: 0,
        screenX: 100,
        screenY: 100,
        pointerId: 1,
        target: document.createElement("div"),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    expect(result.current.isDragging).toBe(false);
  });

  it("aborts drag on rapid click before async initialization completes, preventing (0,0) teleportation", async () => {
    let resolveScale: (val: number) => void;
    const delayedScalePromise = new Promise<number>((res) => {
      resolveScale = res;
    });

    const appWindow = getCurrentWindow();
    vi.mocked(appWindow.scaleFactor).mockReturnValueOnce(delayedScalePromise as unknown as Promise<number>);

    const onPosChange = vi.fn();
    const handleDragState = vi.fn();
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "spotify",
        onPositionChange: onPosChange,
        onDragStateChange: handleDragState,
      })
    );

    // 1. Pointer down starts async init
    const downPromise = result.current.dragProps.onPointerDown({
      button: 0,
      screenX: 200,
      screenY: 200,
      pointerId: 1,
      target: document.createElement("div"),
      currentTarget: { setPointerCapture: vi.fn() },
    } as unknown as React.PointerEvent);

    // 2. Immediate pointer up BEFORE scaleFactor resolves (rapid click)
    await act(async () => {
      await result.current.dragProps.onPointerUp({
        pointerId: 1,
        currentTarget: { releasePointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    // 3. Now let scale factor resolve
    await act(async () => {
      resolveScale!(1.0);
      await downPromise;
    });

    // Assert that drag was never activated and save_widget_position was never called with (0,0)
    expect(result.current.isDragging).toBe(false);
    expect(handleDragState).not.toHaveBeenCalledWith(true);
    expect(invoke).not.toHaveBeenCalledWith("save_widget_position", expect.anything());
    expect(appWindow.setPosition).not.toHaveBeenCalled();
    expect(onPosChange).not.toHaveBeenCalled();
  });

  it("ignores pointer moves while async initialization is pending, preventing premature teleportation", async () => {
    let resolveScale: (val: number) => void;
    const delayedScalePromise = new Promise<number>((res) => {
      resolveScale = res;
    });

    const appWindow = getCurrentWindow();
    vi.mocked(appWindow.scaleFactor).mockReturnValueOnce(delayedScalePromise as unknown as Promise<number>);

    const onPosChange = vi.fn();
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "resources",
        onPositionChange: onPosChange,
      })
    );

    // Pointer down initiates async resolution
    const downPromise = result.current.dragProps.onPointerDown({
      button: 0,
      screenX: 200,
      screenY: 200,
      pointerId: 1,
      target: document.createElement("div"),
      currentTarget: { setPointerCapture: vi.fn() },
    } as unknown as React.PointerEvent);

    // Pointer move occurs immediately before async resolution
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 250,
        screenY: 250,
      } as unknown as React.PointerEvent);
    });

    // No position set while uninitialized
    expect(appWindow.setPosition).not.toHaveBeenCalled();
    expect(onPosChange).not.toHaveBeenCalled();

    // Now resolve initialization
    await act(async () => {
      resolveScale!(1.0);
      await downPromise;
    });

    // Subsequent move now tracks properly
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 250,
        screenY: 250,
      } as unknown as React.PointerEvent);
    });

    // 120 + 50 = 170, 98 + 50 = 148
    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 170, y: 148 })
    );
  });

  it("calculates virtual desktop bounding area across multiple connected monitors", async () => {
    // Primary monitor: 1920x1080 at (0, 0), Secondary monitor: 1920x1080 at (1920, 0)
    vi.mocked(availableMonitors).mockResolvedValueOnce([
      {
        name: "Primary Display",
        position: { x: 0, y: 0 } as any,
        size: { width: 1920, height: 1080 } as any,
        scaleFactor: 1.0,
        workArea: {
          position: { x: 0, y: 0 } as any,
          size: { width: 1920, height: 1040 } as any,
        },
      },
      {
        name: "Secondary Display",
        position: { x: 1920, y: 0 } as any,
        size: { width: 1920, height: 1080 } as any,
        scaleFactor: 1.0,
        workArea: {
          position: { x: 1920, y: 0 } as any,
          size: { width: 1920, height: 1080 } as any,
        },
      },
    ]);

    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "weather",
      })
    );

    const appWindow = getCurrentWindow();

    await act(async () => {
      await result.current.dragProps.onPointerDown({
        button: 0,
        screenX: 100,
        screenY: 100,
        pointerId: 1,
        target: document.createElement("div"),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    // Drag into secondary monitor area at screenX = 2500 (deltaX = 2400)
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 2500,
        screenY: 200,
      } as unknown as React.PointerEvent);
    });

    // Window position: startWindowX 120 + 2400 = 2520, which is on the secondary screen
    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 2520 })
    );

    // Drag to maximum right across both monitors: 3840 - 360 = 3480
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 99999,
        screenY: 200,
      } as unknown as React.PointerEvent);
    });

    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 3480 })
    );
  });
});
