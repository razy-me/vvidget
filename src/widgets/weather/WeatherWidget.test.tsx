import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WeatherWidget } from "./WeatherWidget";
import * as useWeatherModule from "@/hooks/useWeather";
import type { WeatherData } from "@/types/weather";

describe("WeatherWidget Component", () => {
  const mockWeatherData: WeatherData = {
    city: "Hamburg",
    country: "Germany",
    latitude: 53.55,
    longitude: 9.99,
    current: {
      temperatureC: 14,
      feelsLikeC: 12,
      humidity: 82,
      windSpeedKmh: 24,
      precipitationProbability: 65,
      uvIndex: 4,
      sunrise: "07:15",
      sunset: "18:22",
      condition: {
        code: 61,
        label: "Leichter Regen",
        iconName: "CloudRain",
      },
    },
    forecastHourly: [
      {
        time: "15:00",
        tempC: 14,
        condition: { code: 61, label: "Leichter Regen", iconName: "CloudRain" },
      },
      {
        time: "16:00",
        tempC: 13,
        condition: { code: 3, label: "Bedeckt", iconName: "Cloud" },
      },
    ],
    forecastDaily: [
      {
        date: "2026-10-25",
        minTempC: 8,
        maxTempC: 15,
        condition: { code: 61, label: "Leichter Regen", iconName: "CloudRain" },
      },
      {
        date: "2026-10-26",
        minTempC: 7,
        maxTempC: 13,
        condition: { code: 2, label: "Teilweise bewölkt", iconName: "CloudSun" },
      },
    ],
    isOffline: false,
    lastUpdated: "2026-10-25T14:00:00Z",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders current weather details and location correctly", () => {
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: mockWeatherData,
      loading: false,
      error: null,
      refresh: vi.fn(),
      isOffline: false,
    });

    render(<WeatherWidget />);

    expect(screen.getByTestId("weather-location")).toHaveTextContent("Hamburg, Germany");
    expect(screen.getByTestId("weather-current-temp")).toHaveTextContent("14°");
    expect(screen.getByTestId("weather-condition-label")).toHaveTextContent("Leichter Regen");
    expect(screen.getByText("• Gefühlt 12°")).toBeInTheDocument();
    expect(screen.getByText("Luftfeuchtigkeit")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("Wind")).toBeInTheDocument();
    expect(screen.getByText("24 km/h")).toBeInTheDocument();
    expect(screen.getByTestId("weather-rain-prob")).toHaveTextContent("65%");
    expect(screen.getByTestId("weather-uv-index")).toHaveTextContent("4");
    expect(screen.getByTestId("weather-sun-times")).toHaveTextContent("↑ 07:15 ↓ 18:22");
    expect(screen.getByText("Open-Meteo")).toBeInTheDocument();
    expect(screen.queryByTestId("weather-offline-badge")).not.toBeInTheDocument();
  });

  it("displays offline badge when network is disconnected", () => {
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: { ...mockWeatherData, isOffline: true },
      loading: false,
      error: null,
      refresh: vi.fn(),
      isOffline: true,
    });

    render(<WeatherWidget />);
    expect(screen.getByTestId("weather-offline-badge")).toBeInTheDocument();
    expect(screen.getByTestId("weather-offline-badge")).toHaveTextContent("Offline");
  });

  it("switches between hourly and 5-day forecast tabs", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayWeatherData: WeatherData = {
      ...mockWeatherData,
      forecastDaily: [
        { ...mockWeatherData.forecastDaily[0]!, date: todayStr },
        mockWeatherData.forecastDaily[1]!,
      ],
    };
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: todayWeatherData,
      loading: false,
      error: null,
      refresh: vi.fn(),
      isOffline: false,
    });

    render(<WeatherWidget />);

    // Default tab is hourly
    expect(screen.getByTestId("hourly-trend-container")).toBeInTheDocument();
    expect(screen.getByText("Stündlicher Trend")).toBeInTheDocument();
    expect(screen.getByText("Nächste 12h")).toBeInTheDocument();
    expect(screen.getByText("15:00")).toBeInTheDocument();

    // Click daily tab
    const dailyBtn = screen.getByTestId("tab-daily-btn");
    expect(dailyBtn).toHaveTextContent("5 Tage");
    fireEvent.click(dailyBtn);

    expect(screen.getByTestId("daily-forecast-container")).toBeInTheDocument();
    expect(screen.getByText("5-Tage-Vorhersage")).toBeInTheDocument();
    expect(screen.getByText("Max / Min")).toBeInTheDocument();
    expect(screen.getByText("Heute")).toBeInTheDocument();
    expect(screen.getByText("Mo")).toBeInTheDocument();
    expect(screen.getByText("15°")).toBeInTheDocument();
  });

  it("invokes refresh callback on refresh button click", () => {
    const mockRefresh = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: mockWeatherData,
      loading: false,
      error: null,
      refresh: mockRefresh,
      isOffline: false,
    });

    render(<WeatherWidget />);
    const refreshBtn = screen.getByTestId("weather-refresh-btn");
    fireEvent.click(refreshBtn);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders loading skeleton during initial load", () => {
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
      isOffline: false,
    });

    render(<WeatherWidget />);
    expect(screen.getByTestId("weather-widget-loading")).toBeInTheDocument();
  });

  it("renders error state when fetch fails and no cached data", () => {
    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: null,
      loading: false,
      error: "Network unreachable",
      refresh: vi.fn(),
      isOffline: true,
    });

    render(<WeatherWidget />);
    expect(screen.getByTestId("weather-widget-error")).toBeInTheDocument();
    expect(screen.getByText("Wetter nicht verfügbar")).toBeInTheDocument();
    expect(screen.getByText("Erneut verbinden")).toBeInTheDocument();
    expect(screen.getByText("Network unreachable")).toBeInTheDocument();
  });

  it("regression M6-06: displays actual day name instead of 'Heute' for stale offline forecast dates", () => {
    // 2 days ago
    const twoDaysAgo = new Date(Date.now() - 86400000 * 2);
    const year = twoDaysAgo.getFullYear();
    const month = String(twoDaysAgo.getMonth() + 1).padStart(2, "0");
    const day = String(twoDaysAgo.getDate()).padStart(2, "0");
    const staleDate = `${year}-${month}-${day}`;

    const staleItems = [
      {
        date: staleDate,
        minTempC: 5,
        maxTempC: 12,
        condition: { code: 0, label: "Klar", iconName: "Sun" },
      },
    ];

    vi.spyOn(useWeatherModule, "useWeather").mockReturnValue({
      weather: { ...mockWeatherData, forecastDaily: staleItems, isOffline: true },
      loading: false,
      error: null,
      refresh: vi.fn(),
      isOffline: true,
    });

    render(<WeatherWidget />);
    // Should NOT say "Heute" for 2-day-old forecast item
    expect(screen.queryByText("Heute")).not.toBeInTheDocument();
  });
});
