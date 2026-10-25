/**
 * Type definitions matching Rust `AppConfig` and nested structures.
 */

export interface WidgetPlacement {
  id: string;
  visible: boolean;
  logical_x: number;
  logical_y: number;
  logical_width: number;
  logical_height: number;
  scale_factor: number;
  monitor_id: string | null;
}

export interface PollingRates {
  resources_cpu_ram_ms: number;
  resources_disk_ms: number;
  weather_minutes: number;
}

export interface WeatherSettings {
  use_windows_location: boolean;
  manual_city: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type LayoutMode = "independent" | "docked";
export type AppTheme = "auto" | "light" | "dark";

export interface AppConfig {
  version: number;
  lock_positions: boolean;
  always_on_top: boolean;
  snap_to_edges: boolean;
  layout_mode: LayoutMode;
  auto_start: boolean;
  theme: AppTheme;
  polling_rates: PollingRates;
  weather_settings: WeatherSettings;
  widgets: Record<string, WidgetPlacement>;
}

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  lock_positions: false,
  always_on_top: false,
  snap_to_edges: true,
  layout_mode: "independent",
  auto_start: false,
  theme: "auto",
  polling_rates: {
    resources_cpu_ram_ms: 1500,
    resources_disk_ms: 15000,
    weather_minutes: 30,
  },
  weather_settings: {
    use_windows_location: true,
    manual_city: null,
    latitude: null,
    longitude: null,
  },
  widgets: {
    resources: {
      id: "resources",
      visible: true,
      logical_x: 120,
      logical_y: 128,
      logical_width: 360,
      logical_height: 384,
      scale_factor: 1,
      monitor_id: null,
    },
    spotify: {
      id: "spotify",
      visible: true,
      logical_x: 480,
      logical_y: 128,
      logical_width: 360,
      logical_height: 256,
      scale_factor: 1,
      monitor_id: null,
    },
    weather: {
      id: "weather",
      visible: true,
      logical_x: 840,
      logical_y: 128,
      logical_width: 360,
      logical_height: 512,
      scale_factor: 1,
      monitor_id: null,
    },
  },
};
