import type { WeatherCondition } from "@/types/weather";

/**
 * Standard World Meteorological Organization (WMO) Weather Interpretation Codes (WW)
 * Reference: https://open-meteo.com/en/docs
 */
const WMO_MAP: Record<number, { label: string; iconName: string }> = {
  0: { label: "Clear sky", iconName: "Sun" },
  1: { label: "Mainly clear", iconName: "Sun" },
  2: { label: "Partly cloudy", iconName: "CloudSun" },
  3: { label: "Overcast", iconName: "Cloud" },
  45: { label: "Fog", iconName: "CloudFog" },
  48: { label: "Depositing rime fog", iconName: "CloudFog" },
  51: { label: "Light drizzle", iconName: "CloudDrizzle" },
  53: { label: "Moderate drizzle", iconName: "CloudDrizzle" },
  55: { label: "Dense drizzle", iconName: "CloudDrizzle" },
  56: { label: "Light freezing drizzle", iconName: "CloudSnow" },
  57: { label: "Dense freezing drizzle", iconName: "CloudSnow" },
  61: { label: "Slight rain", iconName: "CloudRain" },
  63: { label: "Moderate rain", iconName: "CloudRain" },
  65: { label: "Heavy rain", iconName: "CloudRain" },
  66: { label: "Light freezing rain", iconName: "CloudSnow" },
  67: { label: "Heavy freezing rain", iconName: "CloudSnow" },
  71: { label: "Slight snow fall", iconName: "CloudSnow" },
  73: { label: "Moderate snow fall", iconName: "CloudSnow" },
  75: { label: "Heavy snow fall", iconName: "CloudSnow" },
  77: { label: "Snow grains", iconName: "CloudSnow" },
  80: { label: "Slight rain showers", iconName: "CloudRain" },
  81: { label: "Moderate rain showers", iconName: "CloudRain" },
  82: { label: "Violent rain showers", iconName: "CloudRain" },
  85: { label: "Slight snow showers", iconName: "CloudSnow" },
  86: { label: "Heavy snow showers", iconName: "CloudSnow" },
  95: { label: "Thunderstorm", iconName: "CloudLightning" },
  96: { label: "Thunderstorm with slight hail", iconName: "CloudLightning" },
  99: { label: "Thunderstorm with heavy hail", iconName: "CloudLightning" },
};

/**
 * Resolves WMO code into a typed WeatherCondition with human-readable label and Lucide icon identifier.
 */
export function getWeatherCondition(code: number): WeatherCondition {
  const match = WMO_MAP[code];
  if (match) {
    return {
      code,
      label: match.label,
      iconName: match.iconName,
    };
  }

  // Graceful fallback for unmapped or boundary codes
  return {
    code,
    label: "Partly cloudy",
    iconName: "CloudSun",
  };
}

/**
 * Formats temperature to integer string with unit
 */
export function formatTemperature(tempC: number): string {
  const rounded = Math.round(tempC);
  return `${rounded}°C`;
}
