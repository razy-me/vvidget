import type { FC } from "react";
import { cn } from "@/utils/cn";

export interface SkeletonWidgetProps {
  className?: string;
  title?: string;
}

export const SkeletonWidget: FC<SkeletonWidgetProps> = ({ className, title }) => {
  return (
    <div
      data-testid="skeleton-widget"
      className={cn(
        "w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none pointer-events-none box-border",
        className
      )}
    >
      <div className="w-full h-full rounded-2xl border-2 border-dashed border-[var(--fluent-accent)] bg-[var(--fluent-acrylic-bg)]/90 shadow-[0_12px_32px_rgba(0,0,0,0.6),0_0_24px_rgba(56,189,248,0.35)] flex flex-col p-4 transition-all duration-150 overflow-hidden box-border">
        {/* Skeleton Header Bar */}
        <div className="shrink-0 flex items-center justify-between pb-3 border-b border-[var(--fluent-accent)]/20 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-4 h-4 rounded-md bg-[var(--fluent-accent)]/40" />
            <div className="h-3.5 w-24 rounded-full bg-[var(--fluent-accent)]/30">
              {title && <span className="sr-only">{title}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded bg-[var(--fluent-accent)]/20" />
            <div className="w-3.5 h-3.5 rounded bg-[var(--fluent-accent)]/20" />
          </div>
        </div>

        {/* Skeleton Body Cards / Pulse Lines */}
        <div className="flex-1 min-h-0 flex flex-col gap-2.5 justify-evenly overflow-hidden py-1">
          <div className="flex-1 min-h-[28px] max-h-11 w-full rounded-xl bg-[var(--fluent-accent)]/15 border border-[var(--fluent-accent)]/20 flex items-center px-3">
            <div className="h-2.5 w-1/3 rounded-full bg-[var(--fluent-accent)]/30" />
          </div>
          <div className="flex-1 min-h-[28px] max-h-11 w-full rounded-xl bg-[var(--fluent-accent)]/10 border border-[var(--fluent-accent)]/15 flex items-center px-3">
            <div className="h-2.5 w-1/2 rounded-full bg-[var(--fluent-accent)]/25" />
          </div>
          <div className="flex-1 min-h-[28px] max-h-11 w-full rounded-xl bg-[var(--fluent-accent)]/10 border border-[var(--fluent-accent)]/15 flex items-center px-3">
            <div className="h-2.5 w-2/3 rounded-full bg-[var(--fluent-accent)]/25" />
          </div>
          <div className="flex-1 min-h-[28px] max-h-11 w-full rounded-xl bg-[var(--fluent-accent)]/10 border border-[var(--fluent-accent)]/15 flex items-center px-3">
            <div className="h-2.5 w-1/4 rounded-full bg-[var(--fluent-accent)]/20" />
          </div>
        </div>

        {/* Grid Target Caption */}
        <div className="shrink-0 mt-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--fluent-accent)]/80">
          Drop Target
        </div>
      </div>
    </div>
  );
};
