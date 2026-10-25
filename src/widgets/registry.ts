export type WidgetId =
  | "resources"
  | "spotify"
  | "weather"
  | "speedtest"
  | "launcher"
  | "quick_settings"
  | "calendar"
  | "clock"
  | "bluetooth"
  | "battery";

export interface WidgetMetadata {
  id: WidgetId;
  name: string;
  description: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
  resizable: boolean;
  category: "utility" | "media" | "system";
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetMetadata> = {
  resources: {
    id: "resources",
    name: "System Resources",
    description: "Real-time CPU, RAM and Disk utilization monitor",
    defaultWidth: 360,
    defaultHeight: 384,
    minWidth: 260,
    minHeight: 140,
    resizable: false,
    category: "system",
  },
  spotify: {
    id: "spotify",
    name: "Media Controls",
    description: "Windows media playback controls and currently playing track info",
    defaultWidth: 360,
    defaultHeight: 256,
    minWidth: 280,
    minHeight: 120,
    resizable: false,
    category: "media",
  },
  weather: {
    id: "weather",
    name: "Weather Forecast",
    description: "Current temperature, feels-like and forecasts via Open-Meteo",
    defaultWidth: 360,
    defaultHeight: 512,
    minWidth: 260,
    minHeight: 140,
    resizable: false,
    category: "utility",
  },
  speedtest: {
    id: "speedtest",
    name: "Internet Speedtest",
    description: "Real-time network latency, jitter, download and upload speed benchmark",
    defaultWidth: 360,
    defaultHeight: 256,
    minWidth: 280,
    minHeight: 200,
    resizable: false,
    category: "utility",
  },
  launcher: {
    id: "launcher",
    name: "Game & App Launcher",
    description: "Quick access to Steam, Epic Games and custom applications",
    defaultWidth: 360,
    defaultHeight: 384,
    minWidth: 280,
    minHeight: 250,
    resizable: false,
    category: "utility",
  },
  quick_settings: {
    id: "quick_settings",
    name: "Quick Settings",
    description: "Customizable quick access toggles, volume controls and system utilities",
    defaultWidth: 360,
    defaultHeight: 256,
    minWidth: 280,
    minHeight: 180,
    resizable: false,
    category: "system",
  },
  calendar: {
    id: "calendar",
    name: "Calendar & Notes",
    description: "Monthly calendar with week numbers and daily task notes",
    defaultWidth: 360,
    defaultHeight: 384,
    minWidth: 280,
    minHeight: 260,
    resizable: false,
    category: "utility",
  },
  clock: {
    id: "clock",
    name: "Clock & Timers",
    description: "World clock, stopwatch, countdown timer and alarms",
    defaultWidth: 360,
    defaultHeight: 384,
    minWidth: 280,
    minHeight: 260,
    resizable: false,
    category: "utility",
  },
  bluetooth: {
    id: "bluetooth",
    name: "Bluetooth Devices",
    description: "Manage paired Bluetooth devices, connection status and battery levels",
    defaultWidth: 360,
    defaultHeight: 256,
    minWidth: 280,
    minHeight: 180,
    resizable: false,
    category: "system",
  },
  battery: {
    id: "battery",
    name: "Battery & Power",
    description: "Laptop battery health, discharge rate and power analytics",
    defaultWidth: 360,
    defaultHeight: 384,
    minWidth: 280,
    minHeight: 250,
    resizable: false,
    category: "system",
  },
};

/**
 * Resolves any widget instance ID (including dynamic instances like `quick_settings_123`)
 * to its underlying registered base widget type.
 */
export function resolveBaseWidgetType(widgetId: string): WidgetId {
  if (widgetId.startsWith("quick_settings")) {
    return "quick_settings";
  }
  if (widgetId in WIDGET_REGISTRY) {
    return widgetId as WidgetId;
  }
  return "resources";
}

export function getWidgetMetadata(id: string): WidgetMetadata | undefined {
  if (!id.startsWith("quick_settings") && !(id in WIDGET_REGISTRY)) {
    return undefined;
  }
  const baseType = resolveBaseWidgetType(id);
  return WIDGET_REGISTRY[baseType];
}

export function getAllWidgetMetadata(): WidgetMetadata[] {
  return Object.values(WIDGET_REGISTRY);
}
