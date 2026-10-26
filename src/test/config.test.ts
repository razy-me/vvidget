import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { DEFAULT_CONFIG } from "@/types/config";
import { useConfig } from "@/hooks/useConfig";

const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
  if (cmd === "load_config") return Promise.resolve(DEFAULT_CONFIG);
  return Promise.resolve();
});

const mockUnlisten = vi.fn();
const eventListeners: Record<string, ((event: { payload: unknown }) => void)[]> = {};
let customListenImpl: ((event: string, cb: (e: { payload: unknown }) => void) => Promise<() => void>) | null = null;

const mockListen = vi.fn().mockImplementation((event: string, cb: (e: { payload: unknown }) => void) => {
  if (customListenImpl) {
    return customListenImpl(event, cb);
  }
  if (!eventListeners[event]) {
    eventListeners[event] = [];
  }
  eventListeners[event].push(cb);
  return Promise.resolve(mockUnlisten);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
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
    expect(resources.logical_width).toBe(360);
    expect(resources.logical_height).toBe(384);

    const spotify = DEFAULT_CONFIG.widgets.spotify;
    expect(spotify.visible).toBe(true);
    expect(spotify.logical_width).toBe(360);
    expect(spotify.logical_height).toBe(256);

    const weather = DEFAULT_CONFIG.widgets.weather;
    expect(weather.visible).toBe(true);
    expect(weather.logical_width).toBe(360);
    expect(weather.logical_height).toBe(512);
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

  it("unsubscribes and prevents listener leak if unmounted before listen resolves (regression X1-01)", async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };
    const unlistenSpy = vi.fn();
    let resolveListen!: (unlisten: () => void) => void;
    customListenImpl = () =>
      new Promise((resolve) => {
        resolveListen = resolve;
      });

    const { unmount } = renderHook(() => useConfig());

    // Allow import("@tauri-apps/api/event") to resolve so listen() is called
    await waitFor(() => {
      expect(resolveListen).toBeDefined();
    });

    // Unmount while listen() is in-flight
    unmount();

    // Now resolve the asynchronous listen call
    resolveListen(unlistenSpy);

    // Verify unlisten was called immediately because isDisposed was true
    await waitFor(() => {
      expect(unlistenSpy).toHaveBeenCalledTimes(1);
    });

    customListenImpl = null;
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("synchronously updates latestConfigRef on config-changed event to avoid reverting external changes (regression X1-02)", async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };
    mockInvoke.mockClear();

    const currentListeners: ((event: { payload: unknown }) => void)[] = [];
    customListenImpl = (_event, cb) => {
      currentListeners.push(cb);
      return Promise.resolve(mockUnlisten);
    };

    const { result, unmount } = renderHook(() => useConfig());

    // Wait until initial load_config and listener registration complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(currentListeners.length).toBeGreaterThan(0);
    });

    const externalConfig = {
      ...DEFAULT_CONFIG,
      lock_positions: true,
      theme: "dark" as const,
    };

    // External change arrives (e.g. from system tray)
    act(() => {
      currentListeners.forEach((listener) =>
        listener({ payload: externalConfig })
      );
    });

    expect(result.current.config.lock_positions).toBe(true);

    // Directly trigger updateWidgetPlacement
    act(() => {
      result.current.updateWidgetPlacement("spotify", { logical_x: 120 });
    });

    // Advance debounced write (or trigger flush)
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_config_immediate",
        expect.objectContaining({
          config: expect.objectContaining({
            lock_positions: true,
            theme: "dark",
            widgets: expect.objectContaining({
              spotify: expect.objectContaining({ logical_x: 120 }),
            }),
          }),
        }),
      );
    });

    customListenImpl = null;
    unmount();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });
});
