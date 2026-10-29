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
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ClockFace } from "./ClockFace";
import {
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
  // 1. Clock Tab State (Ticking logic isolated in ClockFace)
  // ----------------------------------------------------

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
      setTimerRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Auto stop when timer hits 0
  useEffect(() => {
    if (timerRemaining === 0 && isTimerRunning) {
      setIsTimerRunning(false);
    }
  }, [timerRemaining, isTimerRunning]);

  const handleStartPauseTimer = () => {
    if (timerRemaining === 0) {
      setTimerRemaining(timerTotalSeconds);
      setIsTimerRunning(true);
    } else {
      setIsTimerRunning(!isTimerRunning);
    }
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
    const m = parseInt(customMinutes, 10) || 0;
    const s = parseInt(customSeconds, 10) || 0;
    const total = m * 60 + s;
    if (total > 0) {
      handleSetPreset(total);
    }
  };

  const timerProgress = useMemo(() => {
    if (timerTotalSeconds === 0) return 0;
    return Math.min(100, Math.max(0, ((timerTotalSeconds - timerRemaining) / timerTotalSeconds) * 100));
  }, [timerTotalSeconds, timerRemaining]);

  // ----------------------------------------------------
  // 3. Stopwatch Tab State
  // ----------------------------------------------------
  const [stopwatchElapsedMs, setStopwatchElapsedMs] = useState<number>(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState<boolean>(false);
  const [laps, setLaps] = useState<LapRecord[]>([]);

  // High precision reference timestamps
  const startTimeRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const lastLapTotalMsRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStopwatchRunning) {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      return;
    }

    startTimeRef.current = performance.now();

    const loop = () => {
      const now = performance.now();
      const currentSessionMs = now - startTimeRef.current;
      setStopwatchElapsedMs(accumulatedMsRef.current + currentSessionMs);
      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [isStopwatchRunning]);

  const handleStartStopStopwatch = () => {
    if (isStopwatchRunning) {
      // Pause
      accumulatedMsRef.current += performance.now() - startTimeRef.current;
      setIsStopwatchRunning(false);
    } else {
      // Resume / Start
      setIsStopwatchRunning(true);
    }
  };

  const handleLapStopwatch = () => {
    if (!isStopwatchRunning) return;
    const currentTotal = stopwatchElapsedMs;
    const lapTime = currentTotal - lastLapTotalMsRef.current;
    lastLapTotalMsRef.current = currentTotal;

    const newRecord: LapRecord = {
      lapIndex: laps.length + 1,
      lapTimeMs: Math.max(0, lapTime),
      totalTimeMs: currentTotal,
    };
    setLaps((prev) => [newRecord, ...prev]);
  };

  const handleResetStopwatch = () => {
    setIsStopwatchRunning(false);
    accumulatedMsRef.current = 0;
    lastLapTotalMsRef.current = 0;
    setStopwatchElapsedMs(0);
    setLaps([]);
  };

  const formattedStopwatch = useMemo(() => {
    return formatStopwatchMs(stopwatchElapsedMs);
  }, [stopwatchElapsedMs]);

  // ----------------------------------------------------
  // 4. Alarm Tab State
  // ----------------------------------------------------
  const [isAlarmEnabled, setIsAlarmEnabled] = useState<boolean>(true);
  const [alarmTime, setAlarmTime] = useState<string>("07:00");
  const [alarmLabel, setAlarmLabel] = useState<string>("Aufstehen");
  const [alarmTriggered, setAlarmTriggered] = useState<boolean>(false);
  const lastTriggeredMinuteRef = useRef<string>("");

  const handleToggleAlarm = () => {
    setIsAlarmEnabled(!isAlarmEnabled);
    if (alarmTriggered) setAlarmTriggered(false);
  };

  // Dedicated background alarm monitor aligned with clean second boundaries
  useEffect(() => {
    if (!isAlarmEnabled || alarmTriggered) return;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const checkAlarm = () => {
      if (!isMounted) return;
      const now = new Date();
      const localHours = String(now.getHours()).padStart(2, "0");
      const localMinutes = String(now.getMinutes()).padStart(2, "0");
      const localNowStr = `${localHours}:${localMinutes}`;
      const todayKey = `${now.toDateString()}_${localNowStr}`;
      if (localNowStr === alarmTime && lastTriggeredMinuteRef.current !== todayKey) {
        lastTriggeredMinuteRef.current = todayKey;
        setAlarmTriggered(true);
      }
      scheduleNext();
    };

    const scheduleNext = () => {
      const nowMs = Date.now();
      const delay = 1000 - (nowMs % 1000);
      timerId = setTimeout(checkAlarm, delay);
    };

    checkAlarm();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isAlarmEnabled, alarmTriggered, alarmTime]);

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
      {/* Segmented Top Navigation Tabs */}
      <div className="p-2 border-b border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)]/40 shrink-0">
        <div
          role="tablist"
          aria-label="Uhrwerk Funktionen"
          className="grid grid-cols-4 gap-1 p-0.5 rounded-lg border border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)]"
        >
          <button
            type="button"
            role="tab"
            aria-label="Uhr"
            title="Uhr"
            aria-selected={activeTab === "uhr"}
            onClick={() => setActiveTab("uhr")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-md text-[11px] font-medium transition-[color,background-color] duration-150 overflow-hidden",
              activeTab === "uhr"
                ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
            )}
          >
            <ClockIcon className="w-3.5 h-3.5 shrink-0" />
            <span className={cn(activeTab !== "uhr" && "hidden")}>Uhr</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-label="Timer"
            title="Timer"
            aria-selected={activeTab === "timer"}
            onClick={() => setActiveTab("timer")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-md text-[11px] font-medium transition-[color,background-color] duration-150 overflow-hidden",
              activeTab === "timer"
                ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
            )}
          >
            <Hourglass className="w-3.5 h-3.5 shrink-0" />
            <span className={cn(activeTab !== "timer" && "hidden")}>Timer</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-label="Stoppuhr"
            title="Stoppuhr"
            aria-selected={activeTab === "stoppuhr"}
            onClick={() => setActiveTab("stoppuhr")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-md text-[11px] font-medium transition-[color,background-color] duration-150 overflow-hidden",
              activeTab === "stoppuhr"
                ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
            )}
          >
            <TimerIcon className="w-3.5 h-3.5 shrink-0" />
            <span className={cn(activeTab !== "stoppuhr" && "hidden")}>Stoppuhr</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-label="Wecker"
            title="Wecker"
            aria-selected={activeTab === "wecker"}
            onClick={() => setActiveTab("wecker")}
            className={cn(
              "flex items-center justify-center gap-1.5 py-1 px-1.5 rounded-md text-[11px] font-medium transition-[color,background-color] duration-150 overflow-hidden",
              activeTab === "wecker"
                ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]"
            )}
          >
            <Bell className="w-3.5 h-3.5 shrink-0" />
            <span className={cn(activeTab !== "wecker" && "hidden")}>Wecker</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 flex flex-col justify-between">
        {/* ==================================================== */}
        {/* TAB 1: UHR (Render Isolated Subcomponent)            */}
        {/* ==================================================== */}
        {activeTab === "uhr" && (
          <ClockFace initialTime={initialTime} />
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
                    "flex-1 py-1 px-1 rounded-md text-[11px] font-medium border border-[var(--fluent-stroke-subtle)] transition-[color,background-color,border-color] duration-150",
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
                      "fill-none transition-[stroke] duration-300",
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
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[var(--fluent-accent)] text-black font-semibold text-xs hover:opacity-90 active:scale-95 transition-[background-color,opacity,transform] duration-150 shadow-sm"
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] text-xs font-medium active:scale-95 transition-[color,background-color,transform] duration-150"
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
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-semibold text-xs active:scale-95 transition-[color,background-color,opacity,transform] duration-150 shadow-sm",
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--fluent-text-primary)] text-xs font-medium active:scale-95 transition-[color,background-color,opacity,transform] duration-150"
              >
                <Flag className="w-3.5 h-3.5 text-[var(--fluent-accent)]" />
                <span>Runde</span>
              </button>

              <button
                type="button"
                data-testid="stopwatch-reset"
                aria-label="Stoppuhr zurücksetzen"
                onClick={handleResetStopwatch}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] text-xs font-medium active:scale-95 transition-[color,background-color,opacity,transform] duration-150"
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
                "p-2.5 rounded-lg border flex items-center justify-between gap-2 transition-[color,background-color,border-color] duration-150",
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
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ease-in-out",
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
