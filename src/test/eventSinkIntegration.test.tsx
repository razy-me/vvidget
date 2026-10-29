import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { BatteryWidget } from "@/widgets/battery/BatteryWidget";
import { SpotifyWidget } from "@/widgets/spotify/SpotifyWidget";
import { MOCK_BATTERY_STATUS, type BatteryStatus } from "@/types/battery";
import { DEFAULT_MEDIA_SESSION, type MediaSession } from "@/types/media";

const mockInvoke = vi.fn();

type EventHandler = (e: { payload: any }) => void;
const eventListeners: Record<string, EventHandler[]> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockImplementation((event: string, cb: EventHandler) => {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(cb);
    return Promise.resolve(() => {
      eventListeners[event] = eventListeners[event].filter((fn) => fn !== cb);
    });
  }),
}));

function emitTauriEvent(event: string, payload: any) {
  const handlers = eventListeners[event] || [];
  handlers.forEach((fn) => fn({ payload }));
}

describe("Event Sink Integration (R4: Native Push over Polling)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(eventListeners)) {
      delete eventListeners[key];
    }

    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_master_volume") return Promise.resolve(0.4);
      if (cmd === "get_master_mute") return Promise.resolve(false);
      if (cmd === "get_battery_status") return Promise.resolve(MOCK_BATTERY_STATUS);
      if (cmd === "get_media_state") {
        const defaultMedia: MediaSession = {
          ...DEFAULT_MEDIA_SESSION,
          is_active: true,
          title: "Test Track",
          artist: "Test Artist",
          album: "Test Album",
          is_playing: true,
          source_app: "Spotify",
          timeline: {
            position_ms: 10000,
            duration_ms: 60000,
            last_updated_system_time_ms: Date.now(),
          },
        };
        return Promise.resolve(defaultMedia);
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.useRealTimers();
  });

  it("propagates native audio-volume-update push events to SpotifyWidget UI without timer polling", async () => {
    await act(async () => {
      render(<SpotifyWidget />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("master-volume-control")).toBeInTheDocument();
    });

    // Initial state from mock: 40% unmuted
    expect(screen.getByText("40%")).toBeInTheDocument();
    const slider = screen.getByTestId("volume-slider") as HTMLInputElement;
    expect(slider.value).toBe("40");

    // Verify listener was registered
    expect(eventListeners["audio-volume-update"]?.length).toBeGreaterThanOrEqual(1);

    mockInvoke.mockClear();

    // Push new volume event from native COM sink
    act(() => {
      emitTauriEvent("audio-volume-update", { volume: 0.85, is_muted: false });
    });

    // UI updates instantaneously to 85%
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(slider.value).toBe("85");

    // Push mute event
    act(() => {
      emitTauriEvent("audio-volume-update", { volume: 0.85, is_muted: true });
    });

    // UI shows 0% when muted
    expect(screen.getByText("0%")).toBeInTheDocument();

    // Verify zero polling invocations took place
    expect(mockInvoke).not.toHaveBeenCalledWith("get_master_volume", expect.anything());
  });

  it("propagates native battery-update push events to BatteryWidget UI without timer polling", async () => {
    await act(async () => {
      render(<BatteryWidget />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("battery-widget")).toBeInTheDocument();
    });

    // Verify listener was registered
    expect(eventListeners["battery-update"]?.length).toBeGreaterThanOrEqual(1);

    // Initial state from mock
    expect(screen.getByTestId("battery-percentage")).toHaveTextContent(
      `${MOCK_BATTERY_STATUS.charge_percent}%`
    );

    mockInvoke.mockClear();

    // Push state transition from native WinRT sink (e.g. plugged in, 72% charging)
    const pushedStatus: BatteryStatus = {
      ...MOCK_BATTERY_STATUS,
      charge_percent: 72,
      is_charging: true,
      is_plugged_in: true,
      drain_rate_percent_per_min: 0.85,
    };

    act(() => {
      emitTauriEvent("battery-update", pushedStatus);
    });

    // Battery widget reflects pushed status immediately
    expect(screen.getByTestId("battery-percentage")).toHaveTextContent("72%");
    expect(screen.getByTestId("battery-charging-badge")).toHaveTextContent("Wird geladen ⚡");
    expect(screen.getByTestId("battery-drain-rate")).toHaveTextContent("+0.85 %/min Laden");

    // Zero polling invocations occurred
    expect(mockInvoke).not.toHaveBeenCalledWith("get_battery_status", expect.anything());
  });

  it("verifies 60s fallback heartbeat sync and document.hidden suspension across both event sinks", async () => {
    vi.useFakeTimers();

    render(<SpotifyWidget />);
    render(<BatteryWidget />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    mockInvoke.mockClear();

    // Advancing 5s, 10s, 30s does NOT poll either endpoint (polling completely eliminated)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("get_master_volume", expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith("get_battery_status", expect.anything());

    // Advance remaining time to 60s -> fallback heartbeat activates once
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(mockInvoke).toHaveBeenCalledWith("get_master_volume", undefined);
    expect(mockInvoke).toHaveBeenCalledWith("get_battery_status", undefined);

    mockInvoke.mockClear();

    // Now test document.hidden suspension
    Object.defineProperty(document, "hidden", { value: true, configurable: true });

    // Advance another 60s while document is hidden -> zero calls
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("get_master_volume", expect.anything());
    expect(mockInvoke).not.toHaveBeenCalledWith("get_battery_status", expect.anything());

    // Restore visibility
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });
});
