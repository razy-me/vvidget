export interface BatteryStatus {
  /** Whether a physical battery is present (false on desktops). */
  has_battery: boolean;
  /** Current charge percentage (0-100). */
  charge_percent: number;
  /** Whether the battery is actively charging. */
  is_charging: boolean;
  /** Whether connected to AC power. */
  is_plugged_in: boolean;
  /** Drain/charge rate in %/min (negative when discharging, positive when charging). */
  drain_rate_percent_per_min: number;
  /** Estimated time remaining until 10% capacity in minutes. */
  estimated_mins_to_10_percent: number | null;
  /** Estimated time remaining until 20% capacity in minutes. */
  estimated_mins_to_20_percent: number | null;
  /** Estimated time remaining until 0% capacity (empty) in minutes. */
  estimated_mins_to_empty: number | null;
  /** Recent battery capacity samples for sparkline graph (up to 20 samples). */
  capacity_history: number[];
  /** Top CPU-consuming process name if available. */
  top_process_name: string | null;
}

export const MOCK_BATTERY_STATUS: BatteryStatus = {
  has_battery: true,
  charge_percent: 82,
  is_charging: false,
  is_plugged_in: false,
  drain_rate_percent_per_min: -0.28,
  estimated_mins_to_10_percent: 195, // ~3h 15m
  estimated_mins_to_20_percent: 165, // ~2h 45m
  estimated_mins_to_empty: 220, // ~3h 40m
  capacity_history: [86, 85, 85, 84, 84, 83, 83, 82, 82, 82],
  top_process_name: null,
};

/**
 * Formats estimated minutes into "noch ~Xh Ym" or "noch ~Ym".
 */
export function formatEstimatedMinutes(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) {
    return "—";
  }
  if (mins === 0) {
    return "noch 0m";
  }
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (hours > 0) {
    return `noch ~${hours}h ${minutes}m`;
  }
  return `noch ~${minutes}m`;
}

/**
 * Formats live drain or charge rate string.
 * Example discharging: "Verbrauch: −0.28 %/min"
 * Example charging: "+0.95 %/min Laden"
 */
export function formatDrainRate(rate: number, isCharging: boolean): string {
  if (isCharging || rate > 0) {
    const sign = rate >= 0 ? "+" : "−";
    return `${sign}${Math.abs(rate).toFixed(2)} %/min Laden`;
  }
  if (rate < 0) {
    return `Verbrauch: −${Math.abs(rate).toFixed(2)} %/min`;
  }
  return "Verbrauch: 0.00 %/min";
}

export type ChargingBadgeType = "charging" | "discharging" | "full";

export interface ChargingBadgeInfo {
  label: string;
  type: ChargingBadgeType;
  variant: "accent" | "warning" | "success";
}

/**
 * Resolves charging badge info based on charge percent and power states.
 */
export function getChargingBadgeInfo(
  chargePercent: number,
  isCharging: boolean,
  isPluggedIn: boolean
): ChargingBadgeInfo {
  if (chargePercent >= 100 && isPluggedIn) {
    return {
      label: "Voll geladen ✓",
      type: "full",
      variant: "success",
    };
  }
  if (isPluggedIn && !isCharging) {
    return {
      label: "Netzbetrieb ⚡",
      type: "charging",
      variant: "accent",
    };
  }
  if (isCharging) {
    return {
      label: "Wird geladen ⚡",
      type: "charging",
      variant: "accent",
    };
  }
  return {
    label: "Wird entladen 🔋",
    type: "discharging",
    variant: "warning",
  };
}

/**
 * High drain threshold in %/min (discharging faster than -1.5 %/min).
 */
export const HIGH_DRAIN_THRESHOLD = -1.5;

export function isHighDrainRate(rate: number): boolean {
  return rate < HIGH_DRAIN_THRESHOLD;
}
