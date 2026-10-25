import type {
  CurrentWeather,
  DailyForecastItem,
  HourlyForecastItem,
  WeatherData,
} from "@/types/weather";
import { getWeatherCondition } from "./wmoCodes";

const FORECAST_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const CACHE_STORAGE_KEY = "widgetz_weather_cache";

export interface OpenMeteoApiResponse {
  latitude: number;
  longitude: number;
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    precipitation_probability?: number;
    uv_index?: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability?: number[];
    uv_index?: number[];
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
    uv_index_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
}

/**
 * Extracts and formats HH:MM from ISO timestamp (e.g. 2026-10-25T07:15 -> 07:15).
 */
export function formatTimeHHMM(isoString?: string): string | undefined {
  if (!isoString) return undefined;
  if (isoString.includes("T")) {
    return isoString.split("T")[1]?.slice(0, 5);
  }
  return isoString.slice(0, 5);
}

/**
 * Parses raw Open-Meteo API response into application WeatherData model.
 */
export function parseWeatherResponse(
  raw: OpenMeteoApiResponse,
  cityName = "Current Location",
  countryName = "",
): WeatherData {
  const currentRaw = raw.current;
  const nowIsoHour = currentRaw?.time
    ? currentRaw.time.slice(0, 13)
    : new Date().toISOString().slice(0, 13);

  // Find current or nearest hour index in hourly data
  let startIndex = raw.hourly?.time
    ? raw.hourly.time.findIndex((t) => t.startsWith(nowIsoHour))
    : -1;
  if (startIndex === -1) startIndex = 0;

  const currentPrecip =
    raw.hourly?.precipitation_probability?.[startIndex] ??
    raw.daily?.precipitation_probability_max?.[0] ??
    currentRaw?.precipitation_probability;

  const currentUv =
    raw.hourly?.uv_index?.[startIndex] ??
    raw.daily?.uv_index_max?.[0] ??
    currentRaw?.uv_index;

  const todaySunrise = formatTimeHHMM(raw.daily?.sunrise?.[0]);
  const todaySunset = formatTimeHHMM(raw.daily?.sunset?.[0]);

  const current: CurrentWeather = {
    temperatureC: currentRaw ? Math.round(currentRaw.temperature_2m) : 0,
    feelsLikeC: currentRaw ? Math.round(currentRaw.apparent_temperature) : 0,
    condition: getWeatherCondition(currentRaw ? currentRaw.weather_code : 0),
    humidity: currentRaw ? Math.round(currentRaw.relative_humidity_2m) : 0,
    windSpeedKmh: currentRaw ? Math.round(currentRaw.wind_speed_10m) : 0,
  };

  if (currentPrecip !== undefined) {
    current.precipitationProbability = Math.round(currentPrecip);
  }
  if (currentUv !== undefined) {
    current.uvIndex = Math.round(currentUv);
  }
  if (todaySunrise) {
    current.sunrise = todaySunrise;
  }
  if (todaySunset) {
    current.sunset = todaySunset;
  }

  const forecastDaily: DailyForecastItem[] = [];
  if (raw.daily && raw.daily.time) {
    const count = Math.min(raw.daily.time.length, 5);
    for (let i = 0; i < count; i++) {
      const item: DailyForecastItem = {
        date: raw.daily.time[i] ?? "",
        minTempC: Math.round(raw.daily.temperature_2m_min[i] ?? 0),
        maxTempC: Math.round(raw.daily.temperature_2m_max[i] ?? 0),
        condition: getWeatherCondition(raw.daily.weather_code[i] ?? 0),
      };

      if (raw.daily.precipitation_probability_max?.[i] !== undefined) {
        item.precipitationProbability = Math.round(
          raw.daily.precipitation_probability_max[i] ?? 0,
        );
      }
      if (raw.daily.uv_index_max?.[i] !== undefined) {
        item.uvIndexMax = Math.round(raw.daily.uv_index_max[i] ?? 0);
      }
      const itemSunrise = formatTimeHHMM(raw.daily.sunrise?.[i]);
      if (itemSunrise) {
        item.sunrise = itemSunrise;
      }
      const itemSunset = formatTimeHHMM(raw.daily.sunset?.[i]);
      if (itemSunset) {
        item.sunset = itemSunset;
      }

      forecastDaily.push(item);
    }
  }

  const forecastHourly: HourlyForecastItem[] = [];
  if (raw.hourly && raw.hourly.time) {
    // Grab next 12 hours
    const endIndex = Math.min(startIndex + 12, raw.hourly.time.length);
    for (let i = startIndex; i < endIndex; i++) {
      const rawTime = raw.hourly.time[i] ?? "";
      // Format time as HH:00
      const hourPart = rawTime.includes("T") ? rawTime.split("T")[1] ?? rawTime : rawTime;
      const formattedTime = hourPart.slice(0, 5);

      const item: HourlyForecastItem = {
        time: formattedTime,
        tempC: Math.round(raw.hourly.temperature_2m[i] ?? 0),
        condition: getWeatherCondition(raw.hourly.weather_code[i] ?? 0),
      };

      if (raw.hourly.precipitation_probability?.[i] !== undefined) {
        item.precipitationProbability = Math.round(
          raw.hourly.precipitation_probability[i] ?? 0,
        );
      }
      if (raw.hourly.uv_index?.[i] !== undefined) {
        item.uvIndex = Math.round(raw.hourly.uv_index[i] ?? 0);
      }

      forecastHourly.push(item);
    }
  }

  const result: WeatherData = {
    city: cityName,
    country: countryName,
    latitude: raw.latitude,
    longitude: raw.longitude,
    current,
    forecastDaily,
    forecastHourly,
    isOffline: false,
    lastUpdated: new Date().toISOString(),
  };

  if (todaySunrise) {
    result.sunrise = todaySunrise;
  }
  if (todaySunset) {
    result.sunset = todaySunset;
  }

  return result;
}

/**
 * Loads cached weather data from local storage if available.
 */
export function getCachedWeather(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherData;
    parsed.isOffline = false;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Saves successful weather data to local storage.
 */
export function setCachedWeather(data: WeatherData): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Non-critical if storage quota is exceeded
  }
}

/**
 * Fetches weather forecast from Open-Meteo.
 * Falls back to local cached weather data with `isOffline = true` if network fails.
 */
export async function fetchWeather(
  latitude: number,
  longitude: number,
  cityName = "Current Location",
  countryName = "",
  signal?: AbortSignal,
): Promise<WeatherData> {
  const url = new URL(FORECAST_BASE_URL);
  url.searchParams.set("latitude", latitude.toFixed(4));
  url.searchParams.set("longitude", longitude.toFixed(4));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
  );
  url.searchParams.set(
    "hourly",
    "temperature_2m,weather_code,precipitation_probability,uv_index",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "5");

  try {
    const response = await fetch(url.toString(), {
      signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP error: ${response.status}`);
    }

    const json: OpenMeteoApiResponse = await response.json();
    const weatherData = parseWeatherResponse(json, cityName, countryName);
    setCachedWeather(weatherData);
    return weatherData;
  } catch (error: unknown) {
    const cached = getCachedWeather();
    if (cached) {
      return { ...cached, isOffline: true };
    }
    const message = error instanceof Error ? error.message : "Failed to fetch weather";
    throw new Error(message);
  }
}
