import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WidgetToggleList } from "@/pages/settings/WidgetToggleList";
import { SettingsModal } from "@/pages/settings/SettingsModal";
import { DEFAULT_CONFIG } from "@/types/config";

describe("WidgetToggleList component", () => {
  it("renders all registered widgets", () => {
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
    expect(screen.getByText("Spotify Controls")).toBeInTheDocument();
    expect(screen.getByText("Weather Forecast")).toBeInTheDocument();
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
});
