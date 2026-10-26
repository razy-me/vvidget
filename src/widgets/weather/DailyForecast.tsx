import type { FC } from "react";
import type { DailyForecastItem } from "@/types/weather";
import { WeatherIcon } from "./HourlyTrend";

interface DailyForecastProps {
  items: DailyForecastItem[];
}

const GERMAN_DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatDayName(dateString: string, index: number): string {
  if (index === 0) return "Heute";
  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return GERMAN_DAY_NAMES[date.getUTCDay()] ?? dateString;
    }
  } catch {
    // Fallback if parsing fails
  }
  return dateString;
}

export const DailyForecast: FC<DailyForecastProps> = ({ items }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-1.5" data-testid="daily-forecast-container">
      <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] uppercase tracking-wider mb-1 flex items-center justify-between">
        <span>5-Tage-Vorhersage</span>
        <span className="text-[10px] text-[var(--fluent-text-secondary)]/80">Max / Min</span>
      </div>
      <div className="space-y-1 select-none">
        {items.map((item, idx) => (
          <div
            key={`${item.date}-${idx}`}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--fluent-card-bg)]/40 text-xs"
          >
            {/* Day name */}
            <span className="w-14 font-medium text-[var(--fluent-text-primary)]">
              {formatDayName(item.date, idx)}
            </span>

            {/* Condition Icon + Label */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0 px-2">
              <WeatherIcon name={item.condition.iconName} className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] text-[var(--fluent-text-secondary)] truncate">
                {item.condition.label}
              </span>
            </div>

            {/* High / Low temperatures */}
            <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
              <span className="text-[var(--fluent-text-primary)] font-semibold">
                {item.maxTempC}°
              </span>
              <span className="text-[var(--fluent-text-secondary)]">/</span>
              <span className="text-[var(--fluent-text-secondary)]">
                {item.minTempC}°
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
