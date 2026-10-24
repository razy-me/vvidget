import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "accent" | "success" | "warning" | "error" | "outline";
  size?: "sm" | "md";
  icon?: ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      children,
      variant = "default",
      size = "sm",
      icon,
      className,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "px-2 py-0.5 text-[11px] gap-1",
      md: "px-2.5 py-1 text-xs gap-1.5",
    }[size];

    const variantClasses = {
      default:
        "bg-[var(--fluent-card-bg)] text-[var(--fluent-text-secondary)] border border-[var(--fluent-stroke)]",
      accent:
        "bg-[var(--fluent-accent-subtle)] text-[var(--fluent-accent)] border border-[var(--fluent-accent)]/20 font-medium",
      success:
        "bg-[var(--fluent-success)]/15 text-[var(--fluent-success)] border border-[var(--fluent-success)]/20 font-medium",
      warning:
        "bg-[var(--fluent-warning)]/15 text-[var(--fluent-warning)] border border-[var(--fluent-warning)]/20 font-medium",
      error:
        "bg-[var(--fluent-error)]/15 text-[var(--fluent-error)] border border-[var(--fluent-error)]/20 font-medium",
      outline:
        "bg-transparent text-[var(--fluent-text-secondary)] border border-[var(--fluent-stroke)]",
    }[variant];

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-normal rounded-full transition-colors leading-none",
          sizeClasses,
          variantClasses,
          className
        )}
        {...props}
      >
        {icon && <span className="shrink-0 flex items-center justify-center">{icon}</span>}
        <span>{children}</span>
      </span>
    );
  }
);

Badge.displayName = "Badge";
