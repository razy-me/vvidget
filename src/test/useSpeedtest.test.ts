import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSpeedtest } from "@/hooks/useSpeedtest";

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

describe("useSpeedtest Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("initializes with idle status and provided history", () => {
    const dummyHistory = [
      {
        timestamp: 100,
        ping_ms: 10,
        jitter_ms: 1,
        download_mbps: 100,
        upload_mbps: 50,
      },
    ];

    const { result } = renderHook(() =>
      useSpeedtest({ initialHistory: dummyHistory, initialLastResult: dummyHistory[0] })
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.stage).toBe("idle");
    expect(result.current.history).toHaveLength(1);
    expect(result.current.lastResult).toEqual(dummyHistory[0]);
  });

  it("calls unlisten functions on unmount in Tauri environment (regression X-ipc-concurrency-03)", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    const unlistenProgress = vi.fn();
    const unlistenConfig = vi.fn();

    mockListen.mockImplementation((event: string) => {
      if (event === "speedtest-progress") return Promise.resolve(unlistenProgress);
      if (event === "config-changed") return Promise.resolve(unlistenConfig);
      return Promise.resolve(vi.fn());
    });

    const { unmount } = renderHook(() => useSpeedtest());

    // Allow promise microtasks in setupListeners to settle
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockListen).toHaveBeenCalledWith("speedtest-progress", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("config-changed", expect.any(Function));

    unmount();

    expect(unlistenProgress).toHaveBeenCalledTimes(1);
    expect(unlistenConfig).toHaveBeenCalledTimes(1);
  });

  it("prevents listener leak if unmounted while listen promise is in flight (regression X-ipc-concurrency-03)", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    const unlistenProgress = vi.fn();

    let resolveProgress: (fn: () => void) => void = () => {};
    const progressPromise = new Promise<() => void>((resolve) => {
      resolveProgress = resolve;
    });

    mockListen.mockImplementation((event: string) => {
      if (event === "speedtest-progress") return progressPromise;
      return Promise.resolve(vi.fn());
    });

    const { unmount } = renderHook(() => useSpeedtest());

    // Wait until import resolves and listen is called
    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith("speedtest-progress", expect.any(Function));
    });

    // Unmount while listen promise is still in flight
    unmount();

    // Now resolve the in-flight listen promise
    await act(async () => {
      resolveProgress(unlistenProgress);
    });

    // unlistenProgress must have been invoked immediately upon resolution to prevent leak
    expect(unlistenProgress).toHaveBeenCalledTimes(1);
  });
});
