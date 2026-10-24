import { useMemo } from "react";
import type { FC } from "react";
import { Card, ProgressBar, Badge } from "@/components/ui";
import { WIDGET_REGISTRY, getAllWidgetMetadata } from "@/widgets/registry";
import { SettingsModal } from "@/pages/settings";
import { Cpu, Music, CloudSun, ShieldCheck } from "lucide-react";

export const App: FC = () => {
  // Query param allows multi-window view (e.g. /?widget=resources or /?view=settings)
  const { widgetId, isSettingsView } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      widgetId: params.get("widget"),
      isSettingsView: params.get("view") === "settings" || params.get("widget") === "settings",
    };
  }, []);

  if (isSettingsView) {
    return <SettingsModal />;
  }

  const registeredWidgets = getAllWidgetMetadata();

  return (
    <main className="min-h-screen p-4 flex flex-col items-center justify-start text-[var(--fluent-text-primary)]">
      {widgetId && WIDGET_REGISTRY[widgetId as keyof typeof WIDGET_REGISTRY] ? (
        <Card variant="acrylic" className="w-full max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-sm font-semibold tracking-wide">
              {WIDGET_REGISTRY[widgetId as keyof typeof WIDGET_REGISTRY].name}
            </h1>
            <Badge variant="accent">Active</Badge>
          </div>
          <p className="text-xs text-[var(--fluent-text-secondary)]">
            {WIDGET_REGISTRY[widgetId as keyof typeof WIDGET_REGISTRY].description}
          </p>
        </Card>
      ) : (
        <div className="w-full max-w-sm flex flex-col gap-3">
          <Card variant="acrylic" className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[var(--fluent-accent)]" />
                <h1 className="text-sm font-semibold tracking-wide">Widgetz Desktop</h1>
              </div>
              <Badge variant="accent">Windows 11</Badge>
            </div>
            <p className="text-xs text-[var(--fluent-text-secondary)] mb-4">
              Native Fluent Design widget engine initialized.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-[var(--fluent-text-secondary)]">
                  <span>Engine Readiness</span>
                  <span>100%</span>
                </div>
                <ProgressBar value={100} variant="accent" />
              </div>
            </div>
          </Card>

          <Card variant="subtle" className="p-3">
            <h2 className="text-xs font-semibold text-[var(--fluent-text-secondary)] uppercase tracking-wider mb-2">
              Available Starter Widgets ({registeredWidgets.length})
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--fluent-card-bg)]">
                <div className="flex items-center gap-2 text-xs">
                  <CloudSun className="w-4 h-4 text-amber-400" />
                  <span>Weather</span>
                </div>
                <Badge size="sm" variant="default">Open-Meteo</Badge>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--fluent-card-bg)]">
                <div className="flex items-center gap-2 text-xs">
                  <Music className="w-4 h-4 text-emerald-400" />
                  <span>Spotify Controls</span>
                </div>
                <Badge size="sm" variant="default">GSMTC</Badge>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--fluent-card-bg)]">
                <div className="flex items-center gap-2 text-xs">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  <span>System Resources</span>
                </div>
                <Badge size="sm" variant="default">sysinfo</Badge>
              </div>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
};

export default App;
