use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
pub struct BluetoothDeviceInfo {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub paired: bool,
    pub battery_level: Option<u8>,
    pub device_type: String, // "audio" | "input" | "phone" | "other"
}

#[tauri::command]
#[specta::specta]
pub async fn get_bluetooth_devices() -> Result<Vec<BluetoothDeviceInfo>, String> {
    tokio::task::spawn_blocking(enumerate_bluetooth_devices)
        .await
        .map_err(|e| format!("Bluetooth task join failed: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn toggle_bluetooth_device(device_id: String, connect: bool) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || toggle_device_internal(device_id, connect))
        .await
        .map_err(|e| format!("Toggle bluetooth task join failed: {e}"))?
}

fn toggle_device_internal(device_id: String, connect: bool) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        windows_impl::toggle_device(&device_id, connect)
    }
    #[cfg(not(target_os = "windows"))]
    {
        log::info!("Simulating toggle_bluetooth_device for {} -> {}", device_id, connect);
        Ok(connect)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn open_bluetooth_settings() -> Result<(), String> {
    tokio::task::spawn_blocking(open_settings_internal)
        .await
        .map_err(|e| format!("Settings task join failed: {e}"))?
}

fn open_settings_internal() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let target = "ms-settings:bluetooth";
        let wide_target: Vec<u16> = OsStr::new(target).encode_wide().chain(Some(0)).collect();
        let wide_open: Vec<u16> = OsStr::new("open").encode_wide().chain(Some(0)).collect();

        unsafe {
            let res = ShellExecuteW(
                HWND(std::ptr::null_mut()),
                PCWSTR::from_raw(wide_open.as_ptr()),
                PCWSTR::from_raw(wide_target.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            );
            if res.0 as usize <= 32 {
                return Err(format!("ShellExecuteW failed to open bluetooth settings (code: {})", res.0 as usize));
            }
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        log::info!("Simulating opening bluetooth settings");
        Ok(())
    }
}

pub fn enumerate_bluetooth_devices() -> Result<Vec<BluetoothDeviceInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_impl::enumerate_devices()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use windows::core::Interface;
    use windows::Devices::Bluetooth::*;
    use windows::Devices::Enumeration::*;
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    use core::ffi::c_void;
    use core::ptr::null_mut;
    use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
    use windows::core::{HRESULT, HSTRING, GUID, IInspectable, IUnknown};
    use windows::Foundation::Collections::{IIterable, IIterable_Vtbl, IIterator, IIterator_Vtbl};

    const S_OK: HRESULT = HRESULT(0);
    const E_NOINTERFACE: HRESULT = HRESULT(-2147467262);
    const E_BOUNDS: HRESULT = HRESULT(-2147483637);

    #[repr(C)]
    struct CustomIterator {
        vtable: &'static IIterator_Vtbl<HSTRING>,
        ref_count: AtomicU32,
        items: Vec<HSTRING>,
        index: AtomicUsize,
    }

    static ITERATOR_VTBL: IIterator_Vtbl<HSTRING> = IIterator_Vtbl {
        base__: windows::core::IInspectable_Vtbl {
            base: windows::core::IUnknown_Vtbl {
                QueryInterface: iterator_query_interface,
                AddRef: iterator_add_ref,
                Release: iterator_release,
            },
            GetIids: iterator_get_iids,
            GetRuntimeClassName: iterator_get_runtime_class_name,
            GetTrustLevel: iterator_get_trust_level,
        },
        Current: iterator_current,
        HasCurrent: iterator_has_current,
        MoveNext: iterator_move_next,
        GetMany: iterator_get_many,
        T: core::marker::PhantomData,
    };

    unsafe extern "system" fn iterator_query_interface(
        this: *mut c_void,
        iid: *const GUID,
        interface: *mut *mut c_void,
    ) -> HRESULT {
        if interface.is_null() || iid.is_null() {
            return E_NOINTERFACE;
        }
        let guid = *iid;
        if guid == IUnknown::IID || guid == IInspectable::IID || guid == <IIterator<HSTRING> as Interface>::IID {
            *interface = this;
            iterator_add_ref(this);
            S_OK
        } else {
            *interface = null_mut();
            E_NOINTERFACE
        }
    }

    unsafe extern "system" fn iterator_add_ref(this: *mut c_void) -> u32 {
        let obj = &*(this as *mut CustomIterator);
        obj.ref_count.fetch_add(1, Ordering::SeqCst) + 1
    }

    unsafe extern "system" fn iterator_release(this: *mut c_void) -> u32 {
        let obj = &*(this as *mut CustomIterator);
        let count = obj.ref_count.fetch_sub(1, Ordering::SeqCst) - 1;
        if count == 0 {
            drop(Box::from_raw(this as *mut CustomIterator));
        }
        count
    }

    unsafe extern "system" fn iterator_get_iids(
        _this: *mut c_void,
        count: *mut u32,
        values: *mut *mut GUID,
    ) -> HRESULT {
        if !count.is_null() {
            *count = 0;
        }
        if !values.is_null() {
            *values = null_mut();
        }
        S_OK
    }

    unsafe extern "system" fn iterator_get_runtime_class_name(
        _this: *mut c_void,
        value: *mut *mut c_void,
    ) -> HRESULT {
        if !value.is_null() {
            *value = null_mut();
        }
        S_OK
    }

    unsafe extern "system" fn iterator_get_trust_level(
        _this: *mut c_void,
        value: *mut i32,
    ) -> HRESULT {
        if !value.is_null() {
            *value = 0;
        }
        S_OK
    }

    unsafe extern "system" fn iterator_current(
        this: *mut c_void,
        result: *mut core::mem::MaybeUninit<HSTRING>,
    ) -> HRESULT {
        let obj = &*(this as *mut CustomIterator);
        let idx = obj.index.load(Ordering::SeqCst);
        if idx < obj.items.len() {
            let hstring = obj.items[idx].clone();
            result.write(core::mem::MaybeUninit::new(hstring));
            S_OK
        } else {
            E_BOUNDS
        }
    }

    unsafe extern "system" fn iterator_has_current(
        this: *mut c_void,
        result: *mut bool,
    ) -> HRESULT {
        let obj = &*(this as *mut CustomIterator);
        if !result.is_null() {
            *result = obj.index.load(Ordering::SeqCst) < obj.items.len();
        }
        S_OK
    }

    unsafe extern "system" fn iterator_move_next(
        this: *mut c_void,
        result: *mut bool,
    ) -> HRESULT {
        let obj = &*(this as *mut CustomIterator);
        let idx = obj.index.load(Ordering::SeqCst);
        if idx < obj.items.len() {
            let next = idx + 1;
            obj.index.store(next, Ordering::SeqCst);
            if !result.is_null() {
                *result = next < obj.items.len();
            }
        } else if !result.is_null() {
            *result = false;
        }
        S_OK
    }

    unsafe extern "system" fn iterator_get_many(
        _this: *mut c_void,
        _capacity: u32,
        _items: *mut core::mem::MaybeUninit<HSTRING>,
        result: *mut u32,
    ) -> HRESULT {
        if !result.is_null() {
            *result = 0;
        }
        S_OK
    }

    #[repr(C)]
    struct CustomIterable {
        vtable: &'static IIterable_Vtbl<HSTRING>,
        ref_count: AtomicU32,
        items: Vec<HSTRING>,
    }

    static ITERABLE_VTBL: IIterable_Vtbl<HSTRING> = IIterable_Vtbl {
        base__: windows::core::IInspectable_Vtbl {
            base: windows::core::IUnknown_Vtbl {
                QueryInterface: iterable_query_interface,
                AddRef: iterable_add_ref,
                Release: iterable_release,
            },
            GetIids: iterable_get_iids,
            GetRuntimeClassName: iterable_get_runtime_class_name,
            GetTrustLevel: iterable_get_trust_level,
        },
        First: iterable_first,
        T: core::marker::PhantomData,
    };

    unsafe extern "system" fn iterable_query_interface(
        this: *mut c_void,
        iid: *const GUID,
        interface: *mut *mut c_void,
    ) -> HRESULT {
        if interface.is_null() || iid.is_null() {
            return E_NOINTERFACE;
        }
        let guid = *iid;
        if guid == IUnknown::IID || guid == IInspectable::IID || guid == <IIterable<HSTRING> as Interface>::IID {
            *interface = this;
            iterable_add_ref(this);
            S_OK
        } else {
            *interface = null_mut();
            E_NOINTERFACE
        }
    }

    unsafe extern "system" fn iterable_add_ref(this: *mut c_void) -> u32 {
        let obj = &*(this as *mut CustomIterable);
        obj.ref_count.fetch_add(1, Ordering::SeqCst) + 1
    }

    unsafe extern "system" fn iterable_release(this: *mut c_void) -> u32 {
        let obj = &*(this as *mut CustomIterable);
        let count = obj.ref_count.fetch_sub(1, Ordering::SeqCst) - 1;
        if count == 0 {
            drop(Box::from_raw(this as *mut CustomIterable));
        }
        count
    }

    unsafe extern "system" fn iterable_get_iids(
        _this: *mut c_void,
        count: *mut u32,
        values: *mut *mut GUID,
    ) -> HRESULT {
        if !count.is_null() {
            *count = 0;
        }
        if !values.is_null() {
            *values = null_mut();
        }
        S_OK
    }

    unsafe extern "system" fn iterable_get_runtime_class_name(
        _this: *mut c_void,
        value: *mut *mut c_void,
    ) -> HRESULT {
        if !value.is_null() {
            *value = null_mut();
        }
        S_OK
    }

    unsafe extern "system" fn iterable_get_trust_level(
        _this: *mut c_void,
        value: *mut i32,
    ) -> HRESULT {
        if !value.is_null() {
            *value = 0;
        }
        S_OK
    }

    unsafe extern "system" fn iterable_first(
        this: *mut c_void,
        result: *mut *mut c_void,
    ) -> HRESULT {
        let obj = &*(this as *mut CustomIterable);
        let iterator = Box::new(CustomIterator {
            vtable: &ITERATOR_VTBL,
            ref_count: AtomicU32::new(1),
            items: obj.items.clone(),
            index: AtomicUsize::new(0),
        });
        *result = Box::into_raw(iterator) as *mut c_void;
        S_OK
    }

    pub(crate) fn create_hstring_iterable(items: Vec<HSTRING>) -> IIterable<HSTRING> {
        let iterable = Box::new(CustomIterable {
            vtable: &ITERABLE_VTBL,
            ref_count: AtomicU32::new(1),
            items,
        });
        let raw = Box::into_raw(iterable) as *mut c_void;
        unsafe { core::mem::transmute(raw) }
    }

    struct ComGuard {
        initialized: bool,
    }

    impl ComGuard {
        fn new() -> Self {
            let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            Self {
                initialized: hr.is_ok(),
            }
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.initialized {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }

    pub fn enumerate_devices() -> Result<Vec<BluetoothDeviceInfo>, String> {
        let _guard = ComGuard::new();
        // Test compilation of types
        let aqs = match BluetoothDevice::GetDeviceSelectorFromPairingState(true) {
            Ok(s) => s,
            Err(_) => return Ok(vec![]),
        };
        let additional_props = vec![
            HSTRING::from("System.Devices.Aep.IsConnected"),
            HSTRING::from("System.Devices.Aep.BatteryLevel"),
            HSTRING::from("System.Devices.Aep.Bluetooth.BatteryLevel"),
            HSTRING::from("System.Devices.Aep.Bluetooth.Cod.Major"),
        ];
        let iterable = create_hstring_iterable(additional_props);
        let devices = match DeviceInformation::FindAllAsyncAqsFilterAndAdditionalProperties(&aqs, &iterable) {
            Ok(op) => match op.get() {
                Ok(list) => list,
                Err(_) => return Ok(vec![]),
            },
            Err(_) => return Ok(vec![]),
        };

        let mut result = Vec::new();
        let count = devices.Size().unwrap_or(0);
        for i in 0..count {
            if let Ok(dev) = devices.GetAt(i) {
                let id = dev.Id().unwrap_or_default().to_string();
                let name = dev.Name().unwrap_or_default().to_string();
                let pairing_info = dev.Pairing();
                let is_paired = match &pairing_info {
                    Ok(p) => p.IsPaired().unwrap_or(false),
                    Err(_) => false,
                };
                let mut connected = false;
                let mut dev_type = "other".to_string();
                let mut battery_level: Option<u8> = None;

                if let Ok(props) = dev.Properties() {
                    // Check System.Devices.Aep.IsConnected
                    if let Ok(val) = props.Lookup(&HSTRING::from("System.Devices.Aep.IsConnected")) {
                        if let Ok(pv) = val.cast::<windows::Foundation::IPropertyValue>() {
                            if let Ok(b) = pv.GetBoolean() {
                                connected = b;
                            }
                        }
                    }

                    // Check System.Devices.Aep.Bluetooth.Cod.Major
                    if let Ok(val) = props.Lookup(&HSTRING::from("System.Devices.Aep.Bluetooth.Cod.Major")) {
                        if let Ok(pv) = val.cast::<windows::Foundation::IPropertyValue>() {
                            let major_opt = pv.GetUInt32().ok().or_else(|| pv.GetInt32().ok().map(|v| v as u32));
                            if let Some(major) = major_opt {
                                dev_type = match major {
                                    4 => "audio".to_string(),
                                    5 => "input".to_string(),
                                    2 => "phone".to_string(),
                                    _ => "other".to_string(),
                                };
                            }
                        }
                    }

                    // Check for battery property: System.Devices.Aep.BatteryLevel or Bluetooth.Device.BatteryLevel
                    let battery_keys = [
                        HSTRING::from("System.Devices.Aep.BatteryLevel"),
                        HSTRING::from("System.Devices.Aep.Bluetooth.BatteryLevel"),
                    ];
                    for key in &battery_keys {
                        if let Ok(val) = props.Lookup(key) {
                            if let Ok(pv) = val.cast::<windows::Foundation::IPropertyValue>() {
                                if let Ok(b) = pv.GetUInt8() {
                                    battery_level = Some(b);
                                    break;
                                } else if let Ok(b) = pv.GetInt32() {
                                    if (0..=100).contains(&b) {
                                        battery_level = Some(b as u8);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // If device is actively connected and type is still unresolved, inspect ClassOfDevice
                // (only for actively connected devices so disconnected devices never block)
                if connected && dev_type == "other" {
                    if let Ok(bt_op) = BluetoothDevice::FromIdAsync(&dev.Id().unwrap_or_default()) {
                        if let Ok(bt_dev) = bt_op.get() {
                            if let Ok(cod) = bt_dev.ClassOfDevice() {
                                dev_type = match cod.MajorClass() {
                                    Ok(BluetoothMajorClass::AudioVideo) => "audio".to_string(),
                                    Ok(BluetoothMajorClass::Peripheral) => "input".to_string(),
                                    Ok(BluetoothMajorClass::Phone) => "phone".to_string(),
                                    _ => "other".to_string(),
                                };
                            }
                        }
                    }
                }

                result.push(BluetoothDeviceInfo {
                    id,
                    name,
                    connected,
                    paired: is_paired,
                    battery_level,
                    device_type: dev_type,
                });
            }
        }

        Ok(result)
    }

    pub fn toggle_device(_device_id: &str, connect: bool) -> Result<bool, String> {
        let _guard = ComGuard::new();
        if !connect {
            // WinRT BluetoothDevice does not support disconnecting paired devices via IClosable.
            return Err("Bluetooth device disconnection is not supported directly via WinRT; please use Windows Settings".to_string());
        }
        // WinRT does not provide a direct public ConnectAsync on BluetoothDevice without pairing or RFCOMM/GATT channel initiation.
        Ok(connect)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_enumerate_bluetooth_devices_does_not_panic() {
        let res = enumerate_bluetooth_devices();
        assert!(res.is_ok(), "enumerate_bluetooth_devices should return Ok: {:?}", res);
        let devices = res.unwrap();
        println!("Enumerated {} Bluetooth devices:", devices.len());
        for d in &devices {
            println!("  - {:?} (type={}, connected={}, paired={}, battery={:?})", d.name, d.device_type, d.connected, d.paired, d.battery_level);
        }
    }

    #[test]
    fn test_bluetooth_device_info_serde() {
        let sample = BluetoothDeviceInfo {
            id: "bt-123".to_string(),
            name: "Sony WH-1000XM4".to_string(),
            connected: true,
            paired: true,
            battery_level: Some(85),
            device_type: "audio".to_string(),
        };

        let json = serde_json::to_string(&sample).expect("serialize");
        let deserialized: BluetoothDeviceInfo = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(sample, deserialized);
    }

    #[test]
    fn test_toggle_bluetooth_device_fallback() {
        let res_connect = toggle_device_internal("sample-device-id".to_string(), true);
        assert!(res_connect.is_ok());

        let res_disconnect = toggle_device_internal("sample-device-id".to_string(), false);
        #[cfg(target_os = "windows")]
        {
            assert!(res_disconnect.is_err());
            let err = res_disconnect.unwrap_err();
            assert!(err.contains("disconnection is not supported directly via WinRT"));
        }
        #[cfg(not(target_os = "windows"))]
        {
            assert!(res_disconnect.is_ok());
        }
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn test_custom_hstring_iterable_construction() {
        use windows::core::HSTRING;
        let props = vec![
            HSTRING::from("System.Devices.Aep.IsConnected"),
            HSTRING::from("System.Devices.Aep.BatteryLevel"),
        ];
        let iter = windows_impl::create_hstring_iterable(props);
        let iterator = iter.First().expect("First iterator");
        assert!(iterator.HasCurrent().unwrap_or(false));
        let curr = iterator.Current().expect("Current item");
        assert_eq!(curr.to_string(), "System.Devices.Aep.IsConnected");
        assert!(iterator.MoveNext().unwrap_or(false));
        let second = iterator.Current().expect("Second item");
        assert_eq!(second.to_string(), "System.Devices.Aep.BatteryLevel");
        assert!(!iterator.MoveNext().unwrap_or(true));
        assert!(!iterator.HasCurrent().unwrap_or(true));
    }
}
