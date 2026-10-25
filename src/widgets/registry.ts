export type WidgetId = "weather" | "spotify" | "resources";

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
};

export function getWidgetMetadata(id: string): WidgetMetadata | undefined {
  return WIDGET_REGISTRY[id as WidgetId];
}

export function getAllWidgetMetadata(): WidgetMetadata[] {
  return Object.values(WIDGET_REGISTRY);
}
