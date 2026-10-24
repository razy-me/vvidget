import { useState, useEffect, type FC, type ReactNode } from "react";
import { ChevronDown, ChevronUp, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/utils/cn";

export interface DockItemProps {
  id: string;
  title: string;
  icon?: ReactNode;
  defaultCollapsed?: boolean;
  onHide?: () => void;
  className?: string;
  children: ReactNode;
}

export const DockItem: FC<DockItemProps> = ({
  id,
  title,
  icon,
  defaultCollapsed = false,
  onHide,
  className,
  children,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  return (
    <Card
      variant="subtle"
      padded={false}
      className={cn(
        "w-full overflow-hidden transition-all duration-200 border border-[var(--fluent-stroke)]",
        "rounded-xl bg-[var(--fluent-card-bg)] shadow-md",
        className
      )}
      data-testid={`dock-item-${id}`}
    >
      {/* Item Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-[var(--fluent-card-hover)]/40 border-b border-[var(--fluent-stroke-subtle)] select-none"
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 text-xs font-semibold text-[var(--fluent-text-primary)] hover:opacity-80 transition-opacity flex-1 text-left"
          aria-expanded={!isCollapsed}
          aria-label={title}
        >
          {icon && (
            <span className="text-[var(--fluent-accent)] flex items-center justify-center">
              {icon}
            </span>
          )}
          <span className="truncate">{title}</span>
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {onHide && (
            <Tooltip content="Hide from Dock" position="top" delay={300}>
              <button
                type="button"
                onClick={onHide}
                className="p-1 rounded-md text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)] transition-colors"
                aria-label={`Hide ${title}`}
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}

          <Tooltip
            content={isCollapsed ? "Expand widget" : "Collapse widget"}
            position="top"
            delay={300}
          >
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded-md text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)] transition-colors"
              aria-label={isCollapsed ? `Expand ${title} content` : `Collapse ${title} content`}
            >
              {isCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Item Body with smooth collapsible state */}
      {!isCollapsed && (
        <div
          className="p-2.5 transition-all duration-200"
          data-testid={`dock-item-content-${id}`}
        >
          {children}
        </div>
      )}
    </Card>
  );
};
