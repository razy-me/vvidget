import { useState, useRef, useEffect } from "react";
import type { FC, ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
  containerClassName?: string;
}

export const Tooltip: FC<TooltipProps> = ({
  content,
  children,
  position = "top",
  delay = 200,
  className,
  containerClassName,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }[position];

  return (
    <div
      className={cn("relative inline-flex items-center", containerClassName)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && Boolean(content) && (
        <div
          role="tooltip"
          className={cn(
            "absolute z-50 px-2.5 py-1 text-xs rounded-md pointer-events-none whitespace-nowrap",
            "bg-[var(--fluent-acrylic-bg)] text-[var(--fluent-text-primary)] border border-[var(--fluent-stroke)]",
            "shadow-[var(--fluent-shadow-flyout)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-100",
            positionClasses,
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
};
