import { isTauri, safeInvoke } from "@/utils/tauri";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LauncherItem } from "@/types/config";
import { useConfig } from "@/hooks/useConfig";



export type LauncherCategory = "Alle" | "Steam" | "Epic" | "Eigene";

export interface UseLauncherOptions {
  initialItems?: LauncherItem[];
  autoScan?: boolean;
}

export interface UseLauncherReturn {
  items: LauncherItem[];
  filteredItems: LauncherItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: LauncherCategory;
  setSelectedCategory: (cat: LauncherCategory) => void;
  isLoading: boolean;
  error: string | null;
  scanGames: () => Promise<void>;
  launchItem: (item: LauncherItem) => Promise<void>;
  addItem: (item: Omit<LauncherItem, "id"> & { id?: string }) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

export function useLauncher(options?: UseLauncherOptions): UseLauncherReturn {
  const { config } = useConfig();
  const [discoveredItems, setDiscoveredItems] = useState<LauncherItem[]>(options?.initialItems ?? []);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<LauncherCategory>("Alle");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  // Combine discovered items with custom launcher items saved in AppConfig
  const items = useMemo(() => {
    const customItems = config.launcher_items ?? [];
    const itemMap = new Map<string, LauncherItem>();

    // Add discovered games
    for (const item of discoveredItems) {
      itemMap.set(item.id, item);
    }

    // Add / overwrite with custom items from config
    for (const item of customItems) {
      itemMap.set(item.id, item);
    }

    return Array.from(itemMap.values());
  }, [discoveredItems, config.launcher_items]);

  const scanGames = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const scanned = await safeInvoke<LauncherItem[]>("scan_installed_games");
      if (isMountedRef.current) {
        setDiscoveredItems(scanned);
      }
    } catch (err) {
      if (isMountedRef.current) {
        // Fallback for non-Tauri / test environments
        if (!isTauri()) {
          setDiscoveredItems((prev) => (prev.length > 0 ? prev : []));
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    if (options?.autoScan !== false) {
      void scanGames();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [scanGames, options?.autoScan]);

  const launchItem = useCallback(async (item: LauncherItem) => {
    setError(null);
    try {
      await safeInvoke("launch_app_or_uri", { target: item.path_or_uri });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const addItem = useCallback(
    async (item: Omit<LauncherItem, "id"> & { id?: string }) => {
      setError(null);
      const fullItem: LauncherItem = {
        id: item.id || `custom_${Date.now()}`,
        name: item.name.trim(),
        path_or_uri: item.path_or_uri.trim(),
        icon_type: item.icon_type ?? "custom",
        source: item.source || "custom",
        last_launched: item.last_launched,
      };

      try {
        await safeInvoke("add_custom_launcher_item", { item: fullItem });
      } catch (err) {
        if (!isTauri()) {
          // In test/web environment update local discovered items
          setDiscoveredItems((prev) => [...prev.filter((i) => i.id !== fullItem.id), fullItem]);
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const removeItem = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await safeInvoke("remove_launcher_item", { id });
      } catch (err) {
        if (!isTauri()) {
          // In test/web environment update local discovered items
          setDiscoveredItems((prev) => prev.filter((i) => i.id !== id));
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      }
    },
    [],
  );

  // Filter items by category and search query
  const filteredItems = useMemo(() => {
    let result = items;

    if (selectedCategory === "Steam") {
      result = result.filter((i) => i.source === "steam");
    } else if (selectedCategory === "Epic") {
      result = result.filter((i) => i.source === "epic");
    } else if (selectedCategory === "Eigene") {
      result = result.filter((i) => i.source === "custom");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.path_or_uri.toLowerCase().includes(q)
      );
    }

    return result;
  }, [items, selectedCategory, searchQuery]);

  return {
    items,
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
  };
}
