import { useRef, useCallback, useState } from "react";
import { getCurrentWindow, LogicalPosition } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

export const DESKTOP_GRID_X = 114;
export const DESKTOP_GRID_Y = 75;

export interface UseGridDragOptions {
  widgetId?: string;
  isLocked?: boolean;
  gridX?: number;
  gridY?: number;
  onPositionChange?: (logicalX: number, logicalY: number) => void;
}

export function useGridDrag({
  widgetId,
  isLocked = false,
  gridX = DESKTOP_GRID_X,
  gridY = DESKTOP_GRID_Y,
  onPositionChange,
}: UseGridDragOptions) {
  const [isDragging, setIsDragging] = useState(false);

  const dragRef = useRef<{
    active: boolean;
    startScreenX: number;
    startScreenY: number;
    startWindowX: number;
    startWindowY: number;
    currentCol: number;
    currentRow: number;
  }>({
    active: false,
    startScreenX: 0,
    startScreenY: 0,
    startWindowX: 0,
    startWindowY: 0,
    currentCol: 0,
    currentRow: 0,
  });

  const onPointerDown = useCallback(
    async (e: React.PointerEvent) => {
      if (isLocked || e.button !== 0) return;
      if (
        (e.target as HTMLElement).closest(
          "button, a, input, select, textarea, [data-no-drag]"
        )
      ) {
        return;
      }

      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Ignored in test environment
      }

      let currentLogicalX = 0;
      let currentLogicalY = 0;

      try {
        const appWindow = getCurrentWindow();
        const scale = await appWindow.scaleFactor().catch(() => 1.0);
        const outer = await appWindow.outerPosition().catch(() => ({ x: 0, y: 0 }));
        currentLogicalX = outer.x / (scale > 0 ? scale : 1.0);
        currentLogicalY = outer.y / (scale > 0 ? scale : 1.0);
      } catch {
        // Fallback for non-Tauri / test environments
      }

      // Calculate the nearest desktop icon grid cell
      const initialCol = Math.max(0, Math.round(currentLogicalX / gridX));
      const initialRow = Math.max(0, Math.round(currentLogicalY / gridY));
      const snappedX = initialCol * gridX;
      const snappedY = initialRow * gridY;

      dragRef.current = {
        active: true,
        startScreenX: e.screenX,
        startScreenY: e.screenY,
        startWindowX: snappedX,
        startWindowY: snappedY,
        currentCol: initialCol,
        currentRow: initialRow,
      };

      setIsDragging(true);

      // Instantly snap to the desktop icon grid on mouse down if currently off-grid
      if (
        Math.abs(currentLogicalX - snappedX) > 1 ||
        Math.abs(currentLogicalY - snappedY) > 1
      ) {
        try {
          const appWindow = getCurrentWindow();
          await appWindow.setPosition(new LogicalPosition(snappedX, snappedY));
          onPositionChange?.(snappedX, snappedY);
        } catch {
          // Non-Tauri fallback
        }
      }
    },
    [isLocked, gridX, gridY, onPositionChange]
  );

  const onPointerMove = useCallback(
    async (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;

      const deltaX = e.screenX - dragRef.current.startScreenX;
      const deltaY = e.screenY - dragRef.current.startScreenY;

      const targetX = dragRef.current.startWindowX + deltaX;
      const targetY = dragRef.current.startWindowY + deltaY;

      // Quantize to discrete desktop grid cell indices
      const newCol = Math.max(0, Math.round(targetX / gridX));
      const newRow = Math.max(0, Math.round(targetY / gridY));

      if (
        newCol !== dragRef.current.currentCol ||
        newRow !== dragRef.current.currentRow
      ) {
        dragRef.current.currentCol = newCol;
        dragRef.current.currentRow = newRow;

        const snappedX = newCol * gridX;
        const snappedY = newRow * gridY;

        try {
          const appWindow = getCurrentWindow();
          await appWindow.setPosition(new LogicalPosition(snappedX, snappedY));
          onPositionChange?.(snappedX, snappedY);
        } catch {
          // Non-Tauri fallback
        }
      }
    },
    [gridX, gridY, onPositionChange]
  );

  const onPointerUp = useCallback(
    async (e: React.PointerEvent) => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      setIsDragging(false);

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Non-Tauri fallback
      }

      const finalX = dragRef.current.currentCol * gridX;
      const finalY = dragRef.current.currentRow * gridY;

      if (widgetId) {
        try {
          await invoke("save_widget_position", {
            widgetId,
            logicalX: finalX,
            logicalY: finalY,
          });
        } catch {
          // If command not registered yet, safe fallback
        }
      }

      onPositionChange?.(finalX, finalY);
    },
    [widgetId, gridX, gridY, onPositionChange]
  );

  return {
    isDragging,
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
