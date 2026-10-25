import type { ReactNode } from "react";
import type { LayoutMode, WidgetPlacement } from "./config";

export type { LayoutMode, WidgetPlacement };

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
  widgetId?: string;
  layoutMode?: LayoutMode;
  onDragStateChange?: (isDragging: boolean) => void;
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
