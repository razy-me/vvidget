import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppContent, App, ErrorBoundary } from "@/App";
import type { AppConfig } from "@/types/config";
import { DEFAULT_CONFIG } from "@/types/config";

let mockConfig: AppConfig = { ...DEFAULT_CONFIG };
const mockSetWidgetsLocked = vi.fn().mockImplementation(async (locked: boolean) => {
  mockConfig = { ...mockConfig, lock_positions: locked };
});
const mockSetLayoutMode = vi.fn().mockImplementation(async (mode: "independent" | "docked") => {
  mockConfig = { ...mockConfig, layout_mode: mode };
});
const mockSetTheme = vi.fn();

vi.mock("@/hooks/useConfig", () => ({
  useConfig: () => ({
    config: mockConfig,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(),
    setWidgetsLocked: mockSetWidgetsLocked,
    setLayoutMode: mockSetLayoutMode,
    setTheme: mockSetTheme,
    reloadConfig: vi.fn(),
  }),
}));

// Mock sub-views for isolated routing verification
vi.mock("@/pages/settings", () => ({
  SettingsModal: () => <div data-testid="settings-modal-view">Settings Modal</div>,
}));

vi.mock("@/components/docking", () => ({
  DockContainer: ({ onOpenSettings }: { onOpenSettings?: () => void }) => (
    <div data-testid="dock-container-view">
      Dock Container
      <button onClick={onOpenSettings}>Dock Settings</button>
    </div>
  ),
}));

vi.mock("@/widgets/resources/ResourceWidget", () => ({
  ResourceWidget: () => <div data-testid="resource-widget-view">Resources</div>,
}));

vi.mock("@/widgets/spotify/SpotifyWidget", () => ({
  SpotifyWidget: () => <div data-testid="spotify-widget-view">Spotify Content</div>,
}));

vi.mock("@/widgets/weather/WeatherWidget", () => ({
  WeatherWidget: () => <div data-testid="weather-widget-view">Weather Content</div>,
}));

describe("App & AppContent Routing", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    // Reset window.location
    delete (window as unknown as { location?: unknown }).location;
    window.location = {
      ...originalLocation,
      search: "",
    };
  });

  it("routes to SettingsModal when ?view=settings is in query string", () => {
    window.location.search = "?view=settings";
    render(<AppContent />);

    expect(screen.getByTestId("settings-modal-view")).toBeInTheDocument();
    expect(screen.queryByTestId("dock-container-view")).not.toBeInTheDocument();
  });

  it("routes to SettingsModal when ?widget=settings is in query string", () => {
    window.location.search = "?widget=settings";
    render(<AppContent />);

    expect(screen.getByTestId("settings-modal-view")).toBeInTheDocument();
  });

  it("routes to dedicated Resources widget window when ?widget=resources", () => {
    window.location.search = "?widget=resources";
    render(<AppContent />);

    expect(screen.getByText("System Resources")).toBeInTheDocument();
    expect(screen.getByTestId("resource-widget-view")).toBeInTheDocument();
    expect(screen.queryByTestId("dock-container-view")).not.toBeInTheDocument();

    // Verify interaction on WidgetContainer lock button
    const toggleBtn = screen.getByRole("button", { name: /Lock System Resources position/i });
    fireEvent.click(toggleBtn);
    expect(mockSetWidgetsLocked).toHaveBeenCalledWith(true);
  });

  it("routes to dedicated Spotify widget window when ?widget=spotify", () => {
    window.location.search = "?widget=spotify";
    render(<AppContent />);

    expect(screen.getByText("Media Controls")).toBeInTheDocument();
    expect(screen.getByTestId("spotify-widget-view")).toBeInTheDocument();
  });

  it("routes to dedicated Weather widget window when ?widget=weather", () => {
    window.location.search = "?widget=weather";
    render(<AppContent />);

    expect(screen.getByText("Weather Forecast")).toBeInTheDocument();
    expect(screen.getByTestId("weather-widget-view")).toBeInTheDocument();
  });

  it("renders DockContainer when layout_mode is 'docked'", () => {
    window.location.search = "";
    mockConfig.layout_mode = "docked";

    render(<AppContent />);
    expect(screen.getByTestId("dock-container-view")).toBeInTheDocument();
  });

  it("renders multi-widget desktop surface when layout_mode is 'independent'", () => {
    window.location.search = "";
    mockConfig.layout_mode = "independent";

    render(<AppContent />);

    expect(screen.getByText("Widgetz Desktop Surface")).toBeInTheDocument();
    expect(screen.getByTestId("resource-widget-view")).toBeInTheDocument();
    expect(screen.getByText("Media Controls")).toBeInTheDocument();
    expect(screen.getByText("Weather Forecast")).toBeInTheDocument();

    // Toggle lock button in header
    const lockBtn = screen.getByText("Unlocked");
    fireEvent.click(lockBtn);
    expect(mockSetWidgetsLocked).toHaveBeenCalledWith(true);

    // Switch to dock button
    const switchBtn = screen.getByText("Switch to Dock");
    fireEvent.click(switchBtn);
    expect(mockSetLayoutMode).toHaveBeenCalledWith("docked");
  });

  it("respects widget visibility toggles in independent mode", () => {
    window.location.search = "";
    mockConfig.layout_mode = "independent";
    mockConfig.widgets.resources.visible = false;
    mockConfig.widgets.spotify.visible = false;
    mockConfig.widgets.weather.visible = true;

    render(<AppContent />);

    expect(screen.queryByTestId("resource-widget-view")).not.toBeInTheDocument();
    expect(screen.queryByText("Media Controls")).not.toBeInTheDocument();
    expect(screen.getByText("Weather Forecast")).toBeInTheDocument();
  });

  it("renders the root App component with ThemeProvider wrapper", () => {
    window.location.search = "";
    mockConfig.layout_mode = "independent";

    render(<App />);
    expect(screen.getByText("Widgetz Desktop Surface")).toBeInTheDocument();
  });

  it("catches errors with ErrorBoundary and displays recovery UI", () => {
    const ProblemChild = () => {
      throw new Error("Simulated widget crash");
    };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Simulated widget crash")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload Widget/i })).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
