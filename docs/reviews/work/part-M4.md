### [MAJOR] [OPEN] M4-01 Triple pointer event listeners and quadruple pointer-up invocations cause IPC saturation and drag stutter
- **Status**: OPEN
- **Where**: `src/hooks/useGridDrag.ts:509-525`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: performance
- **Scenario**: User drags an independent widget window on desktop. During movement, pointermove fires at 120-1000Hz.
- **Why**: `useGridDrag` attaches duplicate event listeners to both `window` and `document` simultaneously (`window.addEventListener("pointermove")` AND `document.addEventListener("pointermove")`), in addition to `dragProps.onPointerMove` on the `<header>` element. Every single mouse movement invokes `setPosition`, `update_skeleton_preview`, and React state updates up to 3 times, flooding the Tauri IPC channel with redundant messages and causing stuttering drag animations. Furthermore, registering `pointerup` and `mouseup` on both targets causes `endDrag` to fire up to 4 times on drop.
- **Fix**:
```diff
--- a/src/hooks/useGridDrag.ts
+++ b/src/hooks/useGridDrag.ts
@@ -506,17 +506,11 @@ export function useGridDrag({
       void endDrag();
     };
 
     window.addEventListener("pointermove", handleWindowPointerMove);
     window.addEventListener("pointerup", handleWindowPointerUp);
     window.addEventListener("pointercancel", handleWindowPointerUp);
-    window.addEventListener("mouseup", handleWindowPointerUp);
-    document.addEventListener("pointermove", handleWindowPointerMove);
-    document.addEventListener("pointerup", handleWindowPointerUp);
-    document.addEventListener("mouseup", handleWindowPointerUp);
 
     return () => {
       window.removeEventListener("pointermove", handleWindowPointerMove);
       window.removeEventListener("pointerup", handleWindowPointerUp);
       window.removeEventListener("pointercancel", handleWindowPointerUp);
-      window.removeEventListener("mouseup", handleWindowPointerUp);
-      document.removeEventListener("pointermove", handleWindowPointerMove);
-      document.removeEventListener("pointerup", handleWindowPointerUp);
-      document.removeEventListener("mouseup", handleWindowPointerUp);
     };
```

### [MAJOR] [OPEN] M4-02 `Math.ceil` in `gridCollision.ts` generates off-grid candidate coordinates clamped outside desktop grid
- **Status**: OPEN
- **Where**: `src/utils/gridCollision.ts:63-78`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: When work area height or width does not evenly divide by grid step (e.g. 1032px work area height with taskbar, 240px widget height, `maxY = 792`, `gridY = 120`), dragging to bottom causes `candY = 792`.
- **Why**: `maxRow` and `maxCol` are computed using `Math.ceil(maxY / gridY)` (e.g., `Math.ceil(792 / 120) = 7`). In the candidate search loop, `Math.min(maxY, r * gridY)` produces `Math.min(792, 840) = 792`, which is not an integer multiple of `gridY` (792 / 120 = 6.6). The widget snaps to an off-grid position, breaking icon-grid desktop alignment.
- **Fix**:
```diff
--- a/src/utils/gridCollision.ts
+++ b/src/utils/gridCollision.ts
@@ -48,4 +48,4 @@ export function findNearestNonOverlappingSlot(
   const candidate = {
-    x: Math.max(minX, Math.min(maxX, baseSnappedX)),
-    y: Math.max(minY, Math.min(maxY, baseSnappedY)),
+    x: Math.max(minX, Math.min(Math.floor(maxX / gridX) * gridX, baseSnappedX)),
+    y: Math.max(minY, Math.min(Math.floor(maxY / gridY) * gridY, baseSnappedY)),
     width,
     height,
   };
@@ -62,4 +62,4 @@ export function findNearestNonOverlappingSlot(
   const minCol = Math.floor(minX / gridX);
-  const maxCol = Math.ceil(maxX / gridX);
+  const maxCol = Math.floor(maxX / gridX);
   const minRow = Math.floor(minY / gridY);
-  const maxRow = Math.ceil(maxY / gridY);
+  const maxRow = Math.floor(maxY / gridY);
```

### [MAJOR] [OPEN] M4-03 Invisible `HeaderBar` lacks `pointer-events-none` when `opacity-0` and occludes top of widget content
- **Status**: OPEN
- **Where**: `src/components/layout/HeaderBar.tsx:66-70`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: In independent window mode, user hovers over and attempts to click top controls/buttons inside a widget (e.g. Spotify widget or Resource widget).
- **Why**: `HeaderBar` is rendered as an absolute overlay (`absolute top-0 left-0 right-0 z-20`) with `opacity-0 group-hover:opacity-100`. Because `pointer-events-none` is omitted when not hovered, the invisible header intercepts pointer clicks in the top 36px of the card. Furthermore, the widget content container lacks top padding to accommodate the header when hovered, causing the header to overlay and block underlying interactive elements.
- **Fix**:
```diff
--- a/src/components/layout/HeaderBar.tsx
+++ b/src/components/layout/HeaderBar.tsx
@@ -67,3 +67,3 @@ export const HeaderBar: FC<HeaderBarProps> = ({
           "absolute top-0 left-0 right-0 z-20 backdrop-blur-md bg-[var(--fluent-acrylic-bg)]/80 rounded-t-2xl",
-          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150",
+          "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150",
           isGridDragging && "opacity-100"
```

### [MAJOR] [OPEN] M4-04 Conditional DOM unmounting of children in `DockItem` destroys widget state and causes abrupt layout shift
- **Status**: OPEN
- **Where**: `src/components/docking/DockItem.tsx:98-105`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User collapses a widget item in the Dock (e.g. active Speedtest or Spotify player), then expands it later.
- **Why**: `DockItem` completely unmounts `{children}` via `!isCollapsed && (...)`. Unmounting destroys active React state, cancels running background timers/network streams, and resets widget state from scratch on expansion. Furthermore, removing the element from the DOM makes the declared `transition-all duration-200` ineffective, producing an instantaneous layout snap.
- **Fix**:
```diff
--- a/src/components/docking/DockItem.tsx
+++ b/src/components/docking/DockItem.tsx
@@ -98,8 +98,8 @@ export const DockItem: FC<DockItemProps> = ({
-      {!isCollapsed && (
-        <div
-          className="p-2.5 transition-all duration-200"
-          data-testid={`dock-item-content-${id}`}
-        >
-          {children}
-        </div>
-      )}
+      <div
+        className={cn(
+          "p-2.5 transition-all duration-200 overflow-hidden",
+          isCollapsed && "hidden"
+        )}
+        data-testid={`dock-item-content-${id}`}
+      >
+        {children}
+      </div>
```

### [MAJOR] [OPEN] M4-05 Tooltips clipped by parent `Card` `overflow-hidden` when positioned at `top` or right boundaries
- **Status**: OPEN
- **Where**: `src/components/docking/DockItem.tsx:37, 64-80` & `src/components/ui/Tooltip.tsx:51-55`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User hovers over "Hide from Dock" or collapse chevron in `DockItem`.
- **Why**: `DockItem` wraps its content in `<Card ... className="... overflow-hidden ...">`. `DockItem` assigns `position="top"` to tooltips at the very top edge of the card, placing the tooltip at `bottom-full` (outside the top boundary). The parent's `overflow-hidden` completely clips the tooltip flyout, rendering it invisible.
- **Fix**:
```diff
--- a/src/components/docking/DockItem.tsx
+++ b/src/components/docking/DockItem.tsx
@@ -64,3 +64,3 @@ export const DockItem: FC<DockItemProps> = ({
           {onHide && (
-            <Tooltip content="Hide from Dock" position="top" delay={300}>
+            <Tooltip content="Hide from Dock" position="bottom" delay={300}>
               <button
@@ -77,3 +77,3 @@ export const DockItem: FC<DockItemProps> = ({
           <Tooltip
             content={isCollapsed ? "Expand widget" : "Collapse widget"}
-            position="top"
+            position="bottom"
             delay={300}
```

### [MAJOR] [OPEN] M4-06 Undefined CSS token `--fluent-card-subtle` breaks active grid drag visual feedback
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:3-33` & `src/components/layout/HeaderBar.tsx:58`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User drags an independent widget window. `HeaderBar` sets `bg-[var(--fluent-card-subtle)]`.
- **Why**: `HeaderBar.tsx` references `bg-[var(--fluent-card-subtle)]` for the dragging state, but `--fluent-card-subtle` is never defined in `fluent.css` (neither in `:root` nor in `.theme-light`). The CSS variable evaluates to empty, rendering the drag header background transparent instead of shaded.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -10,2 +10,3 @@
   --fluent-card-active: rgba(255, 255, 255, 0.06);
+  --fluent-card-subtle: rgba(255, 255, 255, 0.02);
   --fluent-stroke: rgba(255, 255, 255, 0.08);
@@ -39,2 +40,3 @@
   --fluent-card-active: rgba(255, 255, 255, 0.8);
+  --fluent-card-subtle: rgba(255, 255, 255, 0.5);
   --fluent-stroke: rgba(0, 0, 0, 0.08);
```

### [MINOR] [OPEN] M4-07 `onMouseDown` stop-propagation on `HeaderBar` toolbar fails to prevent `onPointerDown` window dragging
- **Status**: OPEN
- **Where**: `src/components/layout/HeaderBar.tsx:106-109`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: User clicks in the whitespace between buttons or on non-button action elements inside the `actions` header toolbar.
- **Why**: `HeaderBar` has `onMouseDown={(e) => e.stopPropagation()}` on the toolbar wrapper. However, `useGridDrag` listens to `onPointerDown`, which fires prior to `onMouseDown` in the DOM event lifecycle. As a result, non-button pointerdown events bubble up to `<header {...dragHandlers}>`, triggering an accidental drag start.
- **Fix**:
```diff
--- a/src/components/layout/HeaderBar.tsx
+++ b/src/components/layout/HeaderBar.tsx
@@ -107,3 +107,4 @@ export const HeaderBar: FC<HeaderBarProps> = ({
       <div
         className="flex items-center gap-1 flex-shrink-0"
         onMouseDown={(e) => e.stopPropagation()}
+        onPointerDown={(e) => e.stopPropagation()}
       >
```

### [MINOR] [OPEN] M4-08 Missing optional chaining on `config.widgets` causes uncaught `TypeError` crash during initial load
- **Status**: OPEN
- **Where**: `src/App.tsx:301-310` & `src/components/docking/DockContainer.tsx:85`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Application starts with uninitialized or empty configuration where `config.widgets` is null or undefined.
- **Why**: `App.tsx` and `DockContainer.tsx` directly evaluate `config.widgets.resources?.visible`. While line 71 of `App.tsx` explicitly guards `if (!config.widgets)`, line 301 accesses `.resources` directly without optional chaining, throwing `TypeError: Cannot read properties of undefined (reading 'resources')` and crashing to the ErrorBoundary.
- **Fix**:
```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -301,10 +301,10 @@ export const AppContent: FC = () => {
   // 4. Main Window (Independent Preview / Multi-Widget Canvas for Web/Test environment)
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
```

### [MINOR] [OPEN] M4-09 Incomplete `.theme-light` tokens for status indicators fail WCAG contrast requirements
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:35-53`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: User switches to light mode. Widgets render status badges or progress bars (e.g. warning or success states).
- **Why**: `.theme-light` fails to define `--fluent-success`, `--fluent-warning`, and `--fluent-error`. Light theme inherits dark-mode pastel shades (e.g. `--fluent-warning: #fce100`), which have near-zero contrast against light acrylic surfaces (`rgba(243, 243, 243, 0.72)`), making status text and icons unreadable and failing WCAG 2.1 AA.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -52,2 +52,7 @@
   --fluent-control-bg: rgba(0, 0, 0, 0.04);
   --fluent-control-active: rgba(0, 0, 0, 0.08);
+
+  /* Status Colors - Light Theme (High Contrast) */
+  --fluent-success: #107c10;
+  --fluent-warning: #9d5d00;
+  --fluent-error: #c42b1c;
```

### [MINOR] [OPEN] M4-10 `Tooltip` lacks accessible `aria-describedby` association and keyboard Escape dismissal
- **Status**: OPEN
- **Where**: `src/components/ui/Tooltip.tsx:22-31, 58-79`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: Keyboard-only or screen reader user navigates action buttons in `HeaderBar` or `DockContainer`.
- **Why**: `Tooltip` renders a detached `<div role="tooltip">` without an `id` or linking `aria-describedby` attribute on the trigger element. Additionally, it lacks a `keydown` listener for the `Escape` key to dismiss the tooltip without shifting focus, violating WCAG 2.1 SC 1.4.13.
- **Fix**:
```diff
--- a/src/components/ui/Tooltip.tsx
+++ b/src/components/ui/Tooltip.tsx
@@ -1,3 +1,3 @@
-import { useState, useRef, useEffect } from "react";
+import { useState, useRef, useEffect, useId } from "react";
 import type { FC, ReactNode } from "react";
 import { cn } from "@/utils/cn";
@@ -23,6 +23,17 @@ export const Tooltip: FC<TooltipProps> = ({
   const timeoutRef = useRef<NodeJS.Timeout | null>(null);
+  const tooltipId = useId();
 
   useEffect(() => {
+    const handleKeyDown = (e: KeyboardEvent) => {
+      if (e.key === "Escape" && isVisible) {
+        hideTooltip();
+      }
+    };
+    window.addEventListener("keydown", handleKeyDown);
     return () => {
+      window.removeEventListener("keydown", handleKeyDown);
       if (timeoutRef.current) {
         clearTimeout(timeoutRef.current);
       }
     };
-  }, []);
+  }, [isVisible]);
@@ -66,3 +77,4 @@ export const Tooltip: FC<TooltipProps> = ({
       {isVisible && (
         <div
+          id={tooltipId}
           role="tooltip"
```

### [MINOR] [OPEN] M4-11 `ProgressBar` ignores `labelPosition="inline"` and produces invalid CSS width on `NaN` value
- **Status**: OPEN
- **Where**: `src/components/ui/ProgressBar.tsx:30-31, 49`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: bug
- **Scenario**: Caller passes `showLabel={true} labelPosition="inline"`, or telemetry hook passes uninitialized metric (`value={NaN}`).
- **Why**: `ProgressBarProps` defines `labelPosition?: "inline" | "top"`, but the JSX only checks `labelPosition === "top"`, silently dropping the label for `"inline"`. When `value` is `NaN`, clamping logic propagates `NaN`, producing `style={{ width: "NaN%" }}` and `aria-valuenow={NaN}`.
- **Fix**:
```diff
--- a/src/components/ui/ProgressBar.tsx
+++ b/src/components/ui/ProgressBar.tsx
@@ -30,2 +30,3 @@ export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
   ) => {
-    const clampedValue = max <= min ? min : Math.min(Math.max(value, min), max);
+    const safeValue = Number.isFinite(value) ? value : min;
+    const clampedValue = max <= min ? min : Math.min(Math.max(safeValue, min), max);
@@ -49,3 +50,3 @@ export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
-        {showLabel && labelPosition === "top" && (
+        {showLabel && (
           <div className="flex justify-between items-center text-xs text-[var(--fluent-text-secondary)]">
```

### [ENHANCEMENT] [OPEN] M4-12 `SkeletonWidget` missing from `src/components/layout/index.ts` barrel export
- **Status**: OPEN
- **Where**: `src/components/layout/index.ts:1-3`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: contract
- **Scenario**: Other modules import layout components from `@/components/layout`.
- **Why**: `SkeletonWidget` is located in `src/components/layout/` but omitted from `index.ts`, forcing consumers like `App.tsx` to use deep path imports (`@/components/layout/SkeletonWidget`).
- **Fix**:
```diff
--- a/src/components/layout/index.ts
+++ b/src/components/layout/index.ts
@@ -2,2 +2,3 @@ export { HeaderBar } from "./HeaderBar";
 export { WidgetContainer } from "./WidgetContainer";
+export { SkeletonWidget, type SkeletonWidgetProps } from "./SkeletonWidget";
```

### [ENHANCEMENT] [OPEN] M4-13 `.fluent-acrylic` class in `fluent.css` lacks `backdrop-filter` definition
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:56-58`
- **Source**: `r-review` (2026-10-26)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: Components use `<Card variant="acrylic">` which applies `.fluent-acrylic`.
- **Why**: `.fluent-acrylic` only sets `background-color: var(--fluent-acrylic-bg)`. Without `backdrop-filter: blur(20px)` and `-webkit-backdrop-filter: blur(20px)`, surfaces lack true Fluent acrylic material blur and appear as flat translucent rectangles.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -57,2 +57,4 @@
   background-color: var(--fluent-acrylic-bg);
+  backdrop-filter: blur(20px);
+  -webkit-backdrop-filter: blur(20px);
 }
```
