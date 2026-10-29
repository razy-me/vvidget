import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWeather } from "@/hooks/useWeather";
import type { WeatherData } from "@/types/weather";
import type { AppConfig } from "@/types/config";
import { DEFAULT_CONFIG } from "@/types/config";

let mockConfig: AppConfig = { ...DEFAULT_CONFIG };

vi.mock("@/hooks/useConfig", () => ({
  useConfig: () => ({
    config: mockConfig,
  }),
}));

const mockWeatherData: WeatherData = {
  city: "Berlin",
  country: "Germany",
  latitude: 52.52,
  longitude: 13.405,
  current: {
    temperatureC: 18,
    feelsLikeC: 17,
    condition: { code: 1, label: "Mainly clear", iconName: "CloudSun" },
    humidity: 60,
    windSpeedKmh: 10,
  },
  forecastDaily: [],
  forecastHourly: [],
  isOffline: false,
  lastUpdated: new Date().toISOString(),
};

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("useWeather Hook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    mockConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("resolves coordinates via Windows Geolocation when enabled", async () => {
    mockConfig.weather_settings.use_windows_location = true;

    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_windows_location") return Promise.resolve([48.8566, 2.3522]);
      return Promise.resolve();
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        latitude: 48.8566,
        longitude: 2.3522,
        current: {
          time: "2026-10-25T12:00",
          temperature_2m: 20,
          apparent_temperature: 19,
          weather_code: 0,
          relative_humidity_2m: 50,
          wind_speed_10m: 12,
        },
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useWeather());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.weather?.city).toBe("Local Area");
    expect(result.current.weather?.current.temperatureC).toBe(20);
    expect(result.current.isOffline).toBe(false);
  });

  it("uses explicit coordinates from config when Windows location is disabled", async () => {
    mockConfig.weather_settings.use_windows_location = false;
    mockConfig.weather_settings.latitude = 35.6762;
    mockConfig.weather_settings.longitude = 139.6503;
    mockConfig.weather_settings.manual_city = "Tokyo";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        latitude: 35.6762,
        longitude: 139.6503,
        current: {
          time: "2026-10-25T12:00",
          temperature_2m: 22,
          apparent_temperature: 21,
          weather_code: 1,
          relative_humidity_2m: 55,
          wind_speed_10m: 8,
        },
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useWeather());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.weather?.city).toBe("Tokyo");
    expect(result.current.weather?.current.temperatureC).toBe(22);
  });

  it("falls back to cached data with isOffline=true when network request fails", async () => {
    mockConfig.weather_settings.use_windows_location = false;

    // Prepopulate localStorage cache
    localStorage.setItem(
      "vvidget_weather_cache",
      JSON.stringify({ ...mockWeatherData, city: "Munich", isOffline: false })
    );

    // Network request throws
    global.fetch = vi.fn().mockRejectedValue(new Error("Network connection lost"));

    const { result } = renderHook(() => useWeather());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.weather?.city).toBe("Munich");
    expect(result.current.isOffline).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("sets error message when network fails and no cached data exists", async () => {
    mockConfig.weather_settings.use_windows_location = false;
    localStorage.clear();

    global.fetch = vi.fn().mockRejectedValue(new Error("Unable to connect to Open-Meteo"));

    const { result } = renderHook(() => useWeather());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.weather).toBeNull();
    expect(result.current.error).toBe("Unable to connect to Open-Meteo");
    expect(result.current.loading).toBe(false);
  });

  it("reuses cached coordinates within 24h TTL without invoking native geolocation", async () => {
    mockConfig.weather_settings.use_windows_location = true;

    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };
    mockInvoke.mockReset();

    localStorage.setItem(
      "vvidget_geo_coords_cache",
      JSON.stringify({ lat: 45.0, lon: 9.0, timestamp: Date.now() - 3600 * 1000 })
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        latitude: 45.0,
        longitude: 9.0,
        current: {
          time: "2026-10-25T12:00",
          temperature_2m: 16,
          apparent_temperature: 15,
          weather_code: 0,
          relative_humidity_2m: 60,
          wind_speed_10m: 5,
        },
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useWeather());

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.weather?.latitude).toBe(45.0);
    expect(result.current.weather?.longitude).toBe(9.0);
  });

  it("pauses interval polling when document is hidden", async () => {
    vi.useFakeTimers();
    mockConfig.weather_settings.use_windows_location = false;
    mockConfig.weather_settings.latitude = 50.0;
    mockConfig.weather_settings.longitude = 10.0;

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          latitude: 50.0,
          longitude: 10.0,
          current: {
            time: "2026-10-25T12:00",
            temperature_2m: 10,
            apparent_temperature: 9,
            weather_code: 0,
            relative_humidity_2m: 70,
            wind_speed_10m: 4,
          },
        }),
      } as unknown as Response);
    });

    await act(async () => {
      renderHook(() => useWeather());
    });
    expect(fetchCount).toBe(1);

    Object.defineProperty(document, "hidden", { value: true, configurable: true });

    await act(async () => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    expect(fetchCount).toBe(1);

    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    vi.useRealTimers();
  });
});
