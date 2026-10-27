# Audit Findings: Fraction M5 - System & Hardware Widgets & Hooks

## Scope
- `src/widgets/battery/*` (`BatteryWidget.tsx`, `BatterySparkline.tsx`, `index.ts`)
- `src/widgets/bluetooth/*` (`BluetoothWidget.tsx`, `index.ts`)
- `src/widgets/resources/*` (`ResourceWidget.tsx`, `MetricBar.tsx`, `MiniGraph.tsx`, `index.ts`)
- `src/widgets/quick-settings/*` (`QuickSettingsWidget.tsx`, `index.ts`)
- `src/hooks/useBattery.ts`
- `src/hooks/useSystemMetrics.ts`
- `src/hooks/useMasterVolume.ts`

---

### [MAJOR] [OPEN] M5-01 Hardcoded 360x384px card dimensions in BatteryWidget exceed 320x360px window registry
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:79, 101, 161, 198`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When BatteryWidget is opened in a standalone desktop window, the Tauri backend creates a window sized to 320x360 (`src-tauri/src/lib.rs:71`). Because the widget container elements hardcode `w-[360px] h-[384px]`, the widget overflows the window boundaries by 40px horizontally and 24px vertically, permanently clipping off the bottom action buttons and the right margin.
- **Why**: The root `Card` wrappers for dismissed, no-battery, loading, and normal states specify explicit pixel dimensions `w-[360px] h-[384px]` rather than responsive container bounds `w-full h-full`.
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

### [MAJOR] [OPEN] M5-02 Erroneous "Wird entladen" badge and projection failure on AC power without active charging
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:290-313`, `src/types/battery.ts:87-106`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: A laptop is connected to AC wall power, but charging is halted because battery health conservation mode (e.g. 80% charge threshold) is enabled or the battery is at 99%. `getChargingBadgeInfo` displays "Wird entladen 🔋" with a warning badge, directly contradicting the "Netzbetrieb" footer line. Concurrently, `projection-empty` displays "—" instead of "Netzbetrieb".
- **Why**: `getChargingBadgeInfo` checks only `isCharging` and `chargePercent >= 100 && isPluggedIn`, falling back to `discharging` when `isPluggedIn` is true but `isCharging` is false. Similarly, `BatteryWidget` projections exclusively branch on `is_charging` rather than `is_plugged_in`.
- **Fix**:
```diff
--- a/src/types/battery.ts
+++ b/src/types/battery.ts
@@ -87,4 +87,11 @@ export function getChargingBadgeInfo(
   if (chargePercent >= 100 && isPluggedIn) {
     return {
       label: "Voll geladen ✓",
       type: "full",
       variant: "success",
     };
   }
+  if (isPluggedIn && !isCharging) {
+    return {
+      label: "Netzbetrieb ⚡",
+      type: "charging",
+      variant: "accent",
+    };
+  }
   if (isCharging) {
--- a/src/widgets/battery/BatteryWidget.tsx
+++ b/src/widgets/battery/BatteryWidget.tsx
@@ -290,3 +290,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
               {is_charging
-                ? "Wird geladen"
+                : is_plugged_in
+                ? "Netzbetrieb"
                 : formatEstimatedMinutes(estimated_mins_to_20_percent)}
@@ -299,3 +299,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
               {is_charging
-                ? "Wird geladen"
+                : is_plugged_in
+                ? "Netzbetrieb"
                 : formatEstimatedMinutes(estimated_mins_to_10_percent)}
@@ -308,3 +308,3 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
               {is_charging || is_plugged_in
                 ? "Netzbetrieb"
                 : formatEstimatedMinutes(estimated_mins_to_empty)}
```

---

### [MAJOR] [OPEN] M5-03 Rapid volume adjustments while muted cause duplicate mute toggles and re-mute audio
- **Status**: OPEN
- **Where**: `src/hooks/useMasterVolume.ts:75-96`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: concurrency
- **Scenario**: System volume is muted. User drags the volume slider up from 0% to 50%. The slider emits several rapid `setVolume` calls before React commits a re-render. Successive calls evaluate `wasMuted = isMuted` as `true` and fire multiple asynchronous `toggle_master_mute` calls. The first call unmutes the endpoint, and the second immediately re-mutes it, leaving the native audio muted.
- **Why**: `setVolume` relies on closure-captured `isMuted` React state which remains stale across synchronous drag events in the same tick. A ref is needed to synchronously record unmuting and guard against duplicate toggle invocations.
- **Fix**:
```diff
--- a/src/hooks/useMasterVolume.ts
+++ b/src/hooks/useMasterVolume.ts
@@ -36,2 +36,7 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
   const isMountedRef = useRef(true);
+  const isMutedRef = useRef(initialMuted);
+
+  useEffect(() => {
+    isMutedRef.current = isMuted;
+  }, [isMuted]);
@@ -77,4 +82,5 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
     setVolumeState(clamped);
-    const wasMuted = isMuted;
+    const wasMuted = isMutedRef.current;
     if (wasMuted && clamped > 0) {
+      isMutedRef.current = false;
       setIsMutedState(false);
     }
```

---

### [MINOR] [OPEN] M5-04 Bluetooth status badge displays green "Aktiv" when all paired devices are disconnected
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:147, 172-179`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User has 2 paired devices (e.g. keyboard and mouse), but both are powered off and disconnected. The Bluetooth widget header displays a green badge labeled "Aktiv", misleading the user into believing an active wireless connection exists.
- **Why**: `statusText` evaluates `devices.length > 0` rather than `devices.some(d => d.connected)`, treating pairing presence as active connectivity.
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

### [MINOR] [OPEN] M5-05 Missing volume poll interval or OS event listener leaves slider permanently out of sync
- **Status**: OPEN
- **Where**: `src/hooks/useMasterVolume.ts:38-73`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User adjusts system volume using keyboard hardware keys (Volume Up/Down) or the Windows taskbar slider. The widget volume slider never updates and stays on the initial mount value.
- **Why**: `useMasterVolume` invokes `refresh()` only once on initial component mount and lacks periodic polling or native WASAPI endpoint callbacks.
- **Fix**:
```diff
--- a/src/hooks/useMasterVolume.ts
+++ b/src/hooks/useMasterVolume.ts
@@ -67,3 +67,8 @@ export function useMasterVolume(initialVolume = 0.5, initialMuted = false): UseM
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
```

---

### [MINOR] [OPEN] M5-06 MetricBar unvalidated `NaN` produces `"NaN%"` and invalid CSS progress bar width
- **Status**: OPEN
- **Where**: `src/widgets/resources/MetricBar.tsx:28-30`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: During system wake or when sensor readings are momentarily uninitialized, `percent` passed to `MetricBar` is `NaN`. MetricBar renders `"NaN%"` and passes `NaN` to `ProgressBar`, resulting in `style={{ width: "NaN%" }}` and `aria-valuenow={NaN}`.
- **Why**: `Math.round(NaN)` returns `NaN`, and `Math.min(Math.max(NaN, 0), 100)` evaluates to `NaN` without a finite fallback guard.
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

### [MINOR] [OPEN] M5-07 False positive "Gestartet" feedback when quick action fails in QuickSettingsWidget
- **Status**: OPEN
- **Where**: `src/widgets/quick-settings/QuickSettingsWidget.tsx:201-228`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User clicks a custom quick action tile targeting an invalid path or prohibited executable. The backend returns an error. The error is swallowed, but because `setActiveFeedback(actionId)` was called unconditionally at the start of the handler, the tile displays "Gestartet" with a spinning sparkle icon, falsely indicating success.
- **Why**: `setActiveFeedback` is set before invoking the IPC command instead of only after successful execution.
- **Fix**:
```diff
--- a/src/widgets/quick-settings/QuickSettingsWidget.tsx
+++ b/src/widgets/quick-settings/QuickSettingsWidget.tsx
@@ -201,3 +201,2 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
   const handleActionClick = async (actionId: string) => {
-    setActiveFeedback(actionId);
 
@@ -222,4 +221,6 @@ export const QuickSettingsWidget: FC<QuickSettingsWidgetProps> = ({
       });
-    } catch {
-      // Safe fallback in web/test environment
+      setActiveFeedback(actionId);
+      setTimeout(() => {
+        setActiveFeedback((prev) => (prev === actionId ? null : prev));
+      }, 700);
+    } catch {
+      // Action failed to execute
     } finally {
-      setTimeout(() => {
-        setActiveFeedback((prev) => (prev === actionId ? null : prev));
-      }, 700);
     }
```

---

### [MINOR] [OPEN] M5-08 Swallowed error in `handleToggleDevice` leaves user without feedback when WinRT disconnection fails
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:114-118`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User clicks "Trennen" on a connected Bluetooth device. WinRT backend returns `Err("Bluetooth device disconnection is not supported directly via WinRT; please use Windows Settings")`. The button spinner disappears and the device stays connected with no error message displayed to the user.
- **Why**: `handleToggleDevice` catches the rejection and only prints to `console.error`, omitting a call to `setError`.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -114,3 +114,4 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
     } catch (err) {
       console.error("Failed to toggle bluetooth device:", err);
+      setError(err instanceof Error ? err.message : String(err));
     } finally {
```

---

### [MINOR] [OPEN] M5-09 Missing unmount cancellation guards in BluetoothWidget async handlers
- **Status**: OPEN
- **Where**: `src/widgets/bluetooth/BluetoothWidget.tsx:82-120`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Bluetooth widget is unmounted while `get_bluetooth_devices` or `toggle_bluetooth_device` IPC calls are awaiting response. When IPC resolves, state updates (`setDevices`, `setIsLoading`, `setTogglingId`) fire against the unmounted component.
- **Why**: `BluetoothWidget` lacks an `isMountedRef` check inside its async completion callbacks.
- **Fix**:
```diff
--- a/src/widgets/bluetooth/BluetoothWidget.tsx
+++ b/src/widgets/bluetooth/BluetoothWidget.tsx
@@ -1,3 +1,3 @@
-import { useState, useEffect, useCallback, useMemo, type FC } from "react";
+import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
@@ -86,2 +86,10 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
   const [togglingId, setTogglingId] = useState<string | null>(null);
+  const isMountedRef = useRef(true);
+
+  useEffect(() => {
+    isMountedRef.current = true;
+    return () => {
+      isMountedRef.current = false;
+    };
+  }, []);
@@ -93,4 +101,6 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
       const list = await invoke<BluetoothDeviceInfo[]>("get_bluetooth_devices");
-      setDevices(list || []);
+      if (isMountedRef.current) {
+        setDevices(list || []);
+      }
     } catch (err) {
@@ -98,3 +108,5 @@ export const BluetoothWidget: FC<BluetoothWidgetProps> = ({
     } finally {
-      setIsLoading(false);
+      if (isMountedRef.current) {
+        setIsLoading(false);
+      }
     }
```

---

### [ENHANCEMENT] [OPEN] M5-10 Dead code and continuous CPU history array allocations for unrendered MiniGraph
- **Status**: OPEN
- **Where**: `src/widgets/resources/MiniGraph.tsx:1-106`, `src/hooks/useSystemMetrics.ts:72-88`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: Telemetry events trigger `appendCpuSample` every second. The hook slices and allocates a new 20-element number array for `cpuHistory` on every update, but `ResourceWidget` never imports or renders `MiniGraph` or `cpuHistory`.
- **Why**: `MiniGraph` was disconnected during redesign without removing the unused component export or cleaning up `cpuHistory` state accumulation in `useSystemMetrics.ts`.
- **Fix**: Either re-embed `MiniGraph` beneath the CPU MetricBar in `ResourceWidget.tsx` or deprecate the unused `cpuHistory` accumulation in `useSystemMetrics.ts`.
