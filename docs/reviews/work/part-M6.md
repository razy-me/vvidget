# Review Findings: M6 (Productivity & Media Widgets & Settings)

Scope:
- `src/widgets/clock/*`
- `src/widgets/calendar/*`
- `src/widgets/spotify/*`
- `src/widgets/weather/*`
- `src/widgets/launcher/*`
- `src/widgets/speedtest/*`
- `src/services/weather/*`
- `src/pages/settings/*`

---

### [MAJOR] [OPEN] M6-01 Stopwatch Reset While Running Overwritten by Effect Cleanup
- **Status**: OPEN
- **Where**: `src/widgets/clock/ClockWidget.tsx:167-169`, `src/widgets/clock/ClockWidget.tsx:189-196`
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User starts the stopwatch in the Stoppuhr tab. After running for 10 seconds, the user clicks "Reset". The display resets to `00:00.00`. The user then clicks "Start" to begin a new timing. Instead of starting from zero, the stopwatch immediately resumes from 10.00 seconds.
- **Why**: `handleResetStopwatch` sets `stopwatchAccumulatedRef.current = 0` and calls `setIsStopwatchRunning(false)`. During the resulting state transition, React unmounts the active timer effect and executes its cleanup function (`stopwatchAccumulatedRef.current += performance.now() - stopwatchStartTimeRef.current`), which adds the elapsed run duration back into the accumulator after it was reset.
- **Fix**:
```diff
--- a/src/widgets/clock/ClockWidget.tsx
+++ b/src/widgets/clock/ClockWidget.tsx
@@ -153,6 +153,7 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
   const stopwatchStartTimeRef = useRef<number>(0);
   const stopwatchAccumulatedRef = useRef<number>(0);
   const lastLapMsRef = useRef<number>(0);
+  const isResettingStopwatchRef = useRef<boolean>(false);
 
   useEffect(() => {
     if (!isStopwatchRunning) return;
@@ -165,7 +166,10 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
 
     return () => {
       clearInterval(interval);
-      stopwatchAccumulatedRef.current += performance.now() - stopwatchStartTimeRef.current;
+      if (!isResettingStopwatchRef.current) {
+        stopwatchAccumulatedRef.current += performance.now() - stopwatchStartTimeRef.current;
+      }
+      isResettingStopwatchRef.current = false;
     };
   }, [isStopwatchRunning]);
 
@@ -188,6 +192,7 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
   };
 
   const handleResetStopwatch = () => {
+    isResettingStopwatchRef.current = true;
     setIsStopwatchRunning(false);
     stopwatchAccumulatedRef.current = 0;
     lastLapMsRef.current = 0;
```

---

### [MAJOR] [OPEN] M6-02 Settings Polling Rate Sliders Fail to Persist on Modal Close and Read Stale Closure State
- **Where**: `src/pages/settings/SettingsModal.tsx:578-598`, `src/pages/settings/SettingsModal.tsx:631-651`, `src/pages/settings/SettingsModal.tsx:675-695`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User opens the Desktop Preferences modal, navigates to "Weather" or "Resources", adjusts the slider (e.g. CPU & RAM Refresh Interval from 1.5s to 0.5s), and immediately closes the modal using the titlebar "X" button. Upon reopening settings, the interval has reverted to 1.5s. Furthermore, clicking directly on the slider track reads the pre-click closure state in `onPointerUp`, saving the old value instead of the clicked target.
- **Why**: Slider release handlers (`onPointerUp` and `onKeyUp`) call `updateConfig` without passing `saveImmediately = true`. This puts disk writes into a 500ms debounce queue. Closing the window immediately destroys the webview (`current.destroy()`) before the debounce timer fires. Additionally, `onPointerUp` reads `localCpuRamMs` from the component closure instead of `(e.currentTarget as HTMLInputElement).valueAsNumber`.
- **Fix**:
```diff
--- a/src/pages/settings/SettingsModal.tsx
+++ b/src/pages/settings/SettingsModal.tsx
@@ -577,25 +577,29 @@ export const SettingsModal: FC = () => {
                       value={localWeatherMinutes}
                       onChange={(e) => setLocalWeatherMinutes(Number(e.target.value))}
-                      onPointerUp={() => {
+                      onPointerUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            weather_minutes: localWeatherMinutes,
+                            weather_minutes: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
-                      onKeyUp={() => {
+                      onKeyUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            weather_minutes: localWeatherMinutes,
+                            weather_minutes: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
@@ -630,25 +634,29 @@ export const SettingsModal: FC = () => {
                       value={localCpuRamMs}
                       onChange={(e) => setLocalCpuRamMs(Number(e.target.value))}
-                      onPointerUp={() => {
+                      onPointerUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            resources_cpu_ram_ms: localCpuRamMs,
+                            resources_cpu_ram_ms: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
-                      onKeyUp={() => {
+                      onKeyUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            resources_cpu_ram_ms: localCpuRamMs,
+                            resources_cpu_ram_ms: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
@@ -674,25 +682,29 @@ export const SettingsModal: FC = () => {
                       value={localDiskMs}
                       onChange={(e) => setLocalDiskMs(Number(e.target.value))}
-                      onPointerUp={() => {
+                      onPointerUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            resources_disk_ms: localDiskMs,
+                            resources_disk_ms: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
-                      onKeyUp={() => {
+                      onKeyUp={(e) => {
+                        const val = e.currentTarget.valueAsNumber;
                         void updateConfig((prev) => ({
                           ...prev,
                           polling_rates: {
                             ...prev.polling_rates,
-                            resources_disk_ms: localDiskMs,
+                            resources_disk_ms: val,
                           },
-                        }));
+                        }), true);
                         showFeedback();
                       }}
```

---

### [MAJOR] [OPEN] M6-03 Clock Alarm Evaluates Against World Clock Timezone and Can Miss Trigger Due to 1-Second Interval Window
- **Where**: `src/widgets/clock/ClockWidget.tsx:214-220`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: (1) User enables an alarm for `07:00`. On the "Uhr" tab, they change the timezone to "Tokio (JST)" to check foreign time. The alarm now evaluates `nowStr === alarmTime` using Tokyo time and triggers at 07:00 Tokyo time (midnight local time) instead of local system time. (2) If `setInterval(..., 1000)` drifts by even 15ms (e.g. tick at 06:59:59.980 followed by 07:00:01.010 under load), `seconds === 0` is never true and the alarm is missed completely.
- **Why**: `ClockWidget` compares `alarmTime` against `digitalTime` (which tracks the Uhr tab's selected world timezone) rather than local time. Furthermore, requiring `parseInt(digitalTime.seconds, 10) === 0` makes the trigger vulnerable to macro-task timer drift.
- **Fix**:
```diff
--- a/src/widgets/clock/ClockWidget.tsx
+++ b/src/widgets/clock/ClockWidget.tsx
@@ -207,6 +207,7 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
   const [alarmLabel, setAlarmLabel] = useState<string>("Aufstehen");
   const [alarmTriggered, setAlarmTriggered] = useState<boolean>(false);
+  const lastTriggeredMinuteRef = useRef<string>("");
 
   const handleToggleAlarm = () => {
     setIsAlarmEnabled(!isAlarmEnabled);
@@ -215,8 +216,13 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
 
   useEffect(() => {
     if (!isAlarmEnabled || alarmTriggered) return;
-    const nowStr = `${digitalTime.hours}:${digitalTime.minutes}`;
-    if (nowStr === alarmTime && parseInt(digitalTime.seconds, 10) === 0) {
+    const localHours = String(currentTime.getHours()).padStart(2, "0");
+    const localMinutes = String(currentTime.getMinutes()).padStart(2, "0");
+    const localNowStr = `${localHours}:${localMinutes}`;
+    const todayKey = `${currentTime.toDateString()}_${localNowStr}`;
+    if (localNowStr === alarmTime && lastTriggeredMinuteRef.current !== todayKey) {
+      lastTriggeredMinuteRef.current = todayKey;
       setAlarmTriggered(true);
     }
-  }, [digitalTime, alarmTime, isAlarmEnabled, alarmTriggered]);
+  }, [currentTime, alarmTime, isAlarmEnabled, alarmTriggered]);
```

---

### [MINOR] [OPEN] M6-04 Clock Timer Calls State Setter Inside State Updater Function Violating Purity
- **Where**: `src/widgets/clock/ClockWidget.tsx:98-105`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: When the timer countdown reaches 0 seconds, React throws console warnings or causes state desynchronization in Concurrent or Strict Mode.
- **Why**: `setIsTimerRunning(false)` is called inside the functional updater passed to `setTimerRemaining`. React updater functions must be pure projections without side effects.
- **Fix**:
```diff
--- a/src/widgets/clock/ClockWidget.tsx
+++ b/src/widgets/clock/ClockWidget.tsx
@@ -95,14 +95,14 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
   useEffect(() => {
     if (!isTimerRunning) return;
     const interval = setInterval(() => {
-      setTimerRemaining((prev) => {
-        if (prev <= 1) {
-          setIsTimerRunning(false);
-          return 0;
-        }
-        return prev - 1;
-      });
+      setTimerRemaining((prev) => Math.max(0, prev - 1));
     }, 1000);
     return () => clearInterval(interval);
   }, [isTimerRunning]);
+
+  useEffect(() => {
+    if (timerRemaining === 0 && isTimerRunning) {
+      setIsTimerRunning(false);
+    }
+  }, [timerRemaining, isTimerRunning]);
```

---

### [MINOR] [OPEN] M6-05 Weather `fetchWeather` Swallows `AbortError` and Erroneously Returns Cached Stale Data
- **Where**: `src/services/weather/openMeteo.ts:262-269`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When a weather fetch is canceled via `AbortSignal` (e.g. user selects a different location in Settings or the widget unmounts), `fetch` throws `DOMException: AbortError`. Instead of propagating the abort or resolving cleanly, `fetchWeather` catches all errors and returns stale cached data with `isOffline: true`.
- **Why**: `fetchWeather` does not inspect `error.name === "AbortError"` or `signal?.aborted` before activating its offline cache fallback, unlike `geocoding.ts:40`.
- **Fix**:
```diff
--- a/src/services/weather/openMeteo.ts
+++ b/src/services/weather/openMeteo.ts
@@ -260,6 +260,9 @@ export async function fetchWeather(
     setCachedWeather(weatherData);
     return weatherData;
   } catch (error: unknown) {
+    if (error instanceof DOMException && error.name === "AbortError") {
+      throw error;
+    }
     const cached = getCachedWeather();
     if (cached) {
       return { ...cached, isOffline: true };
```

---

### [MINOR] [OPEN] M6-06 Weather `DailyForecast` Unconditionally Labels First Day as "Heute" Even for Stale Offline Cache
- **Where**: `src/widgets/weather/DailyForecast.tsx:11-22`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User launches vvidget while offline. The widget displays cached forecast data from 2 days ago (e.g. Sunday). The first row in the 5-day forecast displays "Heute" next to Sunday's temperatures, falsely presenting 2-day-old weather as current.
- **Why**: `formatDayName` checks `if (index === 0) return "Heute";` blindly without comparing `dateString` against current date.
- **Fix**:
```diff
--- a/src/widgets/weather/DailyForecast.tsx
+++ b/src/widgets/weather/DailyForecast.tsx
@@ -10,7 +10,8 @@ const GERMAN_DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
 
 function formatDayName(dateString: string, index: number): string {
-  if (index === 0) return "Heute";
+  const todayKey = new Date().toISOString().slice(0, 10);
+  if (dateString === todayKey || (index === 0 && !dateString)) return "Heute";
   try {
     const date = new Date(dateString);
     if (!isNaN(date.getTime())) {
```

---

### [ENHANCEMENT] [OPEN] M6-07 Spotify TrackProgress Displays Clickable Seek Controls When Seeking Is Unsupported
- **Where**: `src/widgets/spotify/TrackProgress.tsx:82-99`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User clicks on the progress bar in the Spotify widget or presses arrow keys. The progress thumb visually moves to the clicked point, but since `onSeek` is not provided by `SpotifyWidget`, the thumb snaps back to the real track position 250ms later.
- **Why**: `TrackProgress` renders `cursor-pointer`, `onClick={handleSeekClick}`, and `tabIndex={0}` unconditionally even when `onSeek` is `undefined`.
- **Fix**:
```diff
--- a/src/widgets/spotify/TrackProgress.tsx
+++ b/src/widgets/spotify/TrackProgress.tsx
@@ -82,10 +82,10 @@ export const TrackProgress: FC<TrackProgressProps> = ({
     <div className={`w-full flex flex-col gap-1 select-none ${className}`} data-testid="track-progress">
       <div
-        className="w-full py-1 -my-1 cursor-pointer group"
-        onClick={handleSeekClick}
-        onKeyDown={handleKeyDown}
-        tabIndex={0}
+        className={`w-full py-1 -my-1 group ${onSeek ? "cursor-pointer" : "cursor-default"}`}
+        onClick={onSeek ? handleSeekClick : undefined}
+        onKeyDown={onSeek ? handleKeyDown : undefined}
+        tabIndex={onSeek ? 0 : -1}
         role="progressbar"
         aria-valuenow={Math.round(percent)}
```

---

### [ENHANCEMENT] [OPEN] M6-08 SpotifyWidget Triggers Immediate Re-render on Track Changes via Render-Phase State Mutations
- **Where**: `src/widgets/spotify/SpotifyWidget.tsx:44-51`
- **Status**: OPEN
- **Source**: `r-review` (Tier 2/3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When track or album artwork changes, `SpotifyWidget` performs two state updates during render execution (`setPrevArtUrl`, `setImgError`), forcing React to discard and re-execute the render.
- **Why**: State synchronization during render execution triggers an immediate additional render pass instead of resetting image error state using React keys or `useEffect`.
- **Fix**:
```diff
--- a/src/widgets/spotify/SpotifyWidget.tsx
+++ b/src/widgets/spotify/SpotifyWidget.tsx
@@ -44,11 +44,9 @@ export const SpotifyWidget: FC<SpotifyWidgetProps> = ({
   const { volume, isMuted, setVolume, toggleMute } = useMasterVolume();
 
-  const [prevArtUrl, setPrevArtUrl] = useState(session.album_art_url);
-  const [imgError, setImgError] = useState(false);
-
-  // Sync state during render when track or album art changes
-  if (prevArtUrl !== session.album_art_url) {
-    setPrevArtUrl(session.album_art_url);
-    setImgError(false);
-  }
+  const [imgErrorKey, setImgErrorKey] = useState<string | null>(null);
+  const imgError = imgErrorKey === session.album_art_url;
+  const handleImgError = () => {
+    if (session.album_art_url) setImgErrorKey(session.album_art_url);
+  };
```
