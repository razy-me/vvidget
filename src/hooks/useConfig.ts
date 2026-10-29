import { useCallback, useEffect, useRef, useState } from "react";
import type { AppConfig, AppTheme, LayoutMode, WidgetPlacement } from "@/types/config";
import { DEFAULT_CONFIG } from "@/types/config";

import { isTauri, safeInvoke } from "@/utils/tauri";

export interface UseConfigReturn {
  config: AppConfig;
  isLoading: boolean;
  error: string | null;
  updateConfig: (updater: (prev: AppConfig) => AppConfig, immediate?: boolean) => Promise<void>;
  updateWidgetPlacement: (id: string, placement: Partial<WidgetPlacement>) => void;
  setWidgetsLocked: (locked: boolean) => Promise<void>;
  setLayoutMode: (mode: LayoutMode) => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
  setAutostart: (enabled: boolean) => Promise<void>;
  reloadConfig: () => Promise<void>;
}

export function useConfig(): UseConfigReturn {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState<boolean>(isTauri());
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestConfigRef = useRef<AppConfig>(config);
  latestConfigRef.current = config;

  const reloadConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await safeInvoke<AppConfig>("load_config");
      latestConfigRef.current = loaded;
      setConfig(loaded);
    } catch (err) {
      // In web/test preview, keep DEFAULT_CONFIG without fatal error
      if (!isTauri()) {
        setConfig(DEFAULT_CONFIG);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load and listen for backend config changes (e.g. from System Tray)
  useEffect(() => {
    void reloadConfig();

    if (!isTauri()) return;

    let isDisposed = false;
    let unlistenFn: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) => {
      if (isDisposed) return;
      void listen<AppConfig>("config-changed", (event) => {
        if (isDisposed) return;
        if (event.payload) {
          latestConfigRef.current = event.payload;
          setConfig(event.payload);
        }
      }).then((unlisten) => {
        if (isDisposed) {
          unlisten();
        } else {
          unlistenFn = unlisten;
        }
      });
    });

    return () => {
      isDisposed = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [reloadConfig]);

  // Flush debounced placement writes on beforeunload or unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (isTauri()) {
          void safeInvoke("save_config_immediate", { config: latestConfigRef.current });
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (isTauri()) {
          void safeInvoke("save_config_immediate", { config: latestConfigRef.current });
        }
      }
    };
  }, []);

  // Persists configuration change to backend
  const updateConfig = useCallback(
    async (updater: (prev: AppConfig) => AppConfig, immediate = false): Promise<void> => {
      const nextConfig = updater(latestConfigRef.current);
      latestConfigRef.current = nextConfig;
      setConfig(nextConfig);

      if (!isTauri()) return;

      try {
        const cmd = immediate ? "save_config_immediate" : "save_config";
        await safeInvoke(cmd, { config: nextConfig });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      }
    },
    [],
  );

  // Debounced placement update (500ms) for high-frequency window drag events
  const updateWidgetPlacement = useCallback(
    (id: string, placement: Partial<WidgetPlacement>) => {
      const current = latestConfigRef.current;
      const existing = current.widgets[id] ?? {
        id,
        visible: true,
        logical_x: 40,
        logical_y: 40,
        logical_width: 320,
        logical_height: 180,
        scale_factor: 1,
        monitor_id: null,
      };

      const updatedWidgets = {
        ...current.widgets,
        [id]: {
          ...existing,
          ...placement,
        },
      };

      const nextConfig: AppConfig = {
        ...current,
        widgets: updatedWidgets,
      };

      // Synchronously update ref and state immediately
      latestConfigRef.current = nextConfig;
      setConfig(nextConfig);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        if (isTauri()) {
          void safeInvoke("save_config", { config: latestConfigRef.current });
        }
        debounceTimerRef.current = null;
      }, 500);
    },
    [],
  );

  const setWidgetsLocked = useCallback(
    async (locked: boolean) => {
      const nextConfig: AppConfig = {
        ...latestConfigRef.current,
        lock_positions: locked,
      };
      latestConfigRef.current = nextConfig;
      setConfig(nextConfig);

      if (isTauri()) {
        try {
          await safeInvoke("set_widgets_locked", { locked });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      }
    },
    [],
  );

  const setLayoutMode = useCallback(
    async (layout_mode: LayoutMode) => {
      await updateConfig((prev) => ({ ...prev, layout_mode }), true);
    },
    [updateConfig],
  );

  const setTheme = useCallback(
    async (theme: AppTheme) => {
      await updateConfig((prev) => ({ ...prev, theme }), true);
    },
    [updateConfig],
  );

  const setAutostart = useCallback(
    async (auto_start: boolean) => {
      if (isTauri()) {
        try {
          await safeInvoke("set_autostart", { enabled: auto_start });
          const nextConfig: AppConfig = {
            ...latestConfigRef.current,
            auto_start,
          };
          latestConfigRef.current = nextConfig;
          setConfig(nextConfig);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      } else {
        const nextConfig: AppConfig = {
          ...latestConfigRef.current,
          auto_start,
        };
        latestConfigRef.current = nextConfig;
        setConfig(nextConfig);
      }
    },
    [],
  );

  return {
    config,
    isLoading,
    error,
    updateConfig,
    updateWidgetPlacement,
    setWidgetsLocked,
    setLayoutMode,
    setTheme,
    setAutostart,
    reloadConfig,
  };
}
