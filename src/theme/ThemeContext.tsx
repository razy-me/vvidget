import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from "react";
import type { AppTheme } from "@/types/config";
import type { ResolvedTheme, ThemeContextValue } from "./types";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDOM(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const body = document.body;

  if (resolved === "light") {
    root.classList.add("theme-light");
    root.classList.remove("theme-dark");
    body.classList.add("theme-light");
    body.classList.remove("theme-dark");
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";
  } else {
    root.classList.remove("theme-light");
    root.classList.add("theme-dark");
    body.classList.remove("theme-light");
    body.classList.add("theme-dark");
    root.setAttribute("data-theme", "dark");
    root.style.colorScheme = "dark";
  }
}

export interface ThemeProviderProps {
  children: ReactNode;
  initialTheme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
}

export const ThemeProvider: FC<ThemeProviderProps> = ({
  children,
  initialTheme = "auto",
  onThemeChange,
}) => {
  const [theme, setThemeState] = useState<AppTheme>(initialTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Sync initialTheme if it changes from an external source (e.g. useConfig load)
  useEffect(() => {
    setThemeState(initialTheme);
  }, [initialTheme]);

  // Monitor system appearance changes when in "auto" mode
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else if ("addListener" in mediaQuery) {
      // Legacy browser / test environment compatibility
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mediaQuery as any).addListener(handleChange);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return () => (mediaQuery as any).removeListener(handleChange);
    }
  }, []);

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (theme === "auto") {
      return systemTheme;
    }
    return theme;
  }, [theme, systemTheme]);

  // Apply CSS classes and data attributes to DOM whenever resolvedTheme changes
  useEffect(() => {
    applyThemeToDOM(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback(
    (newTheme: AppTheme) => {
      setThemeState(newTheme);
      onThemeChange?.(newTheme);
    },
    [onThemeChange]
  );

  const toggleTheme = useCallback(() => {
    const next: AppTheme = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
