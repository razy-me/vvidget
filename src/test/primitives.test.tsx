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

  it("handles min === max without division by zero NaN", () => {
    render(<ProgressBar value={50} max={50} min={50} showLabel />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("handles non-finite values (NaN/Infinity) safely without displaying NaN% (M4-08)", () => {
    const { rerender } = render(<ProgressBar value={NaN} showLabel />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();

    rerender(<ProgressBar value={Infinity} max={100} min={0} showLabel />);
    const infBar = screen.getByRole("progressbar");
    expect(infBar).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0%")).toBeInTheDocument();
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

  it("cleans up timeout on unmount without throwing", () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <Tooltip content="Tooltip Hint" delay={200}>
        <button>Hover</button>
      </Tooltip>
    );
    fireEvent.mouseEnter(screen.getByText("Hover").parentElement!);
    expect(() => unmount()).not.toThrow();
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
  });

  it("resets timer on rapid consecutive show triggers without timer leaks", () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Rapid Hint" delay={200}>
        <button>Button</button>
      </Tooltip>
    );
    const container = screen.getByText("Button").parentElement!;

    // Trigger rapid mouseEnter followed by focus
    fireEvent.mouseEnter(container);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.focus(container);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    // At t=250ms, first timer was cancelled at t=100ms and second timer was scheduled for t=300ms
    // So at t=250ms tooltip should not yet be visible
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60);
    });
    // At t=310ms, second timer has completed
    expect(screen.getByRole("tooltip")).toHaveTextContent("Rapid Hint");

    vi.useRealTimers();
  });

  it("supports containerClassName to allow full-width flex expansion", () => {
    const { container } = render(
      <Tooltip content="Full width" containerClassName="w-full flex justify-between">
        <div className="w-full flex justify-between">
          <span>Label</span>
          <span>Value</span>
        </div>
      </Tooltip>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("w-full", "flex", "justify-between");
  });

  it("does not render tooltip container when content is empty or null (M4-07)", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <Tooltip content="" delay={100}>
        <button>Empty Content</button>
      </Tooltip>
    );

    const button = screen.getByText("Empty Content");
    fireEvent.mouseEnter(button.parentElement!);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    rerender(
      <Tooltip content={null} delay={100}>
        <button>Empty Content</button>
      </Tooltip>
    );
    fireEvent.mouseEnter(button.parentElement!);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    vi.useRealTimers();
  });
});
