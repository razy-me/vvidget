import { describe, it, expect } from "vitest";
import {
  rectsOverlap,
  findNearestNonOverlappingSlot,
  type GridRect,
} from "@/utils/gridCollision";

describe("gridCollision utilities", () => {
  it("detects overlapping rectangles correctly", () => {
    const r1 = { x: 160, y: 120, width: 320, height: 360 };
    // Intersecting rect
    const r2 = { x: 320, y: 240, width: 320, height: 240 };
    expect(rectsOverlap(r1, r2)).toBe(true);

    // Completely separate rect
    const r3 = { x: 800, y: 120, width: 320, height: 360 };
    expect(rectsOverlap(r1, r3)).toBe(false);

    // Perfectly adjacent edge-to-edge (x=480, right of r1=480)
    const rAdjacent = { x: 480, y: 120, width: 320, height: 360 };
    expect(rectsOverlap(r1, rAdjacent)).toBe(false);
  });

  it("snaps to target slot directly when unobstructed", () => {
    const occupied: GridRect[] = [
      { id: "resources", x: 160, y: 120, width: 320, height: 360 },
    ];

    // Dropping at (485, 125) - free adjacent cell
    const slot = findNearestNonOverlappingSlot(
      485,
      125,
      320,
      240,
      occupied,
      160,
      120,
      0,
      1920,
      0,
      1080
    );

    expect(slot).toEqual({ x: 480, y: 120 });
  });

  it("relocates to nearest free adjacent grid slot when target is occupied", () => {
    const occupied: GridRect[] = [
      // Resources occupies x: [160..480], y: [120..480]
      { id: "resources", x: 160, y: 120, width: 320, height: 360 },
    ];

    // User attempts to drop Media Controls (320x240) directly on top of Resources (x=160, y=120)
    const slot = findNearestNonOverlappingSlot(
      160,
      120,
      320,
      240,
      occupied,
      160,
      120,
      0,
      1920,
      0,
      1080
    );

    // Must not overlap Resources!
    expect(
      rectsOverlap(
        { x: slot.x, y: slot.y, width: 320, height: 240 },
        occupied[0]
      )
    ).toBe(false);

    // Should snap to immediately adjacent free slot (e.g. x: 480 or y: 0)
    expect([
      { x: 480, y: 120 },
      { x: 160, y: 0 },
      { x: 160, y: 480 },
    ]).toContainEqual(slot);
  });

  it("avoids multiple occupied widgets on screen", () => {
    const occupied: GridRect[] = [
      // Widget 1 at (160, 120, 320, 360)
      { id: "w1", x: 160, y: 120, width: 320, height: 360 },
      // Widget 2 at (480, 120, 320, 240)
      { id: "w2", x: 480, y: 120, width: 320, height: 240 },
    ];

    // Attempt to drop at (320, 120) overlapping both
    const slot = findNearestNonOverlappingSlot(
      320,
      120,
      320,
      240,
      occupied,
      160,
      120,
      0,
      1920,
      0,
      1080
    );

    for (const occ of occupied) {
      expect(
        rectsOverlap(
          { x: slot.x, y: slot.y, width: 320, height: 240 },
          occ
        )
      ).toBe(false);
    }
  });

  it("finds closest slot on the left third of screen above an existing widget", () => {
    const occupied: GridRect[] = [
      // Weather sits in column 2 at (320, 360, width 320, height 480)
      { id: "weather", x: 320, y: 360, width: 320, height: 480 },
    ];

    // User drags Media Controls (320x240) towards top-left (0, 100)
    const slot = findNearestNonOverlappingSlot(
      0,
      100,
      320,
      240,
      occupied,
      160,
      120,
      0,
      1440,
      0,
      900
    );

    // Slot must be on the left third (x <= 320) and must not overlap Weather
    expect(slot.x).toBeLessThanOrEqual(320);
    expect(
      rectsOverlap(
        { x: slot.x, y: slot.y, width: 320, height: 240 },
        occupied[0]
      )
    ).toBe(false);
  });

  it("regression M4-02: maintains strict grid alignment when work area bounds do not divide evenly by grid step", () => {
    // Work area 1032px with 240px widget height gives maxY = 792px, gridY = 120px
    // 792 is not a multiple of 120 (792 / 120 = 6.6)
    // Similarly maxX = 1035px with gridX = 160px
    const occupied: GridRect[] = [
      { id: "bottom-blocker", x: 160, y: 600, width: 320, height: 120 },
    ];

    // Dragging near bottom boundary (e.g. y = 800)
    const slot = findNearestNonOverlappingSlot(
      200,
      800,
      320,
      240,
      occupied,
      160,
      120,
      0,
      1035,
      0,
      792
    );

    // Returned coordinates MUST be strict integer multiples of gridX and gridY
    expect(slot.x % 160).toBe(0);
    expect(slot.y % 120).toBe(0);
    // Must be within bounds
    expect(slot.x).toBeLessThanOrEqual(1035);
    expect(slot.y).toBeLessThanOrEqual(792);
    // Must not overlap blocker
    expect(
      rectsOverlap(
        { x: slot.x, y: slot.y, width: 320, height: 240 },
        occupied[0]
      )
    ).toBe(false);
  });
});
