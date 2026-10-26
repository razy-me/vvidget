import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { BatteryWidget } from "@/widgets/battery/BatteryWidget";
import { BatterySparkline } from "@/widgets/battery/BatterySparkline";
import { useBattery } from "@/hooks/useBattery";
import {
  formatDrainRate,
  formatEstimatedMinutes,
  getChargingBadgeInfo,
  isHighDrainRate,
  type BatteryStatus,
} from "@/types/battery";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("Battery utility formatting & logic", () => {
  it("formats estimated minutes into German projection strings", () => {
    expect(formatEstimatedMinutes(null)).toBe("—");
    expect(formatEstimatedMinutes(undefined)).toBe("—");
    expect(formatEstimatedMinutes(0)).toBe("noch 0m");
    expect(formatEstimatedMinutes(45)).toBe("noch ~45m");
    expect(formatEstimatedMinutes(165)).toBe("noch ~2h 45m");
    expect(formatEstimatedMinutes(195)).toBe("noch ~3h 15m");
    expect(formatEstimatedMinutes(220)).toBe("noch ~3h 40m");
  });

  it("formats drain and charge rates correctly", () => {
    expect(formatDrainRate(-0.28, false)).toBe("Verbrauch: −0.28 %/min");
    expect(formatDrainRate(-0.284, false)).toBe("Verbrauch: −0.28 %/min");
    expect(formatDrainRate(-0.286, false)).toBe("Verbrauch: −0.29 %/min");
    expect(formatDrainRate(0.95, true)).toBe("+0.95 %/min Laden");
    expect(formatDrainRate(0.0, false)).toBe("Verbrauch: 0.00 %/min");
    // Charging even if rate is slightly 0
    expect(formatDrainRate(0.0, true)).toBe("+0.00 %/min Laden");
    // Positive rate without explicit isCharging flag still formats as charging
    expect(formatDrainRate(1.154, false)).toBe("+1.15 %/min Laden");
  });

  it("handles non-zero drain rate formatting and zero-rate elimination behaviors", () => {
    // When plugged in and at 100% full charge, rate 0.0 produces Verbrauch: 0.00 %/min
    expect(formatDrainRate(0.0, false)).toBe("Verbrauch: 0.00 %/min");
    // Discharging at minimum floor (-0.05 %/min)
    expect(formatDrainRate(-0.05, false)).toBe("Verbrauch: −0.05 %/min");
    // Active charging at minimum floor (+0.05 %/min)
    expect(formatDrainRate(0.05, true)).toBe("+0.05 %/min Laden");
  });

  it("determines charging mode badges accurately", () => {
    // 100% and plugged in => Voll geladen ✓
    const fullBadge = getChargingBadgeInfo(100, false, true);
    expect(fullBadge.label).toBe("Voll geladen ✓");
    expect(fullBadge.variant).toBe("success");

    // Charging => Wird geladen ⚡
    const chargingBadge = getChargingBadgeInfo(60, true, true);
    expect(chargingBadge.label).toBe("Wird geladen ⚡");
    expect(chargingBadge.variant).toBe("accent");

    // Discharging on battery => Wird entladen 🔋
    const dischargingBadge = getChargingBadgeInfo(82, false, false);
    expect(dischargingBadge.label).toBe("Wird entladen 🔋");
    expect(dischargingBadge.variant).toBe("warning");

    // 100% on battery (unplugged) => Wird entladen 🔋
    const fullUnplugged = getChargingBadgeInfo(100, false, false);
    expect(fullUnplugged.label).toBe("Wird entladen 🔋");
  });

  it("evaluates high drain warning threshold", () => {
    expect(isHighDrainRate(-0.28)).toBe(false);
    expect(isHighDrainRate(-1.5)).toBe(false);
    expect(isHighDrainRate(-1.51)).toBe(true);
    expect(isHighDrainRate(-2.4)).toBe(true);
    expect(isHighDrainRate(1.2)).toBe(false);
  });
});

describe("BatterySparkline component", () => {
  it("renders SVG sparkline for capacity history", () => {
    const { container } = render(
      <BatterySparkline data={[85, 84, 83, 82]} height={32} />
    );
    const sparkline = container.querySelector('[data-testid="battery-sparkline"]');
    expect(sparkline).toBeInTheDocument();
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("handles empty or single data gracefully with subtle placeholder", () => {
    const { rerender } = render(<BatterySparkline data={[]} height={32} />);
    expect(screen.getByTestId("battery-sparkline-placeholder")).toBeInTheDocument();
    expect(screen.getByText("Sammle Daten...")).toBeInTheDocument();

    rerender(<BatterySparkline data={[85]} height={32} />);
    expect(screen.getByTestId("battery-sparkline-placeholder")).toBeInTheDocument();
    expect(screen.getByText("Sammle Daten...")).toBeInTheDocument();
  });
});

describe("BatteryWidget component", () => {
  const mockLaptopDischarging: BatteryStatus = {
    has_battery: true,
    charge_percent: 82,
    is_charging: false,
    is_plugged_in: false,
    drain_rate_percent_per_min: -0.28,
    estimated_mins_to_10_percent: 195, // ~3h 15m
    estimated_mins_to_20_percent: 165, // ~2h 45m
    estimated_mins_to_empty: 220, // ~3h 40m
    capacity_history: [86, 85, 84, 83, 82],
    top_process_name: null,
  };

  it("renders charge percent, drain rate and projections for normal discharging laptop", () => {
    render(<BatteryWidget statusOverride={mockLaptopDischarging} />);

    // Percentage
    expect(screen.getByTestId("battery-percentage")).toHaveTextContent("82%");

    // Charging badge
    expect(screen.getByTestId("battery-charging-badge")).toHaveTextContent("Wird entladen 🔋");

    // Live drain rate
    expect(screen.getByTestId("battery-drain-rate")).toHaveTextContent("Verbrauch: −0.28 %/min");
    expect(screen.getByTestId("battery-drain-rate")).toHaveTextContent("Akkubetrieb");

    // Multi-horizon projections
    expect(screen.getByTestId("projection-20")).toHaveTextContent("noch ~2h 45m");
    expect(screen.getByTestId("projection-10")).toHaveTextContent("noch ~3h 15m");
    expect(screen.getByTestId("projection-empty")).toHaveTextContent("noch ~3h 40m");

    // High drain alert should not be visible
    expect(screen.queryByTestId("battery-high-drain-alert")).not.toBeInTheDocument();
  });

  it("renders charging state and charging badge when on AC power", () => {
    const mockCharging: BatteryStatus = {
      ...mockLaptopDischarging,
      charge_percent: 54,
      is_charging: true,
      is_plugged_in: true,
      drain_rate_percent_per_min: 0.95,
      estimated_mins_to_10_percent: null,
      estimated_mins_to_20_percent: null,
      estimated_mins_to_empty: null,
    };

    render(<BatteryWidget statusOverride={mockCharging} />);

    expect(screen.getByTestId("battery-percentage")).toHaveTextContent("54%");
    expect(screen.getByTestId("battery-charging-badge")).toHaveTextContent("Wird geladen ⚡");
    expect(screen.getByTestId("battery-drain-rate")).toHaveTextContent("+0.95 %/min Laden");
    expect(screen.getByTestId("battery-drain-rate")).toHaveTextContent("Netzbetrieb");

    expect(screen.getByTestId("projection-20")).toHaveTextContent("Wird geladen");
    expect(screen.getByTestId("projection-10")).toHaveTextContent("Wird geladen");
    expect(screen.getByTestId("projection-empty")).toHaveTextContent("Netzbetrieb");
  });

  it("renders Voll geladen ✓ badge when battery is at 100% and plugged in", () => {
    const mockFull: BatteryStatus = {
      ...mockLaptopDischarging,
      charge_percent: 100,
      is_charging: false,
      is_plugged_in: true,
      drain_rate_percent_per_min: 0.0,
      estimated_mins_to_10_percent: null,
      estimated_mins_to_20_percent: null,
      estimated_mins_to_empty: null,
    };

    render(<BatteryWidget statusOverride={mockFull} />);

    expect(screen.getByTestId("battery-percentage")).toHaveTextContent("100%");
    expect(screen.getByTestId("battery-charging-badge")).toHaveTextContent("Voll geladen ✓");
  });

  it("displays high drain rate alert banner with top process name when rate < -1.5 %/min", () => {
    const mockHighDrain: BatteryStatus = {
      ...mockLaptopDischarging,
      drain_rate_percent_per_min: -2.35,
      top_process_name: "chrome.exe",
    };

    render(<BatteryWidget statusOverride={mockHighDrain} />);

    const alert = screen.getByTestId("battery-high-drain-alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Hoher Verbrauch! Verursacher: chrome.exe");
  });

  it("renders fractional rates and exact projections accurately in widget", () => {
    const mockFractional: BatteryStatus = {
      ...mockLaptopDischarging,
      charge_percent: 74,
      drain_rate_percent_per_min: -0.284,
      estimated_mins_to_20_percent: 114,
      estimated_mins_to_10_percent: 135,
      estimated_mins_to_empty: 156,
      top_process_name: "code.exe",
    };

    render(<BatteryWidget statusOverride={mockFractional} />);

    // Fractional drain rate formatted to 2 decimals
    expect(screen.getByTestId("battery-drain-rate")).toHaveTextContent("Verbrauch: −0.28 %/min");

    // Exact projections rendered
    expect(screen.getByTestId("projection-20")).toHaveTextContent("noch ~1h 54m");
    expect(screen.getByTestId("projection-10")).toHaveTextContent("noch ~2h 15m");
    expect(screen.getByTestId("projection-empty")).toHaveTextContent("noch ~2h 36m");
  });

  it("updates real-time top_process_name display when high-drain banner is shown", () => {
    const { rerender } = render(
      <BatteryWidget
        statusOverride={{
          ...mockLaptopDischarging,
          drain_rate_percent_per_min: -2.1,
          top_process_name: "ffmpeg.exe",
        }}
      />
    );

    expect(screen.getByTestId("battery-high-drain-alert")).toHaveTextContent(
      "Hoher Verbrauch! Verursacher: ffmpeg.exe"
    );

    // Update with another high-drain process
    rerender(
      <BatteryWidget
        statusOverride={{
          ...mockLaptopDischarging,
          drain_rate_percent_per_min: -3.4,
          top_process_name: "rustc.exe",
        }}
      />
    );

    expect(screen.getByTestId("battery-high-drain-alert")).toHaveTextContent(
      "Hoher Verbrauch! Verursacher: rustc.exe"
    );

    // Fallback when top_process_name is null
    rerender(
      <BatteryWidget
        statusOverride={{
          ...mockLaptopDischarging,
          drain_rate_percent_per_min: -1.8,
          top_process_name: null,
        }}
      />
    );

    expect(screen.getByTestId("battery-high-drain-alert")).toHaveTextContent(
      "Hoher Verbrauch! Entladerate über 1.5 %/min"
    );
  });

  it("displays desktop info notice when no battery is present", () => {
    const mockDesktop: BatteryStatus = {
      has_battery: false,
      charge_percent: 100,
      is_charging: false,
      is_plugged_in: true,
      drain_rate_percent_per_min: 0.0,
      estimated_mins_to_10_percent: null,
      estimated_mins_to_20_percent: null,
      estimated_mins_to_empty: null,
      capacity_history: [],
      top_process_name: null,
    };

    render(<BatteryWidget statusOverride={mockDesktop} />);

    expect(
      screen.getByText(
        "Keine Batterie erkannt — Dieses Widget ist für Laptops mit Akku optimiert."
      )
    ).toBeInTheDocument();

    // Allows user to dismiss notice
    const dismissBtn = screen.getByLabelText("Hinweis schließen");
    fireEvent.click(dismissBtn);

    expect(screen.getByTestId("battery-widget-dismissed")).toBeInTheDocument();
    expect(screen.getByText("Batterie-Widget ausgeblendet.")).toBeInTheDocument();

    // Restoring notice
    fireEvent.click(screen.getByText("Hinweis wieder anzeigen"));
    expect(screen.getByTestId("battery-widget-no-battery")).toBeInTheDocument();
  });

  it("handles quick-action open power settings button click", () => {
    const onOpenSettings = vi.fn();
    render(
      <BatteryWidget
        statusOverride={mockLaptopDischarging}
        onOpenSettings={onOpenSettings}
      />
    );

    const btn = screen.getByTestId("open-power-settings-btn");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe("useBattery hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("provides fallback mock battery status in non-Tauri environment", () => {
    const { result } = renderHook(() => useBattery());

    expect(result.current.battery).not.toBeNull();
    expect(result.current.battery?.has_battery).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("invokes get_battery_status when running in Tauri webview", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    };

    const mockStatus: BatteryStatus = {
      has_battery: true,
      charge_percent: 77,
      is_charging: false,
      is_plugged_in: false,
      drain_rate_percent_per_min: -0.32,
      estimated_mins_to_10_percent: 120,
      estimated_mins_to_20_percent: 90,
      estimated_mins_to_empty: 150,
      capacity_history: [79, 78, 77],
      top_process_name: null,
    };

    mockInvoke.mockResolvedValue(mockStatus);

    const { result } = renderHook(() => useBattery(10000));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockInvoke).toHaveBeenCalledWith("get_battery_status", undefined);
    expect(result.current.battery?.charge_percent).toBe(77);
  });
});
