import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { DEFAULT_CONFIG } from "@/types/config";
import { useConfig } from "@/hooks/useConfig";

const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
  if (cmd === "load_config") return Promise.resolve(DEFAULT_CONFIG);
  return Promise.resolve();
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

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

  it("flushes debounced placement update immediately on beforeunload event", async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
      transformCallback: () => 0,
    };
    mockInvoke.mockClear();

    const { result, unmount } = renderHook(() => useConfig());

    act(() => {
      result.current.updateWidgetPlacement("weather", { logical_x: 100, logical_y: 200 });
    });

    // Fire beforeunload
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenLastCalledWith(
        "save_config_immediate",
        expect.objectContaining({
          config: expect.objectContaining({
            widgets: expect.objectContaining({
              weather: expect.objectContaining({ logical_x: 100, logical_y: 200 }),
            }),
          }),
        }),
        undefined,
      );
    });

    unmount();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });
});
