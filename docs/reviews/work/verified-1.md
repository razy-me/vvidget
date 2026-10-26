# Verification Report (V1 - Devil's Advocate & Technical Verification)

**Scope**: 4 CRITICAL findings + 26 Top MAJOR findings (30 total)  
**Verifier**: V1 (Technical Verifier & Devil's Advocate)  
**Date**: 2026-10-26  
**Result Summary**:
- **CONFIRMED**: 26
- **DOWNGRADED**: 4 (M6-01, X2-02, X2-03, X2-04)
- **REJECTED**: 0

---

## 1. Critical Findings

### M1-01: CONFIRMED
- **Where**: src-tauri/src/window/win32.rs:492-498
- **Verification**: Re-read cited code fresh. In widget_subclass_proc, WM_SHOWWINDOW checks wparam.0 == 0 && lparam.0 == 0 (the exact signature dispatched by the Windows Shell on Win + D or clicking "Show Desktop") and calls set_window_allow_hide(hwnd, true). In the subsequent WM_WINDOWPOSCHANGING, is_window_allow_hide evaluates to 	rue, preventing SWP_HIDEWINDOW stripping and causing vvidget windows to disappear.
- **Fix Adjustments**: Delete the WM_SHOWWINDOW auto-disarming block. Programmatic hides are already explicitly guarded via hide_window().

### M1-02: CONFIRMED
- **Where**: src-tauri/src/window/win32.rs:306-320, 570-572
- **Verification**: Re-read cited code fresh. On drag release (WM_EXITSIZEMOVE), hiding the skeleton window invokes invalidate_screen_rect(0, 0, 8000, 8000). This issues RedrawWindow(HWND(null_mut()), 8000x8000, RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW), which synchronously forces WM_ERASEBKGND and synchronous painting across the entire desktop and all open applications on all monitors, causing visible screen flicker and DWM stalls.
- **Fix Adjustments**: Remove RDW_ERASE and RDW_UPDATENOW. Pass only RDW_INVALIDATE | RDW_ALLCHILDREN, and constrain the invalidated region to the skeleton preview bounds instead of global 8000x8000.

### M2-01: CONFIRMED
- **Where**: src-tauri/src/config/storage.rs:86-98
- **Verification**: Re-read cited code fresh. In save_config_atomic, if s::rename(&tmp_path, target_path) fails due to a transient file lock, the fallback branch deletes 	arget_path via s::remove_file(target_path). If the retry rename fails as well, it deletes 	mp_path. Both the existing configuration and the new configuration are destroyed, leaving the user with complete data loss.
- **Fix Adjustments**: Remove the destructive emove_file(target_path) fallback entirely. If atomic replacement fails, leave 	arget_path untouched, delete only 	mp_path, and return the IO error safely.

### M3-03: CONFIRMED
- **Where**: src-tauri/src/bluetooth/mod.rs:135-201
- **Verification**: Re-read cited code fresh. DeviceInformation::FindAllAsyncAqsFilter(&aqs) does not request additional properties, so dev.Properties() does not contain System.Devices.Aep.BatteryLevel (evaluating attery_level to None for all devices). Furthermore, the sequential loop invokes BluetoothDevice::FromIdAsync(&id)?.get() for every device; for offline or out-of-range devices, .get() synchronously blocks for radio timeouts (3-10s each), hanging the command for 10-30s.
- **Fix Adjustments**: Query DeviceInformation::FindAllAsyncAqsFilterAndAdditionalProperties with battery and connection GUIDs, extracting properties directly from device information without sequential blocking FromIdAsync calls on offline devices.

---

## 2. Major Findings: Module M1 (Host & Win32)

### M1-03: CONFIRMED
- **Where**: src-tauri/src/actions/mod.rs:73-80
- **Verification**: Re-read cited code fresh. 	askmgr.exe is special-cased to use std::process::Command::new("taskmgr.exe").spawn(), which calls Win32 CreateProcessW. Standard user accounts without elevation fail with OS error 740 (ERROR_ELEVATION_REQUIRED).
- **Fix Adjustments**: Eliminate the special-case branch and route 	askmgr.exe through launch_shell_execute (ShellExecuteW), allowing Windows Shell to perform standard UAC auto-elevation.

### M1-04: CONFIRMED
- **Where**: src-tauri/src/lib.rs:188-196, 208-218
- **Verification**: Re-read cited code fresh. Switching to independent mode unregisters main from WindowManager and TRACKED_WINDOWS. When switching back to docked mode (layout_mode == "docked"), sync_widget_windows shows main (main.show()) but never re-registers it with setup_widget_window, leaving it untracked for snapping and coordinate persistence.
- **Fix Adjustments**: Invoke win_mgr.setup_widget_window for main when restoring docked mode in sync_widget_windows.

### M1-06: CONFIRMED
- **Where**: src-tauri/src/lib.rs:120-128, src-tauri/src/window/manager.rs:349-375
- **Verification**: Re-read cited code fresh. In lib.rs:120, window.on_window_event listens to WindowEvent::Moved and calls update_window_position. When a user drags a widget, WM_EXITSIZEMOVE snaps the window to grid and updates TRACKED_WINDOWS. Delayed asynchronous WindowEvent::Moved events queued in Tauri's winit event pump fire after drag completion and overwrite WindowManager and TRACKED_WINDOWS with unsnapped intermediate coordinates.
- **Fix Adjustments**: Remove the uncoordinated WindowEvent::Moved listener or gate it during Win32-managed native drag/snapping operations.

---

## 3. Major Findings: Module M2 (Persistence & External Services)

### M2-02: CONFIRMED
- **Where**: src-tauri/src/calendar/mod.rs:88-93, src-tauri/src/config/storage.rs:330-345
- **Verification**: Re-read cited code fresh. Configuration mutator commands call cm.get_config().await, modify their local in-memory clone, and call cm.save_immediate(config). Concurrent operations (e.g. rapid calendar edits or speedtest result saves) create a classic TOCTOU window where the later write silently overwrites and discards modifications from the earlier write.
- **Fix Adjustments**: Introduce an atomic mutate helper ConfigManager::update_config<F, R>(&self, f: F) that holds the write lock across the mutation and disk dispatch.

### M2-05: CONFIRMED
- **Where**: src-tauri/src/speedtest/mod.rs:231-334
- **Verification**: Re-read cited code fresh. un_speedtest lacks any concurrency guard (AtomicBool or mutex). Concurrent runs trigger simultaneous HTTP requests against Cloudflare, causing socket contention, corrupted throughput metrics, and interleaved conflicting speedtest-progress events on the global event bus.
- **Fix Adjustments**: Add an AtomicBool or mutex guard to reject concurrent speedtest runs with "Speedtest is already running".

### M2-06: CONFIRMED
- **Where**: src-tauri/src/geo/winrt.rs:45-51, src-tauri/src/geo/mod.rs:14-18
- **Verification**: Re-read cited code fresh. get_geoposition_coords calls sync_op.get() synchronously without an internal timeout. In geo/mod.rs, spawn_blocking lacks a timeout wrapper. If Windows Location Services are disabled or searching for satellites, the call blocks the threadpool worker for up to 60+ seconds.
- **Fix Adjustments**: Wrap spawn_blocking in 	okio::time::timeout(Duration::from_secs(10), ...) or pass a timeout to WinRT's GetGeopositionAsyncWithAgeAndTimeout.

---

## 4. Major Findings: Module M3 (Hardware & System Services)

### M3-04: CONFIRMED
- **Where**: src-tauri/src/bluetooth/mod.rs:226-238
- **Verification**: Re-read cited code fresh. For disconnect, 	oggle_device casts t_dev to IClosable, calls closable.Close(), and returns Ok(false). For connect, it returns Ok(true) unconditionally. WinRT IClosable::Close() only releases the local COM wrapper; it does not disconnect the physical Bluetooth device, fabricating UI connection states.
- **Fix Adjustments**: Acknowledge WinRT limitations; return an explanatory error or trigger ms-settings:bluetooth rather than claiming the device disconnected.

### M3-05: CONFIRMED
- **Where**: src-tauri/src/media/gsmtc.rs:180-205, src-tauri/src/media/mod.rs:50-75
- **Verification**: Re-read cited code fresh. In the 500ms background polling loop, ead_session_data re-encodes cached thumbnail bytes into a multi-megabyte base64 string (STANDARD.encode(&art.bytes)) on every cycle, even when the track is unchanged, causing continuous heap allocation and GC pressure.
- **Fix Adjustments**: Reference album art via the existing custom protocol URL vidget://album-art?t=<track_id> rather than generating base64 data URLs in the 500ms polling loop.

### M3-07: CONFIRMED
- **Where**: src-tauri/src/launcher/mod.rs:518-526
- **Verification**: Re-read cited code fresh. launch_app_or_uri sets lpDirectory to PCWSTR::null() in ShellExecuteW. The launched application inherits vvidget's working directory (C:\Program Files\vvidget or project root). Games and portable apps relying on relative paths to locate config files or dependent DLLs crash on startup.
- **Fix Adjustments**: Extract the parent directory of 	arget (when 	arget is a valid file path) and pass it as lpDirectory.

---

## 5. Major Findings: Module M4 (UI Framework & Docking)

### M4-02: CONFIRMED
- **Where**: src/utils/gridCollision.ts:48-53, 63-78
- **Verification**: Re-read cited code fresh. maxCol and maxRow use Math.ceil(maxX / gridX) and candidate positions use Math.min(maxY, r * gridY). On displays where the work area (e.g. 1080p minus taskbar = 1032px) minus widget height (240px) is 792px, 792 / 120 = 6.6. The loop evaluates candidate Y at 792px, which is off-grid, breaking desktop icon-grid alignment.
- **Fix Adjustments**: Use Math.floor(maxX / gridX) and Math.floor(maxY / gridY) for search loop boundaries and clamping.

### M4-03: CONFIRMED
- **Where**: src/components/layout/HeaderBar.tsx:66-70
- **Verification**: Re-read cited code fresh. In floating mode (!isDocked), HeaderBar is rendered bsolute top-0 left-0 right-0 z-20 with opacity-0 group-hover:opacity-100. Because pointer-events-none is omitted, the invisible header captures mouse clicks and hover events in the top 36px of the card, occluding top widget controls.
- **Fix Adjustments**: Add pointer-events-none when opacity-0, and add group-hover:pointer-events-auto and group-focus-within:pointer-events-auto.

### M4-05: CONFIRMED
- **Where**: src/components/docking/DockItem.tsx:37, 64-80, src/components/ui/Tooltip.tsx:51-55
- **Verification**: Re-read cited code fresh. DockItem has overflow-hidden on its parent Card. Tooltips for "Hide from Dock" and the collapse chevron specify position="top", rendering at ottom-full outside the top edge of the card where overflow-hidden clips them from view.
- **Fix Adjustments**: Change tooltip position from "top" to "bottom" in DockItem.tsx.

---

## 6. Major Findings: Module M5 (System & Hardware Widgets)

### M5-01: CONFIRMED
- **Where**: src/widgets/battery/BatterySparkline.tsx:68-78
- **Verification**: Re-read cited code fresh. The wrapper is <div className="w-full overflow-hidden flex flex-col justify-center" style={{ height: "32px" }}>. In flexbox, the child <svg> defaults to min-height: auto with 1:1 aspect ratio (~300px). justify-center centers the 300px element inside the 32px box, translating its top to ~ -134px. High-charge paths (rendered in the top half of the viewBox) are positioned above the box and clipped away by overflow-hidden.
- **Fix Adjustments**: Replace lex flex-col justify-center with elative block w-full h-full or add min-h-0.

### M5-02: CONFIRMED
- **Where**: src/widgets/resources/ResourceWidget.tsx:160-163, 191
- **Verification**: Re-read cited code fresh. The header unconditionally displays Systemlaufwerk ({mount_point}), and the MetricBar label defaults to "Systemlaufwerk". For secondary drives (e.g. D:), both labels misleadingly call the secondary drive "Systemlaufwerk".
- **Fix Adjustments**: Check ctiveDiskIndex === systemDiskIndex ? "Systemlaufwerk" : "Laufwerk" in the header, and display the partition name or volume letter in MetricBar.

### M5-03: CONFIRMED
- **Where**: src/widgets/bluetooth/BluetoothWidget.tsx:203, 278-316, 324-334
- **Verification**: Re-read cited code fresh. Quick-toggle buttons occupy physical flex width even when opacity-0, squeezing device titles down to ~100px. The bottom button text ("Windows Bluetooth-Einstellungen öffnen") is 40 characters long and wraps/clips on small containers.
- **Fix Adjustments**: Use hidden group-hover:flex for hover controls, and shorten bottom button text to "Bluetooth-Einstellungen" with 	runcate.

---

## 7. Major Findings: Module M6 (Productivity & Media Widgets)

### M6-01: DOWNGRADED(MINOR)
- **Where**: src/widgets/weather/WeatherWidget.tsx:160-168
- **Verification**: Re-read cited code fresh. The current temperature renders as 14° in 3xl text followed by 	ext-xs text-[var(--fluent-text-secondary)] C with gap-1.
- **Reason for Downgrade**: The temperature is completely accurate; no functionality, data, or user interaction is broken. This is a cosmetic typography flaw (identical to X2-05 which was already rated MINOR). Classifying it as MAJOR is severity inflation.
- **Fix Adjustments**: Unify into {current.temperatureC}°C in a single element.

### M6-03: CONFIRMED
- **Where**: src/widgets/launcher/GameLauncherWidget.tsx:265-272
- **Verification**: Re-read cited code fresh. img.onError imperatively removes "hidden" from the fallback initials div and hides the <img>. On any subsequent React re-render (e.g. typing in search or clicking tabs), React reconciles item.icon_url && "hidden" and restores "hidden" on the fallback while the <img> remains at display: none, making both elements invisible.
- **Fix Adjustments**: Manage image failure state via React state or CSS-only error hiding without imperative DOM mutations.

### M6-05: CONFIRMED
- **Where**: src/hooks/useCalendar.ts:70-74
- **Verification**: Re-read cited code fresh. In useCalendar, the config sync effect runs setEvents((prev) => ({ ...prev, ...config.calendar_events })). When a date's notes are deleted in the backend, the date key is omitted from config.calendar_events, but shallow object spread retains the deleted date key in prev, causing phantom note dots to persist in the UI.
- **Fix Adjustments**: Replace state directly via setEvents(config.calendar_events) instead of additive object spread.

---

## 8. Cross-Cutting Findings: X1 (IPC & Concurrency Contracts)

### X1-01: CONFIRMED
- **Where**: src/hooks/useConfig.ts:68-82, src/hooks/useSpeedtest.ts:132-180
- **Verification**: Re-read cited code fresh. In useConfig and useSpeedtest, listen(...) is asynchronous. If the component unmounts before listen resolves (e.g. React 18 StrictMode mount/unmount cycle), the cleanup runs while unlistenFn is undefined. When listen() resolves later, the unlisten callback is orphaned and never called, permanently leaking event listeners in Tauri's event manager.
- **Fix Adjustments**: Add an isDisposed flag in the resolution callback to invoke unlisten() immediately if already unmounted.

### X1-02: CONFIRMED
- **Where**: src/hooks/useConfig.ts:69-75, 114-116
- **Verification**: Re-read cited code fresh. The "config-changed" event listener calls setConfig(event.payload) but omits updating latestConfigRef.current. Later calls to updateConfig or updateWidgetPlacement read latestConfigRef.current (which is stale), overwriting and reverting external configuration changes made via the system tray or independent windows.
- **Fix Adjustments**: Update latestConfigRef.current = event.payload; inside the "config-changed" listener.

### X1-04: CONFIRMED
- **Where**: src-tauri/src/launcher/mod.rs:488-496
- **Verification**: Re-read cited code fresh. scan_installed_games is declared as an sync fn Tauri command and runs on Tokio's async worker thread. It executes synchronous registry lookups, filesystem traversals, VDF file parsing, and image reading without spawn_blocking, stalling the async reactor.
- **Fix Adjustments**: Wrap the scanning routine in 	okio::task::spawn_blocking.

### X1-06: CONFIRMED
- **Where**: src-tauri/src/lib.rs:382-385, 577-586
- **Verification**: Re-read cited code fresh. duplicate_quick_settings_widget emits "config-changed" and immediately calls open_widget_window. Meanwhile, the "config-changed" event listener triggers sync_widget_windows, which also calls open_widget_window for the identical 
ew_id. Both check get_webview_window before window creation finishes, triggering duplicate window label creation errors.
- **Fix Adjustments**: Rely on sync_widget_windows to open windows reactively upon "config-changed" rather than issuing a redundant direct open_widget_window call.

---

## 9. Cross-Cutting Findings: X2 (Windows 11 Fluent UI & Styling)

### X2-01: CONFIRMED
- **Where**: src/styles/fluent.css:56-58, src/components/ui/Card.tsx:30-31
- **Verification**: Re-read cited code fresh. .fluent-acrylic defines only ackground-color: var(--fluent-acrylic-bg) without ackdrop-filter: blur(20px) or -webkit-backdrop-filter. Because native HWND composition is transparent DirectComposition without DWM brush, cards render as flat, unblurred dark boxes with zero optical depth over the desktop wallpaper.
- **Fix Adjustments**: Add ackdrop-filter: blur(20px) saturate(180%) and -webkit-backdrop-filter to .fluent-acrylic.

### X2-02: DOWNGRADED(MINOR)
- **Where**: src/widgets/battery/BatterySparkline.tsx:49-51
- **Verification**: Re-read cited code fresh. The sparkline statically maps 0-100% capacity to a 32px height SVG. At 21%, y=75.2, where fill opacity is ~7% and the stroke is low on the card.
- **Reason for Downgrade**: An absolute 0-100% gauge showing a low line when battery is at 21% is standard gauge behavior, not a functional defect. Dynamic min-max scaling would distort the user's perception of remaining battery level. This is a visual contrast polish item, not a MAJOR bug.
- **Fix Adjustments**: Increase stroke contrast or add a subtle baseline guide and minimum fill opacity stop.

### X2-03: DOWNGRADED(MINOR)
- **Where**: src/widgets/weather/HourlyTrend.tsx:51
- **Verification**: Re-read cited code fresh. Section headers use uppercase tracking-wider.
- **Reason for Downgrade**: Windows 11 Fluent guidelines prefer sentence case, but all-caps tracked headers are a purely aesthetic typography choice. They do not impair functionality, accessibility, or data integrity. Rating this as MAJOR is severity inflation.
- **Fix Adjustments**: Remove uppercase tracking-wider and apply sentence capitalization.

### X2-04: DOWNGRADED(MINOR)
- **Where**: src/widgets/launcher/GameLauncherWidget.tsx:209
- **Verification**: Re-read cited code fresh. Category filters use ounded-full pills rather than ounded-[4px] WinUI 3 segmented control tabs.
- **Reason for Downgrade**: The filter tabs are fully interactive, accessible, and functional. Styling tabs as pills rather than rectangular segmented buttons is a cosmetic style preference, not a MAJOR defect.
- **Fix Adjustments**: Restyle tabs as rectangular segmented controls with ounded-[4px] inside a recessed container.

---

## Final Verification Tally
- **Total Findings Audited**: 30
- **CONFIRMED**: 26
- **DOWNGRADED**: 4 (M6-01 to MINOR, X2-02 to MINOR, X2-03 to MINOR, X2-04 to MINOR)
- **REJECTED**: 0
