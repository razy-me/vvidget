import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCalendar } from "@/hooks/useCalendar";
import type { AppConfig } from "@/types/config";
import { DEFAULT_CONFIG } from "@/types/config";

let currentConfig: AppConfig = {
  ...DEFAULT_CONFIG,
  calendar_events: {
    "2026-10-26": [{ id: "note_1", text: "First Note", completed: false }],
    "2026-10-28": [{ id: "note_2", text: "Second Note", completed: false }],
  },
};

vi.mock("@/hooks/useConfig", () => ({
  useConfig: () => ({
    config: currentConfig,
    isLoading: false,
    error: null,
    updateConfig: vi.fn(),
    updateWidgetPlacement: vi.fn(),
    setWidgetsLocked: vi.fn(),
    setLayoutMode: vi.fn(),
    setTheme: vi.fn(),
    setAutostart: vi.fn(),
    reloadConfig: vi.fn(),
  }),
}));

describe("useCalendar Hook - deletion reconciliation (regression M6-05, X1-03)", () => {
  it("reconciles deleted calendar dates from config without retaining stale keys in state", () => {
    const { result, rerender } = renderHook(() => useCalendar());

    expect(result.current.events["2026-10-26"]).toBeDefined();
    expect(result.current.events["2026-10-28"]).toBeDefined();

    // Simulate backend removing "2026-10-26" after all its notes were deleted
    currentConfig = {
      ...DEFAULT_CONFIG,
      calendar_events: {
        "2026-10-28": [{ id: "note_2", text: "Second Note", completed: false }],
      },
    };

    rerender();

    // The deleted date must be removed, not preserved via shallow object spread
    expect(result.current.events["2026-10-28"]).toBeDefined();
    expect(result.current.events["2026-10-26"]).toBeUndefined();
  });
});
