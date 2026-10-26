import { useState, useEffect, useRef, useMemo, type FC } from "react";
import {
  Clock as ClockIcon,
  Timer as TimerIcon,
  Hourglass,
  Bell,
  BellOff,
  Play,
  Pause,
  RotateCcw,
  Flag,
  Globe,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  TIMEZONE_OPTIONS,
  formatDigitalTime,
  formatDateWithWeekdayGerman,
  formatTimerSeconds,
  formatStopwatchMs,
} from "./clockUtils";
import { cn } from "@/utils/cn";

export type ClockTab = "uhr" | "timer" | "stoppuhr" | "wecker";

export interface ClockWidgetProps {
  initialTab?: ClockTab;
  initialTime?: Date;
  className?: string;
}

export interface LapRecord {
  lapIndex: number;
  lapTimeMs: number;
  totalTimeMs: number;
}

export const ClockWidget: FC<ClockWidgetProps> = ({
  initialTab = "uhr",
  initialTime,
  className = "",
}) => {
  const [activeTab, setActiveTab] = useState<ClockTab>(initialTab);

  // ----------------------------------------------------
  // 1. Clock Tab State
  // ----------------------------------------------------
  const [currentTime, setCurrentTime] = useState<Date>(() => initialTime ?? new Date());
  const [selectedTzId, setSelectedTzId] = useState<string>("local");
  const [clockViewMode, setClockViewMode] = useState<"digital" | "analog">("digital");

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const selectedTz = useMemo(() => {
    return TIMEZONE_OPTIONS.find((t) => t.id === selectedTzId) ?? TIMEZONE_OPTIONS[0];
  }, [selectedTzId]);

  const digitalTime = useMemo(() => {
    return formatDigitalTime(currentTime, selectedTz.timeZone);
  }, [currentTime, selectedTz.timeZone]);

  const germanDate = useMemo(() => {
    return formatDateWithWeekdayGerman(currentTime, selectedTz.timeZone);
  }, [currentTime, selectedTz.timeZone]);

  // Analog calculations
  const analogAngles = useMemo(() => {
    const h = parseInt(digitalTime.hours, 10);
    const m = parseInt(digitalTime.minutes, 10);
    const s = parseInt(digitalTime.seconds, 10);
    return {
      hourAngle: ((h % 12) + m / 60) * 30,
      minuteAngle: (m + s / 60) * 6,
      secondAngle: s * 6,
    };
  }, [digitalTime]);

  // ----------------------------------------------------
  // 2. Timer Tab State
  // ----------------------------------------------------
  const [timerTotalSeconds, setTimerTotalSeconds] = useState<number>(300); // 5 min default
  const [timerRemaining, setTimerRemaining] = useState<number>(300);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [customMinutes, setCustomMinutes] = useState<string>("5");
  const [customSeconds, setCustomSeconds] = useState<string>("0");
  const isTimerCompleted = timerRemaining === 0;

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerRemaining((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const handleStartPauseTimer = () => {
    if (isTimerCompleted) {
      setTimerRemaining(timerTotalSeconds);
      setIsTimerRunning(true);
      return;
    }
    setIsTimerRunning(!isTimerRunning);
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setTimerRemaining(timerTotalSeconds);
  };

  const handleSetPreset = (seconds: number) => {
    setIsTimerRunning(false);
    setTimerTotalSeconds(seconds);
    setTimerRemaining(seconds);
  };

  const handleApplyCustomTimer = () => {
    const m = Math.max(0, parseInt(customMinutes, 10) || 0);
    const s = Math.max(0, parseInt(customSeconds, 10) || 0);
    const total = m * 60 + s;
    if (total > 0) {
      setIsTimerRunning(false);
      setTimerTotalSeconds(total);
      setTimerRemaining(total);
    }
  };

  const timerProgress = useMemo(() => {
    if (timerTotalSeconds <= 0) return 0;
    return Math.max(0, Math.min(100, (timerRemaining / timerTotalSeconds) * 100));
  }, [timerRemaining, timerTotalSeconds]);

  // ----------------------------------------------------
  // 3. Stopwatch Tab State
  // ----------------------------------------------------
  const [stopwatchMs, setStopwatchMs] = useState<number>(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState<boolean>(false);
  const [laps, setLaps] = useState<LapRecord[]>([]);
  const stopwatchStartTimeRef = useRef<number>(0);
  const stopwatchAccumulatedRef = useRef<number>(0);
  const lastLapMsRef = useRef<number>(0);

  useEffect(() => {
    if (!isStopwatchRunning) return;
    stopwatchStartTimeRef.current = performance.now();

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = stopwatchAccumulatedRef.current + (now - stopwatchStartTimeRef.current);
      setStopwatchMs(elapsed);
    }, 25);

    return () => {
      clearInterval(interval);
      stopwatchAccumulatedRef.current += performance.now() - stopwatchStartTimeRef.current;
    };
  }, [isStopwatchRunning]);

  const handleStartStopStopwatch = () => {
    setIsStopwatchRunning(!isStopwatchRunning);
  };

  const handleLapStopwatch = () => {
    if (!isStopwatchRunning) return;
    const currentTotal = stopwatchMs;
    const lapTime = currentTotal - lastLapMsRef.current;
    lastLapMsRef.current = currentTotal;

    const newRecord: LapRecord = {
      lapIndex: laps.length + 1,
      lapTimeMs: lapTime,
      totalTimeMs: currentTotal,
    };
    setLaps((prev) => [newRecord, ...prev]);
  };

  const handleResetStopwatch = () => {
    setIsStopwatchRunning(false);
    stopwatchAccumulatedRef.current = 0;
    lastLapMsRef.current = 0;
    setStopwatchMs(0);
    setLaps([]);
  };

  const formattedStopwatch = useMemo(() => {
    return formatStopwatchMs(stopwatchMs);
  }, [stopwatchMs]);

  // ----------------------------------------------------
  // 4. Alarm Tab State
  // ----------------------------------------------------
  const [isAlarmEnabled, setIsAlarmEnabled] = useState<boolean>(true);
  const [alarmTime, setAlarmTime] = useState<string>("07:00");
  const [alarmLabel, setAlarmLabel] = useState<string>("Aufstehen");
  const [alarmTriggered, setAlarmTriggered] = useState<boolean>(false);

  const handleToggleAlarm = () => {
    setIsAlarmEnabled(!isAlarmEnabled);
    if (alarmTriggered) setAlarmTriggered(false);
  };

  return (
    <Card
      data-testid="clock-widget"
      variant="acrylic"
      padded={false}
      className={cn(
        "w-full h-full max-w-[360px] max-h-[384px] flex flex-col overflow-hidden text-[var(--fluent-text-primary)] select-none",
        className
      )}
    >
      {/* Windows 11 Segmented Pill Switcher */}
      <div className="p-2 border-b border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)]/30 shrink-0">
        <div
          role="tablist"
          aria-label="Uhr Navigation"
          className="grid grid-cols-4 p-0.5 rounded-lg bg-[var(--fluent-card-bg)]/80 border border-[var(--fluent-stroke-subtle)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "uhr"}
            onClick={() => setActiveTab("uhr")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs font-medium transition-all",
              activeTab === "uhr"
                ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
            )}
          >
            <ClockIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Uhr</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "timer"}
            onClick={() => setActiveTab("timer")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs font-medium transition-all",
              activeTab === "timer"
                ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
            )}
          >
            <Hourglass className="w-3.5 h-3.5 shrink-0" />
            <span>Timer</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "stoppuhr"}
            onClick={() => setActiveTab("stoppuhr")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs font-medium transition-all",
              activeTab === "stoppuhr"
                ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
            )}
          >
            <TimerIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Stoppuhr</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "wecker"}
            onClick={() => setActiveTab("wecker")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 px-2 rounded-md text-xs font-medium transition-all",
              activeTab === "wecker"
                ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
            )}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span>Wecker</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col justify-between">
        {/* ==================================================== */}
        {/* TAB 1: UHR                                           */}
        {/* ==================================================== */}
        {activeTab === "uhr" && (
          <div data-testid="uhr-tab-content" className="h-full flex flex-col justify-between space-y-2">
            {/* View Mode & Timezone Bar */}
            <div className="flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1 text-[11px] text-[var(--fluent-text-secondary)]">
                <Globe className="w-3 h-3 text-[var(--fluent-accent)] shrink-0" />
                <select
                  aria-label="Zeitzone auswählen"
                  value={selectedTzId}
                  onChange={(e) => setSelectedTzId(e.target.value)}
                  className="bg-[var(--fluent-card-bg)] border border-[var(--fluent-stroke)] text-[var(--fluent-text-primary)] rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-[var(--fluent-accent)] transition-colors"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.id} value={tz.id} className="bg-neutral-900 text-white">
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Digital / Analog Switcher */}
              <div className="flex items-center p-0.5 rounded-md border border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)]">
                <button
                  type="button"
                  onClick={() => setClockViewMode("digital")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                    clockViewMode === "digital"
                      ? "bg-[var(--fluent-accent)] text-black font-semibold"
                      : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]"
                  )}
                >
                  Digital
                </button>
                <button
                  type="button"
                  onClick={() => setClockViewMode("analog")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                    clockViewMode === "analog"
                      ? "bg-[var(--fluent-accent)] text-black font-semibold"
                      : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)]"
                  )}
                >
                  Analog
                </button>
              </div>
            </div>

            {/* Main Clock Face Display */}
            <div className="flex-1 flex flex-col items-center justify-center py-2">
              {clockViewMode === "analog" ? (
                /* Analog Clock Face */
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    {/* Dial Background */}
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      className="fill-[var(--fluent-card-bg)] stroke-[var(--fluent-stroke)]"
                      strokeWidth="2"
                    />
                    {/* Hour ticks */}
                    {Array.from({ length: 12 }).map((_, i) => {
                      const angle = (i * 30 * Math.PI) / 180;
                      const x1 = 50 + 38 * Math.sin(angle);
                      const y1 = 50 - 38 * Math.cos(angle);
                      const x2 = 50 + 43 * Math.sin(angle);
                      const y2 = 50 - 43 * Math.cos(angle);
                      return (
                        <line
                          key={i}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke="currentColor"
                          strokeWidth={i % 3 === 0 ? "2" : "1"}
                          className={i % 3 === 0 ? "text-[var(--fluent-text-primary)]" : "text-[var(--fluent-text-tertiary)]"}
                        />
                      );
                    })}

                    {/* Hour hand */}
                    <line
                      x1="50"
                      y1="50"
                      x2={50 + 26 * Math.sin((analogAngles.hourAngle * Math.PI) / 180)}
                      y2={50 - 26 * Math.cos((analogAngles.hourAngle * Math.PI) / 180)}
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      className="text-[var(--fluent-text-primary)]"
                    />

                    {/* Minute hand */}
                    <line
                      x1="50"
                      y1="50"
                      x2={50 + 36 * Math.sin((analogAngles.minuteAngle * Math.PI) / 180)}
                      y2={50 - 36 * Math.cos((analogAngles.minuteAngle * Math.PI) / 180)}
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="text-[var(--fluent-text-primary)]"
                    />

                    {/* Second hand */}
                    <line
                      x1="50"
                      y1="50"
                      x2={50 + 39 * Math.sin((analogAngles.secondAngle * Math.PI) / 180)}
                      y2={50 - 39 * Math.cos((analogAngles.secondAngle * Math.PI) / 180)}
                      stroke="var(--fluent-accent)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />

                    {/* Center Cap */}
                    <circle cx="50" cy="50" r="3" fill="var(--fluent-accent)" />
                  </svg>
                </div>
              ) : (
                /* Digital Clock Display */
                <div className="flex flex-col items-center justify-center my-auto">
                  <div
                    data-testid="digital-time-display"
                    className="font-mono text-4xl sm:text-5xl font-extrabold tracking-tight text-[var(--fluent-text-primary)] tabular-nums drop-shadow-sm"
                  >
                    <span>{digitalTime.hours}</span>
                    <span className="text-[var(--fluent-accent)] animate-pulse">:</span>
                    <span>{digitalTime.minutes}</span>
                    <span className="text-xl sm:text-2xl font-semibold text-[var(--fluent-text-secondary)] ml-1">
                      :{digitalTime.seconds}
                    </span>
                  </div>
                </div>
              )}

              {/* Date & Weekday in German */}
              <div
                data-testid="german-date-display"
                className="mt-2 text-xs font-medium text-[var(--fluent-text-secondary)] text-center tracking-wide"
              >
                {germanDate}
              </div>
            </div>

            {/* Bottom Info Footer */}
            <div className="pt-2 border-t border-[var(--fluent-stroke-subtle)] text-center text-[10px] text-[var(--fluent-text-tertiary)] shrink-0">
              {selectedTz.label}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: TIMER                                         */}
        {/* ==================================================== */}
        {activeTab === "timer" && (
          <div data-testid="timer-tab-content" className="h-full flex flex-col justify-between space-y-2">
            {/* Presets Row */}
            <div className="flex items-center justify-between gap-1 shrink-0">
              {[
                { label: "1m", secs: 60 },
                { label: "5m", secs: 300 },
                { label: "10m", secs: 600 },
                { label: "15m", secs: 900 },
                { label: "30m", secs: 1800 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handleSetPreset(p.secs)}
                  className={cn(
                    "flex-1 py-1 px-1 rounded-md text-[11px] font-medium border border-[var(--fluent-stroke-subtle)] transition-all",
                    timerTotalSeconds === p.secs && !isTimerRunning
                      ? "bg-[var(--fluent-card-hover)] border-[var(--fluent-accent)] text-[var(--fluent-accent)] font-semibold"
                      : "bg-[var(--fluent-card-bg)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Countdown Ring & Display */}
            <div className="flex-1 flex flex-col items-center justify-center relative py-1">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  {/* Background Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="stroke-[var(--fluent-card-bg)] fill-none"
                    strokeWidth="6"
                  />
                  {/* Progress Indicator */}
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className={cn(
                      "fill-none transition-all duration-300",
                      isTimerCompleted ? "stroke-[var(--fluent-error)]" : "stroke-[var(--fluent-accent)]"
                    )}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={264}
                    strokeDashoffset={264 - (264 * timerProgress) / 100}
                  />
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                  <div
                    data-testid="timer-display"
                    className={cn(
                      "font-mono text-3xl font-bold tracking-tight tabular-nums",
                      isTimerCompleted
                        ? "text-[var(--fluent-error)] animate-bounce"
                        : "text-[var(--fluent-text-primary)]"
                    )}
                  >
                    {formatTimerSeconds(timerRemaining)}
                  </div>
                  {isTimerCompleted && (
                    <span className="text-[10px] font-bold text-[var(--fluent-error)] uppercase tracking-wider mt-0.5">
                      Zeit abgelaufen!
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Input Accordion / Row */}
            <div className="flex items-center justify-center gap-1.5 pt-1 shrink-0">
              <div className="flex items-center gap-1 text-xs text-[var(--fluent-text-secondary)]">
                <input
                  type="number"
                  min="0"
                  max="99"
                  aria-label="Minuten"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="w-11 px-1 py-0.5 rounded text-center text-xs font-mono border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] text-[var(--fluent-text-primary)] focus:outline-none focus:border-[var(--fluent-accent)]"
                />
                <span>m</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  aria-label="Sekunden"
                  value={customSeconds}
                  onChange={(e) => setCustomSeconds(e.target.value)}
                  className="w-11 px-1 py-0.5 rounded text-center text-xs font-mono border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] text-[var(--fluent-text-primary)] focus:outline-none focus:border-[var(--fluent-accent)]"
                />
                <span>s</span>
              </div>
              <button
                type="button"
                onClick={handleApplyCustomTimer}
                className="px-2 py-0.5 rounded text-[11px] font-medium border border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] transition-colors"
              >
                Setzen
              </button>
            </div>

            {/* Timer Controls */}
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-[var(--fluent-stroke-subtle)] shrink-0">
              <button
                type="button"
                data-testid="timer-start-pause"
                aria-label={isTimerRunning ? "Timer pausieren" : "Timer starten"}
                onClick={handleStartPauseTimer}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--fluent-accent)] text-black font-semibold text-xs hover:opacity-90 active:scale-95 transition-all shadow-sm"
              >
                {isTimerRunning ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>Start</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="timer-reset"
                aria-label="Timer zurücksetzen"
                onClick={handleResetTimer}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] text-xs font-medium active:scale-95 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: STOPPUHR                                      */}
        {/* ==================================================== */}
        {activeTab === "stoppuhr" && (
          <div data-testid="stoppuhr-tab-content" className="h-full flex flex-col justify-between space-y-2">
            {/* Big Centisecond Timer Display */}
            <div className="flex flex-col items-center justify-center py-2 shrink-0">
              <div
                data-testid="stopwatch-display"
                className="font-mono text-4xl sm:text-5xl font-extrabold tracking-tight text-[var(--fluent-text-primary)] tabular-nums"
              >
                <span>{formattedStopwatch.minutes}</span>
                <span className="text-[var(--fluent-accent)]">:</span>
                <span>{formattedStopwatch.seconds}</span>
                <span className="text-xl sm:text-2xl font-semibold text-[var(--fluent-text-secondary)] ml-1">
                  .{formattedStopwatch.centiseconds}
                </span>
              </div>
            </div>

            {/* Stopwatch Controls */}
            <div className="flex items-center justify-center gap-2 shrink-0 pb-1">
              <button
                type="button"
                data-testid="stopwatch-start-stop"
                aria-label={isStopwatchRunning ? "Stoppuhr anhalten" : "Stoppuhr starten"}
                onClick={handleStartStopStopwatch}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-semibold text-xs active:scale-95 transition-all shadow-sm",
                  isStopwatchRunning
                    ? "bg-[var(--fluent-error)] text-white hover:opacity-90"
                    : "bg-[var(--fluent-accent)] text-black hover:opacity-90"
                )}
              >
                {isStopwatchRunning ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Stopp</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>Start</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="stopwatch-lap"
                aria-label="Runde erfassen"
                disabled={!isStopwatchRunning}
                onClick={handleLapStopwatch}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--fluent-text-primary)] text-xs font-medium active:scale-95 transition-all"
              >
                <Flag className="w-3.5 h-3.5 text-[var(--fluent-accent)]" />
                <span>Runde</span>
              </button>

              <button
                type="button"
                data-testid="stopwatch-reset"
                aria-label="Stoppuhr zurücksetzen"
                onClick={handleResetStopwatch}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] text-xs font-medium active:scale-95 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            {/* Scrollable Lap Times List */}
            <div className="flex-1 min-h-[90px] border-t border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)]/30 rounded-md p-1.5 overflow-y-auto custom-scrollbar">
              {laps.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-[11px] text-[var(--fluent-text-tertiary)] py-4">
                  Keine Rundenzeiten erfasst
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-3 text-[10px] font-semibold text-[var(--fluent-text-tertiary)] px-2 pb-0.5 border-b border-[var(--fluent-stroke-subtle)]">
                    <span>Runde</span>
                    <span className="text-center">Rundenzeit</span>
                    <span className="text-right">Gesamt</span>
                  </div>
                  {laps.map((lap) => {
                    const lapFormatted = formatStopwatchMs(lap.lapTimeMs);
                    const totalFormatted = formatStopwatchMs(lap.totalTimeMs);
                    return (
                      <div
                        key={lap.lapIndex}
                        data-testid="lap-item"
                        className="grid grid-cols-3 text-xs px-2 py-0.5 rounded font-mono text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
                      >
                        <span className="text-[var(--fluent-text-secondary)]">#{lap.lapIndex}</span>
                        <span className="text-center font-medium">{lapFormatted.display}</span>
                        <span className="text-right text-[var(--fluent-text-tertiary)]">
                          {totalFormatted.display}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: WECKER                                        */}
        {/* ==================================================== */}
        {activeTab === "wecker" && (
          <div data-testid="wecker-tab-content" className="h-full flex flex-col justify-between space-y-3">
            {/* Alarm Status Banner */}
            <div
              data-testid="alarm-status"
              className={cn(
                "p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-all",
                isAlarmEnabled
                  ? "border-[var(--fluent-accent)] bg-[var(--fluent-accent)]/10 text-[var(--fluent-text-primary)]"
                  : "border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)] text-[var(--fluent-text-secondary)] opacity-80"
              )}
            >
              <div className="flex items-center gap-2">
                {isAlarmEnabled ? (
                  <Bell className="w-4 h-4 text-[var(--fluent-accent)] shrink-0" />
                ) : (
                  <BellOff className="w-4 h-4 text-[var(--fluent-text-tertiary)] shrink-0" />
                )}
                <div>
                  <div className="text-xs font-semibold">
                    {isAlarmEnabled ? `Wecker gestellt für ${alarmTime} Uhr` : "Wecker deaktiviert"}
                  </div>
                  <div className="text-[10px] text-[var(--fluent-text-secondary)]">
                    {isAlarmEnabled ? `Täglich wiederholen • ${alarmLabel}` : "Keine anstehenden Alarme"}
                  </div>
                </div>
              </div>

              {/* Toggle Switch Button */}
              <button
                type="button"
                data-testid="alarm-toggle"
                role="switch"
                aria-checked={isAlarmEnabled}
                aria-label="Wecker ein- oder ausschalten"
                onClick={handleToggleAlarm}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  isAlarmEnabled ? "bg-[var(--fluent-accent)]" : "bg-neutral-600"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    isAlarmEnabled ? "translate-x-4 bg-black" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Time Picker and Settings Form */}
            <div className="space-y-2.5 p-3 rounded-lg border border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)]/40">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="alarm-time-input" className="text-xs font-medium text-[var(--fluent-text-secondary)]">
                  Uhrzeit
                </label>
                <input
                  id="alarm-time-input"
                  data-testid="alarm-time-input"
                  type="time"
                  value={alarmTime}
                  onChange={(e) => setAlarmTime(e.target.value)}
                  className="px-2 py-1 text-sm font-mono font-bold rounded-md border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] text-[var(--fluent-text-primary)] focus:outline-none focus:border-[var(--fluent-accent)]"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <label htmlFor="alarm-label-input" className="text-xs font-medium text-[var(--fluent-text-secondary)]">
                  Bezeichnung
                </label>
                <input
                  id="alarm-label-input"
                  data-testid="alarm-label-input"
                  type="text"
                  value={alarmLabel}
                  onChange={(e) => setAlarmLabel(e.target.value)}
                  placeholder="z.B. Aufstehen"
                  className="w-36 px-2 py-1 text-xs rounded-md border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] text-[var(--fluent-text-primary)] placeholder-[var(--fluent-text-tertiary)] focus:outline-none focus:border-[var(--fluent-accent)]"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs font-medium text-[var(--fluent-text-secondary)]">
                  Wiederholung
                </span>
                <span className="text-[11px] font-semibold text-[var(--fluent-accent)]">
                  Täglich (Mo-So)
                </span>
              </div>
            </div>

            {/* Alert Test Trigger */}
            <div className="pt-2 border-t border-[var(--fluent-stroke-subtle)] flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setAlarmTriggered(!alarmTriggered)}
                className="text-[11px] text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-accent)] transition-colors flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Alarm-Test simulieren</span>
              </button>

              {alarmTriggered && (
                <div className="flex items-center gap-1 text-[11px] font-bold text-[var(--fluent-error)] animate-pulse">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Klingelt jetzt!</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
