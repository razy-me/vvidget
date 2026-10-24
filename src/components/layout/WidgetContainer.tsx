import type { FC } from "react";
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

  return (
    <div
      id={`widget-${id}`}
      data-widget-id={id}
      data-layout-mode={layoutMode}
      data-locked={isLocked}
      style={{
        minWidth: minWidth ? `${minWidth}px` : undefined,
        minHeight: minHeight ? `${minHeight}px` : undefined,
      }}
      className={cn(
        "relative flex flex-col transition-all duration-200 select-none",
        isDocked ? "w-full rounded-lg" : "w-auto rounded-xl",
        className
      )}
    >
      <Card
        variant="acrylic"
        padded={false}
        className={cn(
          "w-full h-full flex flex-col overflow-hidden",
          "border border-[var(--fluent-stroke)] backdrop-blur-xl",
          "shadow-lg",
          isDocked ? "rounded-lg" : "rounded-xl"
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
          />
        )}

        <div
          className={cn(
            "flex-1 p-3 flex flex-col overflow-auto text-[var(--fluent-text-primary)]",
            contentClassName
          )}
        >
          {children}
        </div>
      </Card>
    </div>
  );
};
