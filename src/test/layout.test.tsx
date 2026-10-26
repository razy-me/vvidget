import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { HeaderBar, WidgetContainer } from "@/components/layout";

describe("HeaderBar Component", () => {
  it("renders title and default controls", () => {
    render(<HeaderBar title="Weather" />);
    expect(screen.getByText("Weather")).toBeInTheDocument();
  });

  it("sets data-tauri-drag-region when not locked in docked mode", () => {
    const { container } = render(<HeaderBar title="Spotify" isLocked={false} layoutMode="docked" />);
    const header = container.querySelector("header");
    expect(header).toHaveAttribute("data-tauri-drag-region", "true");
  });

  it("removes data-tauri-drag-region when locked", () => {
    const { container } = render(<HeaderBar title="Spotify" isLocked={true} layoutMode="docked" />);
    const header = container.querySelector("header");
    expect(header).not.toHaveAttribute("data-tauri-drag-region");
  });

  it("uses grid-based pointer dragging in independent mode without native free-float drag region", () => {
    const { container } = render(<HeaderBar title="Spotify" isLocked={false} layoutMode="independent" widgetId="spotify" />);
    const header = container.querySelector("header");
    expect(header).not.toHaveAttribute("data-tauri-drag-region");
    expect(header).toHaveClass("cursor-grab");
  });

  it("fires onToggleLock when lock button is clicked", () => {
    const handleToggle = vi.fn();
    render(<HeaderBar title="Resources" isLocked={false} onToggleLock={handleToggle} />);
    const button = screen.getByLabelText("Lock Resources position");
    fireEvent.click(button);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("fires onOpenSettings when settings button is clicked", () => {
    const handleSettings = vi.fn();
    render(<HeaderBar title="Weather" onOpenSettings={handleSettings} />);
    const button = screen.getByLabelText("Open settings for Weather");
    fireEvent.click(button);
    expect(handleSettings).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(<HeaderBar title="Weather" onClose={handleClose} />);
    const button = screen.getByLabelText("Close Weather widget");
    fireEvent.click(button);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe("WidgetContainer Component", () => {
  it("renders widget children and header", () => {
    render(
      <WidgetContainer id="test-widget" title="Test Widget">
        <div>Widget Content Inside</div>
      </WidgetContainer>
    );
    expect(screen.getByText("Test Widget")).toBeInTheDocument();
    expect(screen.getByText("Widget Content Inside")).toBeInTheDocument();
  });

  it("supports hiding header when showHeader is false", () => {
    render(
      <WidgetContainer id="test-widget" title="Test Widget" showHeader={false}>
        <div>Only Content</div>
      </WidgetContainer>
    );
    expect(screen.queryByText("Test Widget")).not.toBeInTheDocument();
    expect(screen.getByText("Only Content")).toBeInTheDocument();
  });

  it("applies layoutMode classes for docked vs independent", () => {
    const { rerender, container } = render(
      <WidgetContainer id="test-dock" title="Dock" layoutMode="independent">
        <span>Body</span>
      </WidgetContainer>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute("data-layout-mode", "independent");

    rerender(
      <WidgetContainer id="test-dock" title="Dock" layoutMode="docked">
        <span>Body</span>
      </WidgetContainer>
    );
    expect(wrapper).toHaveAttribute("data-layout-mode", "docked");
  });

  it("applies custom minWidth and minHeight styles", () => {
    const { container } = render(
      <WidgetContainer id="sized-widget" title="Sized" minWidth={320} minHeight={200}>
        <span>Sized Content</span>
      </WidgetContainer>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.minWidth).toBe("320px");
    expect(wrapper.style.minHeight).toBe("200px");
  });

  it("activates visual elevation feedback on pointer drag interaction", async () => {
    const { container } = render(
      <WidgetContainer id="drag-widget" title="Draggable Widget" layoutMode="independent">
        <span>Content</span>
      </WidgetContainer>
    );
    const header = container.querySelector("header");
    expect(header).toBeInTheDocument();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute("data-dragging", "false");

    // Initiate pointer down on header
    await act(async () => {
      fireEvent.pointerDown(header!, { button: 0, screenX: 100, screenY: 100, pointerId: 1 });
    });
    expect(wrapper).toHaveAttribute("data-dragging", "true");
    expect(header).toHaveClass("cursor-grabbing");

    // Release pointer
    await act(async () => {
      fireEvent.pointerUp(header!, { pointerId: 1 });
    });
    expect(wrapper).toHaveAttribute("data-dragging", "false");
    expect(header).toHaveClass("cursor-grab");
  });

  it("applies floating hover-only styling in independent mode", () => {
    const { container } = render(
      <WidgetContainer id="hover-widget" title="Hover Widget" layoutMode="independent">
        <span>Content</span>
      </WidgetContainer>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("group", "relative");

    const header = container.querySelector("header");
    expect(header).toHaveClass("absolute", "opacity-0", "group-hover:opacity-100");
  });
});
