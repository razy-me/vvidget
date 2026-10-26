import type { FC } from "react";
import { useId } from "react";
import { cn } from "@/utils/cn";

export interface BatterySparklineProps {
  data: number[];
  height?: number;
  className?: string;
  isCharging?: boolean;
}

export const BatterySparkline: FC<BatterySparklineProps> = ({
  data,
  height = 36,
  className,
  isCharging = false,
}) => {
  const gradientId = useId();

  // If insufficient data points (<= 1), render a subtle placeholder message with soft gradient
  if (!data || data.length <= 1) {
    return (
      <div
        className={cn(
          "w-full rounded-lg bg-gradient-to-r from-sky-500/5 via-sky-400/10 to-transparent border border-sky-400/10 flex items-center justify-center select-none text-[10px] text-[var(--fluent-text-secondary)] font-medium px-2",
          className
        )}
        style={{ height: `${height}px` }}
        role="img"
        aria-label="Akkukapazitätsverlauf Platzhalter"
        data-testid="battery-sparkline-placeholder"
      >
        <span>Sammle Daten...</span>
      </div>
    );
  }

  const points = data;
  const count = points.length;

  const min = 0;
  const max = 100;
  const range = max - min;
  const stepX = count > 1 ? 100 / (count - 1) : 100;

  const coords = points.map((val, idx) => {
    const clamped = Math.min(Math.max(val, min), max);
    const x = idx * stepX;
    // Map 0-100% to Y: 92 is bottom, 8 is top (giving 8% padding)
    const y = 92 - (clamped / range) * 84;
    return { x, y };
  });

  const linePath = coords.reduce(
    (acc, pt, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
    ""
  );

  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  const strokeColor = isCharging ? "var(--fluent-accent)" : "rgb(56, 189, 248)"; // sky-400
  const fillColor = isCharging ? "var(--fluent-accent)" : "rgb(56, 189, 248)";

  const lastPoint = coords[coords.length - 1];

  return (
    <div
      className={cn("w-full overflow-hidden flex flex-col justify-center", className)}
      style={{ height: `${height}px` }}
      role="img"
      aria-label="Akkukapazitätsverlauf Sparkline"
      data-testid="battery-sparkline"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={fillColor} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        {/* Filled Area */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Stroke Line */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Current sample marker circle */}
        {lastPoint && (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r="3"
            fill={strokeColor}
          />
        )}
      </svg>
    </div>
  );
};
