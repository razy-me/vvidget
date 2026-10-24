import type { GeocodingApiResponse, GeocodingResult } from "@/types/weather";

const GEOCODING_BASE_URL = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Searches for cities by name using Open-Meteo Geocoding API.
 * Free, no API key required.
 */
export async function searchCity(
  query: string,
  count = 5,
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return [];
  }

  const url = new URL(GEOCODING_BASE_URL);
  url.searchParams.set("name", trimmed);
  url.searchParams.set("count", Math.min(Math.max(count, 1), 10).toString());
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url.toString(), {
      signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding API responded with HTTP ${response.status}`);
    }

    const data: GeocodingApiResponse = await response.json();
    return data.results ?? [];
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return [];
    }
    const message = error instanceof Error ? error.message : "Geocoding request failed";
    console.warn("Geocoding lookup failed:", message);
    return [];
  }
}

/**
 * Resolves a friendly display name for a geocoded city
 */
export function formatCityDisplayName(result: GeocodingResult): string {
  const parts: string[] = [result.name];
  if (result.admin1 && result.admin1 !== result.name) {
    parts.push(result.admin1);
  }
  if (result.country) {
    parts.push(result.country);
  }
  return parts.join(", ");
}
