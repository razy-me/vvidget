import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "acrylic" | "subtle" | "ghost" | "solid";
  interactive?: boolean;
  padded?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      className,
      variant = "acrylic",
      interactive = false,
      padded = true,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out",
          padded && "p-3.5",
          // Variants
          variant === "acrylic" &&
            "fluent-acrylic border border-[var(--fluent-stroke)] shadow-[var(--fluent-shadow-flyout)]",
          variant === "subtle" &&
            "bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke-subtle)]",
          variant === "ghost" &&
            "bg-transparent border border-transparent",
          variant === "solid" &&
            "bg-[var(--fluent-acrylic-bg)] border border-[var(--fluent-stroke)]",
          // Interactive hover/active styles
          interactive &&
            "cursor-pointer hover:bg-[var(--fluent-card-hover)] active:bg-[var(--fluent-card-active)] active:scale-[0.99]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
