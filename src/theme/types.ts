import type { AppTheme } from "@/types/config";

export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  /** Configured theme preference ('auto' | 'light' | 'dark') */
  theme: AppTheme;
  /** Actual applied theme derived from preference and system appearance ('light' | 'dark') */
  resolvedTheme: ResolvedTheme;
  /** Updates the active theme preference */
  setTheme: (theme: AppTheme) => void;
  /** Toggles between light and dark (or switches auto to explicit) */
  toggleTheme: () => void;
}
