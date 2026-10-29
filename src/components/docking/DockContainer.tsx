import { useState, useCallback, useMemo, type FC, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  GripHorizontal,
  Lock,
  Unlock,
  Settings,
  LayoutGrid,
  Cpu,
  Music,
  CloudSun,
  Gauge,
  Gamepad2,
  SlidersHorizontal,
  Calendar,
  Clock,
  Bluetooth,
  BatteryCharging,
  Minimize2,
  Maximize2,
  PlusCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import { DockItem } from "./DockItem";
import { ResourceWidget } from "@/widgets/resources/ResourceWidget";
import { SpotifyWidget } from "@/widgets/spotify/SpotifyWidget";
import { WeatherWidget } from "@/widgets/weather/WeatherWidget";
import { SpeedtestWidget } from "@/widgets/speedtest/SpeedtestWidget";
import { GameLauncherWidget } from "@/widgets/launcher/GameLauncherWidget";
import { QuickSettingsWidget } from "@/widgets/quick-settings/QuickSettingsWidget";
import { CalendarWidget } from "@/widgets/calendar/CalendarWidget";
import { ClockWidget } from "@/widgets/clock/ClockWidget";
import { BluetoothWidget } from "@/widgets/bluetooth/BluetoothWidget";
import { BatteryWidget } from "@/widgets/battery/BatteryWidget";
import { useConfig } from "@/hooks/useConfig";
import { cn } from "@/utils/cn";

export interface DockContainerProps {
  className?: string;
  onOpenSettings?: () => void;
}

export const DockContainer: FC<DockContainerProps> = ({
  className,
  onOpenSettings,
}) => {
  const { config, setWidgetsLocked, setLayoutMode, updateWidgetPlacement } = useConfig();
  const [allCollapsed, setAllCollapsed] = useState(false);

  const isLocked = config.lock_positions;

  const handleOpenSettings = useCallback(async () => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_settings");
    } catch {
      // In web browser or mock preview, open settings query param or log
      window.location.search = "?view=settings";
    }
  }, [onOpenSettings]);

  const handleToggleLock = useCallback(async () => {
    await setWidgetsLocked(!isLocked);
  }, [isLocked, setWidgetsLocked]);

  const handleSwitchToIndependent = useCallback(async () => {
    await setLayoutMode("independent");
  }, [setLayoutMode]);

  // Compute active widgets
  const visibleWidgets = useMemo(() => {
    const list: Array<{
      id: string;
      title: string;
      icon: ReactNode;
      component: ReactNode;
    }> = [];

    if (config.widgets?.resources?.visible ?? true) {
      list.push({
        id: "resources",
        title: "System Resources",
        icon: <Cpu className="w-3.5 h-3.5 text-sky-400" />,
        component: (
          <ResourceWidget className="w-full border-0 shadow-none bg-transparent p-0" />
        ),
      });
    }

    if (config.widgets?.spotify?.visible ?? true) {
      list.push({
        id: "spotify",
        title: "Media Controls",
        icon: <Music className="w-3.5 h-3.5 text-emerald-400" />,
        component: <SpotifyWidget className="w-full max-w-none" />,
      });
    }

    if (config.widgets?.weather?.visible ?? true) {
      list.push({
        id: "weather",
        title: "Weather Forecast",
        icon: <CloudSun className="w-3.5 h-3.5 text-amber-400" />,
        component: <WeatherWidget className="w-full" />,
      });
    }

    if (config.widgets?.speedtest?.visible) {
      list.push({
        id: "speedtest",
        title: "Internet Speedtest",
        icon: <Gauge className="w-3.5 h-3.5 text-sky-400" />,
        component: <SpeedtestWidget className="w-full border-0 shadow-none bg-transparent p-0" />,
      });
    }

    if (config.widgets?.launcher?.visible) {
      list.push({
        id: "launcher",
        title: "Game Launcher",
        icon: <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />,
        component: <GameLauncherWidget className="w-full border-0 shadow-none bg-transparent p-0" />,
      });
    }

    // Quick Settings base instance
    if (config.widgets?.quick_settings?.visible) {
      const title = config.quick_settings_instances?.quick_settings?.title ?? "Quick Settings";
      list.push({
        id: "quick_settings",
        title,
        icon: <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />,
        component: (
          <QuickSettingsWidget
            instanceId="quick_settings"
            className="w-full border-0 shadow-none bg-transparent p-0"
          />
        ),
      });
    }

    // Dynamic Quick Settings instances
    if (config.widgets) {
      Object.entries(config.widgets).forEach(([id, placement]) => {
        if (id.startsWith("quick_settings_") && placement.visible) {
          const title =
            config.quick_settings_instances?.[id]?.title ??
            `Quick Settings (${id.replace("quick_settings_", "")})`;
          list.push({
            id,
            title,
            icon: <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />,
            component: (
              <QuickSettingsWidget
                instanceId={id}
                className="w-full border-0 shadow-none bg-transparent p-0"
              />
            ),
          });
        }
      });
    }

    if (config.widgets?.calendar?.visible) {
      list.push({
        id: "calendar",
        title: "Calendar & Notes",
        icon: <Calendar className="w-3.5 h-3.5 text-sky-400" />,
        component: <CalendarWidget className="w-full border-0 shadow-none bg-transparent p-0" />,
      });
    }

    if (config.widgets?.clock?.visible) {
      list.push({
        id: "clock",
        title: "Clock & Timers",
        icon: <Clock className="w-3.5 h-3.5 text-indigo-400" />,
        component: <ClockWidget className="w-full border-0 shadow-none bg-transparent p-0" />,
      });
    }

    if (config.widgets?.bluetooth?.visible) {
      list.push({
        id: "bluetooth",
        title: "Bluetooth Devices",
        icon: <Bluetooth className="w-3.5 h-3.5 text-blue-400" />,
        component: <BluetoothWidget className="w-full border-0 shadow-none bg-transparent p-0" />,
      });
    }

    if (config.widgets?.battery?.visible) {
      list.push({
        id: "battery",
        title: "Battery & Power",
        icon: <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />,
        component: <BatteryWidget className="w-full border-0 shadow-none bg-transparent p-0" />,
      });
    }

    return list;
  }, [config.widgets, config.quick_settings_instances]);

  const handleHideWidget = useCallback(
    (widgetId: string) => {
      updateWidgetPlacement(widgetId, { visible: false });
    },
    [updateWidgetPlacement]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isLocked) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [data-no-drag]")) {
      return;
    }
    try {
      void getCurrentWindow().startDragging();
    } catch {
      // Graceful fallback in non-Tauri browser test environments
    }
  };

  return (
    <div
      id="vvidget-dock"
      data-testid="dock-container"
      data-locked={isLocked}
      className={cn(
        "w-full max-w-[360px] flex flex-col transition-[opacity,transform] duration-200 select-none",
        className
      )}
    >
      <Card
        variant="acrylic"
        padded={false}
        className={cn(
          "w-full flex flex-col overflow-hidden",
          "border border-[var(--fluent-stroke)] shadow-2xl",
          "rounded-2xl"
        )}
      >
        {/* Dock Header */}
        <header
          {...(!isLocked ? { "data-tauri-drag-region": true } : {})}
          onMouseDown={handleMouseDown}
          className={cn(
            "flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--fluent-stroke)]",
            "bg-[var(--fluent-card-bg)] select-none",
            !isLocked ? "cursor-grab active:cursor-grabbing" : "cursor-default"
          )}
          aria-label="vvidget desktop dock header"
        >
          {/* Title & Brand */}
          <div
            className="flex items-center gap-2 min-w-0"
            {...(!isLocked ? { "data-tauri-drag-region": true } : {})}
          >
            {!isLocked && (
              <span
                className="text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-text-secondary)] transition-colors pointer-events-none"
                aria-hidden="true"
                data-tauri-drag-region={!isLocked ? true : undefined}
              >
                <GripHorizontal className="w-4 h-4 pointer-events-none" />
              </span>
            )}
            <h1
              className="text-xs font-bold tracking-wide text-[var(--fluent-text-primary)] pointer-events-none"
              data-tauri-drag-region={!isLocked ? true : undefined}
            >
              vvidget Dock
            </h1>
            <span className="pointer-events-none" data-tauri-drag-region={!isLocked ? true : undefined}>
              <Badge size="sm" variant="accent">
                {visibleWidgets.length} Active
              </Badge>
            </span>
          </div>

          {/* Action Toolbar */}
          <div
            className="flex items-center gap-1 flex-shrink-0"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Tooltip
              content={isLocked ? "Unlock dock position" : "Lock dock position"}
              position="bottom"
              delay={200}
            >
              <button
                type="button"
                onClick={handleToggleLock}
                className={cn(
                  "p-1.5 rounded-lg text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]",
                  "hover:bg-[var(--fluent-card-hover)] active:scale-95 transition-[color,background-color,border-color,opacity,transform] duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fluent-accent)]",
                  isLocked && "text-[var(--fluent-accent)] bg-[var(--fluent-accent-subtle)]"
                )}
                aria-label={isLocked ? "Unlock dock position" : "Lock dock position"}
                aria-pressed={isLocked}
              >
                {isLocked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Unlock className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
                )}
              </button>
            </Tooltip>

            <Tooltip
              content="Switch to Independent Windows"
              position="bottom"
              delay={200}
            >
              <button
                type="button"
                onClick={handleSwitchToIndependent}
                className={cn(
                  "p-1.5 rounded-lg text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]",
                  "hover:bg-[var(--fluent-card-hover)] active:scale-95 transition-[color,background-color,border-color,opacity,transform] duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fluent-accent)]"
                )}
                aria-label="Switch to independent windows mode"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </Tooltip>

            <Tooltip
              content={allCollapsed ? "Expand all widgets" : "Collapse all widgets"}
              position="bottom"
              delay={200}
            >
              <button
                type="button"
                onClick={() => setAllCollapsed(!allCollapsed)}
                className={cn(
                  "p-1.5 rounded-lg text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]",
                  "hover:bg-[var(--fluent-card-hover)] active:scale-95 transition-[color,background-color,border-color,opacity,transform] duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fluent-accent)]"
                )}
                aria-label={allCollapsed ? "Expand all widgets" : "Collapse all widgets"}
              >
                {allCollapsed ? (
                  <Maximize2 className="w-3.5 h-3.5" />
                ) : (
                  <Minimize2 className="w-3.5 h-3.5" />
                )}
              </button>
            </Tooltip>

            <Tooltip content="Settings" position="bottom" delay={200}>
              <button
                type="button"
                onClick={handleOpenSettings}
                className={cn(
                  "p-1.5 rounded-lg text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]",
                  "hover:bg-[var(--fluent-card-hover)] active:scale-95 transition-[color,background-color,border-color,opacity,transform] duration-150",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--fluent-accent)]"
                )}
                aria-label="Open settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        </header>

        {/* Dock Stack Area */}
        <div className="p-3 flex flex-col gap-3 overflow-y-auto max-h-[82vh]">
          {visibleWidgets.length > 0 ? (
            visibleWidgets.map((widget) => (
              <DockItem
                key={widget.id}
                id={widget.id}
                title={widget.title}
                icon={widget.icon}
                defaultCollapsed={allCollapsed}
                onHide={() => handleHideWidget(widget.id)}
              >
                {widget.component}
              </DockItem>
            ))
          ) : (
            <div
              className="py-8 px-4 flex flex-col items-center justify-center text-center gap-2.5 rounded-xl border border-dashed border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)]"
              data-testid="dock-empty-state"
            >
              <PlusCircle className="w-8 h-8 text-[var(--fluent-text-tertiary)]" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[var(--fluent-text-primary)]">
                  All widgets are hidden
                </p>
                <p className="text-[11px] text-[var(--fluent-text-secondary)] max-w-[200px]">
                  Enable widgets in Settings or right-click the System Tray icon.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--fluent-accent)] text-black hover:opacity-90 transition-opacity"
              >
                Configure Widgets
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
