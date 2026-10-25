import { describe, it, expect } from "vitest";
import {
  WIDGET_REGISTRY,
  getWidgetMetadata,
  getAllWidgetMetadata,
  resolveBaseWidgetType,
  WidgetId,
} from "@/widgets/registry";

describe("Widget Registry", () => {
  const allWidgetIds: WidgetId[] = [
    "resources",
    "spotify",
    "weather",
    "speedtest",
    "launcher",
    "quick_settings",
    "calendar",
    "clock",
    "bluetooth",
    "battery",
  ];

  it("defines all 10 registered widgets", () => {
    expect(allWidgetIds).toHaveLength(10);
    for (const id of allWidgetIds) {
      expect(WIDGET_REGISTRY).toHaveProperty(id);
    }
  });

  it("returns metadata for all 10 widgets via getWidgetMetadata", () => {
    for (const id of allWidgetIds) {
      const meta = getWidgetMetadata(id);
      expect(meta).toBeDefined();
      expect(meta?.id).toBe(id);
      expect(meta?.defaultWidth).toBeGreaterThan(0);
      expect(meta?.defaultHeight).toBeGreaterThan(0);
      expect(meta?.minWidth).toBeGreaterThan(0);
      expect(meta?.minHeight).toBeGreaterThan(0);
      expect(meta?.name).toBeTruthy();
      expect(meta?.description).toBeTruthy();
      expect(["utility", "media", "system"]).toContain(meta?.category);
    }

    const nonExistent = getWidgetMetadata("unknown-widget");
    expect(nonExistent).toBeUndefined();
  });

  it("resolves dynamic and base widget types via resolveBaseWidgetType", () => {
    expect(resolveBaseWidgetType("quick_settings_123")).toBe("quick_settings");
    expect(resolveBaseWidgetType("quick_settings_dynamic_abc")).toBe("quick_settings");
    expect(resolveBaseWidgetType("quick_settings")).toBe("quick_settings");
    expect(resolveBaseWidgetType("resources")).toBe("resources");
    expect(resolveBaseWidgetType("speedtest")).toBe("speedtest");
    expect(resolveBaseWidgetType("unknown-custom-id")).toBe("resources");
  });

  it("returns metadata for dynamic quick_settings instances", () => {
    const dynamicMeta = getWidgetMetadata("quick_settings_123");
    expect(dynamicMeta).toBeDefined();
    expect(dynamicMeta?.id).toBe("quick_settings");
    expect(dynamicMeta?.defaultWidth).toBe(360);
    expect(dynamicMeta?.defaultHeight).toBe(256);
  });

  it("returns all 10 widgets as a list via getAllWidgetMetadata", () => {
    const widgets = getAllWidgetMetadata();
    expect(widgets.length).toBe(10);
    const ids = widgets.map((w) => w.id);
    for (const expectedId of allWidgetIds) {
      expect(ids).toContain(expectedId);
    }
  });
});
