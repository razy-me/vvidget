import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    expect(screen.queryByTestId("dock-child-content")).not.toBeInTheDocument();

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
    expect(screen.queryByTestId("dock-child-content")).not.toBeInTheDocument();
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
