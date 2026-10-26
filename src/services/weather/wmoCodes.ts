import type { WeatherCondition } from "@/types/weather";

/**
 * Standard World Meteorological Organization (WMO) Weather Interpretation Codes (WW)
 * Reference: https://open-meteo.com/en/docs
 */
const WMO_MAP: Record<number, { label: string; iconName: string }> = {
  0: { label: "Klarer Himmel", iconName: "Sun" },
  1: { label: "Überwiegend klar", iconName: "Sun" },
  2: { label: "Teilweise bewölkt", iconName: "CloudSun" },
  3: { label: "Bedeckt", iconName: "Cloud" },
  45: { label: "Nebel", iconName: "CloudFog" },
  48: { label: "Reifnebel", iconName: "CloudFog" },
  51: { label: "Leichter Nieselregen", iconName: "CloudDrizzle" },
  53: { label: "Mäßiger Nieselregen", iconName: "CloudDrizzle" },
  55: { label: "Dichter Nieselregen", iconName: "CloudDrizzle" },
  56: { label: "Leichter gefrierender Nieselregen", iconName: "CloudSnow" },
  57: { label: "Dichter gefrierender Nieselregen", iconName: "CloudSnow" },
  61: { label: "Leichter Regen", iconName: "CloudRain" },
  63: { label: "Mäßiger Regen", iconName: "CloudRain" },
  65: { label: "Starker Regen", iconName: "CloudRain" },
  66: { label: "Leichter gefrierender Regen", iconName: "CloudSnow" },
  67: { label: "Starker gefrierender Regen", iconName: "CloudSnow" },
  71: { label: "Leichter Schneefall", iconName: "CloudSnow" },
  73: { label: "Mäßiger Schneefall", iconName: "CloudSnow" },
  75: { label: "Starker Schneefall", iconName: "CloudSnow" },
  77: { label: "Schneegriesel", iconName: "CloudSnow" },
  80: { label: "Leichte Regenschauer", iconName: "CloudRain" },
  81: { label: "Mäßige Regenschauer", iconName: "CloudRain" },
  82: { label: "Heftige Regenschauer", iconName: "CloudRain" },
  85: { label: "Leichte Schneeschauer", iconName: "CloudSnow" },
  86: { label: "Starke Schneeschauer", iconName: "CloudSnow" },
  95: { label: "Gewitter", iconName: "CloudLightning" },
  96: { label: "Gewitter mit leichtem Hagel", iconName: "CloudLightning" },
  99: { label: "Gewitter mit schwerem Hagel", iconName: "CloudLightning" },
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
    label: "Teilweise bewölkt",
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
