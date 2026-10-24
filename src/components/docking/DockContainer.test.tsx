import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DockContainer } from "./DockContainer";
import { ThemeProvider } from "@/theme";
import type { AppConfig, LayoutMode } from "@/types/config";
import { DEFAULT_CONFIG } from "@/types/config";

// Mock useConfig
let mockConfig: AppConfig = { ...DEFAULT_CONFIG };
const mockSetWidgetsLocked = vi.fn().mockImplementation(async (locked: boolean) => {
  mockConfig = { ...mockConfig, lock_positions: locked };
});
const mockSetLayoutMode = vi.fn().mockImplementation(async (mode: LayoutMode) => {
  mockConfig = { ...mockConfig, layout_mode: mode };
});
const mockUpdateWidgetPlacement = vi.fn().mockImplementation(
  (id: string, placement: Partial<AppConfig["widgets"][string]>) => {
    mockConfig = {
      ...mockConfig,
      widgets: {
        ...mockConfig.widgets,
        [id]: { ...mockConfig.widgets[id], ...placement },
      },
    };
  }
);

vi.mock("@/hooks/useConfig", () => ({
  useConfig: () => ({
    config: mockConfig,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(),
    setWidgetsLocked: mockSetWidgetsLocked,
    setLayoutMode: mockSetLayoutMode,
    updateWidgetPlacement: mockUpdateWidgetPlacement,
    setTheme: vi.fn(),
    setAutostart: vi.fn(),
    reloadConfig: vi.fn(),
  }),
}));

// Mock widgets to isolate docking container logic
vi.mock("@/widgets/resources/ResourceWidget", () => ({
  ResourceWidget: () => <div data-testid="mock-resource-widget">Resources</div>,
}));
vi.mock("@/widgets/spotify/SpotifyWidget", () => ({
  SpotifyWidget: () => <div data-testid="mock-spotify-widget">Spotify</div>,
}));
vi.mock("@/widgets/weather/WeatherWidget", () => ({
  WeatherWidget: () => <div data-testid="mock-weather-widget">Weather</div>,
}));

describe("DockContainer Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  });

  it("renders dock container with header and active widgets count", () => {
    render(
      <ThemeProvider>
        <DockContainer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("dock-container")).toBeInTheDocument();
    expect(screen.getByText("Widgetz Dock")).toBeInTheDocument();
    expect(screen.getByText("3 Active")).toBeInTheDocument();
    expect(screen.getByTestId("mock-resource-widget")).toBeInTheDocument();
    expect(screen.getByTestId("mock-spotify-widget")).toBeInTheDocument();
    expect(screen.getByTestId("mock-weather-widget")).toBeInTheDocument();
  });

  it("toggles lock positions when lock button is clicked", () => {
    render(
      <ThemeProvider>
        <DockContainer />
      </ThemeProvider>
    );

    const lockBtn = screen.getByRole("button", { name: /lock dock position/i });
    fireEvent.click(lockBtn);
    expect(mockSetWidgetsLocked).toHaveBeenCalledWith(true);
  });

  it("switches to independent mode when layout mode button is clicked", () => {
    render(
      <ThemeProvider>
        <DockContainer />
      </ThemeProvider>
    );

    const switchBtn = screen.getByRole("button", { name: /switch to independent windows mode/i });
    fireEvent.click(switchBtn);
    expect(mockSetLayoutMode).toHaveBeenCalledWith("independent");
  });

  it("collapses and expands individual dock item", () => {
    render(
      <ThemeProvider>
        <DockContainer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("dock-item-content-resources")).toBeInTheDocument();
    const collapseBtn = screen.getByRole("button", { name: /collapse system resources content/i });
    fireEvent.click(collapseBtn);

    expect(screen.queryByTestId("dock-item-content-resources")).not.toBeInTheDocument();

    const expandBtn = screen.getByRole("button", { name: /expand system resources content/i });
    fireEvent.click(expandBtn);
    expect(screen.getByTestId("dock-item-content-resources")).toBeInTheDocument();
  });

  it("collapses and expands all widgets when toolbar toggle button is clicked", () => {
    render(
      <ThemeProvider>
        <DockContainer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("dock-item-content-resources")).toBeInTheDocument();
    expect(screen.getByTestId("dock-item-content-spotify")).toBeInTheDocument();
    expect(screen.getByTestId("dock-item-content-weather")).toBeInTheDocument();

    const collapseAllBtn = screen.getByRole("button", { name: /collapse all widgets/i });
    fireEvent.click(collapseAllBtn);

    expect(screen.queryByTestId("dock-item-content-resources")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dock-item-content-spotify")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dock-item-content-weather")).not.toBeInTheDocument();

    const expandAllBtn = screen.getByRole("button", { name: /expand all widgets/i });
    fireEvent.click(expandAllBtn);

    expect(screen.getByTestId("dock-item-content-resources")).toBeInTheDocument();
    expect(screen.getByTestId("dock-item-content-spotify")).toBeInTheDocument();
    expect(screen.getByTestId("dock-item-content-weather")).toBeInTheDocument();
  });

  it("hides widget from dock when hide button is clicked", () => {
    render(
      <ThemeProvider>
        <DockContainer />
      </ThemeProvider>
    );

    const hideBtn = screen.getByRole("button", { name: /hide system resources/i });
    fireEvent.click(hideBtn);

    expect(mockUpdateWidgetPlacement).toHaveBeenCalledWith("resources", { visible: false });
  });

  it("renders empty state when all widgets are hidden", () => {
    mockConfig = {
      ...DEFAULT_CONFIG,
      widgets: {
        resources: { ...DEFAULT_CONFIG.widgets.resources, visible: false },
        spotify: { ...DEFAULT_CONFIG.widgets.spotify, visible: false },
        weather: { ...DEFAULT_CONFIG.widgets.weather, visible: false },
      },
    };

    render(
      <ThemeProvider>
        <DockContainer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("dock-empty-state")).toBeInTheDocument();
    expect(screen.getByText("All widgets are hidden")).toBeInTheDocument();
  });

  it("opens settings when settings button is clicked", () => {
    const onOpenSettings = vi.fn();
    render(
      <ThemeProvider>
        <DockContainer onOpenSettings={onOpenSettings} />
      </ThemeProvider>
    );

    const settingsBtn = screen.getByRole("button", { name: /open settings/i });
    fireEvent.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
