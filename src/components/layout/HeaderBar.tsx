import type { FC } from "react";
import { GripHorizontal, Lock, Unlock, Settings, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import type { HeaderBarProps } from "@/types/window";

export const HeaderBar: FC<HeaderBarProps> = ({
  title,
  icon,
  isLocked = false,
  onToggleLock,
  onClose,
  onOpenSettings,
  className,
  showControls = true,
  actions,
}) => {
  return (
    <header
      {...(!isLocked ? { "data-tauri-drag-region": true } : {})}
      className={cn(
        "flex items-center justify-between px-3 py-2 select-none border-b border-[var(--fluent-stroke)]",
        "transition-colors duration-150",
        !isLocked ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        className
      )}
      aria-label={`${title} widget header`}
    >
      {/* Title & Icon Area */}
      <div className="flex items-center gap-2 min-w-0" {...(!isLocked ? { "data-tauri-drag-region": true } : {})}>
        {!isLocked && (
          <Tooltip content="Drag to move widget" position="bottom" delay={300}>
            <span
              className="text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-text-secondary)] transition-colors"
              aria-hidden="true"
            >
              <GripHorizontal className="w-3.5 h-3.5" />
            </span>
          </Tooltip>
        )}
        {icon && (
          <span
            className="flex-shrink-0 text-[var(--fluent-accent)] flex items-center justify-center"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <h2 className="text-xs font-semibold text-[var(--fluent-text-primary)] truncate tracking-wide">
          {title}
        </h2>
      </div>

      {/* Controls & Actions Area */}
      <div
        className="flex items-center gap-1 flex-shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {actions}

        {showControls && (
          <>
            {onToggleLock && (
              <Tooltip
                content={isLocked ? "Unlock widget position" : "Lock widget position"}
                position="bottom"
                delay={200}
              >
                <button
                  type="button"
                  onClick={onToggleLock}
                  className={cn(
                    "p-1 rounded-md text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]",
                    "hover:bg-[var(--fluent-card-hover)] active:scale-95 transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fluent-accent)]",
                    isLocked && "text-[var(--fluent-accent)]"
                  )}
                  aria-label={isLocked ? `Unlock ${title} position` : `Lock ${title} position`}
                  aria-pressed={isLocked}
                >
                  {isLocked ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
                  )}
                </button>
              </Tooltip>
            )}

            {onOpenSettings && (
              <Tooltip content="Settings" position="bottom" delay={200}>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className={cn(
                    "p-1 rounded-md text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]",
                    "hover:bg-[var(--fluent-card-hover)] active:scale-95 transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fluent-accent)]"
                  )}
                  aria-label={`Open settings for ${title}`}
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}

            {onClose && (
              <Tooltip content="Close widget" position="bottom" delay={200}>
                <button
                  type="button"
                  onClick={onClose}
                  className={cn(
                    "p-1 rounded-md text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-error)]",
                    "hover:bg-red-500/10 active:scale-95 transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
                  )}
                  aria-label={`Close ${title} widget`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </header>
  );
};
