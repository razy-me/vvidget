import type { FC } from "react";
import { useState } from "react";
import {
  Plus,
  Play,
  Search,
  Trash2,
  ExternalLink,
  RefreshCw,
  X,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useLauncher, type LauncherCategory } from "@/hooks/useLauncher";
import type { LauncherItem } from "@/types/config";
import { cn } from "@/utils/cn";

export interface GameLauncherWidgetProps {
  initialItems?: LauncherItem[];
  autoScan?: boolean;
  className?: string;
}

const CATEGORIES: LauncherCategory[] = ["Alle", "Steam", "Epic", "Eigene"];

export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
  initialItems,
  autoScan,
  className,
}) => {
  const {
    filteredItems,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    isLoading,
    error,
    scanGames,
    launchItem,
    addItem,
    removeItem,
  } = useLauncher({ initialItems, autoScan });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPathOrUri, setNewPathOrUri] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const handleLaunch = async (item: LauncherItem) => {
    setLaunchingId(item.id);
    try {
      await launchItem(item);
    } catch {
      // Error handled in hook / state
    } finally {
      setTimeout(() => setLaunchingId(null), 1000);
    }
  };

  const handleOpenAddModal = () => {
    setNewName("");
    setNewPathOrUri("");
    setModalError(null);
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setModalError(null);
  };

  const handleSaveCustomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const target = newPathOrUri.trim();

    if (!name) {
      setModalError("Bitte gib einen Namen ein.");
      return;
    }
    if (!target) {
      setModalError("Bitte gib einen Pfad oder eine URL ein.");
      return;
    }

    try {
      await addItem({
        name,
        path_or_uri: target,
        source: "custom",
      });
      handleCloseAddModal();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source.toLowerCase()) {
      case "steam":
        return (
          <Badge
            variant="accent"
            size="sm"
            className="bg-sky-500/15 text-sky-400 border-sky-500/20 px-1.5 py-0.5 text-[10px]"
          >
            Steam
          </Badge>
        );
      case "epic":
        return (
          <Badge
            variant="default"
            size="sm"
            className="bg-amber-500/15 text-amber-400 border-amber-500/20 px-1.5 py-0.5 text-[10px]"
          >
            Epic
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            size="sm"
            className="bg-purple-500/15 text-purple-300 border-purple-500/20 px-1.5 py-0.5 text-[10px]"
          >
            Eigene
          </Badge>
        );
    }
  };

  const getItemInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Card
      variant="acrylic"
      className={cn(
        "relative w-full h-full p-3.5 flex flex-col gap-3 text-[var(--fluent-text-primary)] select-none overflow-hidden",
        className
      )}
      data-testid="game-launcher-widget"
    >
      {/* Compact Search & Action Header: [ Suchen... ] [ + ] [ Refresh ] */}
      <div className="flex items-center gap-1.5 w-full">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fluent-text-tertiary)] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Suchen nach Spiel oder App..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] text-[var(--fluent-text-primary)] placeholder-[var(--fluent-text-tertiary)] focus:outline-none focus:border-[var(--fluent-accent)] transition-all"
            aria-label="Spiele durchsuchen"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-text-primary)]"
              aria-label="Suche zurücksetzen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={handleOpenAddModal}
          className="h-8 px-2.5 rounded-lg bg-[var(--fluent-accent)] text-black hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1 font-semibold text-xs shrink-0 shadow-sm"
          title="Spiel oder App hinzufügen"
          aria-label="Spiel oder App hinzufügen"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Hinzufügen</span>
        </button>

        <button
          onClick={() => void scanGames()}
          title="Spiele neu scannen"
          disabled={isLoading}
          className="h-8 w-8 rounded-lg border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] transition-colors flex items-center justify-center shrink-0"
          aria-label="Spiele neu scannen"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar" role="tablist">
        {CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-2.5 py-0.5 text-[11px] rounded-full transition-all font-medium whitespace-nowrap",
                isActive
                  ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                  : "bg-[var(--fluent-card-bg)] text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-card-hover)] hover:text-[var(--fluent-text-primary)]"
              )}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* General Error Banner if IPC error occurred */}
      {error && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Games & Apps Scrollable Grid / List */}
      <div
        className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 focus:outline-none"
        tabIndex={0}
        aria-label="Spieleliste"
      >
        {filteredItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-xs text-[var(--fluent-text-secondary)] gap-2">
            <Sparkles className="w-6 h-6 text-[var(--fluent-text-tertiary)]" />
            <p className="font-medium text-[var(--fluent-text-primary)]">
              {searchQuery
                ? "Keine Treffer für deine Suche"
                : "Keine installierten Spiele oder Apps gefunden"}
            </p>
            <p className="text-[11px] text-[var(--fluent-text-tertiary)] max-w-[240px]">
              {searchQuery
                ? "Überprüfe deinen Suchbegriff oder wechsle die Kategorie."
                : "Klicke oben auf 'Hinzufügen', um ein eigenes Spiel oder eine URL einzutragen."}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isLaunching = launchingId === item.id;
            return (
              <div
                key={item.id}
                data-testid={`launcher-item-${item.id}`}
                className="group relative flex items-center justify-between p-2 rounded-lg bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] transition-all duration-150"
              >
                {/* Left: Icon / Avatar + Title + Badge */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                  {item.icon_url && !failedImages[item.id] ? (
                    <img
                      src={item.icon_url}
                      alt={item.name}
                      className="w-8 h-8 rounded-md object-cover shadow-sm shrink-0 transition-transform group-hover:scale-105 border border-[var(--fluent-stroke-subtle)]"
                      onError={() => {
                        setFailedImages((prev) => ({ ...prev, [item.id]: true }));
                      }}
                    />
                  ) : (
                    <div
                      className={cn(
                        "w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0 shadow-sm transition-transform group-hover:scale-105",
                        item.source === "steam"
                          ? "bg-sky-500/20 text-sky-300"
                          : item.source === "epic"
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-purple-500/20 text-purple-300"
                      )}
                    >
                      {getItemInitials(item.name)}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className="text-xs font-medium text-[var(--fluent-text-primary)] truncate"
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {getSourceBadge(item.source)}
                    </div>
                  </div>
                </div>

                {/* Right: Actions (Delete for custom + 1-Click Launch Button) */}
                <div className="flex items-center gap-1 shrink-0">
                  {item.source === "custom" && (
                    <button
                      onClick={() => void removeItem(item.id)}
                      title="Eintrag entfernen"
                      className="p-1.5 rounded-md text-[var(--fluent-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={`${item.name} entfernen`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => void handleLaunch(item)}
                    disabled={isLaunching}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1 transition-all shadow-sm active:scale-95",
                      isLaunching
                        ? "bg-[var(--fluent-success)] text-black"
                        : "bg-[var(--fluent-accent-subtle)] text-[var(--fluent-accent)] group-hover:bg-[var(--fluent-accent)] group-hover:text-black"
                    )}
                    aria-label={`${item.name} starten`}
                  >
                    {isLaunching ? (
                      <span className="text-[10px] font-semibold">Startet...</span>
                    ) : (
                      <>
                        {item.path_or_uri.startsWith("http") ? (
                          <ExternalLink className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3 fill-current" />
                        )}
                        <span className="text-[11px]">Starten</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Custom Item Modal Dialog */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-game-modal-title"
          className="absolute inset-0 z-50 p-4 bg-black/60 backdrop-blur-md flex flex-col justify-center animate-in fade-in duration-150"
        >
          <div className="w-full bg-[var(--fluent-acrylic-bg)] border border-[var(--fluent-stroke)] rounded-xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 id="add-game-modal-title" className="text-xs font-semibold">
                Spiel oder App hinzufügen
              </h3>
              <button
                onClick={handleCloseAddModal}
                className="p-1 rounded-md text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomItem} className="flex flex-col gap-3">
              <div>
                <label htmlFor="custom-item-name" className="text-[11px] text-[var(--fluent-text-secondary)] block mb-1">
                  Name
                </label>
                <input
                  id="custom-item-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z.B. Cyberpunk 2077 oder Discord"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] text-[var(--fluent-text-primary)] focus:outline-none focus:border-[var(--fluent-accent)]"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="custom-item-target" className="text-[11px] text-[var(--fluent-text-secondary)] block mb-1">
                  Pfad (.exe) oder URL (https://)
                </label>
                <input
                  id="custom-item-target"
                  type="text"
                  value={newPathOrUri}
                  onChange={(e) => setNewPathOrUri(e.target.value)}
                  placeholder="z.B. C:\Games\App.exe oder https://play.geforcenow.com"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] text-[var(--fluent-text-primary)] focus:outline-none focus:border-[var(--fluent-accent)]"
                />
              </div>

              {modalError && (
                <div className="text-[11px] text-red-400 bg-red-500/10 p-2 rounded-md border border-red-500/20">
                  {modalError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="px-3 py-1.5 text-xs rounded-md bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs rounded-md bg-[var(--fluent-accent)] text-black font-semibold hover:brightness-110 transition-all shadow-sm"
                >
                  Hinzufügen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
};
