import { describe, it, expect } from "vitest";
import {
  rectsOverlap,
  findNearestNonOverlappingSlot,
  type GridRect,
} from "@/utils/gridCollision";

describe("gridCollision utilities", () => {
  it("detects overlapping rectangles correctly", () => {
    const r1 = { x: 120, y: 128, width: 360, height: 384 };
    // Intersecting rect
    const r2 = { x: 240, y: 256, width: 360, height: 256 };
    expect(rectsOverlap(r1, r2)).toBe(true);

    // Completely separate rect
    const r3 = { x: 840, y: 128, width: 360, height: 384 };
    expect(rectsOverlap(r1, r3)).toBe(false);

    // Perfectly adjacent edge-to-edge (x=480, right of r1=480)
    const rAdjacent = { x: 480, y: 128, width: 360, height: 384 };
    expect(rectsOverlap(r1, rAdjacent)).toBe(false);
  });

  it("snaps to target slot directly when unobstructed", () => {
    const occupied: GridRect[] = [
      { id: "resources", x: 120, y: 128, width: 360, height: 384 },
    ];

    // Dropping at (480, 128) - free adjacent cell
    const slot = findNearestNonOverlappingSlot(
      485,
      130,
      360,
      256,
      occupied,
      120,
      128,
      0,
      1920,
      0,
      1080
    );

    expect(slot).toEqual({ x: 480, y: 128 });
  });

  it("relocates to nearest free adjacent grid slot when target is occupied", () => {
    const occupied: GridRect[] = [
      // Resources occupies x: [120..480], y: [128..512]
      { id: "resources", x: 120, y: 128, width: 360, height: 384 },
    ];

    // User attempts to drop Media Controls (360x256) directly on top of Resources (x=120, y=128)
    const slot = findNearestNonOverlappingSlot(
      120,
      128,
      360,
      256,
      occupied,
      120,
      128,
      0,
      1920,
      0,
      1080
    );

    // Must not overlap Resources!
    expect(
      rectsOverlap(
        { x: slot.x, y: slot.y, width: 360, height: 256 },
        occupied[0]
      )
    ).toBe(false);

    // Should snap to immediately adjacent free slot (e.g. x: 480 or y: 0)
    expect([
      { x: 480, y: 128 },
      { x: 120, y: 0 },
      { x: 120, y: 512 },
    ]).toContainEqual(slot);
  });

  it("avoids multiple occupied widgets on screen", () => {
    const occupied: GridRect[] = [
      // Widget 1 at (120, 128, 360, 384)
      { id: "w1", x: 120, y: 128, width: 360, height: 384 },
      // Widget 2 at (480, 128, 360, 256)
      { id: "w2", x: 480, y: 128, width: 360, height: 256 },
    ];

    // Attempt to drop at (240, 128) overlapping both
    const slot = findNearestNonOverlappingSlot(
      240,
      128,
      360,
      256,
      occupied,
      120,
      128,
      0,
      1920,
      0,
      1080
    );

    for (const occ of occupied) {
      expect(
        rectsOverlap(
          { x: slot.x, y: slot.y, width: 360, height: 256 },
          occ
        )
      ).toBe(false);
    }
  });

  it("finds closest slot on the left third of screen above an existing widget", () => {
    const occupied: GridRect[] = [
      // Weather sits in column 2 at (240, 384, width 360, height 512)
      { id: "weather", x: 240, y: 384, width: 360, height: 512 },
    ];

    // User drags Media Controls (360x256) towards top-left (0, 100)
    const slot = findNearestNonOverlappingSlot(
      0,
      100,
      360,
      256,
      occupied,
      120,
      128,
      0,
      1440,
      0,
      900
    );

    // Slot must be on the left third (x <= 240) and must not overlap Weather
    expect(slot.x).toBeLessThanOrEqual(240);
    expect(
      rectsOverlap(
        { x: slot.x, y: slot.y, width: 360, height: 256 },
        occupied[0]
      )
    ).toBe(false);
  });
});
