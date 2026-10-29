import { useState, useEffect, useMemo, memo, type FC } from "react";
import { Globe } from "lucide-react";
import {
  TIMEZONE_OPTIONS,
  formatDigitalTime,
  formatDateWithWeekdayGerman,
} from "./clockUtils";
import { cn } from "@/utils/cn";

export interface ClockFaceProps {
  initialTime?: Date;
  className?: string;
}

const ClockFaceComponent: FC<ClockFaceProps> = ({ initialTime, className }) => {
  const [currentTime, setCurrentTime] = useState<Date>(() => initialTime ?? new Date());
  const [selectedTzId, setSelectedTzId] = useState<string>("local");
  const [clockViewMode, setClockViewMode] = useState<"digital" | "analog">("digital");

  // Second-boundary aligned tick update with document.hidden pause
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const scheduleNextTick = () => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      const now = Date.now();
      const delay = 1000 - (now % 1000);
      timerId = setTimeout(() => {
        if (!isMounted) return;
        if (typeof document === "undefined" || !document.hidden) {
          setCurrentTime(new Date());
        }
        scheduleNextTick();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        if (timerId) clearTimeout(timerId);
        setCurrentTime(new Date());
        scheduleNextTick();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    scheduleNextTick();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, []);

  const selectedTz = useMemo(() => {
    return TIMEZONE_OPTIONS.find((t) => t.id === selectedTzId) ?? TIMEZONE_OPTIONS[0];
  }, [selectedTzId]);

  const digitalTime = useMemo(() => {
    return formatDigitalTime(currentTime, selectedTz.timeZone);
  }, [currentTime, selectedTz.timeZone]);

  const germanDate = useMemo(() => {
    return formatDateWithWeekdayGerman(currentTime, selectedTz.timeZone);
  }, [currentTime, selectedTz.timeZone]);

  // Analog calculations
  const analogAngles = useMemo(() => {
    const h = parseInt(digitalTime.hours, 10);
    const m = parseInt(digitalTime.minutes, 10);
    const s = parseInt(digitalTime.seconds, 10);
    return {
      hourAngle: ((h % 12) + m / 60) * 30,
      minuteAngle: (m + s / 60) * 6,
      secondAngle: s * 6,
    };
  }, [digitalTime]);

  return (
    <div
      data-testid="uhr-tab-content"
      className={cn("h-full flex flex-col justify-between space-y-2", className)}
    >
      {/* View Mode & Timezone Bar */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 text-[11px] text-[var(--fluent-text-secondary)]">
          <Globe className="w-3 h-3 text-[var(--fluent-accent)] shrink-0" />
          <select
            aria-label="Zeitzone auswählen"
            value={selectedTzId}
            onChange={(e) => setSelectedTzId(e.target.value)}
            className="bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] text-[var(--fluent-text-primary)] rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-[var(--fluent-accent)] transition-colors"
          >
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.id} value={tz.id} className="bg-neutral-900 text-white">
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Digital / Analog Switcher */}
        <div className="flex items-center p-0.5 rounded-md border border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)]">
          <button
            type="button"
            onClick={() => setClockViewMode("digital")}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium transition-[color,background-color] duration-150",
              clockViewMode === "digital"
                ? "bg-[var(--fluent-accent)] text-black font-semibold"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]"
            )}
          >
            Digital
          </button>
          <button
            type="button"
            onClick={() => setClockViewMode("analog")}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium transition-[color,background-color] duration-150",
              clockViewMode === "analog"
                ? "bg-[var(--fluent-accent)] text-black font-semibold"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]"
            )}
          >
            Analog
          </button>
        </div>
      </div>

      {/* Main Clock Face Display */}
      <div className="flex-1 flex flex-col items-center justify-center py-2">
        {clockViewMode === "analog" ? (
          /* Analog Clock Face */
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              {/* Dial Background */}
              <circle
                cx="50"
                cy="50"
                r="46"
                className="fill-[var(--fluent-card-bg)] stroke-[var(--fluent-stroke)]"
                strokeWidth="2"
              />
              {/* Hour ticks */}
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i * 30 * Math.PI) / 180;
                const x1 = 50 + 38 * Math.sin(angle);
                const y1 = 50 - 38 * Math.cos(angle);
                const x2 = 50 + 43 * Math.sin(angle);
                const y2 = 50 - 43 * Math.cos(angle);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="currentColor"
                    strokeWidth={i % 3 === 0 ? "2" : "1"}
                    className={
                      i % 3 === 0
                        ? "text-[var(--fluent-text-primary)]"
                        : "text-[var(--fluent-text-tertiary)]"
                    }
                  />
                );
              })}

              {/* Hour hand */}
              <line
                x1="50"
                y1="50"
                x2={50 + 26 * Math.sin((analogAngles.hourAngle * Math.PI) / 180)}
                y2={50 - 26 * Math.cos((analogAngles.hourAngle * Math.PI) / 180)}
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                className="text-[var(--fluent-text-primary)]"
              />

              {/* Minute hand */}
              <line
                x1="50"
                y1="50"
                x2={50 + 36 * Math.sin((analogAngles.minuteAngle * Math.PI) / 180)}
                y2={50 - 36 * Math.cos((analogAngles.minuteAngle * Math.PI) / 180)}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="text-[var(--fluent-text-primary)]"
              />

              {/* Second hand */}
              <line
                x1="50"
                y1="50"
                x2={50 + 39 * Math.sin((analogAngles.secondAngle * Math.PI) / 180)}
                y2={50 - 39 * Math.cos((analogAngles.secondAngle * Math.PI) / 180)}
                stroke="var(--fluent-accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />

              {/* Center Cap */}
              <circle cx="50" cy="50" r="3" fill="var(--fluent-accent)" />
            </svg>
          </div>
        ) : (
          /* Digital Clock Display */
          <div className="flex flex-col items-center justify-center my-auto">
            <div
              data-testid="digital-time-display"
              className="font-mono text-4xl sm:text-5xl font-extrabold tracking-tight text-[var(--fluent-text-primary)] tabular-nums drop-shadow-sm"
            >
              <span>{digitalTime.hours}</span>
              <span className="text-[var(--fluent-accent)]">:</span>
              <span>{digitalTime.minutes}</span>
              <span className="text-xl sm:text-2xl font-semibold text-[var(--fluent-text-secondary)] ml-1">
                :{digitalTime.seconds}
              </span>
            </div>
          </div>
        )}

        {/* Date & Weekday in German */}
        <div
          data-testid="german-date-display"
          className="mt-2 text-xs font-medium text-[var(--fluent-text-secondary)] text-center tracking-wide"
        >
          {germanDate}
        </div>
      </div>
    </div>
  );
};

export const ClockFace = memo(ClockFaceComponent);
ClockFace.displayName = "ClockFace";
