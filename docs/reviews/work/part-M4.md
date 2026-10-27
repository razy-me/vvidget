# Review Findings: M4 Frontend Shell, Docking & Design Tokens

### [MAJOR] [OPEN] M4-01 Redundant triple event-listener registration and unthrottled IPC setPosition calls flood backend during grid drag
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:331`, `src/hooks/useGridDrag.ts:468`, `src/hooks/useGridDrag.ts:509-525`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: When dragging any desktop widget in independent mode, moving the pointer at high mouse report rates (125Hz-1000Hz) triggers three concurrent handlers per mouse move: `document` listener (via DOM bubbling), `window` listener, and React synthetic `onPointerMove` on `<header>`. Each handler independently calculates grid collisions and calls `appWindow.setPosition` and `update_skeleton_preview` over Tauri IPC without `requestAnimationFrame` batching, generating hundreds of redundant IPC calls and Win32 `SetWindowPos` operations per second and causing noticeable UI jitter.
- **Why**: Listeners are attached to both `window` and `document` simultaneously, and `<header>` also attaches React `dragProps.onPointerMove`. None of the calls are batched or throttled to the monitor refresh rate.
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -509,7 +509,4 @@
     window.addEventListener("pointermove", handleWindowPointerMove);
     window.addEventListener("pointerup", handleWindowPointerUp);
     window.addEventListener("pointercancel", handleWindowPointerUp);
-    window.addEventListener("mouseup", handleWindowPointerUp);
-    document.addEventListener("pointermove", handleWindowPointerMove);
-    document.addEventListener("pointerup", handleWindowPointerUp);
-    document.addEventListener("mouseup", handleWindowPointerUp);
@@ -519,7 +516,4 @@
       window.removeEventListener("pointermove", handleWindowPointerMove);
       window.removeEventListener("pointerup", handleWindowPointerUp);
       window.removeEventListener("pointercancel", handleWindowPointerUp);
-      window.removeEventListener("mouseup", handleWindowPointerUp);
-      document.removeEventListener("pointermove", handleWindowPointerMove);
-      document.removeEventListener("pointerup", handleWindowPointerUp);
-      document.removeEventListener("mouseup", handleWindowPointerUp);
```

### [MAJOR] [OPEN] M4-02 Missing optional chaining on config.widgets in AppContent and DockContainer causes crash on incomplete or empty config
- **Status**: OPEN
- **Where**: `src/App.tsx:301-310`, `src/components/docking/DockContainer.tsx:85-114`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When configuration is loaded or reloaded with `config.widgets` omitted, null, or during partial configuration synchronization, rendering `AppContent` or `DockContainer` throws an unhandled `TypeError: Cannot read properties of undefined (reading 'resources')`, crashing the application UI.
- **Why**: Both components directly access properties on `config.widgets` (e.g. `config.widgets.resources?.visible`) without optional chaining on `config.widgets`, even though adjacent lines in the same components explicitly guard with `if (!config.widgets) return []`.
- **Fix**:
```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -301,10 +301,10 @@
-  const isResourcesVisible = config.widgets.resources?.visible ?? true;
-  const isSpotifyVisible = config.widgets.spotify?.visible ?? true;
-  const isWeatherVisible = config.widgets.weather?.visible ?? true;
-  const isSpeedtestVisible = config.widgets.speedtest?.visible ?? false;
-  const isLauncherVisible = config.widgets.launcher?.visible ?? false;
-  const isQuickSettingsVisible = config.widgets.quick_settings?.visible ?? false;
-  const isBluetoothVisible = config.widgets.bluetooth?.visible ?? false;
-  const isBatteryVisible = config.widgets.battery?.visible ?? false;
-  const isCalendarVisible = config.widgets.calendar?.visible ?? false;
-  const isClockVisible = config.widgets.clock?.visible ?? false;
+  const isResourcesVisible = config.widgets?.resources?.visible ?? true;
+  const isSpotifyVisible = config.widgets?.spotify?.visible ?? true;
+  const isWeatherVisible = config.widgets?.weather?.visible ?? true;
+  const isSpeedtestVisible = config.widgets?.speedtest?.visible ?? false;
+  const isLauncherVisible = config.widgets?.launcher?.visible ?? false;
+  const isQuickSettingsVisible = config.widgets?.quick_settings?.visible ?? false;
+  const isBluetoothVisible = config.widgets?.bluetooth?.visible ?? false;
+  const isBatteryVisible = config.widgets?.battery?.visible ?? false;
+  const isCalendarVisible = config.widgets?.calendar?.visible ?? false;
+  const isClockVisible = config.widgets?.clock?.visible ?? false;
--- a/src/components/docking/DockContainer.tsx
+++ b/src/components/docking/DockContainer.tsx
@@ -85,15 +85,15 @@
-    if (config.widgets.resources?.visible ?? true) {
+    if (config.widgets?.resources?.visible ?? true) {
...
-    if (config.widgets.spotify?.visible ?? true) {
+    if (config.widgets?.spotify?.visible ?? true) {
...
-    if (config.widgets.weather?.visible ?? true) {
+    if (config.widgets?.weather?.visible ?? true) {
```

### [MAJOR] [OPEN] M4-03 Multi-monitor bounding coordinate calculation corrupts virtual desktop boundaries when displays have different DPI scaling
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:169-174`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In a multi-monitor setup where Display 1 is 1920x1080 at 100% scale (x=0) and Display 2 is 2880x1620 at 150% scale placed to its right (x=1920 in virtual physical space). When computing bounding coordinates, Display 2's starting coordinate (1920) is divided by 1.5, producing `left = 1280`. This causes Display 2's bounding box to overlap Display 1 (0 to 1920) in logical coordinates and restricts `boundMaxX` to 3200 instead of 3840, preventing widgets from being dragged into the right half of the secondary monitor.
- **Why**: Tauri monitor positions are in unified Windows virtual desktop physical coordinates. Dividing secondary monitor physical origin coordinates by their individual scale factor distorts the unified multi-monitor coordinate system.
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -169,4 +169,4 @@
-            const left = workPos.x / mScale;
-            const top = workPos.y / mScale;
-            const right = left + workSize.width / mScale;
-            const bottom = top + workSize.height / mScale;
+            const left = workPos.x / s;
+            const top = workPos.y / s;
+            const right = left + workSize.width / s;
+            const bottom = top + workSize.height / s;
```

### [MINOR] [OPEN] M4-04 Drag activates on stationary clicks without distance threshold, causing accidental grid snapping and skeleton flicker
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:261-306`, `src/hooks/useGridDrag.ts:402-435`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User clicks the header of a widget without moving the mouse (e.g. to focus the window or click near the grip). Because drag activation and skeleton preview invocation occur immediately when async initialization finishes, the skeleton preview window flashes, and when the mouse is released, `endDrag` executes `findNearestNonOverlappingSlot` and repositions the widget to a snapped slot even though no drag movement occurred.
- **Why**: Drag activation is triggered purely on `onPointerDown` completion rather than requiring pointer movement past a minimum threshold (e.g. 3-5px).
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -314,2 +314,7 @@
       const deltaX = e.screenX - dragRef.current.startScreenX;
       const deltaY = e.screenY - dragRef.current.startScreenY;
+      if (!isDragging && Math.hypot(deltaX, deltaY) < 4) {
+        return;
+      }
+      if (!isDragging) {
+        setIsDragging(true);
+        onDragStateChange?.(true);
+      }
```

### [MINOR] [OPEN] M4-05 Unhandled promise rejections on floating appWindow.setPosition calls in useGridDrag
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:331`, `src/hooks/useGridDrag.ts:468`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: During rapid pointer movement or when a widget window is being closed/destroyed during drag, `appWindow.setPosition(...)` returns a rejected promise. Because `void` is used without `await` or `.catch()`, the rejection escapes the synchronous `try ... catch` block and causes an unhandled promise rejection error on the window.
- **Why**: The synchronous `try ... catch` block cannot intercept asynchronous promise rejections from un-awaited promises.
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -330,3 +330,3 @@
       try {
         const appWindow = getCurrentWindow();
-        void appWindow.setPosition(new LogicalPosition(targetX, targetY));
+        appWindow.setPosition(new LogicalPosition(targetX, targetY)).catch(() => {});
         onPositionChange?.(targetX, targetY);
```

### [MINOR] [OPEN] M4-06 Missing light-theme status color tokens in fluent.css causes illegible text contrast
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:24-26`, `src/styles/fluent.css:36-55`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: When the user selects Light Theme (`.theme-light`), UI components like `Badge` and `ProgressBar` continue using dark-mode status colors: `--fluent-warning: #fce100` (bright yellow) and `--fluent-error: #ff99a4` (light pastel pink). On light acrylic or white card backgrounds, bright yellow text has a contrast ratio of ~1.15:1 and light pink text has ~1.3:1, rendering status messages completely illegible and failing WCAG AA guidelines.
- **Why**: `.theme-light` in `src/styles/fluent.css` defines overrides for surface background and text colors but omits definitions for `--fluent-success`, `--fluent-warning`, and `--fluent-error`.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -54,3 +54,8 @@
   --fluent-control-bg: rgba(0, 0, 0, 0.04);
   --fluent-control-active: rgba(0, 0, 0, 0.08);
+
+  /* Status Colors - Light Theme */
+  --fluent-success: #0f7b0f;
+  --fluent-warning: #9d5d00;
+  --fluent-error: #c42b1c;
 }
```

### [MINOR] [OPEN] M4-07 Tooltip component renders empty styled container when content is empty or null
- **Status**: OPEN
- **Where**: `src/components/ui/Tooltip.tsx:66-79`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: If a parent component renders `<Tooltip content="">` or passes `content={null}`, hovering over the target element for 200ms causes `isVisible` to become `true`, which renders an empty 20px x 10px floating box with background, border, and drop shadow over the UI.
- **Why**: `Tooltip` checks `{isVisible && (<div role="tooltip">...)}` without verifying that `content` is present and non-empty.
- **Fix**:
```diff
--- a/src/components/ui/Tooltip.tsx
+++ b/src/components/ui/Tooltip.tsx
@@ -66,3 +66,3 @@
       {children}
-      {isVisible && (
+      {isVisible && Boolean(content) && (
         <div
```

### [MINOR] [OPEN] M4-08 ProgressBar produces NaN% display and invalid ARIA attribute when value is not a finite number
- **Status**: OPEN
- **Where**: `src/components/ui/ProgressBar.tsx:30-31`, `src/components/ui/ProgressBar.tsx:59`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: When telemetry or metrics data is loading or missing (`value: NaN` or `undefined`), `ProgressBar` computes `percentage` as `NaN`. This displays `"NaN%"` in the UI label, applies invalid inline CSS `width: NaN%`, and sets `aria-valuenow="NaN"`, which violates the W3C WAI-ARIA specification for `role="progressbar"`.
- **Why**: `Math.max(NaN, min)` returns `NaN`, propagating non-finite values throughout all calculations without a fallback check.
- **Fix**:
```diff
--- a/src/components/ui/ProgressBar.tsx
+++ b/src/components/ui/ProgressBar.tsx
@@ -30,2 +30,3 @@
-    const clampedValue = max <= min ? min : Math.min(Math.max(value, min), max);
+    const numericValue = Number.isFinite(value) ? value : min;
+    const clampedValue = max <= min ? min : Math.min(Math.max(numericValue, min), max);
     const percentage = max <= min ? 0 : Math.round(((clampedValue - min) / (max - min)) * 100);
```

### [ENHANCEMENT] [OPEN] M4-09 SkeletonWidget missing from layout barrel export
- **Status**: OPEN
- **Where**: `src/components/layout/index.ts:1-2`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: Consumers importing components from `@/components/layout` find `SkeletonWidget` missing from the barrel export, forcing direct internal file imports (`@/components/layout/SkeletonWidget`).
- **Why**: `src/components/layout/index.ts` only exports `HeaderBar` and `WidgetContainer`.
- **Fix**:
```diff
--- a/src/components/layout/index.ts
+++ b/src/components/layout/index.ts
@@ -2,1 +2,2 @@
 export { WidgetContainer } from "./WidgetContainer";
+export { SkeletonWidget, type SkeletonWidgetProps } from "./SkeletonWidget";
```

### [ENHANCEMENT] [OPEN] M4-10 HeaderBar action toolbar div allows pointerdown to bubble and start window drag
- **Status**: OPEN
- **Where**: `src/components/layout/HeaderBar.tsx:102-105`
- **Source**: `r-review` (2026-10-27)
- **Confidence**: MEDIUM
- **Category**: robustness
- **Scenario**: If custom interactive components, icon buttons, or dropdown triggers rendered inside `actions` are clicked, pointer events bubble up to the `<header>` element because the container only stops `mousedown`. This triggers `useGridDrag`'s `onPointerDown` if the child element is not a standard HTML `<button>` or `<a>` tag.
- **Why**: The actions wrapper div handles `onMouseDown={(e) => e.stopPropagation()}` but does not stop `onPointerDown` or specify `data-no-drag`.
- **Fix**:
```diff
--- a/src/components/layout/HeaderBar.tsx
+++ b/src/components/layout/HeaderBar.tsx
@@ -103,4 +103,6 @@
       <div
         className="flex items-center gap-1 flex-shrink-0"
         onMouseDown={(e) => e.stopPropagation()}
+        onPointerDown={(e) => e.stopPropagation()}
+        data-no-drag
       >
```
