# Cross-Cutting Audit: Windows 11 Fluent UI & Styling (X2)

Audit of widgets and UI styling against official Windows 11 Fluent Design guidelines (WinUI 3 / Windows 11 Widgets Board) and visual evaluation of the user screenshot (`media_1793037191384_21489137.png`).

---

### [MAJOR] [OPEN] X2-01 Missing Backdrop Blur on Fluent Acrylic Surfaces Destroys Native Windows 11 Material Depth
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:56-58`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / design-token
- **Scenario**: When widgets are positioned over the Windows desktop wallpaper (as shown in the provided screenshot against the dark purple ribbon wallpaper), the widget containers appear as flat, semi-opaque dark boxes rather than authentic Windows 11 Desktop Acrylic / Mica material with blurred background refraction.
- **Why**: `.fluent-acrylic` defines only `background-color: var(--fluent-acrylic-bg)` without any `backdrop-filter: blur(20px) saturate(180%)` or `-webkit-backdrop-filter`. The default dark opacity `rgba(28, 28, 30, 0.58)` without background blur results in low contrast and lacks the optical depth characteristic of Windows 11 Fluent surfaces.
- **Fix**:
```diff
 /* Acrylic style class for desktop widget containers */
 .fluent-acrylic {
   background-color: var(--fluent-acrylic-bg);
+  backdrop-filter: blur(20px) saturate(180%);
+  -webkit-backdrop-filter: blur(20px) saturate(180%);
 }
```

---

### [MAJOR] [OPEN] X2-02 Battery Sparkline Graph Collapses to Baseline and Becomes Invisible at Low Charge
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatterySparkline.tsx:49-51`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / component
- **Scenario**: In `BatteryWidget`, when the battery is at 21% with 4 recorded samples (visible in screenshot under "KAPAZITÄTSVERLAUF 4 MESSPUNKTE"), the entire chart area appears empty except for a faint line at the very bottom edge; no trend or gradient fill is visible.
- **Why**: `BatterySparkline` statically maps 0-100% into a 32px height SVG where 21% resolves to `y = 74.4` (only 8px from bottom). The gradient fill linearly fades from 30% opacity at y=0 to 0% at y=100. At y=74.4, the fill opacity is under 7%, rendering it invisible against dark cards. Without baseline guidelines or dynamic range padding, the graph appears broken.
- **Fix**:
```diff
-    // Map 0-100% to Y: 92 is bottom, 8 is top (giving 8% padding)
-    const y = 92 - (clamped / range) * 84;
+    // Dynamic min-max padding to ensure low charge trends remain legible
+    const minVal = Math.min(...points);
+    const maxVal = Math.max(...points);
+    const effectiveRange = Math.max(maxVal - minVal, 20);
+    const y = 85 - ((clamped - Math.max(0, minVal - 10)) / (effectiveRange + 15)) * 70;
```

---

### [MAJOR] [OPEN] X2-03 Retro All-Caps Tracked Section Headers Violate Windows 11 Typography Standard
- **Status**: OPEN
- **Where**: `src/widgets/weather/HourlyTrend.tsx:51`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / typography
- **Scenario**: Section headers across multiple widgets display in all-caps with wide tracking: "STÜNDLICHER TREND", "NÄCHSTE 12H", "5-TAGE-VORHERSAGE", "LAUFZEIT-PROGNOSEN", "KAPAZITÄTSVERLAUF", "VERLAUF", "PAUSIERT".
- **Why**: Multiple components use `uppercase tracking-wider` or `uppercase tracking-wide`. Windows 11 Fluent guidelines prohibit all-caps headers across UI surfaces; WinUI 3 mandates sentence capitalization (or title case) in `Segoe UI Variable Text` Semibold with standard letter spacing.
- **Fix**:
```diff
-      <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] uppercase tracking-wider mb-1.5 flex items-center justify-between">
-        <span>Stündlicher Trend</span>
-        <span className="text-[10px] text-[var(--fluent-text-secondary)]/80">Nächste 12h</span>
-      </div>
+      <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] mb-1.5 flex items-center justify-between">
+        <span>Stündlicher Trend</span>
+        <span className="text-[10px] text-[var(--fluent-text-secondary)]/80">Nächste 12 Std.</span>
+      </div>
```

---

### [MAJOR] [OPEN] X2-04 Stadium Pill Shapes Used Instead of WinUI 3 Segmented Controls
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:209`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / controls
- **Scenario**: In `GameLauncherWidget`, category filters ("Alle", "Steam", "Epic", "Eigene") are styled as rounded-full oval capsules/pills.
- **Why**: Windows 11 WinUI 3 specifies Segmented Controls (or TabView / RadioButtons) as rectangular segment buttons with 4px border radius (`rounded-[4px]`) inside a continuous recessed container (`bg-[var(--fluent-control-bg)]`), with an elevated active item, rather than mobile/Android pill tags.
- **Fix**:
```diff
-              className={cn(
-                "px-2.5 py-0.5 text-[11px] rounded-full transition-all font-medium whitespace-nowrap",
-                isActive
-                  ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
-                  : "bg-[var(--fluent-card-bg)] text-[var(--fluent-text-secondary)] hover:bg-[var(--fluent-card-hover)] hover:text-[var(--fluent-text-primary)]"
-              )}
+              className={cn(
+                "px-2.5 py-1 text-[11px] rounded-[4px] transition-all font-medium whitespace-nowrap",
                isActive
-                  ? "bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] font-semibold shadow-xs border border-[var(--fluent-stroke)]"
-                  : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-control-active)]"
+                  ? "bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] font-semibold shadow-xs border border-[var(--fluent-stroke)]"
+                  : "text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-control-active)]"
              )}
```

---

### [MINOR] [OPEN] X2-05 Detached Temperature Unit Renders Awkward "10° c" in Weather Widget
- **Status**: OPEN
- **Where**: `src/widgets/weather/WeatherWidget.tsx:160-168`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / typography
- **Scenario**: In `WeatherWidget`, the current temperature displays as `10°  c` with a detached lowercase `c` and excessive spacing, instead of standard `10°C` or `10°`.
- **Why**: `WeatherWidget.tsx` wraps the number and degree symbol in a `text-3xl` span and places the unit `C` in a separate `span` with `gap-1 text-xs text-[var(--fluent-text-secondary)]`, creating visual detachment and an apparent lowercase unit.
- **Fix**:
```diff
-          <div className="flex items-baseline gap-1">
-            <span
-              className="text-3xl font-light tracking-tight text-[var(--fluent-text-primary)]"
-              data-testid="weather-current-temp"
-            >
-              {current.temperatureC}°
-            </span>
-            <span className="text-xs text-[var(--fluent-text-secondary)]">C</span>
-          </div>
+          <div className="flex items-baseline">
+            <span
+              className="text-3xl font-light tracking-tight text-[var(--fluent-text-primary)]"
+              data-testid="weather-current-temp"
+            >
              {current.temperatureC}°
            </span>
+            <span className="text-sm font-normal text-[var(--fluent-text-secondary)] ml-0.5">C</span>
          </div>
```

---

### [MINOR] [OPEN] X2-06 Tailwind `capitalize` Inappropriately Capitalizes German Verb in Battery Badge
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:216`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / internationalization
- **Scenario**: When discharging, the battery status badge displays `Wird Entladen 🔋` with an uppercase `E` in "Entladen", violating German grammatical rules.
- **Why**: `BatteryWidget.tsx` specifies `className="capitalize font-semibold tracking-wide"`. Tailwind's `capitalize` forces the first letter of each word to uppercase. The underlying string from `types/battery.ts` is `"Wird entladen 🔋"`, but CSS transforms it into `"Wird Entladen 🔋"`.
- **Fix**:
```diff
             <Badge
               variant={badgeInfo.variant}
               size="sm"
-              className="capitalize font-semibold tracking-wide"
+              className="font-medium"
               data-testid="battery-charging-badge"
             >
```

---

### [MINOR] [OPEN] X2-07 Verbose Technical Label Causes Text Truncation in Speedtest Upload Metric
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:255`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / layout
- **Scenario**: In the 3-column metric cards row of `SpeedtestWidget`, the third card clips its subtext as `Speed test paylo...` with an ellipsis.
- **Why**: In a 3-column layout on a 360px widget, available card width is ~94px. The hardcoded technical string `"Speed test payload"` (18 characters) exceeds container width and triggers CSS ellipsis truncation.
- **Fix**:
```diff
-          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Speed test payload</div>
+          <div className="text-[9px] text-[var(--fluent-text-tertiary)] truncate">Cloudflare Edge</div>
```

---

### [MINOR] [OPEN] X2-08 Asymmetrical Navigation Button Widths in Clock Widget Strip
- **Status**: OPEN
- **Where**: `src/widgets/clock/ClockWidget.tsx:246, 264, 282, 300`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: MEDIUM
- **Category**: visual / component
- **Scenario**: In the top navigation bar of `ClockWidget`, the active tab shows an icon and text label (e.g. `[Clock] Uhr`), while inactive tabs hide their text labels (`hidden`), creating an unbalanced, lopsided navigation strip.
- **Why**: In `ClockWidget.tsx`, `activeTab !== "uhr" && "hidden"` selectively unmounts/hides labels on inactive tabs inside a `grid grid-cols-4` container.
- **Fix**: Display consistent icon + label across all tabs, or use icon-only navigation with Fluent tooltips for equal visual rhythm.

---

### [MINOR] [OPEN] X2-09 GameLauncher and Calendar Widgets Display Disproportionate Empty Black Voids
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:230-340`, `src/widgets/calendar/CalendarWidget.tsx:210-262`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: MEDIUM
- **Category**: visual / layout
- **Scenario**: In the screenshot, `GameLauncherWidget` contains only 1 game ("Brotato") and leaves over 60% of the card height as an empty, dark void. Similarly, `CalendarWidget` dedicates half its vertical space to a sparse "Keine Notizen für diesen Tag" empty state.
- **Why**: Widget layouts have fixed slot dimensions without responsive layout adaptations (such as grid item tiles or quick-add placeholders) when list items are few.
- **Fix**: In GameLauncher, render installed items as a Start Menu / Game Bar style tile grid with a "+ Spiel hinzufügen" ghost card when few items exist.

---

### [ENHANCEMENT] [OPEN] X2-10 Primary Action Buttons Lack Fluent WinUI 3 Border Stroke and Subtle Elevation
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:273`, `src/widgets/launcher/GameLauncherWidget.tsx:178`
- **Source**: `r-review` (Tier 3) (2026-10-26)
- **Confidence**: HIGH
- **Category**: visual / styling
- **Scenario**: Primary action buttons ("Erneut testen", "Hinzufügen") appear as flat, borderless cyan rectangles with black text.
- **Why**: In WinUI 3, primary accent buttons feature subtle 1px layered borders (`border-t-white/20`, `border-b-black/30`), subtle drop shadow (`shadow-sm`), and a smooth 150ms hover brightness transition (`hover:brightness-105 active:scale-[0.98]`).
- **Fix**: Introduce standard `.fluent-button-primary` styling in `fluent.css` with proper border highlights and elevation tokens.
