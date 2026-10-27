import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCalendar } from "@/hooks/useCalendar";
import type { AppConfig } from "@/types/config";
import { DEFAULT_CONFIG } from "@/types/config";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

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

describe("useCalendar Hook - IPC error rollback (regression X-ipc-concurrency-07)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("rolls back optimistic addNote and sets error when IPC add_calendar_note fails", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    const initialMap = {
      "2026-10-27": [{ id: "note_init", text: "Existing Note", completed: false }],
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_calendar_events") return Promise.resolve(initialMap);
      if (cmd === "add_calendar_note") return Promise.reject(new Error("Disk write error"));
      return Promise.resolve();
    });

    const { result } = renderHook(() =>
      useCalendar({ initialEvents: initialMap, initialDate: new Date(2026, 9, 27) })
    );

    expect(result.current.events["2026-10-27"]).toHaveLength(1);

    await act(async () => {
      await result.current.addNote("Failing note");
    });

    await waitFor(() => {
      expect(result.current.error).toBe("Disk write error");
    });

    // Ensure state rolled back to backend state (only 1 existing note)
    expect(result.current.events["2026-10-27"]).toHaveLength(1);
    expect(result.current.events["2026-10-27"][0].text).toBe("Existing Note");
  });

  it("rolls back optimistic removeNote and sets error when IPC remove_calendar_note fails", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    const initialMap = {
      "2026-10-27": [{ id: "note_to_remove", text: "Important Note", completed: false }],
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_calendar_events") return Promise.resolve(initialMap);
      if (cmd === "remove_calendar_note") return Promise.reject(new Error("Storage unavailable"));
      return Promise.resolve();
    });

    const { result } = renderHook(() =>
      useCalendar({ initialEvents: initialMap, initialDate: new Date(2026, 9, 27) })
    );

    await act(async () => {
      await result.current.removeNote("note_to_remove");
    });

    await waitFor(() => {
      expect(result.current.error).toBe("Storage unavailable");
    });

    // Ensure state rolled back to restore the note
    expect(result.current.events["2026-10-27"]).toHaveLength(1);
    expect(result.current.events["2026-10-27"][0].id).toBe("note_to_remove");
  });
});
