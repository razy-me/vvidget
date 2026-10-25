import { useRef, useCallback, useState, useEffect } from "react";
import { getCurrentWindow, currentMonitor, availableMonitors, LogicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

export const DESKTOP_GRID_LOGICAL_X = 120.0;
export const DESKTOP_GRID_LOGICAL_Y = 98.0;
export const DESKTOP_GRID_X = DESKTOP_GRID_LOGICAL_X;
export const DESKTOP_GRID_Y = DESKTOP_GRID_LOGICAL_Y;

export interface UseGridDragOptions {
  widgetId?: string;
  isLocked?: boolean;
  gridX?: number;
  gridY?: number;
  onPositionChange?: (logicalX: number, logicalY: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

export function useGridDrag({
  widgetId,
  isLocked = false,
  gridX = DESKTOP_GRID_X,
  gridY = DESKTOP_GRID_Y,
  onPositionChange,
  onDragStateChange,
}: UseGridDragOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [activeGrid, setActiveGrid] = useState<{ x: number; y: number }>({
    x: gridX,
    y: gridY,
  });

  // Query live desktop icon grid metrics from Windows Explorer SysListView32 if available
  useEffect(() => {
    let cancelled = false;
    invoke<{ logical_x?: number; cell_width?: number; logical_y?: number; cell_height?: number }>(
      "get_desktop_grid_metrics"
    )
      .then((metrics) => {
        if (!cancelled && metrics) {
          const gx = metrics.logical_x || metrics.cell_width || DESKTOP_GRID_X;
          const gy = metrics.logical_y || metrics.cell_height || DESKTOP_GRID_Y;
          if (gx > 0 && gy > 0) {
            setActiveGrid({ x: gx, y: gy });
          }
        }
      })
      .catch(() => {
        // Fallback to calibrated 120.0 x 98.0
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentGridX = gridX !== DESKTOP_GRID_X ? gridX : activeGrid.x;
  const currentGridY = gridY !== DESKTOP_GRID_Y ? gridY : activeGrid.y;

  const dragRef = useRef<{
    isDown: boolean;
    active: boolean;
    startScreenX: number;
    startScreenY: number;
    startWindowX: number;
    startWindowY: number;
    lastTargetX: number;
    lastTargetY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>({
    isDown: false,
    active: false,
    startScreenX: 0,
    startScreenY: 0,
    startWindowX: 0,
    startWindowY: 0,
    lastTargetX: 0,
    lastTargetY: 0,
    minX: 0,
    maxX: 1920,
    minY: 0,
    maxY: 1080,
  });

  const onPointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (isLocked || (e.button !== undefined && e.button !== 0)) return;
      if (
        (e.target as HTMLElement).closest(
          "button, a, input, select, textarea, [data-no-drag]"
        )
      ) {
        return;
      }

      dragRef.current.isDown = true;
      dragRef.current.active = false;
      dragRef.current.startScreenX = e.screenX;
      dragRef.current.startScreenY = e.screenY;

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Ignored in test environment
      }

      let currentLogicalX = dragRef.current.lastTargetX || 0;
      let currentLogicalY = dragRef.current.lastTargetY || 0;
      let boundMinX = 0;
      let boundMaxX = Math.max(0, (typeof window !== "undefined" && window.screen?.availWidth ? window.screen.availWidth : 1920) - 360);
      let boundMinY = 0;
      let boundMaxY = Math.max(0, (typeof window !== "undefined" && window.screen?.availHeight ? window.screen.availHeight : 1080) - 294);

      try {
        const appWindow = getCurrentWindow();
        const scale = await appWindow.scaleFactor().catch(() => 1.0);
        const outer = await appWindow.outerPosition().catch(() => ({ x: 0, y: 0 }));
        const inner = await appWindow.innerSize().catch(() => ({ width: 360 * scale, height: 294 * scale }));
        const s = scale > 0 ? scale : 1.0;
        currentLogicalX = outer.x / s;
        currentLogicalY = outer.y / s;
        const widgetW = inner.width / s;
        const widgetH = inner.height / s;

        // Multi-monitor virtual desktop bounding area across all active displays
        const monitors = await availableMonitors().catch(() => []);
        if (monitors.length > 0) {
          let minLeft = Infinity;
          let maxRight = -Infinity;
          let minTop = Infinity;
          let maxBottom = -Infinity;

          for (const m of monitors) {
            const mScale = m.scaleFactor || s || 1.0;
            const workPos = m.workArea?.position || m.position;
            const workSize = m.workArea?.size || m.size;
            const left = workPos.x / mScale;
            const top = workPos.y / mScale;
            const right = left + workSize.width / mScale;
            const bottom = top + workSize.height / mScale;

            if (left < minLeft) minLeft = left;
            if (right > maxRight) maxRight = right;
            if (top < minTop) minTop = top;
            if (bottom > maxBottom) maxBottom = bottom;
          }

          if (isFinite(minLeft) && isFinite(maxRight)) {
            boundMinX = minLeft;
            boundMaxX = Math.max(minLeft, maxRight - widgetW);
          }
          if (isFinite(minTop) && isFinite(maxBottom)) {
            boundMinY = minTop;
            boundMaxY = Math.max(minTop, maxBottom - widgetH);
          }
        } else {
          const monitor = await currentMonitor().catch(() => null);
          if (monitor) {
            const mScale = monitor.scaleFactor || s;
            const workPos = monitor.workArea?.position || monitor.position;
            const workSize = monitor.workArea?.size || monitor.size;
            const monLeft = workPos.x / mScale;
            const monTop = workPos.y / mScale;
            const monW = workSize.width / mScale;
            const monH = workSize.height / mScale;
            boundMinX = monLeft;
            boundMaxX = Math.max(monLeft, monLeft + monW - widgetW);
            boundMinY = monTop;
            boundMaxY = Math.max(monTop, monTop + monH - widgetH);
          } else if (typeof window !== "undefined" && window.screen) {
            boundMinX = 0;
            boundMaxX = Math.max(0, window.screen.availWidth - widgetW);
            boundMinY = 0;
            boundMaxY = Math.max(0, window.screen.availHeight - widgetH);
          }
        }
      } catch {
        // Fallback for non-Tauri / test environments
      }

      // If user released pointer before async initialization finished, abort activation
      if (!dragRef.current.isDown) {
        return;
      }

      dragRef.current.active = true;
      dragRef.current.startWindowX = currentLogicalX;
      dragRef.current.startWindowY = currentLogicalY;
      dragRef.current.lastTargetX = currentLogicalX;
      dragRef.current.lastTargetY = currentLogicalY;
      dragRef.current.minX = boundMinX;
      dragRef.current.maxX = boundMaxX;
      dragRef.current.minY = boundMinY;
      dragRef.current.maxY = boundMaxY;

      setIsDragging(true);
      onDragStateChange?.(true);
    },
    [isLocked, onDragStateChange]
  );

  const onPointerMove = useCallback(
    async (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;

      const deltaX = e.screenX - dragRef.current.startScreenX;
      const deltaY = e.screenY - dragRef.current.startScreenY;

      const rawTargetX = dragRef.current.startWindowX + deltaX;
      const rawTargetY = dragRef.current.startWindowY + deltaY;

      // Work-area bounds clamping so widgets cannot be dragged off-screen
      const targetX = Math.max(dragRef.current.minX, Math.min(dragRef.current.maxX, rawTargetX));
      const targetY = Math.max(dragRef.current.minY, Math.min(dragRef.current.maxY, rawTargetY));

      dragRef.current.lastTargetX = targetX;
      dragRef.current.lastTargetY = targetY;

      // Smooth 1:1 real-time drag tracking on pointer move (smoothly following cursor)
      try {
        const appWindow = getCurrentWindow();
        await appWindow.setPosition(new LogicalPosition(targetX, targetY));
        onPositionChange?.(targetX, targetY);
      } catch {
        // Non-Tauri fallback
      }
    },
    [onPositionChange]
  );

  const onPointerUp = useCallback(
    async (e: React.PointerEvent) => {
      dragRef.current.isDown = false;

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Non-Tauri fallback
      }

      // If drag was not active (e.g. quick click before async init or locked widget), exit immediately
      if (!dragRef.current.active) {
        return;
      }

      dragRef.current.active = false;
      setIsDragging(false);
      onDragStateChange?.(false);

      // Snap-on-release on pointerup to the nearest grid cell Math.round(targetX / gridX) * gridX
      const rawSnappedX = Math.round(dragRef.current.lastTargetX / currentGridX) * currentGridX;
      const rawSnappedY = Math.round(dragRef.current.lastTargetY / currentGridY) * currentGridY;

      // Clamped to work-area bounds
      const finalX = Math.max(dragRef.current.minX, Math.min(dragRef.current.maxX, rawSnappedX));
      const finalY = Math.max(dragRef.current.minY, Math.min(dragRef.current.maxY, rawSnappedY));

      try {
        const appWindow = getCurrentWindow();
        await appWindow.setPosition(new LogicalPosition(finalX, finalY));
      } catch {
        // Non-Tauri fallback
      }

      if (widgetId) {
        try {
          await invoke("save_widget_position", {
            widgetId,
            logicalX: finalX,
            logicalY: finalY,
          });
        } catch {
          // Non-Tauri fallback
        }
      }

      onPositionChange?.(finalX, finalY);
    },
    [widgetId, currentGridX, currentGridY, onPositionChange, onDragStateChange]
  );

  return {
    isDragging,
    gridX: currentGridX,
    gridY: currentGridY,
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
