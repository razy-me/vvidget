export interface GridRect {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Checks whether two rectangles overlap on the screen.
 * A margin tolerance allows adjacent edge-to-edge touching without false positives.
 */
export function rectsOverlap(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number },
  margin: number = 2
): boolean {
  return (
    r1.x < r2.x + r2.width - margin &&
    r1.x + r1.width > r2.x + margin &&
    r1.y < r2.y + r2.height - margin &&
    r1.y + r1.height > r2.y + margin
  );
}

/**
 * Finds the nearest non-overlapping grid slot for a widget.
 * If the target slot is unoccupied, snaps directly to target.
 * If the target slot collides with an existing widget, searches all valid grid slots
 * within screen/work-area bounds and selects the one that minimizes Euclidean distance to the cursor.
 */
export function findNearestNonOverlappingSlot(
  targetX: number,
  targetY: number,
  width: number,
  height: number,
  occupied: GridRect[],
  gridX: number,
  gridY: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): { x: number; y: number } {
  const baseSnappedX = Math.round(targetX / gridX) * gridX;
  const baseSnappedY = Math.round(targetY / gridY) * gridY;

  const minGridX = Math.ceil(minX / gridX) * gridX;
  const maxGridX = Math.floor(maxX / gridX) * gridX;
  const minGridY = Math.ceil(minY / gridY) * gridY;
  const maxGridY = Math.floor(maxY / gridY) * gridY;

  const candidate = {
    x: Math.max(minGridX, Math.min(maxGridX, baseSnappedX)),
    y: Math.max(minGridY, Math.min(maxGridY, baseSnappedY)),
    width,
    height,
  };

  // If initial candidate does not overlap any occupied rect, snap directly
  const hasCollision = occupied.some((other) => rectsOverlap(candidate, other));
  if (!hasCollision) {
    return { x: candidate.x, y: candidate.y };
  }

  // Exhaustive search over all valid screen grid positions to guarantee the closest free slot
  const minCol = Math.ceil(minX / gridX);
  const maxCol = Math.floor(maxX / gridX);
  const minRow = Math.ceil(minY / gridY);
  const maxRow = Math.floor(maxY / gridY);

  interface SlotCandidate {
    x: number;
    y: number;
    distSq: number;
  }
  let bestSlot: SlotCandidate | null = null;

  for (let c = minCol; c <= maxCol; c++) {
    const candX = c * gridX;
    for (let r = minRow; r <= maxRow; r++) {
      const candY = r * gridY;

      const testRect = { x: candX, y: candY, width, height };
      const overlaps = occupied.some((other) => rectsOverlap(testRect, other));

      if (!overlaps) {
        const distSq = (candX - targetX) ** 2 + (candY - targetY) ** 2;
        if (bestSlot === null || distSq < bestSlot.distSq) {
          bestSlot = { x: candX, y: candY, distSq };
        }
      }
    }
  }

  if (bestSlot !== null) {
    const found: SlotCandidate = bestSlot;
    return { x: found.x, y: found.y };
  }

  // Fallback to initial clamped position if no free slot found on the entire desktop
  return { x: candidate.x, y: candidate.y };
}
