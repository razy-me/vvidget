import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number; // 0 to 100
  max?: number;
  min?: number;
  variant?: "accent" | "success" | "warning" | "error";
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
  labelPosition?: "inline" | "top";
}

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value,
      max = 100,
      min = 0,
      variant = "accent",
      size = "sm",
      showLabel = false,
      labelPosition = "top",
      className,
      ...props
    },
    ref
  ) => {
    const numericValue = Number.isFinite(value) ? value : min;
    const clampedValue = max <= min ? min : Math.min(Math.max(numericValue, min), max);
    const percentage = max <= min ? 0 : Math.round(((clampedValue - min) / (max - min)) * 100);

    const heightClasses = {
      xs: "h-1",
      sm: "h-1.5",
      md: "h-2.5",
      lg: "h-3.5",
    }[size];

    const fillVariants = {
      accent: "bg-[var(--fluent-accent)]",
      success: "bg-[var(--fluent-success)]",
      warning: "bg-[var(--fluent-warning)]",
      error: "bg-[var(--fluent-error)]",
    }[variant];

    return (
      <div className={cn("w-full flex flex-col gap-1", className)}>
        {showLabel && labelPosition === "top" && (
          <div className="flex justify-between items-center text-xs text-[var(--fluent-text-secondary)]">
            <span>Progress</span>
            <span className="font-medium tabular-nums">{percentage}%</span>
          </div>
        )}

        <div
          ref={ref}
          role="progressbar"
          aria-valuenow={clampedValue}
          aria-valuemin={min}
          aria-valuemax={max}
          className={cn(
            "w-full overflow-hidden rounded-full bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke-subtle)] relative",
            heightClasses
          )}
          {...props}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300 ease-out",
              fillVariants
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";
