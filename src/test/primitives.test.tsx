import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Card, ProgressBar, Badge, Tooltip } from "@/components/ui";

describe("Card Primitive", () => {
  it("renders children cleanly", () => {
    render(<Card><span>Card Content</span></Card>);
    expect(screen.getByText("Card Content")).toBeInTheDocument();
  });

  it("applies interactive styles when interactive prop is true", () => {
    const { container } = render(<Card interactive>Clickable</Card>);
    expect(container.firstChild).toHaveClass("cursor-pointer");
  });

  it("applies subtle variant classes", () => {
    const { container } = render(<Card variant="subtle">Subtle</Card>);
    expect(container.firstChild).toHaveClass("border-[var(--fluent-stroke-subtle)]");
  });
});

describe("ProgressBar Primitive", () => {
  it("renders with correct accessibility attributes", () => {
    render(<ProgressBar value={45} max={100} min={0} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "45");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps values exceeding max or below min", () => {
    const { rerender } = render(<ProgressBar value={150} max={100} min={0} />);
    let bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");

    rerender(<ProgressBar value={-20} max={100} min={0} />);
    bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  it("renders label when showLabel is true", () => {
    render(<ProgressBar value={75} showLabel />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});

describe("Badge Primitive", () => {
  it("renders text and variant styles", () => {
    render(<Badge variant="accent">Fluent Badge</Badge>);
    const badge = screen.getByText("Fluent Badge");
    expect(badge).toBeInTheDocument();
    expect(badge.parentElement).toHaveClass("text-[var(--fluent-accent)]");
  });

  it("renders with custom icon slot", () => {
    render(
      <Badge icon={<span data-testid="custom-icon">★</span>}>
        Starred
      </Badge>
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    expect(screen.getByText("Starred")).toBeInTheDocument();
  });
});

describe("Tooltip Primitive", () => {
  it("renders children and shows tooltip content on hover", () => {
    vi.useFakeTimers();

    render(
      <Tooltip content="Tooltip Hint" delay={100}>
        <button>Hover Me</button>
      </Tooltip>
    );

    const button = screen.getByText("Hover Me");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(button.parentElement!);
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent("Tooltip Hint");

    fireEvent.mouseLeave(button.parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
