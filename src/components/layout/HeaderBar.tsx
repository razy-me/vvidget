import type { FC } from "react";
import { GripHorizontal, Lock, Unlock, Settings, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/utils/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import type { HeaderBarProps } from "@/types/window";
import { useGridDrag } from "@/hooks/useGridDrag";

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
  widgetId,
  layoutMode = "independent",
  onDragStateChange,
}) => {
  const isDocked = layoutMode === "docked";

  // Dedicated grid drag hook for independent desktop widgets (strictly snaps to native desktop icon grid)
  const { isDragging: isGridDragging, dragProps } = useGridDrag({
    widgetId,
    isLocked: isLocked || isDocked,
    onDragStateChange,
  });

  // Native drag handler: triggers OS-level modal window dragging via Tauri / Win32
  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (isLocked) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [data-no-drag]")) {
      return;
    }
    try {
      void getCurrentWindow().startDragging();
    } catch {
      // Graceful fallback in non-Tauri browser test environments
    }
  };

  const dragHandlers = !isLocked
    ? isDocked
      ? { "data-tauri-drag-region": true, onMouseDown: handleDragMouseDown }
      : { ...dragProps }
    : {};

  return (
    <header
      {...dragHandlers}
      className={cn(
        "relative w-full flex-shrink-0 flex items-center justify-between px-3 py-1.5 select-none border-b",
        isGridDragging
          ? "border-b-[var(--fluent-accent)]/50 bg-[var(--fluent-card-subtle)] shadow-inner"
          : "border-b-[var(--fluent-stroke)]/40 bg-[var(--fluent-card-bg)]/30 backdrop-blur-sm",
        "transition-all duration-150 touch-none",
        !isLocked
          ? isGridDragging
            ? "cursor-grabbing"
            : "cursor-grab active:cursor-grabbing"
          : "cursor-default",
        !isDocked ? "rounded-t-2xl" : "rounded-t-lg",
        className
      )}
      aria-label={`${title} widget header`}
    >
      {/* Title & Icon Area */}
      <div className="flex items-center gap-2 min-w-0" {...(isDocked && !isLocked ? { "data-tauri-drag-region": true } : {})}>
        {!isLocked && (
          <Tooltip content="Drag to move widget" position="bottom" delay={300}>
            <span
              className="text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-text-secondary)] transition-colors pointer-events-none"
              aria-hidden="true"
              data-tauri-drag-region={isDocked && !isLocked ? true : undefined}
            >
              <GripHorizontal className="w-3.5 h-3.5 pointer-events-none" />
            </span>
          </Tooltip>
        )}
        {icon && (
          <span
            className="flex-shrink-0 text-[var(--fluent-accent)] flex items-center justify-center pointer-events-none"
            aria-hidden="true"
            data-tauri-drag-region={isDocked && !isLocked ? true : undefined}
          >
            {icon}
          </span>
        )}
        <h2
          className="text-xs font-semibold text-[var(--fluent-text-primary)] truncate tracking-wide pointer-events-none"
          data-tauri-drag-region={isDocked && !isLocked ? true : undefined}
        >
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
