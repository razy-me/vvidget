import { describe, it, expect } from "vitest";
import {
  WIDGET_REGISTRY,
  getWidgetMetadata,
  getAllWidgetMetadata,
} from "@/widgets/registry";

describe("Widget Registry", () => {
  it("defines the 3 required starter widgets", () => {
    expect(WIDGET_REGISTRY).toHaveProperty("weather");
    expect(WIDGET_REGISTRY).toHaveProperty("spotify");
    expect(WIDGET_REGISTRY).toHaveProperty("resources");
  });

  it("returns metadata by id via getWidgetMetadata", () => {
    const resources = getWidgetMetadata("resources");
    expect(resources).toBeDefined();
    expect(resources?.name).toBe("System Resources");
    expect(resources?.defaultWidth).toBeGreaterThan(0);
    expect(resources?.defaultHeight).toBeGreaterThan(0);

    const nonExistent = getWidgetMetadata("unknown-widget");
    expect(nonExistent).toBeUndefined();
  });

  it("returns all widgets as a list", () => {
    const widgets = getAllWidgetMetadata();
    expect(widgets.length).toBe(3);
    const ids = widgets.map((w) => w.id);
    expect(ids).toContain("weather");
    expect(ids).toContain("spotify");
    expect(ids).toContain("resources");
  });
});
