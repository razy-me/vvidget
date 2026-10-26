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
  const outerPositionMock = vi.fn().mockResolvedValue({ x: 160, y: 120 });
  const innerSizeMock = vi.fn().mockResolvedValue({ width: 320, height: 240 });
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

  it("exports calibrated default grid cell metrics 160.0 x 120.0", () => {
    expect(DESKTOP_GRID_LOGICAL_X).toBe(160.0);
    expect(DESKTOP_GRID_LOGICAL_Y).toBe(120.0);
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

    // Mouse down at screen (200, 200), initial window position (160, 120)
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

    // 1:1 real-time tracking: 160 + 35 = 195, 120 + 45 = 165
    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 195, y: 165 })
    );
    expect(onPosChange).toHaveBeenCalledWith(195, 165);
  });

  it("snaps to nearest grid cell on release on pointerup", async () => {
    const onPosChange = vi.fn();
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "weather",
        gridX: 160.0,
        gridY: 120.0,
        onPositionChange: onPosChange,
      })
    );

    const appWindow = getCurrentWindow();

    // Mouse down at (100, 100), window at (160, 120)
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

    // Move to (100 + 170, 100 + 130) -> raw (330, 250)
    // 330 / 160 = 2.0625 -> Math.round is 2 -> 320.0
    // 250 / 120 = 2.083 -> Math.round is 2 -> 240.0
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 270,
        screenY: 230,
      } as unknown as React.PointerEvent);
    });

    // Release mouse
    await act(async () => {
      await result.current.dragProps.onPointerUp({
        pointerId: 1,
        currentTarget: { releasePointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    // Snapped to exact grid cell (320, 240)
    expect(appWindow.setPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 320, y: 240 })
    );
    expect(invoke).toHaveBeenCalledWith("save_widget_position", {
      widgetId: "weather",
      logicalX: 320,
      logicalY: 240,
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

    // Attempt to drag far beyond screen right (1920 - 320 = 1600, 1080 - 240 = 840)
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 9999,
        screenY: 9999,
      } as unknown as React.PointerEvent);
    });

    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1600, y: 840 })
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

    // 160 + 50 = 210, 120 + 50 = 170
    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 210, y: 170 })
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

    // Window position: startWindowX 160 + 2400 = 2560, which is on the secondary screen
    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 2560 })
    );

    // Drag to maximum right across both monitors: 3840 - 320 = 3520
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 99999,
        screenY: 200,
      } as unknown as React.PointerEvent);
    });

    expect(appWindow.setPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: 3520 })
    );
  });

  it("avoids colliding with another widget on pointer release by snapping to adjacent free slot", async () => {
    const onPosChange = vi.fn();
    const otherWidgets = [
      // Resources already occupies (320, 240, 320, 360)
      { id: "resources", x: 320, y: 240, width: 320, height: 360 },
    ];

    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "spotify",
        otherWidgets,
        onPositionChange: onPosChange,
      })
    );

    const appWindow = getCurrentWindow();

    // Mouse down at (100, 100), window at (160, 120)
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

    // Move to (320, 240) where Resources is already located
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 260,
        screenY: 220,
      } as unknown as React.PointerEvent);
    });

    // Release mouse
    await act(async () => {
      await result.current.dragProps.onPointerUp({
        pointerId: 1,
        currentTarget: { releasePointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    // The snapped position must not overlap Resources!
    const calls = vi.mocked(appWindow.setPosition).mock.calls;
    const finalSetCall = calls[calls.length - 1][0] as { x: number; y: number };
    const overlaps =
      finalSetCall.x < otherWidgets[0].x + otherWidgets[0].width - 2 &&
      finalSetCall.x + 320 > otherWidgets[0].x + 2 &&
      finalSetCall.y < otherWidgets[0].y + otherWidgets[0].height - 2 &&
      finalSetCall.y + 240 > otherWidgets[0].y + 2;

    expect(overlaps).toBe(false);
  });

  it("updates skeleton preview slot during drag and hides skeleton on release", async () => {
    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "spotify",
        otherWidgets: [],
      })
    );

    expect(result.current.skeletonSlot).toBeNull();

    // Pointer down activates drag and initializes skeletonSlot
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

    expect(result.current.skeletonSlot).not.toBeNull();
    expect(result.current.skeletonSlot?.width).toBe(320);
    expect(result.current.skeletonSlot?.height).toBe(240);
    expect(invoke).toHaveBeenCalledWith(
      "update_skeleton_preview",
      expect.objectContaining({
        width: 320,
        height: 240,
      })
    );

    // Pointer move to next grid position updates skeleton preview (deltaX=160, deltaY=120)
    await act(async () => {
      await result.current.dragProps.onPointerMove({
        screenX: 260, // 160px delta
        screenY: 220, // 120px delta
      } as unknown as React.PointerEvent);
    });

    expect(result.current.skeletonSlot?.x).toBe(320);
    expect(result.current.skeletonSlot?.y).toBe(240);

    // Pointer release clears skeletonSlot and invokes hide_skeleton_preview
    await act(async () => {
      await result.current.dragProps.onPointerUp({
        pointerId: 1,
        currentTarget: { releasePointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    expect(result.current.skeletonSlot).toBeNull();
    expect(invoke).toHaveBeenCalledWith("hide_skeleton_preview");
  });

  it("adapts skeleton preview dimensions to match specific widget metadata (e.g. weather 320x480)", async () => {
    const appWindow = getCurrentWindow();
    vi.mocked(appWindow.innerSize).mockResolvedValueOnce({ width: 320, height: 480 } as unknown as import("@tauri-apps/api/dpi").PhysicalSize);

    const { result } = renderHook(() =>
      useGridDrag({
        widgetId: "weather",
        otherWidgets: [],
      })
    );

    await act(async () => {
      await result.current.dragProps.onPointerDown({
        button: 0,
        screenX: 200,
        screenY: 200,
        pointerId: 2,
        target: document.createElement("div"),
        currentTarget: { setPointerCapture: vi.fn() },
      } as unknown as React.PointerEvent);
    });

    expect(result.current.skeletonSlot).not.toBeNull();
    expect(result.current.skeletonSlot?.width).toBe(320);
    expect(result.current.skeletonSlot?.height).toBe(480);
    expect(invoke).toHaveBeenCalledWith(
      "update_skeleton_preview",
      expect.objectContaining({
        width: 320,
        height: 480,
      })
    );
  });
});
