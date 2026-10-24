import type { ReactNode } from "react";

export type LayoutMode = "independent" | "docked";

export interface WidgetPlacement {
  id: string;
  visible: boolean;
  logical_x: number;
  logical_y: number;
  logical_width: number;
  logical_height: number;
  scale_factor: number;
  monitor_id?: string | null;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorBounds {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
}

export interface SnappingOptions {
  enabled: boolean;
  threshold_px: number;
  snap_to_screen_edges: boolean;
  snap_to_widgets: boolean;
}

export interface HeaderBarProps {
  title: string;
  icon?: ReactNode;
  isLocked?: boolean;
  onToggleLock?: () => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
  className?: string;
  showControls?: boolean;
  actions?: ReactNode;
}

export interface WidgetContainerProps {
  id: string;
  title: string;
  icon?: ReactNode;
  isLocked?: boolean;
  onToggleLock?: () => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
  showHeader?: boolean;
  layoutMode?: LayoutMode;
  minWidth?: number;
  minHeight?: number;
}
