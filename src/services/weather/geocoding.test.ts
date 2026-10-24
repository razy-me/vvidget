import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCity, formatCityDisplayName } from "./geocoding";
import type { GeocodingResult } from "@/types/weather";

describe("geocoding service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array for queries shorter than 2 characters", async () => {
    const results = await searchCity("a");
    expect(results).toEqual([]);
    const empty = await searchCity("   ");
    expect(empty).toEqual([]);
  });

  it("calls geocoding API and returns city results", async () => {
    const mockResults: GeocodingResult[] = [
      {
        id: 2950159,
        name: "Berlin",
        latitude: 52.52437,
        longitude: 13.41053,
        country: "Germany",
        admin1: "Land Berlin",
      },
      {
        id: 5128581,
        name: "New York",
        latitude: 40.71427,
        longitude: -74.00597,
        country: "United States",
        admin1: "New York",
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: mockResults }),
    } as unknown as Response);

    const data = await searchCity("Berlin", 2);
    expect(data.length).toBe(2);
    expect(data[0]?.name).toBe("Berlin");
    expect(data[0]?.latitude).toBe(52.52437);
  });

  it("formats city display names cleanly", () => {
    const cityWithAdmin: GeocodingResult = {
      id: 1,
      name: "Munich",
      latitude: 48.13,
      longitude: 11.58,
      admin1: "Bavaria",
      country: "Germany",
    };
    expect(formatCityDisplayName(cityWithAdmin)).toBe("Munich, Bavaria, Germany");

    const citySameAdmin: GeocodingResult = {
      id: 2,
      name: "New York",
      latitude: 40.71,
      longitude: -74.0,
      admin1: "New York",
      country: "United States",
    };
    expect(formatCityDisplayName(citySameAdmin)).toBe("New York, United States");
  });

  it("handles network error gracefully returning empty array", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("DNS resolution failed"));
    const data = await searchCity("Nowhere");
    expect(data).toEqual([]);
  });
});
