import { type FC } from "react";
import { Badge, Card } from "@/components/ui";
import { getAllWidgetMetadata, type WidgetId } from "@/widgets/registry";
import type { AppConfig, WidgetPlacement } from "@/types/config";
import { Cpu, Music, CloudSun, RotateCcw } from "lucide-react";

interface WidgetToggleListProps {
  config: AppConfig;
  onToggleVisibility: (widgetId: string, visible: boolean) => void;
  onResetWidgetPlacement: (widgetId: string) => void;
  disabled?: boolean;
}

const WIDGET_ICONS: Record<WidgetId, FC<{ className?: string }>> = {
  resources: Cpu,
  spotify: Music,
  weather: CloudSun,
};

export const WidgetToggleList: FC<WidgetToggleListProps> = ({
  config,
  onToggleVisibility,
  onResetWidgetPlacement,
  disabled = false,
}) => {
  const metadataList = getAllWidgetMetadata();

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
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold truncate text-[var(--fluent-text-primary)]">
                      {meta.name}
                    </h4>
                    <Badge size="sm" variant={isVisible ? "accent" : "default"}>
                      {isVisible ? "Visible" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--fluent-text-secondary)] line-clamp-1">
                    {meta.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
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
          </Card>
        );
      })}
    </div>
  );
};
