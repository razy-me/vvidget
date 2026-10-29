import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMasterVolume } from "@/hooks/useMasterVolume";

const mockInvoke = vi.fn();
const mockUnlisten = vi.fn();
let volumeEventListener: ((e: { payload: { volume: number; is_muted?: boolean } }) => void) | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((event: string, cb: (e: { payload: { volume: number; is_muted?: boolean } }) => void) => {
    if (event === "audio-volume-update") {
      volumeEventListener = cb;
    }
    return Promise.resolve(mockUnlisten);
  }),
}));

describe("useMasterVolume Hook (regression M5-05 & WP-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    volumeEventListener = null;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_master_volume") return Promise.resolve(0.3);
      if (cmd === "get_master_mute") return Promise.resolve(true);
      if (cmd === "toggle_master_mute") return Promise.resolve(false);
      if (cmd === "set_master_volume") return Promise.resolve();
      return Promise.resolve();
    });
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("unmutes native Windows endpoint when volume is increased while muted (regression M5-05)", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_master_volume") return Promise.resolve(0.2);
      if (cmd === "get_master_mute") return Promise.resolve(true);
      if (cmd === "toggle_master_mute") return Promise.resolve(false);
      if (cmd === "set_master_volume") return Promise.resolve();
      return Promise.resolve();
    });

    const { result } = renderHook(() => useMasterVolume(0.2, true));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isMuted).toBe(true);
    expect(result.current.volume).toBe(0.2);

    mockInvoke.mockClear();

    await act(async () => {
      await result.current.setVolume(0.45);
    });

    expect(result.current.volume).toBe(0.45);
    expect(result.current.isMuted).toBe(false);

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "toggle_master_mute", undefined);
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "set_master_volume", { level: 0.45 });
  });

  it("does not call toggle_master_mute when volume is set to 0 while muted", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_master_volume") return Promise.resolve(0.2);
      if (cmd === "get_master_mute") return Promise.resolve(true);
      return Promise.resolve();
    });

    const { result } = renderHook(() => useMasterVolume(0.2, true));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockInvoke.mockClear();

    await act(async () => {
      await result.current.setVolume(0);
    });

    expect(result.current.volume).toBe(0);
    expect(result.current.isMuted).toBe(true);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("set_master_volume", { level: 0 });
    expect(mockInvoke).not.toHaveBeenCalledWith("toggle_master_mute", expect.anything());
  });

  it("only calls set_master_volume when adjusting volume while unmuted", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_master_volume") return Promise.resolve(0.5);
      if (cmd === "get_master_mute") return Promise.resolve(false);
      return Promise.resolve();
    });

    const { result } = renderHook(() => useMasterVolume(0.5, false));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockInvoke.mockClear();

    await act(async () => {
      await result.current.setVolume(0.75);
    });

    expect(result.current.volume).toBe(0.75);
    expect(result.current.isMuted).toBe(false);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("set_master_volume", { level: 0.75 });
    expect(mockInvoke).not.toHaveBeenCalledWith("toggle_master_mute", expect.anything());
  });

  it("toggles mute state via toggle_master_mute", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_master_volume") return Promise.resolve(0.5);
      if (cmd === "get_master_mute") return Promise.resolve(false);
      if (cmd === "toggle_master_mute") return Promise.resolve(true);
      return Promise.resolve();
    });

    const { result } = renderHook(() => useMasterVolume(0.5, false));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockInvoke.mockClear();

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(mockInvoke).toHaveBeenCalledWith("toggle_master_mute", undefined);
  });

  it("rapid volume adjustments while muted only invoke toggle_master_mute once (regression M5-03)", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_master_volume") return Promise.resolve(0.1);
      if (cmd === "get_master_mute") return Promise.resolve(true);
      if (cmd === "toggle_master_mute") return Promise.resolve(false);
      if (cmd === "set_master_volume") return Promise.resolve();
      return Promise.resolve();
    });

    const { result } = renderHook(() => useMasterVolume(0.1, true));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    mockInvoke.mockClear();

    await act(async () => {
      const p1 = result.current.setVolume(0.2);
      const p2 = result.current.setVolume(0.3);
      const p3 = result.current.setVolume(0.4);
      await Promise.all([p1, p2, p3]);
    });

    const toggleCalls = mockInvoke.mock.calls.filter((call) => call[0] === "toggle_master_mute");
    expect(toggleCalls).toHaveLength(1);
    expect(result.current.isMuted).toBe(false);
  });

  it("periodically refreshes volume and mute state via 60000ms heartbeat fallback (WP-04)", async () => {
    vi.useFakeTimers();
    try {
      (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
        invoke: mockInvoke,
      };

      let currentVolume = 0.4;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "get_master_volume") return Promise.resolve(currentVolume);
        if (cmd === "get_master_mute") return Promise.resolve(false);
        return Promise.resolve();
      });

      const { result } = renderHook(() => useMasterVolume(0.4, false));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(mockInvoke).toHaveBeenCalledWith("get_master_volume", undefined);

      mockInvoke.mockClear();
      currentVolume = 0.8;

      // 3000ms should NOT trigger polling tick (heartbeat changed to 60000ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(mockInvoke).not.toHaveBeenCalledWith("get_master_volume", undefined);

      // Advance 57000ms more (total 60000ms) for fallback heartbeat
      await act(async () => {
        await vi.advanceTimersByTimeAsync(57000);
      });

      expect(mockInvoke).toHaveBeenCalledWith("get_master_volume", undefined);
      expect(result.current.volume).toBe(0.8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates volume and mute state immediately upon audio-volume-update event (WP-04)", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    const { result } = renderHook(() => useMasterVolume(0.5, false));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(volumeEventListener).not.toBeNull();

    act(() => {
      volumeEventListener?.({ payload: { volume: 0.95, is_muted: true } });
    });

    expect(result.current.volume).toBe(0.95);
    expect(result.current.isMuted).toBe(true);
  });

  it("pauses polling when document is hidden (WP-04)", async () => {
    vi.useFakeTimers();
    try {
      (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
        invoke: mockInvoke,
      };

      renderHook(() => useMasterVolume(0.4, false));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      mockInvoke.mockClear();

      Object.defineProperty(document, "hidden", { value: true, configurable: true });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60000);
      });

      expect(mockInvoke).not.toHaveBeenCalled();

      Object.defineProperty(document, "hidden", { value: false, configurable: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
