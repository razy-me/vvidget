import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QuickSettingsWidget, PREDEFINED_ACTIONS } from "@/widgets/quick-settings/QuickSettingsWidget";
import { DEFAULT_CONFIG } from "@/types/config";

const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
  if (cmd === "load_config") return Promise.resolve(DEFAULT_CONFIG);
  if (cmd === "duplicate_quick_settings_widget") return Promise.resolve("quick_settings_9999");
  return Promise.resolve();
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe("QuickSettingsWidget Component", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it("renders default title and all predefined quick action tiles", async () => {
    await act(async () => {
      render(<QuickSettingsWidget />);
    });

    expect(screen.getByTestId("instance-title")).toHaveTextContent("Quick Settings");
    expect(screen.getByTestId("duplicate-widget-btn")).toBeInTheDocument();
    expect(screen.getByTestId("customize-tiles-btn")).toBeInTheDocument();

    // Verify 8 standard tiles
    for (const action of PREDEFINED_ACTIONS) {
      expect(screen.getByTestId(`action-tile-${action.id}`)).toBeInTheDocument();
      expect(screen.getByLabelText(action.label)).toBeInTheDocument();
    }
  });

  it("triggers execute_quick_action when a tile is clicked and displays feedback", async () => {
    await act(async () => {
      render(<QuickSettingsWidget />);
    });

    const soundTile = screen.getByTestId("action-tile-sound");
    expect(soundTile).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(soundTile);
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "execute_quick_action",
        expect.objectContaining({
          actionId: "sound",
        }),
      );
    });

    // Check tactile feedback state
    expect(soundTile).toHaveAttribute("data-active", "true");
    expect(screen.getByText("Gestartet")).toBeInTheDocument();
  });

  it("allows inline editing of the widget instance title", async () => {
    await act(async () => {
      render(<QuickSettingsWidget instanceId="quick_settings" />);
    });

    // Click edit pencil button
    const editBtn = screen.getByTestId("edit-title-btn");
    await act(async () => {
      fireEvent.click(editBtn);
    });

    const input = screen.getByTestId("edit-title-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Quick Settings");

    // Change title and press Enter
    await act(async () => {
      fireEvent.change(input, { target: { value: "Studio Audio & Net" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("instance-title")).toHaveTextContent("Studio Audio & Net");
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "update_quick_settings_instance",
      expect.objectContaining({
        instance: expect.objectContaining({
          title: "Studio Audio & Net",
        }),
      }),
    );
  });

  it("cancels title editing when cancel button is clicked", async () => {
    await act(async () => {
      render(<QuickSettingsWidget instanceId="quick_settings" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("edit-title-btn"));
    });
    const input = screen.getByTestId("edit-title-input");

    await act(async () => {
      fireEvent.change(input, { target: { value: "Discarded Title" } });
      fireEvent.click(screen.getByLabelText("Cancel title edit"));
    });

    expect(screen.getByTestId("instance-title")).toHaveTextContent("Quick Settings");
  });

  it("calls duplicate_quick_settings_widget on + Duplizieren button click", async () => {
    await act(async () => {
      render(<QuickSettingsWidget instanceId="quick_settings_101" />);
    });

    const duplicateBtn = screen.getByTestId("duplicate-widget-btn");
    expect(duplicateBtn).toHaveTextContent("+ Duplizieren");

    await act(async () => {
      fireEvent.click(duplicateBtn);
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "duplicate_quick_settings_widget",
        expect.objectContaining({
          sourceId: "quick_settings_101",
        }),
      );
    });
  });

  it("opens customization dialog, toggles tiles visibility, and reorders tiles", async () => {
    await act(async () => {
      render(<QuickSettingsWidget instanceId="quick_settings" />);
    });

    // Click customize button
    const customizeBtn = screen.getByTestId("customize-tiles-btn");
    await act(async () => {
      fireEvent.click(customizeBtn);
    });

    expect(screen.getByTestId("customization-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Aktionen konfigurieren/)).toBeInTheDocument();

    // Toggle off nightlight
    const toggleNightlight = screen.getByTestId("toggle-action-nightlight");
    expect(toggleNightlight).toBeChecked();
    await act(async () => {
      fireEvent.click(toggleNightlight);
    });
    expect(toggleNightlight).not.toBeChecked();

    // Move bluetooth up (it's index 1 initially, moving up swaps with index 0 sound)
    const moveUpBtn = screen.getByLabelText("Move Bluetooth up");
    await act(async () => {
      fireEvent.click(moveUpBtn);
    });

    // Close customization
    await act(async () => {
      fireEvent.click(screen.getByText("Fertig"));
    });
    expect(screen.queryByTestId("customization-dialog")).not.toBeInTheDocument();

    // Check tiles grid: nightlight should no longer be present
    expect(screen.queryByTestId("action-tile-nightlight")).not.toBeInTheDocument();
    // Bluetooth and sound should still be present
    expect(screen.getByTestId("action-tile-bluetooth")).toBeInTheDocument();
    expect(screen.getByTestId("action-tile-sound")).toBeInTheDocument();
  });

  it("supports adding a custom action path or URL", async () => {
    await act(async () => {
      render(<QuickSettingsWidget instanceId="quick_settings" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("customize-tiles-btn"));
    });

    const customInput = screen.getByTestId("custom-action-input");
    const addBtn = screen.getByTestId("add-custom-action-btn");

    await act(async () => {
      fireEvent.change(customInput, { target: { value: "https://github.com" } });
      fireEvent.click(addBtn);
    });

    // Close customization
    await act(async () => {
      fireEvent.click(screen.getByText("Fertig"));
    });

    // Verify custom tile rendered
    const customTile = screen.getByTestId("action-tile-custom:https://github.com");
    expect(customTile).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(customTile);
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "execute_quick_action",
        expect.objectContaining({
          actionId: "custom",
          customTarget: "https://github.com",
        }),
      );
    });
  });
});

