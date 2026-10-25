import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSystemMetrics, MOCK_SYSTEM_METRICS } from "@/hooks/useSystemMetrics";
import type { SystemMetrics } from "@/types/resources";

const mockUnlisten = vi.fn();
let eventListener: ((e: { payload: SystemMetrics }) => void) | null = null;
const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((_event: string, cb: (e: { payload: SystemMetrics }) => void) => {
    eventListener = cb;
    return Promise.resolve(mockUnlisten);
  }),
}));

describe("useSystemMetrics Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventListener = null;
    mockInvoke.mockResolvedValue(MOCK_SYSTEM_METRICS);
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("initializes with mock data in non-Tauri environment", () => {
    const { result } = renderHook(() => useSystemMetrics());

    expect(result.current.metrics).toEqual(MOCK_SYSTEM_METRICS);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.cpuHistory.length).toBeGreaterThan(0);
  });

  it("limits CPU history array to 20 samples maximum", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    };

    const { result } = renderHook(() => useSystemMetrics());

    // Wait for effects
    await act(async () => {
      await result.current.refresh();
      await new Promise((r) => setTimeout(r, 10));
    });

    // Simulate 25 incoming metrics events
    for (let i = 1; i <= 25; i++) {
      act(() => {
        if (eventListener) {
          eventListener({
            payload: {
              ...MOCK_SYSTEM_METRICS,
              cpu_usage_percent: i * 2,
            },
          });
        }
      });
    }

    // Must be clamped to exactly 20 points
    expect(result.current.cpuHistory.length).toBe(20);
    // The last item should be 50 (25 * 2)
    expect(result.current.cpuHistory[result.current.cpuHistory.length - 1]).toBe(50);
  });

  it("handles IPC error and records error message", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    };
    mockInvoke.mockRejectedValueOnce(new Error("Permission denied for sysinfo"));

    const { result } = renderHook(() => useSystemMetrics());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe("Permission denied for sysinfo");
    expect(result.current.isLoading).toBe(false);
  });

  it("unregisters listener on unmount", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    };

    const { unmount } = renderHook(() => useSystemMetrics());

    // Allow effects and event import promise to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    unmount();
    expect(mockUnlisten).toHaveBeenCalled();
  });
});
