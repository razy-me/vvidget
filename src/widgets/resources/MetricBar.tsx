import type { FC, ReactNode } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { getMetricVariant } from "@/types/resources";
import { cn } from "@/utils/cn";

export interface MetricBarProps {
  label: string;
  valueDisplay: string;
  percent: number;
  icon?: ReactNode;
  detailTooltip?: ReactNode;
  variant?: "accent" | "warning" | "error";
  className?: string;
  size?: "xs" | "sm" | "md";
}

export const MetricBar: FC<MetricBarProps> = ({
  label,
  valueDisplay,
  percent,
  icon,
  detailTooltip,
  variant,
  className,
  size = "sm",
}) => {
  const roundedPercent = Math.min(Math.max(Math.round(percent), 0), 100);
  const activeVariant = variant ?? getMetricVariant(roundedPercent);

  const content = (
    <div className={cn("flex flex-col gap-1 w-full select-none", className)}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium text-[var(--fluent-text-primary)]">
          {icon && <span className="text-[var(--fluent-text-secondary)] flex items-center">{icon}</span>}
          <span>{label}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--fluent-text-secondary)] tabular-nums">
            {valueDisplay}
          </span>
          <Badge
            variant={activeVariant}
            size="sm"
            className="tabular-nums font-semibold min-w-[42px] justify-center"
          >
            {roundedPercent}%
          </Badge>
        </div>
      </div>

      <ProgressBar
        value={roundedPercent}
        variant={activeVariant}
        size={size}
      />
    </div>
  );

  if (detailTooltip) {
    return (
      <Tooltip content={detailTooltip} position="top" delay={150}>
        {content}
      </Tooltip>
    );
  }

  return content;
};
