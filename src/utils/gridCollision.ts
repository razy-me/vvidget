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
 * If the target slot collides with an existing widget, searches outward in concentric rings
 * for the closest free slot within screen/work-area bounds.
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

  const candidate = {
    x: Math.max(minX, Math.min(maxX, baseSnappedX)),
    y: Math.max(minY, Math.min(maxY, baseSnappedY)),
    width,
    height,
  };

  // If initial candidate does not overlap any occupied rect, snap directly
  const hasCollision = occupied.some((other) => rectsOverlap(candidate, other));
  if (!hasCollision) {
    return { x: candidate.x, y: candidate.y };
  }

  // Search expanding grid rings (radius r = 1..15)
  interface SlotCandidate {
    x: number;
    y: number;
    distSq: number;
  }
  let bestSlot: SlotCandidate | null = null;
  const maxRadius = 15;

  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Only evaluate outer perimeter of the current ring
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

        const candX = Math.max(minX, Math.min(maxX, baseSnappedX + dx * gridX));
        const candY = Math.max(minY, Math.min(maxY, baseSnappedY + dy * gridY));

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
    // Return the nearest free slot found in the closest concentric ring
    if (bestSlot !== null) {
      const found: SlotCandidate = bestSlot;
      return { x: found.x, y: found.y };
    }
  }

  // Fallback to initial clamped position if no free slot found
  return { x: candidate.x, y: candidate.y };
}
