import type { FC } from "react";
import { useId } from "react";
import { cn } from "@/utils/cn";

export interface MiniGraphProps {
  data: number[];
  min?: number;
  max?: number;
  height?: number;
  className?: string;
  variant?: "accent" | "warning" | "error" | "default";
}

export const MiniGraph: FC<MiniGraphProps> = ({
  data,
  min = 0,
  max = 100,
  height = 28,
  className,
  variant = "accent",
}) => {
  const gradientId = useId();

  // If data is empty, default to zero points
  const points = data.length > 0 ? data : [0, 0];
  const count = points.length;

  const strokeColors = {
    accent: "var(--fluent-accent)",
    warning: "var(--fluent-warning)",
    error: "var(--fluent-error)",
    default: "var(--fluent-text-secondary)",
  }[variant];

  const fillColors = {
    accent: "var(--fluent-accent)",
    warning: "var(--fluent-warning)",
    error: "var(--fluent-error)",
    default: "var(--fluent-text-secondary)",
  }[variant];

  // SVG coordinate space: 100 width, viewBox="0 0 100 100"
  const range = max > min ? max - min : 100;
  const stepX = count > 1 ? 100 / (count - 1) : 100;

  const coords = points.map((val, idx) => {
    const clamped = Math.min(Math.max(val, min), max);
    const x = idx * stepX;
    // In SVG, y=0 is top, y=100 is bottom
    const y = 100 - ((clamped - min) / range) * 90 - 5; // 5% padding top and bottom
    return { x, y };
  });

  const linePath = coords.reduce(
    (acc, pt, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`,
    ""
  );

  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  return (
    <div
      className={cn("w-full overflow-hidden flex items-center", className)}
      style={{ height: `${height}px` }}
      role="img"
      aria-label="CPU usage history trend sparkline"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColors} stopOpacity="0.25" />
            <stop offset="100%" stopColor={fillColors} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Gradient Area Fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Line Stroke */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColors}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-colors duration-300 ease-linear"
        />

        {/* Latest Value Dot */}
        {coords.length > 0 && (
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r="2.5"
            fill={strokeColors}
          />
        )}
      </svg>
    </div>
  );
};
