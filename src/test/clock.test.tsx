import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ClockWidget } from "@/widgets/clock/ClockWidget";

describe("ClockWidget Component", () => {
  const fixedDate = new Date(2026, 9, 26, 14, 30, 45); // 26.10.2026, 14:30:45

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Tab Switching", () => {
    it("renders segmented tabs and switches between Uhr, Timer, Stoppuhr, and Wecker", async () => {
      await act(async () => {
        render(<ClockWidget initialTab="uhr" initialTime={fixedDate} />);
      });

      // Default is Uhr tab
      expect(screen.getByRole("tab", { name: /^Uhr$/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("uhr-tab-content")).toBeInTheDocument();

      // Switch to Timer tab
      await act(async () => {
        fireEvent.click(screen.getByRole("tab", { name: /Timer/i }));
      });
      expect(screen.getByRole("tab", { name: /Timer/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("timer-tab-content")).toBeInTheDocument();

      // Switch to Stoppuhr tab
      await act(async () => {
        fireEvent.click(screen.getByRole("tab", { name: /Stoppuhr/i }));
      });
      expect(screen.getByRole("tab", { name: /Stoppuhr/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("stoppuhr-tab-content")).toBeInTheDocument();

      // Switch to Wecker tab
      await act(async () => {
        fireEvent.click(screen.getByRole("tab", { name: /Wecker/i }));
      });
      expect(screen.getByRole("tab", { name: /Wecker/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("wecker-tab-content")).toBeInTheDocument();
    });
  });

  describe("Uhr (Clock) Tab", () => {
    it("displays digital time, weekday in German, and toggles between digital and analog", async () => {
      await act(async () => {
        render(<ClockWidget initialTab="uhr" initialTime={fixedDate} />);
      });

      expect(screen.getByTestId("digital-time-display")).toBeInTheDocument();
      expect(screen.getByTestId("german-date-display")).toHaveTextContent(/Montag/i);
      expect(screen.getByTestId("german-date-display")).toHaveTextContent(/Oktober/i);

      // Switch to Analog
      const analogBtn = screen.getByRole("button", { name: /Analog/i });
      await act(async () => {
        fireEvent.click(analogBtn);
      });

      // Analog clock SVG is rendered
      expect(document.querySelector("svg circle")).toBeInTheDocument();

      // Switch back to Digital
      const digitalBtn = screen.getByRole("button", { name: /Digital/i });
      await act(async () => {
        fireEvent.click(digitalBtn);
      });
      expect(screen.getByTestId("digital-time-display")).toBeInTheDocument();
    });

    it("allows selecting a timezone", async () => {
      await act(async () => {
        render(<ClockWidget initialTab="uhr" initialTime={fixedDate} />);
      });

      const select = screen.getByLabelText("Zeitzone auswählen");
      expect(select).toBeInTheDocument();

      await act(async () => {
        fireEvent.change(select, { target: { value: "utc" } });
      });

      expect(select).toHaveValue("utc");
      expect(screen.getAllByText("UTC").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Timer Tab", () => {
    it("handles preset selection and countdown progression", async () => {
      vi.useFakeTimers();

      await act(async () => {
        render(<ClockWidget initialTab="timer" />);
      });

      // Select 1m preset
      const preset1m = screen.getByRole("button", { name: "1m" });
      await act(async () => {
        fireEvent.click(preset1m);
      });

      const timerDisplay = screen.getByTestId("timer-display");
      expect(timerDisplay).toHaveTextContent("01:00");

      // Start countdown
      const startPauseBtn = screen.getByTestId("timer-start-pause");
      await act(async () => {
        fireEvent.click(startPauseBtn);
      });

      // Advance by 5 seconds
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(timerDisplay).toHaveTextContent("00:55");

      // Pause timer
      await act(async () => {
        fireEvent.click(startPauseBtn);
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(timerDisplay).toHaveTextContent("00:55");

      // Advance to 0
      await act(async () => {
        fireEvent.click(startPauseBtn);
      });
      await act(async () => {
        vi.advanceTimersByTime(56000);
      });
      expect(timerDisplay).toHaveTextContent("00:00");
      expect(screen.getByText("Zeit abgelaufen!")).toBeInTheDocument();

      // Reset timer
      const resetBtn = screen.getByTestId("timer-reset");
      await act(async () => {
        fireEvent.click(resetBtn);
      });
      expect(timerDisplay).toHaveTextContent("01:00");
    });

    it("allows custom timer inputs", async () => {
      await act(async () => {
        render(<ClockWidget initialTab="timer" />);
      });

      const minInput = screen.getByLabelText("Minuten");
      const secInput = screen.getByLabelText("Sekunden");
      const setBtn = screen.getByRole("button", { name: "Setzen" });

      await act(async () => {
        fireEvent.change(minInput, { target: { value: "3" } });
        fireEvent.change(secInput, { target: { value: "30" } });
        fireEvent.click(setBtn);
      });

      expect(screen.getByTestId("timer-display")).toHaveTextContent("03:30");
    });
  });

  describe("Stoppuhr (Stopwatch) Tab", () => {
    it("starts, captures laps, stops, and resets", async () => {
      vi.useFakeTimers();

      await act(async () => {
        render(<ClockWidget initialTab="stoppuhr" />);
      });

      const display = screen.getByTestId("stopwatch-display");
      const startStopBtn = screen.getByTestId("stopwatch-start-stop");
      const lapBtn = screen.getByTestId("stopwatch-lap");
      const resetBtn = screen.getByTestId("stopwatch-reset");

      expect(display).toHaveTextContent("00:00.00");
      expect(lapBtn).toBeDisabled();

      // Start stopwatch
      await act(async () => {
        fireEvent.click(startStopBtn);
      });

      expect(startStopBtn).toHaveTextContent("Stopp");
      expect(lapBtn).not.toBeDisabled();

      // Advance time
      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      // Capture lap 1
      await act(async () => {
        fireEvent.click(lapBtn);
      });

      expect(screen.getAllByTestId("lap-item")).toHaveLength(1);
      expect(screen.getByText("#1")).toBeInTheDocument();

      // Advance and capture lap 2
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      await act(async () => {
        fireEvent.click(lapBtn);
      });

      expect(screen.getAllByTestId("lap-item")).toHaveLength(2);
      expect(screen.getByText("#2")).toBeInTheDocument();

      // Stop
      await act(async () => {
        fireEvent.click(startStopBtn);
      });
      expect(startStopBtn).toHaveTextContent("Start");

      // Reset
      await act(async () => {
        fireEvent.click(resetBtn);
      });
      expect(display).toHaveTextContent("00:00.00");
      expect(screen.queryByTestId("lap-item")).not.toBeInTheDocument();
      expect(screen.getByText("Keine Rundenzeiten erfasst")).toBeInTheDocument();
    });
  });

  describe("Wecker (Alarm) Tab", () => {
    it("toggles alarm state and adjusts time and label", async () => {
      await act(async () => {
        render(<ClockWidget initialTab="wecker" />);
      });

      const toggle = screen.getByTestId("alarm-toggle");
      expect(toggle).toHaveAttribute("aria-checked", "true");
      expect(screen.getByTestId("alarm-status")).toHaveTextContent("Wecker gestellt für 07:00 Uhr");

      // Toggle off
      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(toggle).toHaveAttribute("aria-checked", "false");
      expect(screen.getByTestId("alarm-status")).toHaveTextContent("Wecker deaktiviert");

      // Toggle back on
      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(toggle).toHaveAttribute("aria-checked", "true");

      // Change alarm time
      const timeInput = screen.getByTestId("alarm-time-input");
      await act(async () => {
        fireEvent.change(timeInput, { target: { value: "08:30" } });
      });
      expect(screen.getByTestId("alarm-status")).toHaveTextContent("Wecker gestellt für 08:30 Uhr");

      // Change alarm label
      const labelInput = screen.getByTestId("alarm-label-input");
      await act(async () => {
        fireEvent.change(labelInput, { target: { value: "Frühstück" } });
      });
      expect(labelInput).toHaveValue("Frühstück");

      // Simulate alarm trigger
      const simulateBtn = screen.getByText("Alarm-Test simulieren");
      await act(async () => {
        fireEvent.click(simulateBtn);
      });
      expect(screen.getByText("Klingelt jetzt!")).toBeInTheDocument();
    });

    it("regression M6-06: automatically triggers alarm when current time matches alarm time at 00 seconds", async () => {
      vi.useFakeTimers();
      const nearAlarmTime = new Date(2026, 9, 26, 6, 59, 59);
      vi.setSystemTime(nearAlarmTime);

      await act(async () => {
        render(<ClockWidget initialTab="wecker" initialTime={nearAlarmTime} />);
      });

      // Initially alarm is not triggered at 06:59:59
      expect(screen.queryByText("Klingelt jetzt!")).not.toBeInTheDocument();

      // Advance by 1 second to 07:00:00
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Alarm should now be triggered automatically
      expect(screen.getByText("Klingelt jetzt!")).toBeInTheDocument();
    });
  });
});
