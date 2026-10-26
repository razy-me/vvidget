import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DockContainer } from "@/components/docking/DockContainer";
import { DockItem } from "@/components/docking/DockItem";
import { ThemeProvider } from "@/theme";
import type { AppConfig } from "@/types/config";
import { DEFAULT_CONFIG } from "@/types/config";

let mockConfig: AppConfig = { ...DEFAULT_CONFIG };

vi.mock("@/hooks/useConfig", () => ({
  useConfig: () => ({
    config: mockConfig,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(),
    setWidgetsLocked: vi.fn(),
    setLayoutMode: vi.fn(),
    updateWidgetPlacement: vi.fn(),
    setTheme: vi.fn(),
    setAutostart: vi.fn(),
    reloadConfig: vi.fn(),
  }),
}));

describe("DockItem Component (R1, R7)", () => {
  it("renders header with title, collapse button and hide button", () => {
    const handleHide = vi.fn();

    render(
      <DockItem
        id="resources"
        title="System Resources"
        defaultCollapsed={false}
        onHide={handleHide}
      >
        <div data-testid="dock-child-content">Child Widget Content</div>
      </DockItem>
    );

    expect(screen.getByText("System Resources")).toBeInTheDocument();
    expect(screen.getByTestId("dock-child-content")).toBeInTheDocument();

    // Toggle collapse
    const collapseBtn = screen.getByLabelText("Collapse System Resources content");
    fireEvent.click(collapseBtn);
    expect(screen.getByTestId("dock-item-content-resources")).toHaveClass("hidden");
    // M4-04: Children remain in the DOM to preserve active state and avoid layout snaps
    expect(screen.getByTestId("dock-child-content")).toBeInTheDocument();

    // Hide item
    const hideBtn = screen.getByLabelText("Hide System Resources");
    fireEvent.click(hideBtn);
    expect(handleHide).toHaveBeenCalledTimes(1);
  });

  it("hides body when defaultCollapsed is true", () => {
    render(
      <DockItem
        id="spotify"
        title="Spotify"
        defaultCollapsed={true}
      >
        <div data-testid="dock-child-content">Child Widget Content</div>
      </DockItem>
    );

    expect(screen.getByText("Spotify")).toBeInTheDocument();
    expect(screen.getByTestId("dock-item-content-spotify")).toHaveClass("hidden");
    expect(screen.getByTestId("dock-child-content")).toBeInTheDocument();
  });

  it("regression M4-04: preserves child component state across collapse and expand cycles", () => {
    function StatefulChild() {
      const [count, setCount] = useState(0);
      return (
        <div>
          <span data-testid="counter-val">{count}</span>
          <button onClick={() => setCount((c) => c + 1)}>Increment</button>
        </div>
      );
    }

    render(
      <DockItem id="counter-test" title="Counter Test" defaultCollapsed={false}>
        <StatefulChild />
      </DockItem>
    );

    // Initial count is 0
    expect(screen.getByTestId("counter-val")).toHaveTextContent("0");

    // Increment count to 3
    fireEvent.click(screen.getByText("Increment"));
    fireEvent.click(screen.getByText("Increment"));
    fireEvent.click(screen.getByText("Increment"));
    expect(screen.getByTestId("counter-val")).toHaveTextContent("3");

    // Collapse the dock item
    const collapseBtn = screen.getByLabelText("Collapse Counter Test content");
    fireEvent.click(collapseBtn);
    expect(screen.getByTestId("dock-item-content-counter-test")).toHaveClass("hidden");

    // Re-expand the dock item
    const expandBtn = screen.getByLabelText("Expand Counter Test content");
    fireEvent.click(expandBtn);
    expect(screen.getByTestId("dock-item-content-counter-test")).not.toHaveClass("hidden");

    // State MUST be preserved (3, not reset to 0!)
    expect(screen.getByTestId("counter-val")).toHaveTextContent("3");
  });

  it("regression M4-05: tooltips on dock header buttons use bottom position to avoid card clipping", () => {
    vi.useFakeTimers();
    const handleHide = vi.fn();
    const { container } = render(
      <DockItem id="tooltip-test" title="Tooltip Test" onHide={handleHide}>
        <div>Body</div>
      </DockItem>
    );

    // Hover over hide button container
    const hideBtn = screen.getByLabelText("Hide Tooltip Test");
    fireEvent.mouseEnter(hideBtn.parentElement!);
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // Tooltip should be positioned below (top-full / bottom position)
    const tooltip = container.querySelector("[role='tooltip']");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveClass("top-full");

    vi.useRealTimers();
  });
});

describe("DockContainer Edge Cases (R1, R7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  });

  it("shows empty state when all widgets are toggled off", () => {
    mockConfig.widgets.resources.visible = false;
    mockConfig.widgets.spotify.visible = false;
    mockConfig.widgets.weather.visible = false;

    render(
      <ThemeProvider>
        <DockContainer />
      </ThemeProvider>
    );

    expect(screen.getByText("0 Active")).toBeInTheDocument();
    expect(screen.getByText("All widgets are hidden")).toBeInTheDocument();
    expect(
      screen.getByText("Enable widgets in Settings or right-click the System Tray icon.")
    ).toBeInTheDocument();
  });
});
