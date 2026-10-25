import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  parseWeatherResponse,
  getCachedWeather,
  setCachedWeather,
  fetchWeather,
  type OpenMeteoApiResponse,
} from "./openMeteo";

describe("openMeteo service", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const mockApiResponse: OpenMeteoApiResponse = {
    latitude: 52.52,
    longitude: 13.41,
    current: {
      time: "2026-10-25T14:00",
      temperature_2m: 16.7,
      relative_humidity_2m: 65,
      apparent_temperature: 15.3,
      weather_code: 2,
      wind_speed_10m: 12.8,
    },
    hourly: {
      time: [
        "2026-10-25T14:00",
        "2026-10-25T15:00",
        "2026-10-25T16:00",
        "2026-10-25T17:00",
      ],
      temperature_2m: [16.7, 17.2, 16.5, 15.0],
      weather_code: [2, 1, 0, 3],
    },
    daily: {
      time: ["2026-10-25", "2026-10-26", "2026-10-27"],
      weather_code: [2, 61, 0],
      temperature_2m_max: [18.2, 15.1, 19.0],
      temperature_2m_min: [9.4, 11.2, 8.5],
    },
  };

  it("parses Open-Meteo response into domain WeatherData model", () => {
    const parsed = parseWeatherResponse(mockApiResponse, "Berlin", "Germany");

    expect(parsed.city).toBe("Berlin");
    expect(parsed.country).toBe("Germany");
    expect(parsed.latitude).toBe(52.52);
    expect(parsed.longitude).toBe(13.41);
    expect(parsed.isOffline).toBe(false);

    // Current metrics
    expect(parsed.current.temperatureC).toBe(17);
    expect(parsed.current.feelsLikeC).toBe(15);
    expect(parsed.current.humidity).toBe(65);
    expect(parsed.current.windSpeedKmh).toBe(13);
    expect(parsed.current.condition.label).toBe("Partly cloudy");
    expect(parsed.current.condition.iconName).toBe("CloudSun");

    // Forecast daily
    expect(parsed.forecastDaily.length).toBe(3);
    expect(parsed.forecastDaily[0]).toEqual({
      date: "2026-10-25",
      minTempC: 9,
      maxTempC: 18,
      condition: {
        code: 2,
        label: "Partly cloudy",
        iconName: "CloudSun",
      },
    });

    // Forecast hourly
    expect(parsed.forecastHourly.length).toBe(4);
    expect(parsed.forecastHourly[0]?.time).toBe("14:00");
    expect(parsed.forecastHourly[0]?.tempC).toBe(17);
  });

  it("parses UV index, precipitation probability, and sunrise/sunset", () => {
    const extendedApiResponse: OpenMeteoApiResponse = {
      ...mockApiResponse,
      hourly: {
        ...mockApiResponse.hourly!,
        precipitation_probability: [20, 45, 60, 10],
        uv_index: [3.2, 4.8, 2.1, 0.5],
      },
      daily: {
        ...mockApiResponse.daily!,
        precipitation_probability_max: [65, 80, 10],
        uv_index_max: [5.4, 6.1, 4.0],
        sunrise: ["2026-10-25T07:15", "2026-10-26T07:17", "2026-10-27T07:19"],
        sunset: ["2026-10-25T18:22", "2026-10-26T18:20", "2026-10-27T18:18"],
      },
    };

    const parsed = parseWeatherResponse(extendedApiResponse, "Berlin", "Germany");

    expect(parsed.current.precipitationProbability).toBe(20);
    expect(parsed.current.uvIndex).toBe(3);
    expect(parsed.current.sunrise).toBe("07:15");
    expect(parsed.current.sunset).toBe("18:22");
    expect(parsed.sunrise).toBe("07:15");
    expect(parsed.sunset).toBe("18:22");

    expect(parsed.forecastDaily[0]?.precipitationProbability).toBe(65);
    expect(parsed.forecastDaily[0]?.uvIndexMax).toBe(5);
    expect(parsed.forecastDaily[0]?.sunrise).toBe("07:15");
    expect(parsed.forecastDaily[0]?.sunset).toBe("18:22");

    expect(parsed.forecastHourly[0]?.precipitationProbability).toBe(20);
    expect(parsed.forecastHourly[0]?.uvIndex).toBe(3);
  });

  it("handles caching of weather data and offline retrieval", () => {
    expect(getCachedWeather()).toBeNull();

    const parsed = parseWeatherResponse(mockApiResponse, "Munich", "Germany");
    setCachedWeather(parsed);

    const cached = getCachedWeather();
    expect(cached).not.toBeNull();
    expect(cached?.city).toBe("Munich");
    expect(cached?.isOffline).toBe(false);
    expect(cached?.current.temperatureC).toBe(17);
  });

  it("fetches weather successfully and writes to cache", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    } as unknown as Response);

    const result = await fetchWeather(52.52, 13.41, "Berlin", "Germany");
    expect(result.city).toBe("Berlin");
    expect(result.current.temperatureC).toBe(17);
    expect(result.isOffline).toBe(false);

    // Should also be in cache
    const cached = getCachedWeather();
    expect(cached).not.toBeNull();
    expect(cached?.city).toBe("Berlin");
  });

  it("falls back to cached weather when network request fails", async () => {
    const parsed = parseWeatherResponse(mockApiResponse, "Offline Cached City", "Germany");
    setCachedWeather(parsed);

    global.fetch = vi.fn().mockRejectedValue(new Error("Network connection lost"));

    const result = await fetchWeather(52.52, 13.41, "Failed City");
    expect(result.city).toBe("Offline Cached City");
    expect(result.isOffline).toBe(true);
  });

  it("throws error when network fails and no cached data exists", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network connection down"));

    await expect(fetchWeather(52.52, 13.41, "No Cache City")).rejects.toThrow(
      "Network connection down",
    );
  });
});
