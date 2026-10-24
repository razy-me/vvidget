import { useState, useCallback, useEffect, type FC } from "react";
import { Badge, Card } from "@/components/ui";
import { useConfig } from "@/hooks/useConfig";
import { WidgetToggleList } from "@/pages/settings/WidgetToggleList";
import { DEFAULT_CONFIG } from "@/types/config";
import { WIDGET_REGISTRY, type WidgetId } from "@/widgets/registry";
import {
  AppWindow,
  CloudSun,
  Cpu,
  FolderOpen,
  Info,
  Lock,
  Magnet,
  Monitor,
  Moon,
  Power,
  RotateCcw,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";

type SettingsTab = "general" | "widgets" | "weather" | "resources" | "about";

export const SettingsModal: FC = () => {
  const {
    config,
    isLoading,
    error,
    updateConfig,
    setWidgetsLocked,
    setLayoutMode,
    setTheme,
    setAutostart,
    reloadConfig,
  } = useConfig();

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [cityInput, setCityInput] = useState<string>(config.weather_settings.manual_city ?? "");
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Range slider local states to prevent high-frequency unthrottled IPC loops during drag
  const [localWeatherMinutes, setLocalWeatherMinutes] = useState<number>(
    config.polling_rates.weather_minutes,
  );
  const [localCpuRamMs, setLocalCpuRamMs] = useState<number>(
    config.polling_rates.resources_cpu_ram_ms,
  );
  const [localDiskMs, setLocalDiskMs] = useState<number>(
    config.polling_rates.resources_disk_ms,
  );

  // Synchronize cityInput whenever configuration loads or changes
  useEffect(() => {
    setCityInput(config.weather_settings.manual_city ?? "");
  }, [config.weather_settings.manual_city]);

  // Synchronize slider local states with backend configuration
  useEffect(() => {
    setLocalWeatherMinutes(config.polling_rates.weather_minutes);
  }, [config.polling_rates.weather_minutes]);

  useEffect(() => {
    setLocalCpuRamMs(config.polling_rates.resources_cpu_ram_ms);
  }, [config.polling_rates.resources_cpu_ram_ms]);

  useEffect(() => {
    setLocalDiskMs(config.polling_rates.resources_disk_ms);
  }, [config.polling_rates.resources_disk_ms]);

  const handleClose = useCallback(async () => {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const current = getCurrentWebviewWindow();
      await current.destroy();
    } catch {
      // In web browser preview or test environment
      if (typeof window !== "undefined") {
        window.close();
      }
    }
  }, []);

  const handleOpenLogs = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_logs_folder");
    } catch {
      console.info("Opening logs directory...");
    }
  }, []);

  const handleResetDefaults = useCallback(async () => {
    if (window.confirm("Are you sure you want to restore default settings?")) {
      await updateConfig(() => DEFAULT_CONFIG, true);
      setCityInput("");
      showFeedback();
    }
  }, [updateConfig]);

  const handleResetWidgetPlacement = useCallback(
    (widgetId: string) => {
      const meta = WIDGET_REGISTRY[widgetId as WidgetId];
      if (!meta) return;

      void updateConfig((prev) => {
        const existing = prev.widgets[widgetId];
        return {
          ...prev,
          widgets: {
            ...prev.widgets,
            [widgetId]: {
              id: widgetId,
              visible: existing ? existing.visible : true,
              logical_x: 40,
              logical_y: widgetId === "resources" ? 40 : widgetId === "spotify" ? 240 : 400,
              logical_width: meta.defaultWidth,
              logical_height: meta.defaultHeight,
              scale_factor: 1,
              monitor_id: null,
            },
          },
        };
      }, true);
      showFeedback();
    },
    [updateConfig],
  );

  const showFeedback = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleCitySearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void updateConfig((prev) => ({
      ...prev,
      weather_settings: {
        ...prev.weather_settings,
        use_windows_location: false,
        manual_city: cityInput.trim() ? cityInput.trim() : null,
      },
    }), true);
    showFeedback();
  };

  return (
    <div
      className="min-h-screen bg-[var(--fluent-acrylic-bg)] text-[var(--fluent-text-primary)] flex flex-col font-sans select-none"
      data-testid="settings-modal"
    >
      {/* Fluent Window Title Bar */}
      <header className="h-10 px-4 border-b border-[var(--fluent-stroke)] flex items-center justify-between shrink-0 bg-[var(--fluent-card-bg)]">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[var(--fluent-accent)]" />
          <span className="text-xs font-semibold tracking-wide">Widgetz — Desktop Preferences</span>
        </div>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <Badge size="sm" variant="success" className="animate-fade-in">
              Saved
            </Badge>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-red-500/20 hover:text-red-400 transition-colors"
            aria-label="Close Settings"
            data-testid="close-settings-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area: Sidebar Navigation + Tab Pane */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-44 border-r border-[var(--fluent-stroke)] p-3 space-y-1 bg-black/10 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              activeTab === "general"
                ? "bg-[var(--fluent-control-active)] text-[var(--fluent-accent)]"
                : "text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-control-bg)] hover:text-[var(--fluent-text-primary)]"
            }`}
          >
            <Monitor className="w-4 h-4 shrink-0" />
            <span>General</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("widgets")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              activeTab === "widgets"
                ? "bg-[var(--fluent-control-active)] text-[var(--fluent-accent)]"
                : "text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-control-bg)] hover:text-[var(--fluent-text-primary)]"
            }`}
          >
            <AppWindow className="w-4 h-4 shrink-0" />
            <span>Widgets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("weather")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              activeTab === "weather"
                ? "bg-[var(--fluent-control-active)] text-[var(--fluent-accent)]"
                : "text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-control-bg)] hover:text-[var(--fluent-text-primary)]"
            }`}
          >
            <CloudSun className="w-4 h-4 shrink-0" />
            <span>Weather</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("resources")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              activeTab === "resources"
                ? "bg-[var(--fluent-control-active)] text-[var(--fluent-accent)]"
                : "text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-control-bg)] hover:text-[var(--fluent-text-primary)]"
            }`}
          >
            <Cpu className="w-4 h-4 shrink-0" />
            <span>Resources</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("about")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
              activeTab === "about"
                ? "bg-[var(--fluent-control-active)] text-[var(--fluent-accent)]"
                : "text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-control-bg)] hover:text-[var(--fluent-text-primary)]"
            }`}
          >
            <Info className="w-4 h-4 shrink-0" />
            <span>About</span>
          </button>
        </aside>

        {/* Tab Body */}
        <main className="flex-1 p-5 overflow-y-auto space-y-4">
          {error && (
            <Card variant="solid" className="p-3 bg-red-500/10 border-red-500/30 text-red-400 text-xs flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void reloadConfig()}
                className="underline hover:text-white"
              >
                Retry
              </button>
            </Card>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-xs text-[var(--fluent-text-secondary)]">
              Loading preferences...
            </div>
          ) : (
            <>
              {/* TAB: GENERAL */}
              {activeTab === "general" && (
                <div className="space-y-4" data-testid="tab-general">
                  <h3 className="text-sm font-semibold text-[var(--fluent-text-primary)]">
                    System & Layout Behavior
                  </h3>

                  {/* Autostart Toggle */}
                  <Card variant="subtle" className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Power className="w-5 h-5 text-[var(--fluent-accent)]" />
                      <div>
                        <div className="text-xs font-semibold">Start with Windows</div>
                        <div className="text-[11px] text-[var(--fluent-text-secondary)]">
                          Automatically launch Widgetz in background upon system startup
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={config.auto_start}
                        onChange={(e) => void setAutostart(e.target.checked)}
                        aria-label="Toggle Start with Windows"
                      />
                      <div className="w-11 h-6 bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--fluent-accent)]"></div>
                    </label>
                  </Card>

                  {/* Lock Widget Positions */}
                  <Card variant="subtle" className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Lock className="w-5 h-5 text-[var(--fluent-accent)]" />
                      <div>
                        <div className="text-xs font-semibold">Lock Widget Positions</div>
                        <div className="text-[11px] text-[var(--fluent-text-secondary)]">
                          Prevent accidental dragging or moving of widgets on desktop
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={config.lock_positions}
                        onChange={(e) => void setWidgetsLocked(e.target.checked)}
                        aria-label="Toggle Lock Widget Positions"
                      />
                      <div className="w-11 h-6 bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--fluent-accent)]"></div>
                    </label>
                  </Card>

                  {/* Magnetic Snapping */}
                  <Card variant="subtle" className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Magnet className="w-5 h-5 text-[var(--fluent-accent)]" />
                      <div>
                        <div className="text-xs font-semibold">Magnetic Edge Snapping</div>
                        <div className="text-[11px] text-[var(--fluent-text-secondary)]">
                          Snap widgets smoothly to screen boundaries and adjacent widgets
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={config.snap_to_edges}
                        onChange={(e) =>
                          void updateConfig((prev) => ({
                            ...prev,
                            snap_to_edges: e.target.checked,
                          }), true)
                        }
                        aria-label="Toggle Magnetic Snapping"
                      />
                      <div className="w-11 h-6 bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--fluent-accent)]"></div>
                    </label>
                  </Card>

                  {/* Layout Mode Selection */}
                  <Card variant="subtle" className="p-3 space-y-2">
                    <div className="text-xs font-semibold">Desktop Presentation Mode</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void setLayoutMode("independent")}
                        className={`p-2.5 rounded-lg border text-left transition-colors ${
                          config.layout_mode === "independent"
                            ? "border-[var(--fluent-accent)] bg-[var(--fluent-accent)]/10"
                            : "border-[var(--fluent-stroke)] hover:bg-[var(--fluent-control-bg)]"
                        }`}
                      >
                        <div className="text-xs font-semibold">Independent Windows</div>
                        <div className="text-[11px] text-[var(--fluent-text-secondary)]">
                          Position widgets freely anywhere on multi-monitor canvas
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => void setLayoutMode("docked")}
                        className={`p-2.5 rounded-lg border text-left transition-colors ${
                          config.layout_mode === "docked"
                            ? "border-[var(--fluent-accent)] bg-[var(--fluent-accent)]/10"
                            : "border-[var(--fluent-stroke)] hover:bg-[var(--fluent-control-bg)]"
                        }`}
                      >
                        <div className="text-xs font-semibold">Docked Stack</div>
                        <div className="text-[11px] text-[var(--fluent-text-secondary)]">
                          Unified single-window stack for ultra-low RAM footprint (&lt;90MB)
                        </div>
                      </button>
                    </div>
                  </Card>

                  {/* Theme Selector */}
                  <Card variant="subtle" className="p-3 space-y-2">
                    <div className="text-xs font-semibold">Appearance & Fluent Theme</div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => void setTheme("auto")}
                        className={`p-2 rounded-lg border text-center text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                          config.theme === "auto"
                            ? "border-[var(--fluent-accent)] bg-[var(--fluent-accent)]/10 text-[var(--fluent-accent)]"
                            : "border-[var(--fluent-stroke)] hover:bg-[var(--fluent-control-bg)]"
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>System Auto</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void setTheme("light")}
                        className={`p-2 rounded-lg border text-center text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                          config.theme === "light"
                            ? "border-[var(--fluent-accent)] bg-[var(--fluent-accent)]/10 text-[var(--fluent-accent)]"
                            : "border-[var(--fluent-stroke)] hover:bg-[var(--fluent-control-bg)]"
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        <span>Light</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void setTheme("dark")}
                        className={`p-2 rounded-lg border text-center text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                          config.theme === "dark"
                            ? "border-[var(--fluent-accent)] bg-[var(--fluent-accent)]/10 text-[var(--fluent-accent)]"
                            : "border-[var(--fluent-stroke)] hover:bg-[var(--fluent-control-bg)]"
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        <span>Dark</span>
                      </button>
                    </div>
                  </Card>
                </div>
              )}

              {/* TAB: WIDGETS */}
              {activeTab === "widgets" && (
                <div className="space-y-4" data-testid="tab-widgets">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--fluent-text-primary)]">
                      Active Starter Widgets
                    </h3>
                    <span className="text-xs text-[var(--fluent-text-secondary)]">
                      Toggle to display or hide widgets on desktop
                    </span>
                  </div>

                  <WidgetToggleList
                    config={config}
                    onToggleVisibility={(widgetId, visible) => {
                      void updateConfig((prev) => {
                        const existing = prev.widgets[widgetId];
                        return {
                          ...prev,
                          widgets: {
                            ...prev.widgets,
                            [widgetId]: {
                              id: widgetId,
                              visible,
                              logical_x: existing ? existing.logical_x : 40,
                              logical_y: existing ? existing.logical_y : 40,
                              logical_width: existing ? existing.logical_width : 320,
                              logical_height: existing ? existing.logical_height : 180,
                              scale_factor: existing ? existing.scale_factor : 1,
                              monitor_id: existing ? existing.monitor_id : null,
                            },
                          },
                        };
                      }, true);
                      showFeedback();
                    }}
                    onResetWidgetPlacement={handleResetWidgetPlacement}
                  />
                </div>
              )}

              {/* TAB: WEATHER */}
              {activeTab === "weather" && (
                <div className="space-y-4" data-testid="tab-weather">
                  <h3 className="text-sm font-semibold text-[var(--fluent-text-primary)]">
                    Weather Location & Query Settings
                  </h3>

                  <Card variant="subtle" className="p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold">Windows Geolocation Service</div>
                      <div className="text-[11px] text-[var(--fluent-text-secondary)]">
                        Query device location via native Windows.Devices.Geolocation (zero network API)
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={config.weather_settings.use_windows_location}
                        onChange={(e) => {
                          const useWindows = e.target.checked;
                          void updateConfig((prev) => ({
                            ...prev,
                            weather_settings: {
                              ...prev.weather_settings,
                              use_windows_location: useWindows,
                            },
                          }), true);
                          showFeedback();
                        }}
                        aria-label="Toggle Windows Location"
                      />
                      <div className="w-11 h-6 bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--fluent-accent)]"></div>
                    </label>
                  </Card>

                  {/* Manual City Search - Focusable input */}
                  <Card variant="subtle" className="p-3 space-y-2">
                    <div className="text-xs font-semibold">Manual City Search (Open-Meteo)</div>
                    <div className="text-[11px] text-[var(--fluent-text-secondary)]">
                      Type a city name to override Windows location
                    </div>
                    <form onSubmit={handleCitySearchSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={cityInput}
                        onChange={(e) => setCityInput(e.target.value)}
                        placeholder="e.g. Berlin, New York, Tokyo..."
                        className="flex-1 bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)] rounded-lg px-3 py-1.5 text-xs text-[var(--fluent-text-primary)] placeholder-[var(--fluent-text-secondary)] focus:outline-none focus:border-[var(--fluent-accent)] transition-colors"
                        data-testid="city-input"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-[var(--fluent-accent)] text-white text-xs font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                        data-testid="city-submit-btn"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Set</span>
                      </button>
                    </form>
                    {config.weather_settings.manual_city && (
                      <div className="text-[11px] text-[var(--fluent-accent)] flex items-center gap-1">
                        <span>Current configured city:</span>
                        <strong>{config.weather_settings.manual_city}</strong>
                      </div>
                    )}
                  </Card>

                  {/* Refresh Rate Slider */}
                  <Card variant="subtle" className="p-3 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold">Forecast Query Interval</span>
                      <span className="text-[var(--fluent-accent)] font-semibold">
                        {localWeatherMinutes} minutes
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={120}
                      step={5}
                      value={localWeatherMinutes}
                      onChange={(e) => setLocalWeatherMinutes(Number(e.target.value))}
                      onPointerUp={() => {
                        void updateConfig((prev) => ({
                          ...prev,
                          polling_rates: {
                            ...prev.polling_rates,
                            weather_minutes: localWeatherMinutes,
                          },
                        }));
                        showFeedback();
                      }}
                      onKeyUp={() => {
                        void updateConfig((prev) => ({
                          ...prev,
                          polling_rates: {
                            ...prev.polling_rates,
                            weather_minutes: localWeatherMinutes,
                          },
                        }));
                        showFeedback();
                      }}
                      className="w-full accent-[var(--fluent-accent)] cursor-pointer"
                      aria-label="Forecast Query Interval"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--fluent-text-secondary)]">
                      <span>10 min (fast)</span>
                      <span>30 min (default)</span>
                      <span>120 min (low bandwidth)</span>
                    </div>
                  </Card>
                </div>
              )}

              {/* TAB: RESOURCES */}
              {activeTab === "resources" && (
                <div className="space-y-4" data-testid="tab-resources">
                  <h3 className="text-sm font-semibold text-[var(--fluent-text-primary)]">
                    Hardware Collector Polling Rates
                  </h3>

                  <Card variant="subtle" className="p-3 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold">CPU & RAM Refresh Interval</span>
                      <span className="text-[var(--fluent-accent)] font-semibold">
                        {(localCpuRamMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={5000}
                      step={250}
                      value={localCpuRamMs}
                      onChange={(e) => setLocalCpuRamMs(Number(e.target.value))}
                      onPointerUp={() => {
                        void updateConfig((prev) => ({
                          ...prev,
                          polling_rates: {
                            ...prev.polling_rates,
                            resources_cpu_ram_ms: localCpuRamMs,
                          },
                        }));
                        showFeedback();
                      }}
                      onKeyUp={() => {
                        void updateConfig((prev) => ({
                          ...prev,
                          polling_rates: {
                            ...prev.polling_rates,
                            resources_cpu_ram_ms: localCpuRamMs,
                          },
                        }));
                        showFeedback();
                      }}
                      className="w-full accent-[var(--fluent-accent)] cursor-pointer"
                      aria-label="CPU & RAM Refresh Interval"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--fluent-text-secondary)]">
                      <span>0.5s (responsive)</span>
                      <span>1.5s (standard)</span>
                      <span>5.0s (power saver)</span>
                    </div>
                  </Card>

                  <Card variant="subtle" className="p-3 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold">Storage / Disk Refresh Interval</span>
                      <span className="text-[var(--fluent-accent)] font-semibold">
                        {(localDiskMs / 1000).toFixed(0)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5000}
                      max={60000}
                      step={5000}
                      value={localDiskMs}
                      onChange={(e) => setLocalDiskMs(Number(e.target.value))}
                      onPointerUp={() => {
                        void updateConfig((prev) => ({
                          ...prev,
                          polling_rates: {
                            ...prev.polling_rates,
                            resources_disk_ms: localDiskMs,
                          },
                        }));
                        showFeedback();
                      }}
                      onKeyUp={() => {
                        void updateConfig((prev) => ({
                          ...prev,
                          polling_rates: {
                            ...prev.polling_rates,
                            resources_disk_ms: localDiskMs,
                          },
                        }));
                        showFeedback();
                      }}
                      className="w-full accent-[var(--fluent-accent)] cursor-pointer"
                      aria-label="Disk Refresh Interval"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--fluent-text-secondary)]">
                      <span>5s</span>
                      <span>15s (default)</span>
                      <span>60s</span>
                    </div>
                  </Card>
                </div>
              )}

              {/* TAB: ABOUT & DIAGNOSTICS */}
              {activeTab === "about" && (
                <div className="space-y-4" data-testid="tab-about">
                  <h3 className="text-sm font-semibold text-[var(--fluent-text-primary)]">
                    Diagnostics & Application Info
                  </h3>

                  <Card variant="subtle" className="p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--fluent-text-secondary)]">Application</span>
                      <span className="font-semibold">Widgetz Desktop</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--fluent-text-secondary)]">Architecture</span>
                      <span className="font-semibold">Tauri v2 + Evergreen WebView2</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--fluent-text-secondary)]">Styling</span>
                      <span className="font-semibold">Windows 11 Fluent Design (Acrylic)</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--fluent-text-secondary)]">Config Path</span>
                      <span className="font-mono text-[10px] text-[var(--fluent-text-secondary)]">
                        %APPDATA%/Widgetz/config.json
                      </span>
                    </div>
                  </Card>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => void handleOpenLogs()}
                      className="p-3 rounded-xl border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-control-bg)] transition-colors flex items-center justify-center gap-2 text-xs font-semibold text-[var(--fluent-text-primary)]"
                    >
                      <FolderOpen className="w-4 h-4 text-[var(--fluent-accent)]" />
                      <span>Open Logs Folder</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleResetDefaults()}
                      className="p-3 rounded-xl border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-red-500/10 hover:border-red-500/30 text-red-400 transition-colors flex items-center justify-center gap-2 text-xs font-semibold"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reset Defaults</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default SettingsModal;
