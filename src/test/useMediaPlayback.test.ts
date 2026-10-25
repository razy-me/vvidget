import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaPlayback } from "@/hooks/useMediaPlayback";
import type { MediaSession } from "@/types/media";
import { DEFAULT_MEDIA_SESSION } from "@/types/media";

describe("useMediaPlayback Hook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("initializes with default session in non-Tauri preview environment", () => {
    const { result } = renderHook(() => useMediaPlayback());

    expect(result.current.session).toEqual(DEFAULT_MEDIA_SESSION);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("safely handles refresh in non-Tauri environment without crashing", async () => {
    const { result } = renderHook(() => useMediaPlayback());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.session).toEqual(DEFAULT_MEDIA_SESSION);
  });

  it("does nothing in playPause when session is inactive and has no title", async () => {
    const { result } = renderHook(() => useMediaPlayback());

    await act(async () => {
      await result.current.playPause();
    });

    expect(result.current.session.is_playing).toBe(false);
  });

  it("handles optimistic playPause and calculates elapsed timeline progress when pausing", async () => {
    const mockTrack: MediaSession = {
      is_active: true,
      is_playing: true,
      title: "Blinding Lights",
      artist: "The Weeknd",
      album: "After Hours",
      track_id: "track-1",
      timeline: {
        position_ms: 10000,
        duration_ms: 200000,
        last_updated_system_time_ms: Date.now() - 5000, // 5 seconds ago
      },
      album_art_url: null,
      can_play_pause: true,
      can_skip_next: true,
      can_skip_previous: true,
      source_app: "Spotify",
    };

    // Mock Tauri environment
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {};

    let eventCallback: ((e: { payload: MediaSession }) => void) | null = null;
    const mockUnlisten = vi.fn();
    const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "get_media_state") return Promise.resolve(mockTrack);
      if (cmd === "media_play_pause") return Promise.resolve();
      return Promise.resolve();
    });

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: mockInvoke,
    }));
    vi.doMock("@tauri-apps/api/event", () => ({
      listen: vi.fn().mockImplementation((_event: string, cb: (e: { payload: MediaSession }) => void) => {
        eventCallback = cb;
        return Promise.resolve(mockUnlisten);
      }),
    }));

    const { result, unmount } = renderHook(() => useMediaPlayback());

    // Trigger initial refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.session.title).toBe("Blinding Lights");
    expect(result.current.session.is_playing).toBe(true);

    // Call playPause (pauses track)
    await act(async () => {
      await result.current.playPause();
    });

    // Should now be paused, and position should be at least 15000ms
    expect(result.current.session.is_playing).toBe(false);
    expect(result.current.session.timeline.position_ms).toBeGreaterThanOrEqual(15000);
    expect(mockInvoke).toHaveBeenCalledWith("media_play_pause", undefined);

    // Simulate backend media-metadata-update push event
    if (eventCallback) {
      act(() => {
        (eventCallback as (e: { payload: MediaSession }) => void)({
          payload: {
            ...mockTrack,
            title: "After Hours",
            is_playing: true,
          },
        });
      });
      expect(result.current.session.title).toBe("After Hours");
    }

    // Test unmount cleanup
    unmount();
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("rolls back optimistic playPause on backend failure", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {};

    const mockTrack: MediaSession = {
      is_active: true,
      is_playing: true,
      title: "Failure Track",
      artist: "Test",
      album: "Test",
      track_id: "t-1",
      timeline: {
        position_ms: 5000,
        duration_ms: 100000,
        last_updated_system_time_ms: Date.now(),
      },
      album_art_url: null,
      can_play_pause: true,
      can_skip_next: true,
      can_skip_previous: true,
      source_app: "Spotify",
    };

    const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "get_media_state") return Promise.resolve(mockTrack);
      if (cmd === "media_play_pause") return Promise.reject(new Error("GSMTC service unavailable"));
      return Promise.resolve();
    });

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: mockInvoke,
    }));
    vi.doMock("@tauri-apps/api/event", () => ({
      listen: vi.fn().mockResolvedValue(vi.fn()),
    }));

    const { result } = renderHook(() => useMediaPlayback());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.session.is_playing).toBe(true);

    // Trigger playPause which will fail
    await act(async () => {
      await result.current.playPause();
    });

    // Should rollback to original playing state and set error
    expect(result.current.session.is_playing).toBe(true);
    expect(result.current.error).toBe("GSMTC service unavailable");
  });

  it("handles nextTrack and previousTrack error dispatch", async () => {
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {};

    const mockInvoke = vi.fn().mockRejectedValue(new Error("Device disconnected"));
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: mockInvoke,
    }));
    vi.doMock("@tauri-apps/api/event", () => ({
      listen: vi.fn().mockResolvedValue(vi.fn()),
    }));

    const { result } = renderHook(() => useMediaPlayback());

    await act(async () => {
      await result.current.nextTrack();
    });
    expect(result.current.error).toBe("Device disconnected");

    await act(async () => {
      await result.current.previousTrack();
    });
    expect(result.current.error).toBe("Device disconnected");
  });
});
