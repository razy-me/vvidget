import { useState, type FC } from "react";
import { Card } from "@/components/ui/Card";
import { HeaderBar } from "./HeaderBar";
import { cn } from "@/utils/cn";
import type { WidgetContainerProps } from "@/types/window";

export const WidgetContainer: FC<WidgetContainerProps> = ({
  id,
  title,
  icon,
  isLocked = false,
  onToggleLock,
  onClose,
  onOpenSettings,
  className,
  contentClassName,
  children,
  showHeader = true,
  layoutMode = "independent",
  minWidth,
  minHeight,
}) => {
  const isDocked = layoutMode === "docked";
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      id={`widget-${id}`}
      data-widget-id={id}
      data-layout-mode={layoutMode}
      data-locked={isLocked}
      data-dragging={isDragging}
      style={{
        minWidth: minWidth ? `${minWidth}px` : undefined,
        minHeight: minHeight ? `${minHeight}px` : undefined,
      }}
      className={cn(
        "group relative flex flex-col transition-transform duration-200 select-none",
        isDocked ? "w-full rounded-lg" : "w-full h-full rounded-2xl",
        isDragging && "scale-[1.01]",
        className
      )}
    >
      <Card
        variant="acrylic"
        padded={false}
        className={cn(
          "w-full h-full flex flex-col relative overflow-hidden transition-[border-color,box-shadow,ring-color] duration-150",
          isDragging
            ? "border-[var(--fluent-accent)]/60 shadow-[0_20px_40px_rgba(0,0,0,0.5)] ring-1 ring-[var(--fluent-accent)]/40"
            : "border border-[var(--fluent-stroke)] shadow-2xl",
          isDocked ? "rounded-lg" : "rounded-2xl"
        )}
      >
        {showHeader && (
          <HeaderBar
            title={title}
            icon={icon}
            isLocked={isLocked}
            onToggleLock={onToggleLock}
            onClose={onClose}
            onOpenSettings={onOpenSettings}
            widgetId={id}
            layoutMode={layoutMode}
            onDragStateChange={setIsDragging}
          />
        )}

        <div
          className={cn(
            "flex-1 p-3 flex flex-col overflow-auto text-[var(--fluent-text-primary)] min-h-0",
            contentClassName
          )}
        >
          {children}
        </div>
      </Card>
    </div>
  );
};
