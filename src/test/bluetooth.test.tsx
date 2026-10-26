import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BluetoothWidget, getDeviceIcon } from "@/widgets/bluetooth/BluetoothWidget";
import type { BluetoothDeviceInfo } from "@/types/bluetooth";
import { Headphones, Keyboard, Mouse, Smartphone, Bluetooth } from "lucide-react";

const mockDevices: BluetoothDeviceInfo[] = [
  {
    id: "bt-audio-1",
    name: "Sony WH-1000XM4",
    connected: true,
    paired: true,
    battery_level: 80,
    device_type: "audio",
  },
  {
    id: "bt-input-1",
    name: "Logitech MX Keys Wireless Keyboard",
    connected: false,
    paired: true,
    battery_level: null,
    device_type: "input",
  },
  {
    id: "bt-mouse-1",
    name: "Logitech MX Master 3S Mouse",
    connected: true,
    paired: true,
    battery_level: 65,
    device_type: "input",
  },
  {
    id: "bt-phone-1",
    name: "Google Pixel 8",
    connected: false,
    paired: true,
    battery_level: 95,
    device_type: "phone",
  },
  {
    id: "bt-other-1",
    name: "Generic OBD2 Adapter",
    connected: false,
    paired: true,
    battery_level: null,
    device_type: "other",
  },
];

const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
  if (cmd === "get_bluetooth_devices") {
    return Promise.resolve(mockDevices);
  }
  if (cmd === "open_bluetooth_settings") {
    return Promise.resolve();
  }
  return Promise.resolve();
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("BluetoothWidget Component", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it("renders friendly empty state and 'Keine Geräte' badge when no devices are present", async () => {
    await act(async () => {
      render(<BluetoothWidget initialDevices={[]} autoFetch={false} />);
    });

    expect(screen.getByText("Bluetooth")).toBeInTheDocument();
    expect(screen.getByTestId("bluetooth-status")).toHaveTextContent("Keine Geräte");
    expect(screen.getByText("0 Geräte gekoppelt")).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByText("Keine Geräte gefunden")).toBeInTheDocument();
    expect(
      screen.getByText("Windows Bluetooth-Einstellungen öffnen")
    ).toBeInTheDocument();
  });

  it("renders device list with connection status, device icons, and battery display", async () => {
    await act(async () => {
      render(<BluetoothWidget initialDevices={mockDevices} autoFetch={false} />);
    });

    // Header badge
    expect(screen.getByTestId("bluetooth-status")).toHaveTextContent("Aktiv");
    expect(screen.getByText("5 Geräte gekoppelt")).toBeInTheDocument();

    // Verify all devices are rendered
    expect(screen.getByText("Sony WH-1000XM4")).toBeInTheDocument();
    expect(
      screen.getByText("Logitech MX Keys Wireless Keyboard")
    ).toBeInTheDocument();
    expect(screen.getByText("Logitech MX Master 3S Mouse")).toBeInTheDocument();
    expect(screen.getByText("Google Pixel 8")).toBeInTheDocument();
    expect(screen.getByText("Generic OBD2 Adapter")).toBeInTheDocument();

    // Verify connection status labels
    const connectedBadges = screen.getAllByText("Verbunden");
    expect(connectedBadges.length).toBe(2);

    const pairedBadges = screen.getAllByText("Gekoppelt");
    expect(pairedBadges.length).toBe(3);

    // Verify green connection dots for connected devices
    const dots = screen.getAllByTestId("connection-dot");
    expect(dots.length).toBe(2);

    // Verify battery indicators
    expect(screen.getByTestId("device-battery-bt-audio-1")).toHaveTextContent("80%");
    expect(screen.getByTestId("device-battery-bt-mouse-1")).toHaveTextContent("65%");
    expect(screen.getByTestId("device-battery-bt-phone-1")).toHaveTextContent("95%");
    expect(screen.queryByTestId("device-battery-bt-input-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("device-battery-bt-other-1")).not.toBeInTheDocument();
  });

  it("fetches devices via invoke on mount when autoFetch is true", async () => {
    await act(async () => {
      render(<BluetoothWidget autoFetch={true} />);
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("get_bluetooth_devices");
    });

    expect(screen.getByTestId("bluetooth-status")).toHaveTextContent("Aktiv");
    expect(screen.getByText("Sony WH-1000XM4")).toBeInTheDocument();
  });

  it("calls get_bluetooth_devices when refresh button is clicked", async () => {
    await act(async () => {
      render(<BluetoothWidget initialDevices={[]} autoFetch={false} />);
    });

    const refreshBtn = screen.getByTestId("refresh-btn");
    expect(refreshBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    expect(mockInvoke).toHaveBeenCalledWith("get_bluetooth_devices");
  });

  it("calls open_bluetooth_settings when settings quick action button is clicked", async () => {
    await act(async () => {
      render(<BluetoothWidget initialDevices={mockDevices} autoFetch={false} />);
    });

    const settingsBtn = screen.getByTestId("open-settings-btn");
    expect(settingsBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(settingsBtn);
    });

    expect(mockInvoke).toHaveBeenCalledWith("open_bluetooth_settings");
  });

  it("handles fetch error gracefully and shows error message", async () => {
    mockInvoke.mockImplementationOnce((cmd: string) => {
      if (cmd === "get_bluetooth_devices") {
        return Promise.reject(new Error("Bluetooth radio unavailable"));
      }
      return Promise.resolve();
    });

    await act(async () => {
      render(<BluetoothWidget autoFetch={true} />);
    });

    await waitFor(() => {
      expect(screen.getByText("Fehler beim Laden")).toBeInTheDocument();
      expect(screen.getByText("Bluetooth radio unavailable")).toBeInTheDocument();
    });
  });

  it("getDeviceIcon maps types and names to appropriate Lucide icons", () => {
    expect(
      getDeviceIcon({
        id: "1",
        name: "Bose QuietComfort 45",
        connected: false,
        paired: true,
        battery_level: null,
        device_type: "audio",
      })
    ).toBe(Headphones);

    expect(
      getDeviceIcon({
        id: "2",
        name: "AirPods Pro",
        connected: false,
        paired: true,
        battery_level: null,
        device_type: "other",
      })
    ).toBe(Headphones);

    expect(
      getDeviceIcon({
        id: "3",
        name: "Ergonomic Optical Mouse",
        connected: false,
        paired: true,
        battery_level: null,
        device_type: "input",
      })
    ).toBe(Mouse);

    expect(
      getDeviceIcon({
        id: "4",
        name: "Mechanical Keyboard",
        connected: false,
        paired: true,
        battery_level: null,
        device_type: "input",
      })
    ).toBe(Keyboard);

    expect(
      getDeviceIcon({
        id: "5",
        name: "Galaxy S24 Ultra",
        connected: false,
        paired: true,
        battery_level: null,
        device_type: "phone",
      })
    ).toBe(Smartphone);

    expect(
      getDeviceIcon({
        id: "6",
        name: "Smart Watch Device",
        connected: false,
        paired: true,
        battery_level: null,
        device_type: "other",
      })
    ).toBe(Bluetooth);
  });
});
