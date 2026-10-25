import { useState, useEffect, useRef } from "react";
import type { FC } from "react";
import { Card, Badge } from "@/components/ui";
import { useWeather } from "@/hooks/useWeather";
import { HourlyTrend, WeatherIcon } from "./HourlyTrend";
import { DailyForecast } from "./DailyForecast";
import {
  MapPin,
  RefreshCw,
  Droplets,
  Wind,
  WifiOff,
  Calendar,
  Clock,
  AlertCircle,
} from "lucide-react";

export interface WeatherWidgetProps {
  className?: string;
}

export const WeatherWidget: FC<WeatherWidgetProps> = ({ className = "" }) => {
  const { weather, loading, error, refresh, isOffline } = useWeather();
  const [activeTab, setActiveTab] = useState<"hourly" | "daily">("hourly");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // 1. Initial Loading State with skeleton
  if (loading && !weather) {
    return (
      <Card
        variant="acrylic"
        className={`w-full p-4 space-y-4 animate-pulse select-none ${className}`}
        data-testid="weather-widget-loading"
      >
        <div className="flex items-center justify-between">
          <div className="h-4 bg-[var(--fluent-control-bg)] rounded w-28" />
          <div className="h-4 bg-[var(--fluent-control-bg)] rounded w-16" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-10 bg-[var(--fluent-control-bg)] rounded w-20" />
          <div className="h-10 w-10 bg-[var(--fluent-control-bg)] rounded-full" />
        </div>
        <div className="h-16 bg-[var(--fluent-control-bg)] rounded-lg w-full" />
      </Card>
    );
  }

  // 2. Fatal Error State (no network and no cached data)
  if (error && !weather) {
    return (
      <Card
        variant="acrylic"
        className={`w-full p-4 space-y-3 select-none ${className}`}
        data-testid="weather-widget-error"
      >
        <div className="flex items-center justify-between text-rose-400">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <AlertCircle className="w-4 h-4" />
            <span>Weather Unavailable</span>
          </div>
          <Badge variant="error" size="sm">
            Error
          </Badge>
        </div>
        <p className="text-xs text-[var(--fluent-text-secondary)]">{error}</p>
        <button
          type="button"
          onClick={() => void handleManualRefresh()}
          className="w-full py-1.5 px-3 rounded-lg bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)] hover:bg-[var(--fluent-control-active)] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Retry Connection</span>
        </button>
      </Card>
    );
  }

  if (!weather) {
    return null;
  }

  const { current, city, country, forecastHourly, forecastDaily } = weather;
  const locationLabel = country ? `${city}, ${country}` : city;

  return (
    <Card
      variant="acrylic"
      className={`w-full p-3 space-y-3 select-none ${className}`}
      data-testid="weather-widget"
    >
      {/* Top Header: Location, Offline badge & Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0 pr-2">
          <MapPin className="w-3.5 h-3.5 text-[var(--fluent-accent)] shrink-0" />
          <span
            className="text-xs font-semibold text-[var(--fluent-text-primary)] truncate"
            title={locationLabel}
            data-testid="weather-location"
          >
            {locationLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isOffline && (
            <Badge
              variant="warning"
              size="sm"
              icon={<WifiOff className="w-3 h-3" />}
              data-testid="weather-offline-badge"
            >
              Offline
            </Badge>
          )}

          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            className="p-1 rounded-md text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-control-bg)] transition-colors"
            title="Refresh weather"
            aria-label="Refresh weather"
            data-testid="weather-refresh-btn"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing || loading ? "animate-spin text-[var(--fluent-accent)]" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Hero Display: Temperature, Icon & Details */}
      <div className="flex items-center justify-between px-1">
        <div>
          <div className="flex items-baseline gap-1">
            <span
              className="text-3xl font-light tracking-tight text-[var(--fluent-text-primary)]"
              data-testid="weather-current-temp"
            >
              {current.temperatureC}°
            </span>
            <span className="text-xs text-[var(--fluent-text-secondary)]">C</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-xs font-medium text-[var(--fluent-text-primary)]"
              data-testid="weather-condition-label"
            >
              {current.condition.label}
            </span>
            <span className="text-[11px] text-[var(--fluent-text-secondary)]">
              • Feels like {current.feelsLikeC}°
            </span>
          </div>
        </div>

        <div className="p-2 rounded-2xl bg-white/5 border border-[var(--fluent-stroke)] flex items-center justify-center">
          <WeatherIcon name={current.condition.iconName} className="w-8 h-8" />
        </div>
      </div>

      {/* Environmental Sub-metrics: Humidity & Wind */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)]">
          <Droplets className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-[var(--fluent-text-secondary)]">Humidity</span>
            <span className="font-semibold text-[11px]">{current.humidity}%</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)]">
          <Wind className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-[var(--fluent-text-secondary)]">Wind</span>
            <span className="font-semibold text-[11px]">{current.windSpeedKmh} km/h</span>
          </div>
        </div>
      </div>

      {/* Forecast Sub-view Mode Switcher */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--fluent-stroke)]">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("hourly")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === "hourly"
                ? "bg-[var(--fluent-accent)]/15 text-[var(--fluent-accent)]"
                : "text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-control-bg)] hover:text-[var(--fluent-text-primary)]"
            }`}
            data-testid="tab-hourly-btn"
          >
            <Clock className="w-3 h-3" />
            <span>Hourly</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("daily")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === "daily"
                ? "bg-[var(--fluent-accent)]/15 text-[var(--fluent-accent)]"
                : "text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-control-bg)] hover:text-[var(--fluent-text-primary)]"
            }`}
            data-testid="tab-daily-btn"
          >
            <Calendar className="w-3 h-3" />
            <span>5 Days</span>
          </button>
        </div>

        <span className="text-[10px] text-[var(--fluent-text-secondary)]">
          Open-Meteo
        </span>
      </div>

      {/* Sub-view Content: Hourly Trend vs Daily Forecast */}
      {activeTab === "hourly" ? (
        <HourlyTrend items={forecastHourly} />
      ) : (
        <DailyForecast items={forecastDaily} />
      )}
    </Card>
  );
};

export default WeatherWidget;
