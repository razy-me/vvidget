# Audit Findings: Fraction M5 - System & Hardware Widgets & Hooks

## Scope
- `src/widgets/battery/*` (`BatteryWidget.tsx`, `BatterySparkline.tsx`)
- `src/widgets/bluetooth/*` (`BluetoothWidget.tsx`)
- `src/widgets/resources/*` (`ResourceWidget.tsx`, `MetricBar.tsx`, `MiniGraph.tsx`)
- `src/widgets/quick-settings/*` (`QuickSettingsWidget.tsx`)
- `src/hooks/useBattery.ts`
- `src/hooks/useSystemMetrics.ts`
- `src/hooks/useMasterVolume.ts`

---

### [MAJOR] [OPEN] M5-01 BatterySparkline flexbox centering and missing min-h-0 causes SVG vertical collapse and clipping
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatterySparkline.tsx:68-78`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Laptop battery status contains 4 capacity samples (e.g., `[82, 82, 82, 82]`). The header displays "Kapazitätsverlauf 4 Messpunkte", but the sparkline graph area below it is completely blank.
- **Why**: The outer wrapper `<div className="w-full overflow-hidden flex flex-col justify-center" style={{ height: `${height}px` }}>` wraps an `<svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">`. In CSS Flexbox, SVG elements default to `min-height: auto`, which resolves to their 1:1 intrinsic aspect-ratio height (~280-320px based on widget width). `justify-center` vertically centers this 280px tall element inside the 32px box, translating the SVG top to approximately -124px. Because high battery charge levels (75-100%) render near the top of the viewBox (y = 8..25), the path is placed at screen position ~-100px and completely clipped away by `overflow-hidden`. Additionally, `preserveAspectRatio="none"` non-uniformly distorts the marker circle into a flattened ellipse and clips its right half at x=100.
- **Fix**:
```diff
--- a/src/widgets/battery/BatterySparkline.tsx
+++ b/src/widgets/battery/BatterySparkline.tsx
@@ -65,13 +65,13 @@ export const BatterySparkline: FC<BatterySparklineProps> = ({
   const lastPoint = coords[coords.length - 1];
 
   return (
     <div
-      className={cn("w-full overflow-hidden flex flex-col justify-center", className)}
+      className={cn("w-full overflow-hidden relative block", className)}
       style={{ height: `${height}px` }}
       role="img"
       aria-label="Akkukapazitätsverlauf Sparkline"
       data-testid="battery-sparkline"
     >
       <svg
         viewBox="0 0 100 100"
         preserveAspectRatio="none"
-        className="w-full h-full overflow-visible"
+        className="w-full h-full block"
       >
```

---

### [MAJOR] [OPEN] M5-02 Erroneous "Systemlaufwerk" header and MetricBar duplicate label for secondary disk drives
- **Status**: OPEN
- **Where**: `src/widgets/resources/ResourceWidget.tsx:160-163, 191`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: System has drive C: and secondary data drive D:. On C:, the card displays "Systemlaufwerk (C:)" in the header and immediately repeats "Systemlaufwerk" inside the MetricBar 5px below. When clicking "D:", the header displays "Systemlaufwerk (D:)" (calling a secondary volume "Systemlaufwerk"), and the MetricBar sub-label also displays "Systemlaufwerk".
- **Why**: The section header unconditionally hardcodes `"Systemlaufwerk ("` instead of checking if `activeDiskIndex === systemDiskIndex`. In the MetricBar, `label` falls back to `"Systemlaufwerk"` instead of displaying the volume label or "Laufwerk".
- **Fix**:
```diff
--- a/src/widgets/resources/ResourceWidget.tsx
+++ b/src/widgets/resources/ResourceWidget.tsx
@@ -158,8 +158,10 @@ export const ResourceWidget: FC<ResourceWidgetProps> = ({
               <div className="flex items-center justify-between mb-1">
                 <div className="flex items-center gap-1.5 text-xs font-medium">
                   <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                   <span>
-                    Systemlaufwerk ({activeDisk.mount_point.replace(/\\$/, "")})
+                    {activeDiskIndex === systemDiskIndex ? "Systemlaufwerk" : "Laufwerk"} (
+                    {activeDisk.mount_point.replace(/\\$/, "")})
                   </span>
                 </div>
 
                 {/* Windows 11 Segmented Control rounded-[5px] */}
@@ -188,7 +190,11 @@ export const ResourceWidget: FC<ResourceWidgetProps> = ({
               </div>
 
               <MetricBar
-                label={activeDisk.name !== activeDisk.mount_point && activeDisk.name ? activeDisk.name : "Systemlaufwerk"}
+                label={
+                  activeDisk.name && activeDisk.name !== activeDisk.mount_point
+                    ? activeDisk.name
+                    : `Belegt (${activeDisk.mount_point.slice(0, 2)})`
+                }
                 valueDisplay={`${diskUsedGb} / ${diskTotalGb}`}
                 percent={diskPercent}
                 variant={diskVariant}
```

---

### [MAJOR] [OPEN] M5-03 Bluetooth device list overflow, name compression by hidden toggle, and bottom button clipping
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:203, 278-316, 324-334`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When two or more devices are paired, the device list overflows the 240px card height. The "Trennen"/"Verbinden" button has `opacity-0` but occupies ~65px in the layout flow permanently, crushing device names down to ~100px. At 125% Windows DPI scaling, the 40-character button text "Windows Bluetooth-Einstellungen öffnen" wraps into two lines, pushing the button outside the card boundaries where its bottom corners are clipped off.
- **Why**: Hidden hover controls reserve physical flex space in the item row instead of acting as an overlay or appearing on touch/focus. The bottom button text is overly verbose and overflows the available width in small containers.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -280,7 +280,7 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
                   {device.battery_level != null && (
                     <div
                       data-testid={`device-battery-${device.id}`}
-                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--fluent-text-secondary)] px-1.5 py-0.5 rounded bg-[var(--fluent-subtle-bg)] border border-[var(--fluent-stroke)] flex-shrink-0 group-hover:opacity-40 transition-opacity"
+                      className="flex items-center gap-1 text-[11px] font-medium text-[var(--fluent-text-secondary)] px-1.5 py-0.5 rounded bg-[var(--fluent-subtle-bg)] border border-[var(--fluent-stroke)] flex-shrink-0 group-hover:hidden"
                     >
                       <Battery className="w-3.5 h-3.5 text-emerald-400" />
                       <span>{device.battery_level}%</span>
@@ -301,7 +301,7 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
                       device.connected
                         ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/40"
                         : "bg-[var(--fluent-accent-subtle)] text-[var(--fluent-accent)] border-[var(--fluent-accent)]/30 hover:bg-[var(--fluent-accent)]/20 hover:border-[var(--fluent-accent)]",
-                      "opacity-0 group-hover:opacity-100 focus:opacity-100",
+                      "hidden group-hover:flex focus:flex",
                       isToggling && "opacity-60 pointer-events-none"
                     )}
                   >
@@ -329,7 +329,7 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
           className="w-full py-1.5 px-3 rounded-lg bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] active:bg-[var(--fluent-card-active)] border border-[var(--fluent-stroke)] text-xs font-medium text-[var(--fluent-text-primary)] flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--fluent-accent)] flex-shrink-0 cursor-pointer"
         >
           <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
-          <span>Windows Bluetooth-Einstellungen öffnen</span>
+          <span className="truncate">Bluetooth-Einstellungen</span>
         </button>
       </div>
```

---

### [MAJOR] [OPEN] M5-04 Custom quick actions missing from customization list, preventing deletion or reordering
- **Status**: OPEN
- **Where**: `src/widgets/quick-settings/QuickSettingsWidget.tsx:424-473`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User adds a custom URL or executable via the "Eigener Pfad / URL" field. The action tile appears on the widget dashboard. When opening the customization menu to delete or reorder it, only `PREDEFINED_ACTIONS` are displayed; custom actions are absent and cannot be unpinned or removed.
- **Why**: The customization dialog exclusively maps over `PREDEFINED_ACTIONS`. Custom action IDs starting with `custom:` are never rendered in the list, making it impossible to uncheck or delete them from the UI.
- **Fix**:
```diff
--- a/src/widgets/quick-settings/QuickSettingsWidget.tsx
+++ b/src/widgets/quick-settings/QuickSettingsWidget.tsx
@@ -423,7 +423,7 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
           {/* List of predefined actions with toggle and reordering */}
           <div className="flex flex-col gap-1">
-            {PREDEFINED_ACTIONS.map((action) => {
+            {Array.from(new Set([...PREDEFINED_ACTIONS.map((a) => a.id), ...pinnedActionIds])).map((actionId) => {
+              const action = resolveActionDef(actionId);
               const isPinned = pinnedActionIds.includes(action.id);
               const pinnedIndex = pinnedActionIds.indexOf(action.id);
               const ActionIcon = action.icon;
```

---

### [MAJOR] [OPEN] M5-05 `setVolume` updates UI mute state without unmuting native Windows audio endpoint
- **Status**: OPEN
- **Where**: `src/hooks/useMasterVolume.ts:75-91`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: System volume is muted in Windows. In the media widget, user drags the volume slider up from 0 to 45%. The UI shows the unmuted speaker icon, but no sound plays because the Windows Core Audio endpoint remains muted.
- **Why**: `setVolume` updates React state `setIsMutedState(false)` when `clamped > 0`, but only calls `set_master_volume` over IPC. In Windows WASAPI, `SetMasterVolumeLevelScalar` does not clear the mute flag on `IAudioEndpointVolume`.
- **Fix**:
```diff
--- a/src/hooks/useMasterVolume.ts
+++ b/src/hooks/useMasterVolume.ts
@@ -82,6 +82,7 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
     if (!isTauri()) return;
 
     try {
+      if (isMuted && clamped > 0) {
+        await safeInvoke("toggle_master_mute");
+      }
       await safeInvoke("set_master_volume", { level: clamped });
     } catch (err) {
```

---

### [MINOR] [OPEN] M5-06 Missing volume poll interval or OS event listener leaves slider permanently out of sync
- **Status**: OPEN
- **Where**: `src/hooks/useMasterVolume.ts:38-73`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User adjusts volume using keyboard hardware keys (Volume Up/Down) or Windows taskbar slider. The widget volume slider never updates and stays on the stale mount value.
- **Why**: `useMasterVolume` invokes `refresh()` only once on initial component mount and lacks any periodic polling or native WASAPI endpoint callback.
- **Fix**:
```diff
--- a/src/hooks/useMasterVolume.ts
+++ b/src/hooks/useMasterVolume.ts
@@ -67,6 +67,10 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
     if (isTauri()) {
       void refresh();
+      const interval = setInterval(() => {
+        void refresh();
+      }, 3000);
+      return () => {
+        isMountedRef.current = false;
+        clearInterval(interval);
+      };
     }
     return () => {
       isMountedRef.current = false;
     };
```

---

### [MINOR] [OPEN] M5-07 Hardcoded 360x384px card dimensions in BatteryWidget exceed 320x360px window registry
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:79, 101, 161, 198`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When BatteryWidget is mounted in standalone or preview contexts without an explicit `className` override, it renders at `w-[360px] h-[384px]`. The Tauri window is sized to `320x360px`, resulting in 40px horizontal and 24px vertical overflow clipping.
- **Why**: Dismissed, no-battery, loading, and normal cards hardcode `w-[360px] h-[384px]` instead of `w-full h-full max-w-none`.
- **Fix**:
```diff
--- a/src/widgets/battery/BatteryWidget.tsx
+++ b/src/widgets/battery/BatteryWidget.tsx
@@ -78,3 +78,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
           className={cn(
-            "w-[360px] h-[384px] p-5 flex flex-col items-center justify-center text-center select-none text-[var(--fluent-text-secondary)]",
+            "w-full h-full p-5 flex flex-col items-center justify-center text-center select-none text-[var(--fluent-text-secondary)]",
             className
@@ -100,3 +100,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
         className={cn(
-          "w-[360px] h-[384px] p-5 flex flex-col justify-between select-none relative overflow-hidden",
+          "w-full h-full p-5 flex flex-col justify-between select-none relative overflow-hidden",
           className
@@ -160,3 +160,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
         className={cn(
-          "w-[360px] h-[384px] p-5 flex flex-col items-center justify-center text-center select-none",
+          "w-full h-full p-5 flex flex-col items-center justify-center text-center select-none",
           className
@@ -197,3 +197,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
       className={cn(
-        "w-[360px] h-[384px] p-4 flex flex-col justify-between text-[var(--fluent-text-primary)] select-none overflow-hidden",
+        "w-full h-full p-4 flex flex-col justify-between text-[var(--fluent-text-primary)] select-none overflow-hidden",
         className
```

---

### [MINOR] [OPEN] M5-08 Bluetooth status badge displays green "Aktiv" when all paired devices are disconnected
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:147, 172-179`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User has paired devices (e.g. keyboard and mouse), but both are turned off and disconnected. The Bluetooth widget header displays a green badge labeled "Aktiv".
- **Why**: `statusText` evaluates `devices.length > 0` rather than `devices.some(d => d.connected)`.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -146,3 +146,4 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
   }, [devices]);
 
-  const statusText = devices.length > 0 ? "Aktiv" : "Keine Geräte";
+  const hasConnected = devices.some((d) => d.connected);
+  const statusText = hasConnected ? "Verbunden" : devices.length > 0 ? "Bereit" : "Keine Geräte";
 
@@ -173,3 +174,3 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
                 className={cn(
                   "text-[10px] px-1.5 py-0.2 rounded-full font-medium flex-shrink-0",
-                  devices.length > 0
+                  hasConnected
                     ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
```

---

### [MINOR] [OPEN] M5-09 MetricBar unvalidated `NaN` produces `"NaN%"` and invalid CSS progress bar width
- **Status**: OPEN
- **Where**: `src/widgets/resources/MetricBar.tsx:28-30`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: During system startup or if a sensor returns `NaN`, `percent` passed to MetricBar is `NaN`. MetricBar renders `"NaN%"` and passes `NaN` to `ProgressBar`, corrupting CSS inline styling.
- **Why**: `Math.round(NaN)` returns `NaN`, and `Math.min(Math.max(NaN, 0), 100)` evaluates to `NaN` without a fallback check.
- **Fix**:
```diff
--- a/src/widgets/resources/MetricBar.tsx
+++ b/src/widgets/resources/MetricBar.tsx
@@ -27,4 +27,5 @@ export const MetricBar: FC<MetricBarProps> = ({
 }) => {
-  const roundedPercent = Math.min(Math.max(Math.round(percent), 0), 100);
+  const safePercent = Number.isFinite(percent) ? percent : 0;
+  const roundedPercent = Math.min(Math.max(Math.round(safePercent), 0), 100);
   const activeVariant = variant ?? getMetricVariant(roundedPercent);
```

---

### [MINOR] [OPEN] M5-10 Dead code and continuous CPU history array allocations for unrendered `MiniGraph`
- **Status**: OPEN
- **Where**: `src/widgets/resources/MiniGraph.tsx:1-107`, `src/hooks/useSystemMetrics.ts:72-88`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: Every second, telemetry events trigger `appendCpuSample`. The hook slices and allocates a new 20-element number array for `cpuHistory`, triggering re-renders, but `ResourceWidget` never imports or renders `MiniGraph` or `cpuHistory`.
- **Why**: `MiniGraph` was unlinked during design refactors without cleaning up unused component exports or removing the unrendered history accumulator from the hook.
- **Fix**: Either re-integrate `MiniGraph` into `ResourceWidget` under CPU usage, or remove `cpuHistory` state accumulation from `useSystemMetrics.ts` when no sparkline is rendered.
