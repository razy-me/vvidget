import type { FC } from "react";
import type { HourlyForecastItem } from "@/types/weather";
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudDrizzle,
  CloudFog,
} from "lucide-react";

interface HourlyTrendProps {
  items: HourlyForecastItem[];
}

export const WeatherIcon: FC<{ name: string; className?: string }> = ({
  name,
  className = "w-4 h-4",
}) => {
  switch (name) {
    case "Sun":
      return <Sun className={`${className} text-amber-400`} />;
    case "CloudSun":
      return <CloudSun className={`${className} text-amber-300`} />;
    case "Cloud":
      return <Cloud className={`${className} text-slate-300`} />;
    case "CloudRain":
      return <CloudRain className={`${className} text-sky-400`} />;
    case "CloudDrizzle":
      return <CloudDrizzle className={`${className} text-sky-300`} />;
    case "CloudSnow":
      return <CloudSnow className={`${className} text-blue-200`} />;
    case "CloudLightning":
      return <CloudLightning className={`${className} text-yellow-400`} />;
    case "CloudFog":
      return <CloudFog className={`${className} text-slate-400`} />;
    default:
      return <CloudSun className={`${className} text-amber-300`} />;
  }
};

export const HourlyTrend: FC<HourlyTrendProps> = ({ items }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] uppercase tracking-wider mb-1.5 flex items-center justify-between">
        <span>Hourly Trend</span>
        <span className="text-[10px] lowercase text-[var(--fluent-text-secondary)]/80">Next 12h</span>
      </div>
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none select-none"
        data-testid="hourly-trend-container"
      >
        {items.map((item, idx) => (
          <div
            key={`${item.time}-${idx}`}
            className="flex flex-col items-center justify-between min-w-[46px] p-1.5 rounded-lg bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] shrink-0 transition-transform hover:scale-105"
          >
            <span className="text-[10px] text-[var(--fluent-text-secondary)]">{item.time}</span>
            <div className="my-1">
              <WeatherIcon name={item.condition.iconName} className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-[var(--fluent-text-primary)]">
              {item.tempC}°
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
