import { useState, useEffect, useCallback, useRef } from "react";
import type { WeatherData } from "@/types/weather";
import { fetchWeather, getCachedWeather } from "@/services/weather/openMeteo";
import { searchCity } from "@/services/weather/geocoding";
import { useConfig } from "./useConfig";
import { safeInvoke } from "@/utils/tauri";

export interface UseWeatherReturn {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isOffline: boolean;
}

// Sensible default location (Berlin, Germany) if no location or coordinates configured
const DEFAULT_FALLBACK_LOCATION = {
  city: "Berlin",
  country: "Germany",
  latitude: 52.52,
  longitude: 13.405,
};

const GEO_COORDS_CACHE_KEY = "vvidget_geo_coords_cache";
const GEO_COORDS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedGeoCoords {
  lat: number;
  lon: number;
  timestamp: number;
}

/**
 * React hook orchestrating Windows Geolocation / Open-Meteo Geocoding resolution,
 * periodic forecast updates, offline fallback caching, and error resilience.
 */
export function useWeather(): UseWeatherReturn {
  const { config } = useConfig();
  const [weather, setWeather] = useState<WeatherData | null>(() => getCachedWeather());
  const [loading, setLoading] = useState<boolean>(!weather);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const resolveCoordinates = useCallback(
    async (
      signal?: AbortSignal,
    ): Promise<{
      lat: number;
      lon: number;
      city: string;
      country: string;
    }> => {
      const { weather_settings } = config;

      // 1. Native Windows Geolocation API
      if (weather_settings.use_windows_location) {
        try {
          if (typeof localStorage !== "undefined") {
            const raw = localStorage.getItem(GEO_COORDS_CACHE_KEY);
            if (raw) {
              try {
                const parsed: CachedGeoCoords = JSON.parse(raw);
                if (
                  typeof parsed.lat === "number" &&
                  typeof parsed.lon === "number" &&
                  typeof parsed.timestamp === "number" &&
                  Date.now() - parsed.timestamp < GEO_COORDS_CACHE_TTL_MS
                ) {
                  return {
                    lat: parsed.lat,
                    lon: parsed.lon,
                    city: "Local Area",
                    country: "",
                  };
                }
              } catch {
                localStorage.removeItem(GEO_COORDS_CACHE_KEY);
              }
            }
          }

          const coords = await safeInvoke<[number, number]>("get_windows_location");
          const [lat, lon] = coords;

          if (typeof localStorage !== "undefined") {
            localStorage.setItem(
              GEO_COORDS_CACHE_KEY,
              JSON.stringify({ lat, lon, timestamp: Date.now() })
            );
          }

          return {
            lat,
            lon,
            city: "Local Area",
            country: "",
          };
        } catch (err) {
          console.warn(
            "Windows Location API query failed, falling back to manual city or default:",
            err,
          );
        }
      }

      // 2. Explicit Coordinates in config
      if (
        weather_settings.latitude !== null &&
        weather_settings.longitude !== null &&
        !isNaN(weather_settings.latitude) &&
        !isNaN(weather_settings.longitude)
      ) {
        return {
          lat: weather_settings.latitude,
          lon: weather_settings.longitude,
          city: weather_settings.manual_city ?? "Configured Location",
          country: "",
        };
      }

      // 3. Manual City Search Geocoding
      if (weather_settings.manual_city && weather_settings.manual_city.trim().length > 1) {
        try {
          const results = await searchCity(weather_settings.manual_city.trim(), 1, signal);
          if (results.length > 0 && results[0]) {
            const match = results[0];
            return {
              lat: match.latitude,
              lon: match.longitude,
              city: match.name,
              country: match.country ?? "",
            };
          }
        } catch (geoErr) {
          console.warn("City geocoding search failed:", geoErr);
        }
      }

      // 4. Default Fallback
      return {
        lat: DEFAULT_FALLBACK_LOCATION.latitude,
        lon: DEFAULT_FALLBACK_LOCATION.longitude,
        city: DEFAULT_FALLBACK_LOCATION.city,
        country: DEFAULT_FALLBACK_LOCATION.country,
      };
    },
    [config.weather_settings],
  );

  const loadWeather = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const coords = await resolveCoordinates(controller.signal);
      const data = await fetchWeather(
        coords.lat,
        coords.lon,
        coords.city,
        coords.country,
        controller.signal,
      );

      if (!controller.signal.aborted) {
        setWeather(data);
        setError(null);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const cached = getCachedWeather();
      if (cached) {
        setWeather({ ...cached, isOffline: true });
      } else {
        const msg = err instanceof Error ? err.message : "Unable to retrieve weather data";
        setError(msg);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [resolveCoordinates]);

  // Periodic polling interval
  useEffect(() => {
    void loadWeather();

    const intervalMinutes = Math.max(config.polling_rates?.weather_minutes ?? 30, 5);
    const intervalMs = intervalMinutes * 60 * 1000;

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }
      void loadWeather();
    }, intervalMs);

    const handleResume = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void loadWeather();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleResume);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleResume);
    }

    return () => {
      clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleResume);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleResume);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadWeather, config.polling_rates?.weather_minutes]);

  return {
    weather,
    loading,
    error,
    refresh: loadWeather,
    isOffline: weather?.isOffline ?? false,
  };
}
