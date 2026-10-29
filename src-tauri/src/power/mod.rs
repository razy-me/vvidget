use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[cfg(windows)]
use windows::core::w;
#[cfg(windows)]
use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
#[cfg(windows)]
use windows::Win32::System::Power::{
    GetSystemPowerStatus, RegisterPowerSettingNotification, UnregisterPowerSettingNotification,
    HPOWERNOTIFY, POWERBROADCAST_SETTING, SYSTEM_POWER_STATUS,
};
#[cfg(windows)]
use windows::Win32::System::RemoteDesktop::{
    WTSRegisterSessionNotification, WTSUnRegisterSessionNotification, NOTIFY_FOR_THIS_SESSION,
};
#[cfg(windows)]
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW,
    GetWindowLongPtrW, KillTimer, PostQuitMessage, RegisterClassW, SetTimer,
    SetWindowLongPtrW, TranslateMessage, CREATESTRUCTW, DEVICE_NOTIFY_WINDOW_HANDLE,
    GWLP_USERDATA, HMENU, HWND_MESSAGE, MSG, PBT_APMRESUMEAUTOMATIC, PBT_APMRESUMESUSPEND,
    PBT_APMSUSPEND, PBT_POWERSETTINGCHANGE, WINDOW_EX_STYLE, WM_CREATE, WM_DESTROY,
    WM_NCDESTROY, WM_POWERBROADCAST, WM_TIMER, WM_WTSSESSION_CHANGE, WNDCLASSW,
    WS_OVERLAPPED, WTS_SESSION_LOCK, WTS_SESSION_UNLOCK,
};

// Power setting GUIDs
#[cfg(windows)]
const GUID_CONSOLE_DISPLAY_STATE: windows::core::GUID = windows::core::GUID::from_values(
    0x238C9FA8, 0x0AAD, 0x41ED, [0x83, 0xF4, 0x97, 0xBE, 0x24, 0x2C, 0x8F, 0x20]
);

#[cfg(windows)]
const GUID_ACDC_POWER_SOURCE: windows::core::GUID = windows::core::GUID::from_values(
    0x5D3E9A59, 0xE9D5, 0x4B00, [0xA6, 0xBD, 0xFF, 0x34, 0xFF, 0x51, 0x65, 0x48]
);

#[cfg(windows)]
const GUID_ENERGY_SAVER_STATUS: windows::core::GUID = windows::core::GUID::from_values(
    0xDE830923, 0xA562, 0x41AF, [0xA0, 0x86, 0xE3, 0xA1, 0x42, 0x31, 0x93, 0x61]
);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct PowerStateSnapshot {
    pub display_on: bool,
    pub session_locked: bool,
    pub energy_saver: bool,
    pub on_battery: bool,
    pub fullscreen_active: bool,
    pub should_sample: bool,
    pub interval_multiplier: u32,
}

/// Thread-safe power and OS session state tracker.
#[derive(Debug)]
pub struct PowerState {
    display_on: AtomicBool,
    session_locked: AtomicBool,
    energy_saver: AtomicBool,
    on_battery: AtomicBool,
    fullscreen_active: AtomicBool,
}

impl Default for PowerState {
    fn default() -> Self {
        Self {
            display_on: AtomicBool::new(true),
            session_locked: AtomicBool::new(false),
            energy_saver: AtomicBool::new(false),
            on_battery: AtomicBool::new(false),
            fullscreen_active: AtomicBool::new(false),
        }
    }
}

impl PowerState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_display_on(&self) -> bool {
        self.display_on.load(Ordering::SeqCst)
    }

    pub fn is_session_locked(&self) -> bool {
        self.session_locked.load(Ordering::SeqCst)
    }

    pub fn is_energy_saver(&self) -> bool {
        self.energy_saver.load(Ordering::SeqCst)
    }

    pub fn is_on_battery(&self) -> bool {
        self.on_battery.load(Ordering::SeqCst)
    }

    pub fn is_fullscreen_active(&self) -> bool {
        self.fullscreen_active.load(Ordering::SeqCst)
    }

    /// Sets display_on state. Returns true if the value changed.
    pub fn set_display_on(&self, val: bool) -> bool {
        self.display_on.swap(val, Ordering::SeqCst) != val
    }

    /// Sets session_locked state. Returns true if the value changed.
    pub fn set_session_locked(&self, val: bool) -> bool {
        self.session_locked.swap(val, Ordering::SeqCst) != val
    }

    /// Sets energy_saver state. Returns true if the value changed.
    pub fn set_energy_saver(&self, val: bool) -> bool {
        self.energy_saver.swap(val, Ordering::SeqCst) != val
    }

    /// Sets on_battery state. Returns true if the value changed.
    pub fn set_on_battery(&self, val: bool) -> bool {
        self.on_battery.swap(val, Ordering::SeqCst) != val
    }

    /// Sets fullscreen_active state. Returns true if the value changed.
    pub fn set_fullscreen_active(&self, val: bool) -> bool {
        self.fullscreen_active.swap(val, Ordering::SeqCst) != val
    }

    /// Returns false if display is off, session is locked, or fullscreen app is active.
    pub fn should_sample(&self) -> bool {
        if !self.is_display_on() || self.is_session_locked() || self.is_fullscreen_active() {
            return false;
        }
        true
    }

    /// Returns 1 if on AC, 2 if on battery, 3 if energy_saver is active.
    pub fn interval_multiplier(&self) -> u32 {
        if self.is_energy_saver() {
            3
        } else if self.is_on_battery() {
            2
        } else {
            1
        }
    }

    /// Creates an immutable point-in-time snapshot of the power state.
    pub fn snapshot(&self) -> PowerStateSnapshot {
        PowerStateSnapshot {
            display_on: self.is_display_on(),
            session_locked: self.is_session_locked(),
            energy_saver: self.is_energy_saver(),
            on_battery: self.is_on_battery(),
            fullscreen_active: self.is_fullscreen_active(),
            should_sample: self.should_sample(),
            interval_multiplier: self.interval_multiplier(),
        }
    }
}

/// High-level manager coordinating OS power events and the shared PowerState.
#[derive(Clone, Debug)]
pub struct PowerManager {
    state: Arc<PowerState>,
}

impl Default for PowerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PowerManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(PowerState::new()),
        }
    }

    pub fn state(&self) -> Arc<PowerState> {
        self.state.clone()
    }

    pub fn should_sample(&self) -> bool {
        self.state.should_sample()
    }

    pub fn interval_multiplier(&self) -> u32 {
        self.state.interval_multiplier()
    }
}


/// Command returning current OS power state and throttling parameters snapshot.
#[tauri::command]
#[specta::specta]
pub async fn get_power_state<R: Runtime>(app: AppHandle<R>) -> Result<PowerStateSnapshot, String> {
    if let Some(state) = app.try_state::<Arc<PowerState>>() {
        return Ok(state.snapshot());
    }
    if let Some(pm) = app.try_state::<PowerManager>() {
        return Ok(pm.state().snapshot());
    }
    Ok(PowerState::new().snapshot())
}

trait PowerEventSink: Send + Sync {
    fn emit_power_state_changed(&self, snapshot: PowerStateSnapshot);
}

struct TauriPowerSink<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> PowerEventSink for TauriPowerSink<R> {
    fn emit_power_state_changed(&self, snapshot: PowerStateSnapshot) {
        let _ = self.app.emit("power-state-changed", snapshot);
    }
}

#[cfg(windows)]
struct PowerListenerContext {
    state: Arc<PowerState>,
    sink: Option<Box<dyn PowerEventSink>>,
    display_notify: Option<HPOWERNOTIFY>,
    acdc_notify: Option<HPOWERNOTIFY>,
    energy_notify: Option<HPOWERNOTIFY>,
}

#[cfg(windows)]
const TIMER_FULLSCREEN_ID: usize = 1;
#[cfg(windows)]
const TIMER_FULLSCREEN_INTERVAL_MS: u32 = 5000;

#[cfg(windows)]
unsafe extern "system" fn power_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_CREATE => {
            let cs = &*(lparam.0 as *const CREATESTRUCTW);
            let ctx_ptr = cs.lpCreateParams as *mut PowerListenerContext;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, ctx_ptr as isize);
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        WM_POWERBROADCAST => {
            let ctx_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut PowerListenerContext;
            if !ctx_ptr.is_null() {
                let ctx = &mut *ctx_ptr;
                let mut state_changed = false;

                match wparam.0 as u32 {
                    PBT_POWERSETTINGCHANGE => {
                        if lparam.0 != 0 {
                            let pbs = &*(lparam.0 as *const POWERBROADCAST_SETTING);
                            if pbs.PowerSetting == GUID_CONSOLE_DISPLAY_STATE {
                                if pbs.DataLength >= 4 {
                                    let val = *(pbs.Data.as_ptr() as *const u32);
                                    // 0 = Display Off, 1 = Display On, 2 = Display Dimmed
                                    let display_on = val != 0;
                                    if ctx.state.set_display_on(display_on) {
                                        state_changed = true;
                                    }
                                }
                            } else if pbs.PowerSetting == GUID_ACDC_POWER_SOURCE {
                                if pbs.DataLength >= 4 {
                                    let val = *(pbs.Data.as_ptr() as *const u32);
                                    // 0 = AC power, 1 = Battery (DC), 2 = Hot (Short term battery)
                                    let on_battery = val != 0;
                                    if ctx.state.set_on_battery(on_battery) {
                                        state_changed = true;
                                    }
                                }
                            } else if pbs.PowerSetting == GUID_ENERGY_SAVER_STATUS {
                                if pbs.DataLength >= 4 {
                                    let val = *(pbs.Data.as_ptr() as *const u32);
                                    // 0 = Off, 1 = Energy Saver On
                                    let energy_saver = val != 0;
                                    if ctx.state.set_energy_saver(energy_saver) {
                                        state_changed = true;
                                    }
                                }
                            }
                        }
                    }
                    PBT_APMSUSPEND => {
                        if ctx.state.set_display_on(false) {
                            state_changed = true;
                        }
                    }
                    PBT_APMRESUMEAUTOMATIC | PBT_APMRESUMESUSPEND => {
                        if ctx.state.set_display_on(true) {
                            state_changed = true;
                        }
                    }
                    _ => {}
                }

                if state_changed {
                    if let Some(sink) = &ctx.sink {
                        sink.emit_power_state_changed(ctx.state.snapshot());
                    }
                }
            }
            LRESULT(1)
        }
        WM_WTSSESSION_CHANGE => {
            let ctx_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut PowerListenerContext;
            if !ctx_ptr.is_null() {
                let ctx = &mut *ctx_ptr;
                let mut state_changed = false;

                match wparam.0 as u32 {
                    WTS_SESSION_LOCK => {
                        if ctx.state.set_session_locked(true) {
                            state_changed = true;
                        }
                    }
                    WTS_SESSION_UNLOCK => {
                        if ctx.state.set_session_locked(false) {
                            state_changed = true;
                        }
                    }
                    _ => {}
                }

                if state_changed {
                    if let Some(sink) = &ctx.sink {
                        sink.emit_power_state_changed(ctx.state.snapshot());
                    }
                }
            }
            LRESULT(0)
        }
        WM_TIMER => {
            if wparam.0 == TIMER_FULLSCREEN_ID {
                let ctx_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut PowerListenerContext;
                if !ctx_ptr.is_null() {
                    let ctx = &mut *ctx_ptr;
                    if let Ok(qstate) = SHQueryUserNotificationState() {
                        let is_fullscreen = matches!(
                            qstate,
                            QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE
                        );
                        if ctx.state.set_fullscreen_active(is_fullscreen) {
                            if let Some(sink) = &ctx.sink {
                                sink.emit_power_state_changed(ctx.state.snapshot());
                            }
                        }
                    }
                }
            }
            LRESULT(0)
        }
        WM_DESTROY => {
            let _ = KillTimer(hwnd, TIMER_FULLSCREEN_ID);
            PostQuitMessage(0);
            LRESULT(0)
        }
        WM_NCDESTROY => {
            let ctx_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut PowerListenerContext;
            if !ctx_ptr.is_null() {
                let mut ctx = Box::from_raw(ctx_ptr);
                if let Some(h) = ctx.display_notify.take() {
                    let _ = UnregisterPowerSettingNotification(h);
                }
                if let Some(h) = ctx.acdc_notify.take() {
                    let _ = UnregisterPowerSettingNotification(h);
                }
                if let Some(h) = ctx.energy_notify.take() {
                    let _ = UnregisterPowerSettingNotification(h);
                }
                let _ = WTSUnRegisterSessionNotification(hwnd);
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            }
            DefWindowProcW(hwnd, msg, wparam, lparam)
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

/// Spawns the background OS power state & fullscreen monitoring thread.
#[cfg(windows)]
pub fn start_power_monitor<R: Runtime>(app_handle: AppHandle<R>, state: Arc<PowerState>) {
    let sink: Box<dyn PowerEventSink> = Box::new(TauriPowerSink { app: app_handle });
    start_power_monitor_inner(Some(sink), state);
}

#[cfg(windows)]
fn start_power_monitor_inner(sink: Option<Box<dyn PowerEventSink>>, state: Arc<PowerState>) {
    std::thread::Builder::new()
        .name("vvidget-power-monitor".into())
        .spawn(move || {
            // Force this monitoring thread onto Efficiency (E) cores via Win32 EcoQoS
            let _ = crate::window::win32::enable_current_thread_eco_qos();

            // Perform initial queries from OS to sync power and fullscreen state immediately
            let mut power_status = SYSTEM_POWER_STATUS::default();
            if unsafe { GetSystemPowerStatus(&mut power_status).is_ok() } {
                let on_battery = power_status.ACLineStatus == 0;
                let energy_saver = power_status.SystemStatusFlag == 1;
                state.set_on_battery(on_battery);
                state.set_energy_saver(energy_saver);
            }

            if let Ok(qstate) = unsafe { SHQueryUserNotificationState() } {
                let is_fullscreen = matches!(
                    qstate,
                    QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE
                );
                state.set_fullscreen_active(is_fullscreen);
            }

            let class_name = w!("VvidgetPowerListener");
            let wnd_class = WNDCLASSW {
                lpfnWndProc: Some(power_wnd_proc),
                lpszClassName: class_name,
                ..Default::default()
            };

            unsafe {
                let _ = RegisterClassW(&wnd_class);
            }

            let context = Box::new(PowerListenerContext {
                state: state.clone(),
                sink,
                display_notify: None,
                acdc_notify: None,
                energy_notify: None,
            });

            let ctx_raw = Box::into_raw(context);

            let hwnd = match unsafe {
                CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    class_name,
                    w!("VvidgetPowerListenerWindow"),
                    WS_OVERLAPPED,
                    0,
                    0,
                    0,
                    0,
                    HWND_MESSAGE,
                    HMENU::default(),
                    None,
                    Some(ctx_raw as *const core::ffi::c_void),
                )
            } {
                Ok(h) => h,
                Err(e) => {
                    log::error!("Failed to create power listener HWND_MESSAGE window: {:?}", e);
                    unsafe {
                        let _ = Box::from_raw(ctx_raw);
                    }
                    return;
                }
            };

            // Register for power setting notifications
            let display_notify = unsafe {
                RegisterPowerSettingNotification(
                    HANDLE(hwnd.0),
                    &GUID_CONSOLE_DISPLAY_STATE,
                    DEVICE_NOTIFY_WINDOW_HANDLE,
                )
                .ok()
            };

            let acdc_notify = unsafe {
                RegisterPowerSettingNotification(
                    HANDLE(hwnd.0),
                    &GUID_ACDC_POWER_SOURCE,
                    DEVICE_NOTIFY_WINDOW_HANDLE,
                )
                .ok()
            };

            let energy_notify = unsafe {
                RegisterPowerSettingNotification(
                    HANDLE(hwnd.0),
                    &GUID_ENERGY_SAVER_STATUS,
                    DEVICE_NOTIFY_WINDOW_HANDLE,
                )
                .ok()
            };

            // Register for session lock/unlock notifications
            let _ = unsafe { WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION) };

            // Start 5-second periodic fullscreen check
            let _ = unsafe { SetTimer(hwnd, TIMER_FULLSCREEN_ID, TIMER_FULLSCREEN_INTERVAL_MS, None) };

            unsafe {
                let ctx_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut PowerListenerContext;
                if !ctx_ptr.is_null() {
                    (*ctx_ptr).display_notify = display_notify;
                    (*ctx_ptr).acdc_notify = acdc_notify;
                    (*ctx_ptr).energy_notify = energy_notify;
                }
            }

            log::info!("Power and session notification listener initialized on HWND_MESSAGE");

            // Native Win32 message pump
            let mut msg = MSG::default();
            loop {
                let res = unsafe { GetMessageW(&mut msg, HWND::default(), 0, 0) };
                if res.0 <= 0 {
                    break;
                }
                unsafe {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
        })
        .expect("failed to spawn power monitor thread");
}

#[cfg(not(windows))]
pub fn start_power_monitor<R: Runtime>(_app_handle: AppHandle<R>, _state: Arc<PowerState>) {
    log::info!("Mock power monitor initialized for non-Windows platform");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_power_state_default() {
        let state = PowerState::new();
        assert!(state.is_display_on());
        assert!(!state.is_session_locked());
        assert!(!state.is_energy_saver());
        assert!(!state.is_on_battery());
        assert!(!state.is_fullscreen_active());

        // Default state on AC with display on and not locked should sample
        assert!(state.should_sample());
        assert_eq!(state.interval_multiplier(), 1);
    }

    #[test]
    fn test_should_sample_matrix() {
        let state = PowerState::new();

        // 1. Initial healthy state: samples
        assert!(state.should_sample());

        // 2. Display off suppresses sampling
        state.set_display_on(false);
        assert!(!state.should_sample());
        state.set_display_on(true);
        assert!(state.should_sample());

        // 3. Session locked suppresses sampling
        state.set_session_locked(true);
        assert!(!state.should_sample());
        state.set_session_locked(false);
        assert!(state.should_sample());

        // 4. Fullscreen app active suppresses sampling
        state.set_fullscreen_active(true);
        assert!(!state.should_sample());
        state.set_fullscreen_active(false);
        assert!(state.should_sample());

        // 5. Multiple conditions simultaneously
        state.set_display_on(false);
        state.set_session_locked(true);
        state.set_fullscreen_active(true);
        assert!(!state.should_sample());
    }

    #[test]
    fn test_interval_multiplier_rules() {
        let state = PowerState::new();

        // AC power, normal mode -> 1x
        assert_eq!(state.interval_multiplier(), 1);

        // On battery power -> 2x
        state.set_on_battery(true);
        assert_eq!(state.interval_multiplier(), 2);

        // Energy saver takes highest priority -> 3x
        state.set_energy_saver(true);
        assert_eq!(state.interval_multiplier(), 3);

        // Energy saver on AC power -> 3x
        state.set_on_battery(false);
        assert_eq!(state.interval_multiplier(), 3);

        // Turn off energy saver on AC -> back to 1x
        state.set_energy_saver(false);
        assert_eq!(state.interval_multiplier(), 1);
    }

    #[test]
    fn test_state_change_detection() {
        let state = PowerState::new();

        // Flipping from false to true returns true (changed)
        assert!(state.set_session_locked(true));
        // Setting to same value returns false (unchanged)
        assert!(!state.set_session_locked(true));

        assert!(state.set_on_battery(true));
        assert!(!state.set_on_battery(true));

        assert!(state.set_energy_saver(true));
        assert!(!state.set_energy_saver(true));

        assert!(state.set_fullscreen_active(true));
        assert!(!state.set_fullscreen_active(true));

        assert!(state.set_display_on(false));
        assert!(!state.set_display_on(false));
    }

    #[test]
    fn test_power_manager_accessors_and_snapshot() {
        let pm = PowerManager::new();
        assert!(pm.should_sample());
        assert_eq!(pm.interval_multiplier(), 1);

        let snap = pm.state().snapshot();
        assert_eq!(snap.display_on, true);
        assert_eq!(snap.session_locked, false);
        assert_eq!(snap.energy_saver, false);
        assert_eq!(snap.on_battery, false);
        assert_eq!(snap.fullscreen_active, false);
        assert_eq!(snap.should_sample, true);
        assert_eq!(snap.interval_multiplier, 1);

        // Verify Serde roundtrip for frontend IPC
        let json = serde_json::to_string(&snap).expect("snapshot should serialize");
        let deserialized: PowerStateSnapshot =
            serde_json::from_str(&json).expect("snapshot should deserialize");
        assert_eq!(snap, deserialized);
    }
}
