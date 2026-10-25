import { useMemo, useCallback, Component, type FC, type ErrorInfo, type ReactNode } from "react";
import { ThemeProvider } from "@/theme";
import { useConfig } from "@/hooks/useConfig";
import { SettingsModal } from "@/pages/settings";
import { DockContainer } from "@/components/docking";
import { WidgetContainer } from "@/components/layout/WidgetContainer";
import { ResourceWidget } from "@/widgets/resources/ResourceWidget";
import { SpotifyWidget } from "@/widgets/spotify/SpotifyWidget";
import { WeatherWidget } from "@/widgets/weather/WeatherWidget";
import {
  Cpu,
  Music,
  CloudSun,
  LayoutGrid,
  Layers,
  Settings,
  Lock,
  Unlock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export const AppContent: FC = () => {
  const { config, setWidgetsLocked, setLayoutMode } = useConfig();

  // Query parameter parsing allows multi-window routing in Tauri:
  // e.g. /?widget=resources, /?widget=spotify, /?widget=weather, /?view=settings
  const { widgetId, isSettingsView } = useMemo(() => {
    if (typeof window === "undefined") {
      return { widgetId: null, isSettingsView: false };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      widgetId: params.get("widget"),
      isSettingsView:
        params.get("view") === "settings" || params.get("widget") === "settings",
    };
  }, []);

  const handleOpenSettings = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_settings");
    } catch {
      window.location.search = "?view=settings";
    }
  }, []);

  const handleToggleLock = useCallback(async () => {
    await setWidgetsLocked(!config.lock_positions);
  }, [config.lock_positions, setWidgetsLocked]);

  // 1. Settings Window View
  if (isSettingsView) {
    return <SettingsModal />;
  }

  // 2. Dedicated Single-Widget Window Views (Independent Multi-Window Mode)
  if (widgetId === "resources") {
    return (
      <div className="w-full h-full p-0 flex flex-col bg-transparent overflow-hidden select-none">
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
          <ResourceWidget className="border-0 shadow-none bg-transparent p-0" />
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "spotify") {
    return (
      <div className="w-full h-full p-0 flex flex-col bg-transparent overflow-hidden select-none">
        <WidgetContainer
          id="spotify"
          title="Spotify Controls"
          icon={<Music className="w-4 h-4 text-emerald-400" />}
          isLocked={config.lock_positions}
          layoutMode="independent"
          onToggleLock={handleToggleLock}
          onOpenSettings={handleOpenSettings}
          className="w-full h-full"
        >
          <SpotifyWidget className="border-0 shadow-none bg-transparent p-0" />
        </WidgetContainer>
      </div>
    );
  }

  if (widgetId === "weather") {
    return (
      <div className="w-full h-full p-0 flex flex-col bg-transparent overflow-hidden select-none">
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
          <WeatherWidget className="border-0 shadow-none bg-transparent p-0" />
        </WidgetContainer>
      </div>
    );
  }

  // 3. Main Window: Docked Mode or Independent Desktop Canvas
  if (config.layout_mode === "docked") {
    return (
      <main className="min-h-screen p-3 flex flex-col items-center justify-start bg-transparent">
        <DockContainer onOpenSettings={handleOpenSettings} />
      </main>
    );
  }

  // 4. Main Window (Independent Preview / Multi-Widget Canvas)
  const isResourcesVisible = config.widgets.resources?.visible ?? true;
  const isSpotifyVisible = config.widgets.spotify?.visible ?? true;
  const isWeatherVisible = config.widgets.weather?.visible ?? true;

  return (
    <main className="min-h-screen p-4 flex flex-col items-center justify-start text-[var(--fluent-text-primary)] bg-transparent">
      {/* Top Workspace Controls Bar */}
      <header className="w-full max-w-5xl mb-4 flex items-center justify-between px-3 py-2 rounded-xl border border-[var(--fluent-stroke)] bg-[var(--fluent-acrylic-bg)] backdrop-blur-xl shadow-lg">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[var(--fluent-accent)]" />
          <h1 className="text-xs font-bold tracking-wide">Widgetz Desktop Surface</h1>
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
            <ResourceWidget className="border-0 shadow-none bg-transparent p-0" />
          </WidgetContainer>
        )}

        {isSpotifyVisible && (
          <WidgetContainer
            id="spotify"
            title="Spotify Controls"
            icon={<Music className="w-4 h-4 text-emerald-400" />}
            isLocked={config.lock_positions}
            layoutMode="independent"
            onToggleLock={handleToggleLock}
            onOpenSettings={handleOpenSettings}
            className="w-full"
          >
            <SpotifyWidget className="border-0 shadow-none bg-transparent p-0" />
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
            <WeatherWidget className="border-0 shadow-none bg-transparent p-0" />
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
          <div className="p-6 rounded-2xl border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] backdrop-blur-xl max-w-sm w-full flex flex-col items-center gap-3 shadow-xl">
            <AlertCircle className="w-8 h-8 text-[var(--fluent-error)]" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Something went wrong</h2>
              <p className="text-xs text-[var(--fluent-text-secondary)] line-clamp-3">
                {this.state.error?.message || "An unexpected error occurred in Widgetz."}
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
