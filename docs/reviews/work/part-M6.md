# Review Findings - Module M6: Productivity & Media Widgets & Settings

### [MAJOR] [OPEN] M6-01 Hero temperature unit disconnected from number as lowercase-like orphan "C"
- **Status**: OPEN
- **Where**: `src/widgets/weather/WeatherWidget.tsx:160-168`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In `WeatherWidget`, the current temperature renders as `14°` in a 30px (3xl) font, followed by an orphaned `C` in muted 12px (`text-xs text-[var(--fluent-text-secondary)]`) separated by a `gap-1` flex offset. In Segoe UI Variable, this renders visually as `14°  C` where the tiny, muted "C" looks like an accidental subscript / lowercase letter "c", while all other temperatures in the widget (`• Gefühlt 12°`, hourly `15°`, daily `18° / 9°`) omit "C" entirely and `formatTemperature` in `wmoCodes.ts` specifies unified `${rounded}°C`.
- **Why**: `WeatherWidget.tsx` fragments the temperature value and Celsius unit across two distinct flex items with `gap-1`, styling the unit with `text-xs text-[var(--fluent-text-secondary)]` instead of displaying a unified temperature string.
- **Fix**:
```diff
--- a/src/widgets/weather/WeatherWidget.tsx
+++ b/src/widgets/weather/WeatherWidget.tsx
@@ -160,9 +160,8 @@ export const WeatherWidget: FC<WeatherWidgetProps> = ({ className = "" }) => {
           <div className="flex items-baseline gap-1">
             <span
               className="text-3xl font-light tracking-tight text-[var(--fluent-text-primary)]"
               data-testid="weather-current-temp"
             >
-              {current.temperatureC}°
+              {current.temperatureC}°C
             </span>
-            <span className="text-xs text-[var(--fluent-text-secondary)]">C</span>
           </div>
```

### [MAJOR] [OPEN] M6-02 Upload metric subtitle "Speed test payload" truncated to "Speed test paylo..."
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:255`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When viewing the Speedtest widget, the third sub-card (Upload metric) permanently displays "Speed test paylo..." with an ellipsis on screen.
- **Why**: In `SpeedtestWidget.tsx`, the 3-column sub-card grid allocates only ~92px of horizontal content width per card. The unlocalized English string `"Speed test payload"` (18 characters) exceeds this boundary and is aggressively clipped by the `truncate` CSS utility class.
- **Fix**:
```diff
--- a/src/widgets/speedtest/SpeedtestWidget.tsx
+++ b/src/widgets/speedtest/SpeedtestWidget.tsx
@@ -252,5 +252,5 @@ export const SpeedtestWidget: FC<SpeedtestWidgetProps> = ({
               : "--"}{" "}
             <span className="text-[9px] font-normal text-[var(--fluent-text-secondary)]">Mbps</span>
           </div>
-          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Speed test payload</div>
+          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Cloudflare Payload</div>
         </div>
```

### [MAJOR] [OPEN] M6-03 Direct DOM mutation in launcher `img.onError` hides both icon and fallback initials upon re-render
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:265-272`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When a launcher item has an invalid or slow `icon_url`, `onError` imperatively removes `"hidden"` from the fallback initials `div` and hides the `<img>`. As soon as any React state update re-renders the component (e.g. typing in the search box, filtering by category, or launching an item), React's reconciliation re-evaluates `item.icon_url && "hidden"` and restores the `"hidden"` class on the initials `div`, while the `<img>` remains at `display: none`. This results in both the image and the fallback initials disappearing entirely, leaving an empty hole.
- **Why**: The fallback mechanism mutates the DOM directly (`style.display = "none"` and `classList.remove("hidden")`) rather than managing image error state through React component state.
- **Fix**:
```diff
--- a/src/widgets/launcher/GameLauncherWidget.tsx
+++ b/src/widgets/launcher/GameLauncherWidget.tsx
@@ -260,14 +260,8 @@ export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
                   {item.icon_url ? (
                     <img
                       src={item.icon_url}
                       alt={item.name}
                       className="w-8 h-8 rounded-md object-cover shadow-sm shrink-0 transition-transform group-hover:scale-105 border border-[var(--fluent-stroke-subtle)]"
-                      onError={(e) => {
-                        // Fallback gracefully to initials if image fails to load
-                        (e.currentTarget as HTMLElement).style.display = "none";
-                        const fallback = e.currentTarget.nextElementSibling;
-                        if (fallback) (fallback as HTMLElement).classList.remove("hidden");
-                      }}
+                      onError={(e) => { (e.currentTarget as HTMLElement).classList.add("hidden"); }}
                     />
                   ) : null}
```

### [MAJOR] [OPEN] M6-04 Add custom game modal escapes card bounds due to missing `relative` on Card
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:146-153, 343-350`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Clicking "+ Hinzufügen" in `GameLauncherWidget` opens the modal dialog. Because `Card` does not declare `relative` positioning and `GameLauncherWidget` does not include `relative` in its root classes, the modal's `absolute inset-0` coordinates resolve against whatever ancestor container has relative positioning (e.g., the whole window or docking canvas), stretching the modal backdrop and dialog far outside the launcher widget card.
- **Why**: `Card.tsx` does not include `relative` in its default class list, and `GameLauncherWidget.tsx` omits `relative` while placing an `absolute inset-0` modal overlay inside it.
- **Fix**:
```diff
--- a/src/widgets/launcher/GameLauncherWidget.tsx
+++ b/src/widgets/launcher/GameLauncherWidget.tsx
@@ -147,5 +147,5 @@ export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
     <Card
       variant="acrylic"
       className={cn(
-        "w-full h-full p-3.5 flex flex-col gap-3 text-[var(--fluent-text-primary)] select-none overflow-hidden",
+        "relative w-full h-full p-3.5 flex flex-col gap-3 text-[var(--fluent-text-primary)] select-none overflow-hidden",
         className
```

### [MAJOR] [OPEN] M6-05 Stale key retention in `useCalendar` preserves deleted calendar dates across updates
- **Status**: OPEN
- **Where**: `src/hooks/useCalendar.ts:70-74`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When all notes for a given calendar date are deleted, the backend removes that date key from `config.calendar_events`. When the updated configuration is received, `useCalendar` executes `setEvents((prev) => ({ ...prev, ...config.calendar_events }))`. Due to the object spread merge, the deleted date key in `prev` is preserved indefinitely in state, causing phantom note indicators (`note-dot`) to remain displayed on the monthly grid.
- **Why**: `useCalendar.ts` uses shallow object spread merge `{ ...prev, ...config.calendar_events }`, which retains keys that were deleted from the source configuration.
- **Fix**:
```diff
--- a/src/hooks/useCalendar.ts
+++ b/src/hooks/useCalendar.ts
@@ -69,6 +69,3 @@
     if (!options?.initialEvents && config.calendar_events) {
-      setEvents((prev) => ({
-        ...prev,
-        ...config.calendar_events,
-      }));
+      setEvents(config.calendar_events);
     }
```

### [MAJOR] [OPEN] M6-06 Alarm tab in `ClockWidget` never triggers automatically when current time reaches alarm time
- **Status**: OPEN
- **Where**: `src/widgets/clock/ClockWidget.tsx:204-213, 811-828`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User sets an alarm for "07:00" and enables it (`isAlarmEnabled: true`). When the system clock strikes 07:00, no alarm sounds, no visual alert triggers, and `alarmTriggered` remains false. The only way the alarm state ever flips to true is if the user manually clicks "Alarm-Test simulieren".
- **Why**: `ClockWidget.tsx` stores `alarmTime` and `isAlarmEnabled`, but contains zero timer or tick effect comparing `currentTime` to `alarmTime`.
- **Fix**:
```diff
--- a/src/widgets/clock/ClockWidget.tsx
+++ b/src/widgets/clock/ClockWidget.tsx
@@ -212,2 +212,12 @@ export const ClockWidget: FC<ClockWidgetProps> = ({
     if (alarmTriggered) setAlarmTriggered(false);
   };
+
+  useEffect(() => {
+    if (!isAlarmEnabled || alarmTriggered) return;
+    const nowStr = `${digitalTime.hours}:${digitalTime.minutes}`;
+    if (nowStr === alarmTime && parseInt(digitalTime.seconds, 10) === 0) {
+      setAlarmTriggered(true);
+    }
+  }, [digitalTime, alarmTime, isAlarmEnabled, alarmTriggered]);
```

### [MINOR] [OPEN] M6-07 Note input '+' button positioned with hardcoded `top-[3px]` against padded form, causing vertical misalignment
- **Status**: OPEN
- **Where**: `src/widgets/calendar/CalendarWidget.tsx:192-207`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In `CalendarWidget`, the '+' button inside the note input is offset using a hardcoded `top-[3px]` on a form element that has `pb-2`. Under high-DPI scaling or non-standard system fonts, the button is visibly uncentered against the input field, sitting too high and clipping against the top border.
- **Why**: The `<form>` element applies padding-bottom (`pb-2`), so an absolute child pinned to `top-[3px]` does not center vertically within the `<input>` element.
- **Fix**:
```diff
--- a/src/widgets/calendar/CalendarWidget.tsx
+++ b/src/widgets/calendar/CalendarWidget.tsx
@@ -192,3 +192,3 @@ export const CalendarWidget: FC<CalendarWidgetProps> = ({
-        <form onSubmit={handleAddNote} className="relative flex items-center pb-2 shrink-0">
+        <form onSubmit={handleAddNote} className="flex items-center mb-2 shrink-0">
+          <div className="relative flex-1">
           <input
@@ -204,3 +204,4 @@ export const CalendarWidget: FC<CalendarWidgetProps> = ({
-            className="absolute right-1 top-[3px] p-1 rounded bg-[var(--fluent-accent)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center shadow-xs"
+            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded bg-[var(--fluent-accent)] text-black hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center shadow-xs"
           >
             <Plus className="w-3 h-3 stroke-[2.5]" />
           </button>
+          </div>
         </form>
```

### [MINOR] [OPEN] M6-08 In-flow invisible delete button creates asymmetric title truncation in custom launcher items
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:301-310`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Custom launcher items display an invisible delete button with `opacity-0 group-hover:opacity-100`. Because the button is in the layout flow, custom item titles truncate 26px earlier than Steam or Epic game titles, and an asymmetric 26px void appears between the title and the "Starten" button when unhovered.
- **Why**: The delete button occupies layout space even when invisible (`opacity-0`) instead of using `hidden group-hover:block` or conditional absolute layout.
- **Fix**:
```diff
--- a/src/widgets/launcher/GameLauncherWidget.tsx
+++ b/src/widgets/launcher/GameLauncherWidget.tsx
@@ -305,3 +305,3 @@ export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
-                      className="p-1.5 rounded-md text-[var(--fluent-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
+                      className="p-1.5 rounded-md text-[var(--fluent-text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors hidden group-hover:block focus:block"
                       aria-label={`${item.name} entfernen`}
```

### [MINOR] [OPEN] M6-09 Any Win32 application with auto-generated AppUserModelId is falsely branded as "Spotify"
- **Status**: OPEN
- **Where**: `src/widgets/spotify/SpotifyWidget.tsx:28-31`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When playing audio or video from any generic Win32 media player, game, or tool without an explicit AppUserModelId (e.g. Foobar2000, VLC portable, Winamp, OBS, or Chrome background audio with an auto-generated GUID `Microsoft.AutoGenerated.{GUID}`), `formatSourceApp` classifies the application as `"Spotify"`.
- **Why**: `formatSourceApp` checks `if (lower.startsWith("microsoft.autogenerated") || (lower.includes("{") && lower.includes("}"))) return "Spotify";`. Any application with a Windows-generated GUID AppUserModelID is unconditionally misidentified as Spotify.
- **Fix**:
```diff
--- a/src/widgets/spotify/SpotifyWidget.tsx
+++ b/src/widgets/spotify/SpotifyWidget.tsx
@@ -28,5 +28,4 @@ export function formatSourceApp(app: string): string {
-  // Windows Win32 auto-generated AppUserModelIds (e.g. "Microsoft.AutoGenerated.{3A54D6C0...}")
-  if (lower.startsWith("microsoft.autogenerated") || (lower.includes("{") && lower.includes("}"))) {
-    return "Spotify";
-  }
+  if (lower.includes("spotify")) return "Spotify";
   return app.replace(/\.exe$/i, "");
```

### [MINOR] [OPEN] M6-10 `TrackProgress` renders interactive scrubber UI and keybindings despite seeking not being implemented
- **Status**: OPEN
- **Where**: `src/widgets/spotify/SpotifyWidget.tsx:169-172`, `src/widgets/spotify/TrackProgress.tsx:83-99`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: User clicks on the playback progress bar or uses ArrowLeft/ArrowRight to seek. The scrubber visually jumps to the clicked point, but because `SpotifyWidget` does not supply `onSeek` (and the backend has no `media_seek` command), the progress bar snaps back to the original playback position within 250ms on the next interval tick.
- **Why**: `TrackProgress` unconditionally renders interactive scrubber styling (`cursor-pointer`, `onClick={handleSeekClick}`, `tabIndex={0}`, `role="progressbar"`) even when `onSeek` is `undefined`.
- **Fix**:
```diff
--- a/src/widgets/spotify/TrackProgress.tsx
+++ b/src/widgets/spotify/TrackProgress.tsx
@@ -83,5 +83,5 @@ export const TrackProgress: FC<TrackProgressProps> = ({
       <div
-        className="w-full py-1 -my-1 cursor-pointer group"
-        onClick={handleSeekClick}
-        onKeyDown={handleKeyDown}
-        tabIndex={0}
+        className={`w-full py-1 -my-1 ${onSeek ? "cursor-pointer group" : "cursor-default"}`}
+        onClick={onSeek ? handleSeekClick : undefined}
+        onKeyDown={onSeek ? handleKeyDown : undefined}
+        tabIndex={onSeek ? 0 : -1}
```

### [MINOR] [OPEN] M6-11 Play/Pause button uses `text-white` on `--fluent-accent` (`#60cdff`), failing accessibility contrast requirements (1.4:1)
- **Status**: OPEN
- **Where**: `src/widgets/spotify/MediaControls.tsx:53`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In `MediaControls`, the Play/Pause icon is rendered as white on top of `--fluent-accent` (`#60cdff`). In dark mode, the contrast ratio is only 1.43:1, severely violating WCAG 2.1 AA requirements (minimum 3:1) and making the icon difficult to discern. Every other widget in the app correctly uses `text-black` when placed on `--fluent-accent`.
- **Why**: `MediaControls.tsx` hardcodes `text-white` on `bg-[var(--fluent-accent)]` instead of using high-contrast `text-black`.
- **Fix**:
```diff
--- a/src/widgets/spotify/MediaControls.tsx
+++ b/src/widgets/spotify/MediaControls.tsx
@@ -53,3 +53,3 @@ export const MediaControls: FC<MediaControlsProps> = ({
-        className={`rounded-full bg-[var(--fluent-accent)] text-white shadow-md ring-1 ring-white/10 transition-all duration-150 hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center ${
+        className={`rounded-full bg-[var(--fluent-accent)] text-black shadow-md ring-1 ring-white/10 transition-all duration-150 hover:scale-105 hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center ${
```

### [ENHANCEMENT] [OPEN] M6-12 Redundant geocoding HTTP request executed on every periodic weather polling cycle
- **Status**: OPEN
- **Where**: `src/hooks/useWeather.ts:80-97`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When a manual city is configured, every weather refresh (default every 30 minutes) performs an HTTP request to `https://geocoding-api.open-meteo.com/v1/search` to re-resolve the coordinates, before calling `api.open-meteo.com/v1/forecast`. Because coordinates for a city do not change, this causes unnecessary network traffic and introduces an extra point of failure.
- **Why**: `useWeather.ts` does not cache resolved city coordinates in memory or write them to `weather_settings.latitude`/`longitude`.
- **Fix**: Cache resolved coordinates by city name in module-level memory so subsequent polling intervals reuse the latitude/longitude directly.

### [ENHANCEMENT] [OPEN] M6-13 Hardcoded fixed dimensions `w-[360px] h-[256px]` on Card break responsive sizing in docking container
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:88`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: When `SpeedtestWidget` is rendered in `DockContainer` (which passes `className="w-full ..."`), the hardcoded `w-[360px] h-[256px]` takes precedence or conflicts, preventing responsive adaptation to container width.
- **Why**: Unlike `CalendarWidget`, `ClockWidget`, and `WeatherWidget` (which use `w-full h-full max-w-[360px]`), `SpeedtestWidget.tsx` hardcodes absolute pixel widths in the root Card classes.
- **Fix**:
```diff
--- a/src/widgets/speedtest/SpeedtestWidget.tsx
+++ b/src/widgets/speedtest/SpeedtestWidget.tsx
@@ -88,3 +88,3 @@ export const SpeedtestWidget: FC<SpeedtestWidgetProps> = ({
     <Card
       variant="acrylic"
-      className={`w-[360px] h-[256px] p-3 text-[var(--fluent-text-primary)] font-['Segoe_UI_Variable_Text',_'Segoe_UI',_sans-serif] flex flex-col justify-between select-none overflow-hidden ${className}`}
+      className={`w-full h-full max-w-[360px] max-h-[256px] p-3 text-[var(--fluent-text-primary)] font-['Segoe_UI_Variable_Text',_'Segoe_UI',_sans-serif] flex flex-col justify-between select-none overflow-hidden ${className}`}
```
