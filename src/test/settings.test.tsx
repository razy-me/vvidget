import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WidgetToggleList } from "@/pages/settings/WidgetToggleList";
import { SettingsModal } from "@/pages/settings/SettingsModal";
import { DEFAULT_CONFIG, type AppConfig } from "@/types/config";

describe("WidgetToggleList component", () => {
  it("renders all registered widgets with category badges", () => {
    const handleToggle = vi.fn();
    const handleReset = vi.fn();

    render(
      <WidgetToggleList
        config={DEFAULT_CONFIG}
        onToggleVisibility={handleToggle}
        onResetWidgetPlacement={handleReset}
      />,
    );

    expect(screen.getByText("System Resources")).toBeInTheDocument();
    expect(screen.getByText("Media Controls")).toBeInTheDocument();
    expect(screen.getByText("Weather Forecast")).toBeInTheDocument();
    expect(screen.getByText("Internet Speedtest")).toBeInTheDocument();
    expect(screen.getByText("Game & App Launcher")).toBeInTheDocument();
    expect(screen.getByText("Quick Settings")).toBeInTheDocument();
    expect(screen.getByText("Calendar & Notes")).toBeInTheDocument();
    expect(screen.getByText("Clock & Timers")).toBeInTheDocument();
    expect(screen.getByText("Bluetooth Devices")).toBeInTheDocument();
    expect(screen.getByText("Battery & Power")).toBeInTheDocument();

    // Verify category badges
    expect(screen.getAllByText("system").length).toBeGreaterThan(0);
    expect(screen.getAllByText("utility").length).toBeGreaterThan(0);
    expect(screen.getAllByText("media").length).toBeGreaterThan(0);
  });

  it("calls onToggleVisibility when checkbox is clicked", () => {
    const handleToggle = vi.fn();
    const handleReset = vi.fn();

    render(
      <WidgetToggleList
        config={DEFAULT_CONFIG}
        onToggleVisibility={handleToggle}
        onResetWidgetPlacement={handleReset}
      />,
    );

    const toggle = screen.getByLabelText("Toggle visibility of System Resources");
    fireEvent.click(toggle);

    expect(handleToggle).toHaveBeenCalledWith("resources", false);
  });

  it("allows toggling all 10 widgets", () => {
    const handleToggle = vi.fn();
    const handleReset = vi.fn();

    render(
      <WidgetToggleList
        config={DEFAULT_CONFIG}
        onToggleVisibility={handleToggle}
        onResetWidgetPlacement={handleReset}
      />,
    );

    const widgetIds = [
      { id: "resources", label: "Toggle visibility of System Resources" },
      { id: "spotify", label: "Toggle visibility of Media Controls" },
      { id: "weather", label: "Toggle visibility of Weather Forecast" },
      { id: "speedtest", label: "Toggle visibility of Internet Speedtest" },
      { id: "launcher", label: "Toggle visibility of Game & App Launcher" },
      { id: "quick_settings", label: "Toggle visibility of Quick Settings" },
      { id: "calendar", label: "Toggle visibility of Calendar & Notes" },
      { id: "clock", label: "Toggle visibility of Clock & Timers" },
      { id: "bluetooth", label: "Toggle visibility of Bluetooth Devices" },
      { id: "battery", label: "Toggle visibility of Battery & Power" },
    ];

    widgetIds.forEach(({ id, label }) => {
      const toggle = screen.getByLabelText(label);
      fireEvent.click(toggle);
      expect(handleToggle).toHaveBeenCalledWith(id, expect.any(Boolean));
    });
  });

  it("calls clone button on quick_settings to duplicate widget", () => {
    const handleToggle = vi.fn();
    const handleReset = vi.fn();
    const handleDuplicate = vi.fn();

    render(
      <WidgetToggleList
        config={DEFAULT_CONFIG}
        onToggleVisibility={handleToggle}
        onResetWidgetPlacement={handleReset}
        onDuplicateQuickSettings={handleDuplicate}
      />,
    );

    const cloneBtn = screen.getByTestId("clone-quick-settings-btn");
    expect(cloneBtn).toBeInTheDocument();
    fireEvent.click(cloneBtn);

    expect(handleDuplicate).toHaveBeenCalledWith("quick_settings");
  });

  it("lists multiple quick_settings instances with delete/remove button", () => {
    const handleToggle = vi.fn();
    const handleReset = vi.fn();
    const handleRemove = vi.fn();

    const configWithMultipleInstances: AppConfig = {
      ...DEFAULT_CONFIG,
      widgets: {
        ...DEFAULT_CONFIG.widgets,
        quick_settings: {
          id: "quick_settings",
          visible: true,
          logical_x: 120,
          logical_y: 128,
          logical_width: 360,
          logical_height: 256,
          scale_factor: 1,
          monitor_id: null,
        },
        quick_settings_second: {
          id: "quick_settings_second",
          visible: true,
          logical_x: 160,
          logical_y: 168,
          logical_width: 360,
          logical_height: 256,
          scale_factor: 1,
          monitor_id: null,
        },
      },
      quick_settings_instances: {
        quick_settings: {
          id: "quick_settings",
          title: "Primary Quick Settings",
          pinned_actions: ["sound", "bluetooth"],
        },
        quick_settings_second: {
          id: "quick_settings_second",
          title: "Second Quick Settings",
          pinned_actions: ["display", "taskmanager"],
        },
      },
    };

    render(
      <WidgetToggleList
        config={configWithMultipleInstances}
        onToggleVisibility={handleToggle}
        onResetWidgetPlacement={handleReset}
        onRemoveWidgetInstance={handleRemove}
      />,
    );

    expect(screen.getByTestId("quick-settings-instances-list")).toBeInTheDocument();
    expect(screen.getByText("Primary Quick Settings")).toBeInTheDocument();
    expect(screen.getByText("Second Quick Settings")).toBeInTheDocument();

    const removeBtn = screen.getByTestId("remove-instance-quick_settings_second");
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);

    expect(handleRemove).toHaveBeenCalledWith("quick_settings_second");
  });

  it("calls onResetWidgetPlacement when reset button is clicked", () => {
    const handleToggle = vi.fn();
    const handleReset = vi.fn();

    render(
      <WidgetToggleList
        config={DEFAULT_CONFIG}
        onToggleVisibility={handleToggle}
        onResetWidgetPlacement={handleReset}
      />,
    );

    const resetBtn = screen.getByLabelText("Reset System Resources bounds");
    fireEvent.click(resetBtn);

    expect(handleReset).toHaveBeenCalledWith("resources");
  });
});

describe("SettingsModal component", () => {
  it("renders settings navigation tabs", async () => {
    render(<SettingsModal />);

    await waitFor(() => {
      expect(screen.getByText("General")).toBeInTheDocument();
      expect(screen.getByText("Widgets")).toBeInTheDocument();
      expect(screen.getByText("Weather")).toBeInTheDocument();
      expect(screen.getByText("Resources")).toBeInTheDocument();
      expect(screen.getByText("About")).toBeInTheDocument();
    });
  });

  it("navigates across tabs correctly", async () => {
    render(<SettingsModal />);

    // General tab is active initially
    await waitFor(() => {
      expect(screen.getByTestId("tab-general")).toBeInTheDocument();
    });

    // Switch to Weather tab
    fireEvent.click(screen.getByText("Weather"));
    await waitFor(() => {
      expect(screen.getByTestId("tab-weather")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Berlin, New York, Tokyo/i)).toBeInTheDocument();
    });

    // Switch to Resources tab
    fireEvent.click(screen.getByText("Resources"));
    await waitFor(() => {
      expect(screen.getByTestId("tab-resources")).toBeInTheDocument();
    });

    // Switch to About tab
    fireEvent.click(screen.getByText("About"));
    await waitFor(() => {
      expect(screen.getByTestId("tab-about")).toBeInTheDocument();
      expect(screen.getByText("Open Logs Folder")).toBeInTheDocument();
    });
  });

  it("allows typing and submitting city search", async () => {
    render(<SettingsModal />);

    await waitFor(() => {
      expect(screen.getByText("Weather")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Weather"));

    await waitFor(() => {
      expect(screen.getByTestId("city-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("city-input");
    fireEvent.change(input, { target: { value: "Munich" } });
    expect((input as HTMLInputElement).value).toBe("Munich");

    const submitBtn = screen.getByTestId("city-submit-btn");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Munich")).toBeInTheDocument();
    });
  });

  it("updates slider local value and commits on pointer up", async () => {
    render(<SettingsModal />);

    await waitFor(() => {
      expect(screen.getByText("Weather")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Weather"));

    await waitFor(() => {
      expect(screen.getByLabelText("Forecast Query Interval")).toBeInTheDocument();
    });

    const slider = screen.getByLabelText("Forecast Query Interval");
    fireEvent.change(slider, { target: { value: "45" } });
    expect(screen.getByText("45 minutes")).toBeInTheDocument();

    fireEvent.pointerUp(slider);
    expect(screen.getByText("45 minutes")).toBeInTheDocument();
  });

  it("clears coordinates and updates manual city on submit", async () => {
    render(<SettingsModal />);

    await waitFor(() => {
      expect(screen.getByText("Weather")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Weather"));

    await waitFor(() => {
      expect(screen.getByTestId("city-input")).toBeInTheDocument();
    });

    const input = screen.getByTestId("city-input");
    fireEvent.change(input, { target: { value: "Tokyo" } });
    fireEvent.click(screen.getByTestId("city-submit-btn"));

    await waitFor(() => {
      expect(screen.getByText("Tokyo")).toBeInTheDocument();
    });
  });

  it("regression M6-02: updates polling rate sliders with immediate persistence and valueAsNumber", async () => {
    render(<SettingsModal />);

    await waitFor(() => {
      expect(screen.getByText("Resources")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Resources"));

    await waitFor(() => {
      expect(screen.getByLabelText("CPU & RAM Refresh Interval")).toBeInTheDocument();
      expect(screen.getByLabelText("Disk Refresh Interval")).toBeInTheDocument();
    });

    const cpuSlider = screen.getByLabelText("CPU & RAM Refresh Interval") as HTMLInputElement;
    fireEvent.change(cpuSlider, { target: { value: "2500" } });
    fireEvent.pointerUp(cpuSlider);

    const diskSlider = screen.getByLabelText("Disk Refresh Interval") as HTMLInputElement;
    fireEvent.change(diskSlider, { target: { value: "30000" } });
    fireEvent.keyUp(diskSlider);

    expect(screen.getByText("2.5s")).toBeInTheDocument();
    expect(screen.getByText("30s")).toBeInTheDocument();
  });
});
