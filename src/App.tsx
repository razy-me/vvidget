import React, {
  Suspense,
  useMemo,
  useCallback,
  Component,
  type FC,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { ThemeProvider } from "@/theme";
import { useConfig } from "@/hooks/useConfig";
import { isTauri, safeInvoke } from "@/utils/tauri";
import { WidgetContainer } from "@/components/layout/WidgetContainer";
import {
  Cpu,
  Music,
  CloudSun,
  Gauge,
  Gamepad2,
  BatteryCharging,
  SlidersHorizontal,
  Bluetooth,
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  LayoutGrid,
  Layers,
  Settings,
  Lock,
  Unlock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

// Lazy-loaded widget components and views to enable per-route code-splitting
const ResourceWidget = React.lazy(() =>
  import("@/widgets/resources/ResourceWidget").then((m) => ({ default: m.ResourceWidget }))
);
const SpotifyWidget = React.lazy(() =>
  import("@/widgets/spotify/SpotifyWidget").then((m) => ({ default: m.SpotifyWidget }))
);
const WeatherWidget = React.lazy(() =>
  import("@/widgets/weather/WeatherWidget").then((m) => ({ default: m.WeatherWidget }))
);
const QuickSettingsWidget = React.lazy(() =>
  import("@/widgets/quick-settings/QuickSettingsWidget").then((m) => ({
    default: m.QuickSettingsWidget,
  }))
);
const SpeedtestWidget = React.lazy(() =>
  import("@/widgets/speedtest/SpeedtestWidget").then((m) => ({ default: m.SpeedtestWidget }))
);
const GameLauncherWidget = React.lazy(() =>
  import("@/widgets/launcher/GameLauncherWidget").then((m) => ({
    default: m.GameLauncherWidget,
  }))
);
const BluetoothWidget = React.lazy(() =>
  import("@/widgets/bluetooth/BluetoothWidget").then((m) => ({ default: m.BluetoothWidget }))
);
const BatteryWidget = React.lazy(() =>
  import("@/widgets/battery/BatteryWidget").then((m) => ({ default: m.BatteryWidget }))
);
const CalendarWidget = React.lazy(() =>
  import("@/widgets/calendar/CalendarWidget").then((m) => ({ default: m.CalendarWidget }))
);
const ClockWidget = React.lazy(() =>
  import("@/widgets/clock/ClockWidget").then((m) => ({ default: m.ClockWidget }))
);
const SettingsModal = React.lazy(() =>
  import("@/pages/settings").then((m) => ({ default: m.SettingsModal }))
);
const SkeletonWidget = React.lazy(() =>
  import("@/components/layout/SkeletonWidget").then((m) => ({ default: m.SkeletonWidget }))
);
const DockContainer = React.lazy(() =>
  import("@/components/docking").then((m) => ({ default: m.DockContainer }))
);

export const AppContent: FC = () => {
  const { config, setWidgetsLocked, setLayoutMode } = useConfig();

  // Query parameter parsing allows multi-window routing in Tauri:
  // e.g. /?widget=resources, /?widget=spotify, /?widget=weather, /?view=settings, /?view=skeleton
  const { widgetId, isSettingsView, isSkeletonView } = useMemo(() => {
    if (typeof window === "undefined") {
      return { widgetId: null, isSettingsView: false, isSkeletonView: false };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      widgetId: params.get("widget"),
      isSettingsView:
        params.get("view") === "settings" || params.get("widget") === "settings",
      isSkeletonView:
        params.get("view") === "skeleton" || params.get("widget") === "skeleton",
    };
  }, []);

  const handleOpenSettings = useCallback(async () => {
    try {
      await safeInvoke("open_settings");
    } catch {
      window.location.search = "?view=settings";
    }
  }, []);

  const handleToggleLock = useCallback(async () => {
    await setWidgetsLocked(!config.lock_positions);
  }, [config.lock_positions, setWidgetsLocked]);

  const dynamicQuickSettings = useMemo(() => {
    if (!config.widgets) return [];
    return Object.entries(config.widgets).filter(
      ([id, placement]) => id.startsWith("quick_settings_") && placement.visible
    );
  }, [config.widgets]);

  // 1. Settings Window View
  if (isSettingsView) {
    return (
      <Suspense fallback={null}>
        <SettingsModal />
      </Suspense>
    );
  }

  // 1b. Translucent Grid Skeleton Preview View (shown while dragging on desktop)
  if (isSkeletonView) {
    return (
      <Suspense fallback={null}>
        <SkeletonWidget />
      </Suspense>
    );
  }

  // 2. Dedicated Single-Widget Window Views (Independent Multi-Window Mode)
  // Outer p-2 provides an 8px inset gap on all sides, resulting in a clean 16px gap between adjacent snapped widgets
  if (widgetId === "resources") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="resources"
          title="System Resources"
          icon={<Cpu className="w-4 h-4 text-sky-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <ResourceWidget className="border-0 shadow-none bg-transparent p-0 max-w-none" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "spotify") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="spotify"
          title="Media Controls"
          icon={<Music className="w-4 h-4 text-emerald-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <SpotifyWidget className="border-0 shadow-none bg-transparent p-0 max-w-none" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "weather") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="weather"
          title="Weather Forecast"
          icon={<CloudSun className="w-4 h-4 text-amber-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <WeatherWidget className="border-0 shadow-none bg-transparent p-0 max-w-none" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "speedtest") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="speedtest"
          title="Internet Speedtest"
          icon={<Gauge className="w-4 h-4 text-sky-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <SpeedtestWidget className="border-0 shadow-none bg-transparent p-0 max-w-none w-full h-full" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "launcher") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="launcher"
          title="Game & App Launcher"
          icon={<Gamepad2 className="w-4 h-4 text-purple-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <GameLauncherWidget className="border-0 shadow-none bg-transparent p-0 max-w-none w-full h-full" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "bluetooth") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="bluetooth"
          title="Bluetooth Devices"
          icon={<Bluetooth className="w-4 h-4 text-blue-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <BluetoothWidget className="border-0 shadow-none bg-transparent p-0 max-w-none w-full h-full" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "battery") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="battery"
          title="Battery & Power"
          icon={<BatteryCharging className="w-4 h-4 text-emerald-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <BatteryWidget className="border-0 shadow-none bg-transparent p-0 max-w-none w-full h-full" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "calendar") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="calendar"
          title="Calendar & Notes"
          icon={<CalendarIcon className="w-4 h-4 text-sky-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <CalendarWidget className="border-0 shadow-none bg-transparent p-0 max-w-none w-full h-full" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "clock") {
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="clock"
          title="Clock & Timers"
          icon={<ClockIcon className="w-4 h-4 text-indigo-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <ClockWidget className="border-0 shadow-none bg-transparent p-0 max-w-none w-full h-full" />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId && widgetId.startsWith("quick_settings")) {
    const instanceTitle =
      config.quick_settings_instances?.[widgetId]?.title ?? "Quick Settings";
    return (
      <div className="w-full h-full p-2 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id={widgetId}
          title={instanceTitle}
          icon={<SlidersHorizontal className="w-4 h-4 text-sky-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <Suspense fallback={null}>
            <QuickSettingsWidget
              instanceId={widgetId}
              className="border-0 shadow-none bg-transparent p-0 max-w-none"
            />
          </Suspense>
        </WidgetContainer>
      </div>
    );
  }

  // 3. Main Window: Docked Mode or Independent Desktop Canvas
  if (config.layout_mode === "docked") {
    return (
      <main className="min-h-screen p-3 flex flex-col items-center justify-start bg-transparent">
        <Suspense fallback={null}>
          <DockContainer onOpenSettings={handleOpenSettings} />
        </Suspense>
      </main>
    );
  }

  // In Tauri runtime when in independent multi-window mode, the main window is hidden via Win32 SW_HIDE.
  // Rendering the entire 10-widget grid inside the hidden window creates duplicate listeners,
  // timers, and GPU compositing load. Return null to keep the hidden main window at 0% CPU/GPU.
  if (isTauri()) {
    return null;
  }

  // 4. Main Window (Independent Preview / Multi-Widget Canvas for Web/Test environment)
  const isResourcesVisible = config.widgets?.resources?.visible ?? true;
  const isSpotifyVisible = config.widgets?.spotify?.visible ?? true;
  const isWeatherVisible = config.widgets?.weather?.visible ?? true;
  const isSpeedtestVisible = config.widgets?.speedtest?.visible ?? false;
  const isLauncherVisible = config.widgets?.launcher?.visible ?? false;
  const isQuickSettingsVisible = config.widgets?.quick_settings?.visible ?? false;
  const isBluetoothVisible = config.widgets?.bluetooth?.visible ?? false;
  const isBatteryVisible = config.widgets?.battery?.visible ?? false;
  const isCalendarVisible = config.widgets?.calendar?.visible ?? false;
  const isClockVisible = config.widgets?.clock?.visible ?? false;

  return (
    <main className="min-h-screen p-4 flex flex-col items-center justify-start text-[var(--fluent-text-primary)] bg-transparent">
      {/* Top Workspace Controls Bar */}
      <header className="w-full max-w-5xl mb-4 flex items-center justify-between px-3 py-2 rounded-xl border border-[var(--fluent-stroke)] bg-[var(--fluent-acrylic-bg)] shadow-lg">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--fluent-accent)]" />
          <h1 className="text-xs font-bold tracking-wide">vvidget Desktop Surface</h1>
          <span className="text-[11px] text-[var(--fluent-text-tertiary)]">
            (Independent Multi-Window Mode)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleLock}
            className="px-2.5 py-1 rounded-lg border border-[var(--fluent-stroke)] hover:bg-[var(--fluent-card-hover)] text-xs flex items-center gap-1.5 transition-colors"
          >
            {config.lock_positions ? (
              <>
                <Lock className="w-3.5 h-3.5 text-[var(--fluent-accent)]" />
                <span>Locked</span>
              </>
            ) : (
              <>
                <Unlock className="w-3.5 h-3.5 text-[var(--fluent-text-secondary)]" />
                <span>Unlocked</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void setLayoutMode("docked")}
            className="px-2.5 py-1 rounded-lg border border-[var(--fluent-stroke)] hover:bg-[var(--fluent-card-hover)] text-xs flex items-center gap-1.5 transition-colors"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[var(--fluent-accent)]" />
            <span>Switch to Dock</span>
          </button>

          <button
            type="button"
            onClick={handleOpenSettings}
            className="p-1 rounded-lg border border-[var(--fluent-stroke)] hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] transition-colors"
            aria-label="Open settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Grid of Independent Widgets */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {isResourcesVisible && (
          <WidgetContainer
            id="resources"
            title="System Resources"
            icon={<Cpu className="w-4 h-4 text-sky-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <ResourceWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}

        {isSpotifyVisible && (
          <WidgetContainer
            id="spotify"
            title="Media Controls"
            icon={<Music className="w-4 h-4 text-emerald-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <SpotifyWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}

        {isWeatherVisible && (
          <WidgetContainer
            id="weather"
            title="Weather Forecast"
            icon={<CloudSun className="w-4 h-4 text-amber-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <WeatherWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}

        {isSpeedtestVisible && (
          <WidgetContainer
            id="speedtest"
            title="Internet Speedtest"
            icon={<Gauge className="w-4 h-4 text-sky-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <SpeedtestWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}

        {isLauncherVisible && (
          <WidgetContainer
            id="launcher"
            title="Game & App Launcher"
            icon={<Gamepad2 className="w-4 h-4 text-purple-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <GameLauncherWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}

        {isQuickSettingsVisible && (
          <WidgetContainer
            id="quick_settings"
            title={config.quick_settings_instances?.quick_settings?.title ?? "Quick Settings"}
            icon={<SlidersHorizontal className="w-4 h-4 text-sky-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <QuickSettingsWidget
                instanceId="quick_settings"
                className="border-0 shadow-none bg-transparent p-0"
              />
            </Suspense>
          </WidgetContainer>
        )}

        {dynamicQuickSettings.map(([id]) => (
          <WidgetContainer
            key={id}
            id={id}
            title={
              config.quick_settings_instances?.[id]?.title ??
              `Quick Settings (${id.replace("quick_settings_", "")})`
            }
            icon={<SlidersHorizontal className="w-4 h-4 text-sky-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <QuickSettingsWidget
                instanceId={id}
                className="border-0 shadow-none bg-transparent p-0"
              />
            </Suspense>
          </WidgetContainer>
        ))}

        {isBluetoothVisible && (
          <WidgetContainer
            id="bluetooth"
            title="Bluetooth Devices"
            icon={<Bluetooth className="w-4 h-4 text-blue-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <BluetoothWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}

        {isBatteryVisible && (
          <WidgetContainer
            id="battery"
            title="Battery & Power"
            icon={<BatteryCharging className="w-4 h-4 text-emerald-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <BatteryWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}

        {isCalendarVisible && (
          <WidgetContainer
            id="calendar"
            title="Calendar & Notes"
            icon={<CalendarIcon className="w-4 h-4 text-sky-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <CalendarWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}

        {isClockVisible && (
          <WidgetContainer
            id="clock"
            title="Clock & Timers"
            icon={<ClockIcon className="w-4 h-4 text-indigo-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <Suspense fallback={null}>
              <ClockWidget className="border-0 shadow-none bg-transparent p-0" />
            </Suspense>
          </WidgetContainer>
        )}
      </div>
    </main>
  );
};

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          className="min-h-screen p-4 flex flex-col items-center justify-center text-center bg-[var(--fluent-acrylic-bg)] text-[var(--fluent-text-primary)] select-none"
          data-testid="error-boundary-fallback"
        >
          <div className="p-6 rounded-2xl border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] max-w-sm w-full flex flex-col items-center gap-3 shadow-xl">
            <AlertCircle className="w-8 h-8 text-[var(--fluent-error)]" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Something went wrong</h2>
              <p className="text-xs text-[var(--fluent-text-secondary)] line-clamp-3">
                {this.state.error?.message || "An unexpected error occurred in vvidget."}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-2 px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--fluent-accent)] text-black hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Widget</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const App: FC = () => {
  const { config, setTheme } = useConfig();

  return (
    <ErrorBoundary>
      <ThemeProvider initialTheme={config.theme} onThemeChange={setTheme}>
        <AppContent />
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
