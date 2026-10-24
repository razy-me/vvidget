import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ThemeProvider, useTheme } from "./index";
import type { FC } from "react";

const ThemeConsumer: FC = () => {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="set-light" onClick={() => setTheme("light")}>
        Light
      </button>
      <button data-testid="set-dark" onClick={() => setTheme("dark")}>
        Dark
      </button>
      <button data-testid="set-auto" onClick={() => setTheme("auto")}>
        Auto
      </button>
      <button data-testid="toggle" onClick={toggleTheme}>
        Toggle
      </button>
    </div>
  );
};

describe("ThemeProvider & useTheme", () => {
  let listeners: Array<(e: { matches: boolean }) => void> = [];

  beforeEach(() => {
    listeners = [];
    document.documentElement.className = "";
    document.body.className = "";
    document.documentElement.removeAttribute("data-theme");

    // Mock matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-color-scheme: dark"),
        media: query,
        onchange: null,
        addEventListener: vi.fn((event: string, handler: (e: { matches: boolean }) => void) => {
          if (event === "change") listeners.push(handler);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws error when useTheme is called outside ThemeProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ThemeConsumer />)).toThrow(
      "useTheme must be used within a ThemeProvider"
    );
    consoleError.mockRestore();
  });

  it("defaults to auto theme and derives system theme", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("auto");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies light theme correctly to DOM", () => {
    const onThemeChange = vi.fn();

    render(
      <ThemeProvider initialTheme="auto" onThemeChange={onThemeChange}>
        <ThemeConsumer />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId("set-light"));

    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.classList.contains("theme-dark")).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(onThemeChange).toHaveBeenCalledWith("light");
  });

  it("toggles between dark and light themes", () => {
    render(
      <ThemeProvider initialTheme="dark">
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("dark");

    fireEvent.click(screen.getByTestId("toggle"));
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);

    fireEvent.click(screen.getByTestId("toggle"));
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
  });

  it("dynamically reacts to system matchMedia changes when in auto mode", () => {
    render(
      <ThemeProvider initialTheme="auto">
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("dark");

    // Simulate system changing to light mode
    act(() => {
      listeners.forEach((handler) => handler({ matches: false }));
    });

    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
  });
});
