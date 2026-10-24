import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@/types/config";

describe("AppConfig data contracts and defaults", () => {
  it("has valid default configuration schema", () => {
    expect(DEFAULT_CONFIG.version).toBe(1);
    expect(DEFAULT_CONFIG.lock_positions).toBe(false);
    expect(DEFAULT_CONFIG.always_on_top).toBe(false);
    expect(DEFAULT_CONFIG.snap_to_edges).toBe(true);
    expect(DEFAULT_CONFIG.layout_mode).toBe("independent");
    expect(DEFAULT_CONFIG.auto_start).toBe(false);
    expect(DEFAULT_CONFIG.theme).toBe("auto");
  });

  it("contains default configurations for all 3 starter widgets", () => {
    expect(DEFAULT_CONFIG.widgets).toBeDefined();
    const widgetKeys = Object.keys(DEFAULT_CONFIG.widgets);
    expect(widgetKeys).toContain("resources");
    expect(widgetKeys).toContain("spotify");
    expect(widgetKeys).toContain("weather");

    const resources = DEFAULT_CONFIG.widgets.resources;
    expect(resources.visible).toBe(true);
    expect(resources.logical_width).toBe(320);
    expect(resources.logical_height).toBe(180);

    const spotify = DEFAULT_CONFIG.widgets.spotify;
    expect(spotify.visible).toBe(true);
    expect(spotify.logical_width).toBe(320);
    expect(spotify.logical_height).toBe(140);

    const weather = DEFAULT_CONFIG.widgets.weather;
    expect(weather.visible).toBe(true);
    expect(weather.logical_width).toBe(320);
    expect(weather.logical_height).toBe(160);
  });

  it("defines standard polling rates", () => {
    expect(DEFAULT_CONFIG.polling_rates.resources_cpu_ram_ms).toBe(1500);
    expect(DEFAULT_CONFIG.polling_rates.resources_disk_ms).toBe(15000);
    expect(DEFAULT_CONFIG.polling_rates.weather_minutes).toBe(30);
  });

  it("enables Windows location by default", () => {
    expect(DEFAULT_CONFIG.weather_settings.use_windows_location).toBe(true);
    expect(DEFAULT_CONFIG.weather_settings.manual_city).toBeNull();
  });
});
