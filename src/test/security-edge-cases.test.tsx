import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpotifyWidget } from "@/widgets/spotify/SpotifyWidget";
import { ResourceWidget } from "@/widgets/resources/ResourceWidget";
import { parseWeatherResponse, getCachedWeather } from "@/services/weather/openMeteo";
import { bytesToGb, formatBytesGb, getMetricVariant, type SystemMetrics } from "@/types/resources";
import type { MediaSession } from "@/types/media";

describe("Security & Input Sanitization (R8)", () => {
  it("safely escapes potential XSS strings in Spotify track metadata", () => {
    const maliciousSession: MediaSession = {
      is_active: true,
      is_playing: true,
      title: '<script>alert("xss")</script><img src=x onerror=alert(1)>',
      artist: '<b onmouseover="alert(2)">Evil Artist</b>',
      album: '"><script>evil()</script>',
      track_id: "sec-xss-1",
      timeline: {
        position_ms: 1000,
        duration_ms: 60000,
        last_updated_system_time_ms: Date.now(),
      },
      album_art_url: null,
      can_play_pause: true,
      can_skip_next: true,
      can_skip_previous: true,
      source_app: '<script>alert("spotify")</script>',
    };

    const { container } = render(<SpotifyWidget sessionOverride={maliciousSession} />);

    // React escapes strings into text nodes, no raw script tags should exist in DOM
    const scripts = container.querySelectorAll("script");
    expect(scripts.length).toBe(0);

    // The text content should be literally present as plain escaped text
    expect(screen.getByText('<script>alert("xss")</script><img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<b onmouseover="alert(2)">Evil Artist</b>')).toBeInTheDocument();
  });

  it("safely handles corrupted JSON in localStorage weather cache without crashing", () => {
    localStorage.setItem("widgetz_weather_cache", "NOT_VALID_JSON{[[{");
    const cached = getCachedWeather();
    expect(cached).toBeNull();
  });

  it("handles null/missing payload fields in Open-Meteo response", () => {
    const malformedRaw = {
      latitude: 0,
      longitude: 0,
    };

    const parsed = parseWeatherResponse(malformedRaw, "Unknown City");
    expect(parsed.city).toBe("Unknown City");
    expect(parsed.current.temperatureC).toBe(0);
    expect(parsed.forecastDaily).toEqual([]);
    expect(parsed.forecastHourly).toEqual([]);
  });

  it("handles extreme negative temperatures and unknown WMO codes safely", () => {
    const extremeRaw = {
      latitude: -75.25,
      longitude: 123.3,
      current: {
        time: "2026-10-25T12:00",
        temperature_2m: -58.4,
        apparent_temperature: -68.2,
        relative_humidity_2m: 10,
        weather_code: 9999, // Undefined WMO code
        wind_speed_10m: 120.5,
      },
    };

    const parsed = parseWeatherResponse(extremeRaw, "Antarctica");
    expect(parsed.current.temperatureC).toBe(-58);
    expect(parsed.current.feelsLikeC).toBe(-68);
    expect(parsed.current.condition.label).toBe("Partly cloudy");
  });
});

describe("System Resource Utilization Edge Cases (R5)", () => {
  it("handles zero and negative byte values safely in format functions", () => {
    expect(bytesToGb(-999999)).toBe(0);
    expect(formatBytesGb(-500)).toBe("0.0 GB");
    expect(formatBytesGb(0)).toBe("0.0 GB");
  });

  it("handles petabyte-scale storage sizes gracefully", () => {
    // 2 Petabytes = 2 * 1024^5 bytes
    const twoPetabytes = 2 * 1024 * 1024 * 1024 * 1024 * 1024;
    // bytesToGb converts to GiB
    const inGb = bytesToGb(twoPetabytes);
    expect(inGb).toBe(2097152);
    expect(formatBytesGb(twoPetabytes)).toBe("2097152.0 GB");
  });

  it("correctly evaluates variant bounds for negative or >100 percentages", () => {
    expect(getMetricVariant(-5)).toBe("accent");
    expect(getMetricVariant(150)).toBe("error");
  });
});

describe("Multi-Disk Interaction in ResourceWidget (R5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("allows switching between multiple storage drives (C:, D:, E:)", async () => {
    const multiDiskMetrics: SystemMetrics = {
      cpu_usage_percent: 15.0,
      cpu_cores: 16,
      memory: {
        total_bytes: 32 * 1024 * 1024 * 1024,
        used_bytes: 12 * 1024 * 1024 * 1024,
        free_bytes: 20 * 1024 * 1024 * 1024,
        used_percent: 37.5,
      },
      disks: [
        {
          name: "Windows NVMe",
          mount_point: "C:\\",
          total_bytes: 1000 * 1024 * 1024 * 1024,
          used_bytes: 400 * 1024 * 1024 * 1024,
          free_bytes: 600 * 1024 * 1024 * 1024,
          used_percent: 40.0,
        },
        {
          name: "Games SSD",
          mount_point: "D:\\",
          total_bytes: 2000 * 1024 * 1024 * 1024,
          used_bytes: 1500 * 1024 * 1024 * 1024,
          free_bytes: 500 * 1024 * 1024 * 1024,
          used_percent: 75.0,
        },
        {
          name: "Backup HDD",
          mount_point: "E:\\",
          total_bytes: 4000 * 1024 * 1024 * 1024,
          used_bytes: 3600 * 1024 * 1024 * 1024,
          free_bytes: 400 * 1024 * 1024 * 1024,
          used_percent: 90.0,
        },
      ],
      timestamp_ms: Date.now(),
    };

    const useSystemMetricsModule = await import("@/hooks/useSystemMetrics");
    vi.spyOn(useSystemMetricsModule, "useSystemMetrics").mockReturnValue({
      metrics: multiDiskMetrics,
      cpuHistory: [10, 15],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<ResourceWidget />);

    // Starts on C:
    expect(screen.getByText("Storage (C:)")).toBeInTheDocument();
    expect(screen.getByText("Windows NVMe")).toBeInTheDocument();
    expect(screen.getByText("400.0 GB / 1000.0 GB")).toBeInTheDocument();

    // Click D: disk button
    const dButton = screen.getByRole("button", { name: "D:" });
    fireEvent.click(dButton);

    expect(screen.getByText("Storage (D:)")).toBeInTheDocument();
    expect(screen.getByText("Games SSD")).toBeInTheDocument();
    expect(screen.getByText("1500.0 GB / 2000.0 GB")).toBeInTheDocument();

    // Click E: disk button
    const eButton = screen.getByRole("button", { name: "E:" });
    fireEvent.click(eButton);

    expect(screen.getByText("Storage (E:)")).toBeInTheDocument();
    expect(screen.getByText("Backup HDD")).toBeInTheDocument();
    expect(screen.getByText("3600.0 GB / 4000.0 GB")).toBeInTheDocument();
  });

  it("handles systems with no disks gracefully without crashing", async () => {
    const noDisksMetrics: SystemMetrics = {
      cpu_usage_percent: 20.0,
      cpu_cores: 4,
      memory: {
        total_bytes: 8 * 1024 * 1024 * 1024,
        used_bytes: 4 * 1024 * 1024 * 1024,
        free_bytes: 4 * 1024 * 1024 * 1024,
        used_percent: 50.0,
      },
      disks: [],
      timestamp_ms: Date.now(),
    };

    const useSystemMetricsModule = await import("@/hooks/useSystemMetrics");
    vi.spyOn(useSystemMetricsModule, "useSystemMetrics").mockReturnValue({
      metrics: noDisksMetrics,
      cpuHistory: [20],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<ResourceWidget />);

    expect(screen.getByText("System Resources")).toBeInTheDocument();
    expect(screen.getByText("CPU")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.queryByText(/Storage/)).not.toBeInTheDocument();
  });
});
