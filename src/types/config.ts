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

export interface LauncherItem {
  id: string;
  name: string;
  path_or_uri: string;
  icon_type?: string;
  source: "steam" | "epic" | "custom";
  last_launched?: number;
}

export interface QuickSettingsInstance {
  id: string;
  title: string;
  pinned_actions: string[];
}

export interface CalendarNote {
  id: string;
  text: string;
  completed?: boolean;
}

export interface SpeedtestResult {
  timestamp: number;
  ping_ms: number;
  jitter_ms: number;
  download_mbps: number;
  upload_mbps: number;
}

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
  launcher_items?: LauncherItem[];
  quick_settings_instances?: Record<string, QuickSettingsInstance>;
  calendar_events?: Record<string, CalendarNote[]>;
  speedtest_history?: SpeedtestResult[];
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
  launcher_items: [],
  quick_settings_instances: {},
  calendar_events: {},
  speedtest_history: [],
};
