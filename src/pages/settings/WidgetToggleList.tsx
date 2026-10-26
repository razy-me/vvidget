import { useMemo, type FC } from "react";
import { Badge, Card } from "@/components/ui";
import { getAllWidgetMetadata, type WidgetId } from "@/widgets/registry";
import type { AppConfig, WidgetPlacement } from "@/types/config";
import {
  Cpu,
  Music,
  CloudSun,
  Gauge,
  Gamepad2,
  Sliders,
  Calendar,
  Clock,
  Bluetooth,
  Battery,
  RotateCcw,
  Copy,
  Trash2,
} from "lucide-react";

export interface WidgetToggleListProps {
  config: AppConfig;
  onToggleVisibility: (widgetId: string, visible: boolean) => void;
  onResetWidgetPlacement: (widgetId: string) => void;
  onDuplicateQuickSettings?: (sourceId?: string) => Promise<void> | void;
  onRemoveWidgetInstance?: (widgetId: string) => Promise<void> | void;
  disabled?: boolean;
}

const WIDGET_ICONS: Record<WidgetId, FC<{ className?: string }>> = {
  resources: Cpu,
  spotify: Music,
  weather: CloudSun,
  speedtest: Gauge,
  launcher: Gamepad2,
  quick_settings: Sliders,
  calendar: Calendar,
  clock: Clock,
  bluetooth: Bluetooth,
  battery: Battery,
};

export const WidgetToggleList: FC<WidgetToggleListProps> = ({
  config,
  onToggleVisibility,
  onResetWidgetPlacement,
  onDuplicateQuickSettings,
  onRemoveWidgetInstance,
  disabled = false,
}) => {
  const metadataList = getAllWidgetMetadata();

  const handleDuplicate = async (sourceId?: string) => {
    if (onDuplicateQuickSettings) {
      await onDuplicateQuickSettings(sourceId);
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("duplicate_quick_settings_widget", { sourceId });
    } catch (e) {
      console.error("Failed to duplicate quick settings widget:", e);
    }
  };

  const handleRemove = async (instanceId: string) => {
    if (onRemoveWidgetInstance) {
      await onRemoveWidgetInstance(instanceId);
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_widget_instance", { widgetId: instanceId });
    } catch (e) {
      console.error("Failed to remove widget instance:", e);
    }
  };

  const quickSettingsInstances = useMemo(() => {
    const map = new Map<string, { id: string; title: string; visible: boolean }>();
    if (config.widgets) {
      for (const [id, placement] of Object.entries(config.widgets)) {
        if (id === "quick_settings" || id.startsWith("quick_settings_")) {
          map.set(id, {
            id,
            title:
              config.quick_settings_instances?.[id]?.title ||
              (id === "quick_settings" ? "Quick Settings" : `Quick Settings (${id.replace("quick_settings_", "")})`),
            visible: placement.visible,
          });
        }
      }
    }
    if (config.quick_settings_instances) {
      for (const [id, inst] of Object.entries(config.quick_settings_instances)) {
        if (!map.has(id)) {
          map.set(id, {
            id,
            title: inst.title || id,
            visible: config.widgets?.[id]?.visible ?? true,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [config.widgets, config.quick_settings_instances]);

  return (
    <div className="space-y-3" data-testid="widget-toggle-list">
      {metadataList.map((meta) => {
        const placement: WidgetPlacement | undefined = config.widgets[meta.id];
        const isVisible = placement ? placement.visible : true;
        const IconComponent = WIDGET_ICONS[meta.id] ?? Cpu;

        return (
          <Card
            key={meta.id}
            variant="subtle"
            className="p-3 transition-colors hover:bg-[var(--fluent-card-bg)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)]">
                  <IconComponent className="w-5 h-5 text-[var(--fluent-accent)]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold truncate text-[var(--fluent-text-primary)]">
                      {meta.name}
                    </h4>
                    <Badge size="sm" variant="outline" className="capitalize text-[10px]">
                      {meta.category}
                    </Badge>
                    <Badge size="sm" variant={isVisible ? "accent" : "default"}>
                      {isVisible ? "Visible" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--fluent-text-secondary)] line-clamp-1">
                    {meta.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {meta.id === "quick_settings" && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void handleDuplicate("quick_settings")}
                    className="px-2.5 py-1 text-xs rounded-lg border border-[var(--fluent-stroke)] hover:bg-[var(--fluent-control-bg)] text-[var(--fluent-accent)] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    aria-label="Klonen / Duplizieren"
                    data-testid="clone-quick-settings-btn"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>+ Klonen / Duplizieren</span>
                  </button>
                )}

                <button
                  type="button"
                  title="Reset placement & bounds"
                  disabled={disabled}
                  onClick={() => onResetWidgetPlacement(meta.id)}
                  className="p-1.5 rounded-md text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-control-bg)] transition-colors disabled:opacity-50"
                  aria-label={`Reset ${meta.name} bounds`}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isVisible}
                    disabled={disabled}
                    onChange={(e) => onToggleVisibility(meta.id, e.target.checked)}
                    aria-label={`Toggle visibility of ${meta.name}`}
                  />
                  <div className="w-11 h-6 bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--fluent-accent)]"></div>
                </label>
              </div>
            </div>

            {placement && (
              <div className="mt-2 pt-2 border-t border-[var(--fluent-stroke)] flex items-center justify-between text-[11px] text-[var(--fluent-text-secondary)]">
                <span>
                  Bounds: {Math.round(placement.logical_width)} × {Math.round(placement.logical_height)} px
                </span>
                <span>
                  Pos: ({Math.round(placement.logical_x)}, {Math.round(placement.logical_y)})
                </span>
              </div>
            )}

            {/* If multiple quick_settings instances exist, list each instance with a delete/remove button */}
            {meta.id === "quick_settings" && quickSettingsInstances.length > 1 && (
              <div
                className="mt-3 pt-3 border-t border-[var(--fluent-stroke)] space-y-2"
                data-testid="quick-settings-instances-list"
              >
                <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)]">
                  Instanzen ({quickSettingsInstances.length})
                </div>
                {quickSettingsInstances.map((inst) => (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-[var(--fluent-control-bg)] border border-[var(--fluent-stroke)] text-xs"
                    data-testid={`instance-row-${inst.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-[var(--fluent-text-primary)] truncate">
                        {inst.title}
                      </span>
                      <span className="text-[10px] text-[var(--fluent-text-tertiary)] font-mono">
                        {inst.id}
                      </span>
                      <Badge size="sm" variant={inst.visible ? "accent" : "default"}>
                        {inst.visible ? "Visible" : "Hidden"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onResetWidgetPlacement(inst.id)}
                        className="p-1 rounded text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] transition-colors disabled:opacity-50"
                        aria-label={`Reset ${inst.title} bounds`}
                        title="Reset position"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={inst.visible}
                          disabled={disabled}
                          onChange={(e) => onToggleVisibility(inst.id, e.target.checked)}
                          aria-label={`Toggle visibility of ${inst.title}`}
                        />
                        <div className="w-9 h-5 bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--fluent-accent)]"></div>
                      </label>

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void handleRemove(inst.id)}
                        className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        aria-label={`Instanz ${inst.title} entfernen`}
                        title="Instanz entfernen"
                        data-testid={`remove-instance-${inst.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};
