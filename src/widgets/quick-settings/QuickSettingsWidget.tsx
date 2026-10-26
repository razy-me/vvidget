import { useState, useMemo, useCallback } from "react";
import type { FC, KeyboardEvent } from "react";
import {
  Volume2,
  Bluetooth,
  Monitor,
  Moon,
  Wifi,
  Zap,
  Activity,
  Trash2,
  ExternalLink,
  Pencil,
  Check,
  X,
  Plus,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useConfig } from "@/hooks/useConfig";
import type { QuickSettingsInstance } from "@/types/config";
import { cn } from "@/utils/cn";

export interface QuickSettingsWidgetProps {
  /** Identifier of this widget instance. Defaults to "quick_settings". */
  instanceId?: string;
  className?: string;
}

export interface ActionDefinition {
  id: string;
  label: string;
  description: string;
  icon: typeof Volume2;
  colorClass: string;
}

export const PREDEFINED_ACTIONS: ActionDefinition[] = [
  {
    id: "sound",
    label: "Sound",
    description: "ms-settings:sound",
    icon: Volume2,
    colorClass: "text-sky-400",
  },
  {
    id: "bluetooth",
    label: "Bluetooth",
    description: "ms-settings:bluetooth",
    icon: Bluetooth,
    colorClass: "text-blue-400",
  },
  {
    id: "display",
    label: "Display",
    description: "ms-settings:display",
    icon: Monitor,
    colorClass: "text-indigo-400",
  },
  {
    id: "nightlight",
    label: "Night Light",
    description: "ms-settings:nightlight",
    icon: Moon,
    colorClass: "text-amber-300",
  },
  {
    id: "network",
    label: "Network",
    description: "ms-settings:network",
    icon: Wifi,
    colorClass: "text-emerald-400",
  },
  {
    id: "powersleep",
    label: "Energy",
    description: "ms-settings:powersleep",
    icon: Zap,
    colorClass: "text-amber-400",
  },
  {
    id: "taskmanager",
    label: "Task Manager",
    description: "taskmgr.exe",
    icon: Activity,
    colorClass: "text-rose-400",
  },
  {
    id: "recyclebin",
    label: "Recycle Bin",
    description: "shell:RecycleBinFolder",
    icon: Trash2,
    colorClass: "text-teal-400",
  },
];

export const DEFAULT_PINNED_ACTIONS = [
  "sound",
  "bluetooth",
  "display",
  "nightlight",
  "network",
  "powersleep",
  "taskmanager",
  "recyclebin",
];

export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
  instanceId = "quick_settings",
  className,
}) => {
  const { config, updateConfig } = useConfig();

  // Load instance configuration from config
  const instanceConfig = useMemo<QuickSettingsInstance>(() => {
    return (
      config.quick_settings_instances?.[instanceId] ?? {
        id: instanceId,
        title: "Quick Settings",
        pinned_actions: DEFAULT_PINNED_ACTIONS,
      }
    );
  }, [config.quick_settings_instances, instanceId]);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(instanceConfig.title);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [activeFeedback, setActiveFeedback] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");

  const pinnedActionIds = useMemo(() => {
    return instanceConfig.pinned_actions && instanceConfig.pinned_actions.length > 0
      ? instanceConfig.pinned_actions
      : DEFAULT_PINNED_ACTIONS;
  }, [instanceConfig.pinned_actions]);

  // Persists updated instance configuration both locally and to backend IPC
  const saveInstance = useCallback(
    async (updated: QuickSettingsInstance) => {
      await updateConfig((prev) => ({
        ...prev,
        quick_settings_instances: {
          ...prev.quick_settings_instances,
          [instanceId]: updated,
        },
      }));

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("update_quick_settings_instance", { instance: updated });
      } catch {
        // Safe fallback in web or test environment
      }
    },
    [instanceId, updateConfig],
  );

  // Handle inline title editing
  const handleSaveTitle = async () => {
    const trimmed = editedTitle.trim() || "Quick Settings";
    setEditedTitle(trimmed);
    setIsEditingTitle(false);
    await saveInstance({
      ...instanceConfig,
      title: trimmed,
      pinned_actions: pinnedActionIds,
    });
  };

  const handleCancelTitleEdit = () => {
    setEditedTitle(instanceConfig.title);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void handleSaveTitle();
    } else if (e.key === "Escape") {
      handleCancelTitleEdit();
    }
  };

  // Duplicate widget trigger
  const handleDuplicate = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("duplicate_quick_settings_widget", {
        sourceId: instanceId,
        source_id: instanceId,
      });
    } catch {
      // Safe fallback in web/test environment
    }
  };

  // Execute quick action trigger
  const handleActionClick = async (actionId: string) => {
    setActiveFeedback(actionId);

    try {
      let realAction = actionId;
      let customTarget: string | undefined = undefined;

      if (actionId.startsWith("custom:")) {
        realAction = "custom";
        customTarget = actionId.slice("custom:".length);
      } else if (actionId === "custom") {
        realAction = "custom";
        customTarget = "https://github.com";
      }

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("execute_quick_action", {
        actionId: realAction,
        action_id: realAction,
        customTarget,
        custom_target: customTarget,
      });
    } catch {
      // Safe fallback in web/test environment
    } finally {
      setTimeout(() => {
        setActiveFeedback((prev) => (prev === actionId ? null : prev));
      }, 700);
    }
  };

  // Toggle action visibility in customization dialog
  const handleToggleAction = async (id: string) => {
    const isPinned = pinnedActionIds.includes(id);
    const updatedPinned = isPinned
      ? pinnedActionIds.filter((item) => item !== id)
      : [...pinnedActionIds, id];

    await saveInstance({
      ...instanceConfig,
      pinned_actions: updatedPinned,
    });
  };

  // Reorder action up
  const handleMoveActionUp = async (index: number) => {
    if (index <= 0) return;
    const updated = [...pinnedActionIds];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    await saveInstance({
      ...instanceConfig,
      pinned_actions: updated,
    });
  };

  // Reorder action down
  const handleMoveActionDown = async (index: number) => {
    if (index >= pinnedActionIds.length - 1) return;
    const updated = [...pinnedActionIds];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    await saveInstance({
      ...instanceConfig,
      pinned_actions: updated,
    });
  };

  // Add custom URL / path action
  const handleAddCustomAction = async () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    const customId = `custom:${trimmed}`;
    if (!pinnedActionIds.includes(customId)) {
      const updated = [...pinnedActionIds, customId];
      await saveInstance({
        ...instanceConfig,
        pinned_actions: updated,
      });
    }
    setCustomInput("");
  };

  // Lookup action metadata (or synthesize for custom actions)
  const resolveActionDef = (id: string): ActionDefinition => {
    const predefined = PREDEFINED_ACTIONS.find((a) => a.id === id);
    if (predefined) return predefined;

    if (id.startsWith("custom:")) {
      const target = id.slice("custom:".length);
      return {
        id,
        label: target.replace(/^https?:\/\//, "").slice(0, 16),
        description: target,
        icon: ExternalLink,
        colorClass: "text-purple-400",
      };
    }

    return {
      id,
      label: id,
      description: "Custom Action",
      icon: ExternalLink,
      colorClass: "text-purple-400",
    };
  };

  return (
    <Card
      variant="acrylic"
      className={cn(
        "w-full h-full p-2.5 flex flex-col justify-between text-[var(--fluent-text-primary)] select-none overflow-hidden",
        className,
      )}
      data-testid="quick-settings-widget"
    >
      {/* Header with Title Editing + Duplicate Button */}
      <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-[var(--fluent-stroke)]/60">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-1 w-full max-w-[190px]">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                autoFocus
                className="w-full text-xs font-semibold px-1.5 py-0.5 rounded bg-[var(--fluent-card-bg)] border border-[var(--fluent-accent)] text-[var(--fluent-text-primary)] outline-none"
                data-testid="edit-title-input"
                aria-label="Edit title input"
              />
              <button
                type="button"
                onClick={() => void handleSaveTitle()}
                className="p-1 rounded hover:bg-[var(--fluent-card-hover)] text-emerald-400"
                aria-label="Save title"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCancelTitleEdit}
                className="p-1 rounded hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-secondary)]"
                aria-label="Cancel title edit"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <span
                className="text-xs font-semibold tracking-wide truncate max-w-[140px]"
                title={instanceConfig.title}
                data-testid="instance-title"
              >
                {instanceConfig.title}
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditedTitle(instanceConfig.title);
                  setIsEditingTitle(true);
                }}
                className="p-1 rounded hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] transition-colors"
                aria-label="Edit title"
                data-testid="edit-title-btn"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleDuplicate()}
            className="px-2 py-0.5 rounded-md bg-[var(--fluent-card-bg)]/80 hover:bg-[var(--fluent-card-hover)] border border-[var(--fluent-stroke)] text-[11px] font-medium flex items-center gap-1 transition-all active:scale-95"
            aria-label="Duplicate quick settings widget"
            data-testid="duplicate-widget-btn"
          >
            <Plus className="w-3 h-3 text-[var(--fluent-accent)]" />
            <span>+ Duplizieren</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCustomizing((prev) => !prev)}
            className={cn(
              "p-1 rounded-md border border-[var(--fluent-stroke)] transition-colors",
              isCustomizing
                ? "bg-[var(--fluent-accent)] text-black"
                : "bg-[var(--fluent-card-bg)]/80 hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]",
            )}
            aria-label="Customize tiles"
            data-testid="customize-tiles-btn"
            title="Kacheln anpassen"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content: Tiles Grid or Customization View */}
      {isCustomizing ? (
        <div
          className="flex-1 flex flex-col gap-2 pt-2 overflow-y-auto max-h-[195px] pr-0.5"
          data-testid="customization-dialog"
        >
          <div className="flex items-center justify-between text-[11px] text-[var(--fluent-text-secondary)] pb-1 border-b border-[var(--fluent-stroke)]/40">
            <span>Aktionen konfigurieren ({pinnedActionIds.length} aktiv)</span>
            <button
              type="button"
              onClick={() => setIsCustomizing(false)}
              className="text-xs text-[var(--fluent-accent)] hover:underline font-medium"
            >
              Fertig
            </button>
          </div>

          {/* List of predefined actions with toggle and reordering */}
          <div className="flex flex-col gap-1">
            {Array.from(new Set([...PREDEFINED_ACTIONS.map((a) => a.id), ...pinnedActionIds])).map((actionId) => {
              const action = resolveActionDef(actionId);
              const isPinned = pinnedActionIds.includes(action.id);
              const pinnedIndex = pinnedActionIds.indexOf(action.id);
              const ActionIcon = action.icon;

              return (
                <div
                  key={action.id}
                  className="flex items-center justify-between p-1.5 rounded-lg bg-[var(--fluent-card-bg)]/50 border border-[var(--fluent-stroke)]/50 text-xs"
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isPinned}
                      onChange={() => void handleToggleAction(action.id)}
                      className="rounded accent-[var(--fluent-accent)] cursor-pointer"
                      data-testid={`toggle-action-${action.id}`}
                    />
                    <ActionIcon className={cn("w-3.5 h-3.5 shrink-0", action.colorClass)} />
                    <span className="truncate font-medium">{action.label}</span>
                  </label>

                  {isPinned && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleMoveActionUp(pinnedIndex)}
                        disabled={pinnedIndex === 0}
                        className="p-0.5 rounded hover:bg-[var(--fluent-card-hover)] disabled:opacity-25"
                        aria-label={`Move ${action.label} up`}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMoveActionDown(pinnedIndex)}
                        disabled={pinnedIndex === pinnedActionIds.length - 1}
                        className="p-0.5 rounded hover:bg-[var(--fluent-card-hover)] disabled:opacity-25"
                        aria-label={`Move ${action.label} down`}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom Action Input */}
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-[var(--fluent-stroke)]/40">
            <input
              type="text"
              placeholder="Eigener Pfad / URL (z.B. https://...)"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddCustomAction();
              }}
              className="flex-1 text-[11px] px-2 py-1 rounded bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] text-[var(--fluent-text-primary)] placeholder:text-[var(--fluent-text-secondary)]/60 outline-none focus:border-[var(--fluent-accent)]"
              data-testid="custom-action-input"
            />
            <button
              type="button"
              onClick={() => void handleAddCustomAction()}
              className="px-2 py-1 rounded bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] text-[11px] font-medium hover:bg-[var(--fluent-card-hover)] shrink-0"
              data-testid="add-custom-action-btn"
            >
              + Hinzufügen
            </button>
          </div>
        </div>
      ) : (
        /* Standard Tiles Grid: 2x4 responsive grid */
        <div
          className="grid grid-cols-2 gap-1.5 pt-2 flex-1 overflow-y-auto max-h-[200px] pr-0.5"
          data-testid="tiles-grid"
        >
          {pinnedActionIds.map((actionId) => {
            const def = resolveActionDef(actionId);
            const Icon = def.icon;
            const isActive = activeFeedback === actionId;

            return (
              <button
                key={actionId}
                type="button"
                onClick={() => void handleActionClick(actionId)}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-xl border border-[var(--fluent-stroke)]/70 transition-all duration-150 text-left group overflow-hidden select-none active:scale-[0.97]",
                  isActive
                    ? "bg-[var(--fluent-accent)]/20 border-[var(--fluent-accent)] shadow-sm"
                    : "bg-[var(--fluent-card-bg)]/60 hover:bg-[var(--fluent-card-hover)]",
                )}
                aria-label={def.label}
                data-testid={`action-tile-${actionId}`}
                data-active={isActive ? "true" : "false"}
              >
                <div
                  className={cn(
                    "p-1.5 rounded-lg bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)]/50 shrink-0 transition-transform group-hover:scale-105",
                    isActive && "border-[var(--fluent-accent)]",
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5", def.colorClass)} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate tracking-tight text-[var(--fluent-text-primary)]">
                    {def.label}
                  </div>
                  <div className="text-[10px] text-[var(--fluent-text-secondary)] truncate">
                    {isActive ? (
                      <span className="text-[var(--fluent-accent)] font-medium flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 inline animate-spin" />
                        <span>Gestartet</span>
                      </span>
                    ) : (
                      def.description
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
};
