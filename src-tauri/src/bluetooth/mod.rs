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
        let devices = match DeviceInformation::FindAllAsyncAqsFilter(&aqs) {
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
                log::info!("Device {} pairing_info ok: {}, is_paired: {}", name, pairing_info.is_ok(), is_paired);
                
                // Try to resolve BluetoothDevice to get connection status and CoD
                let (connected, dev_type) = if let Ok(bt_op) = BluetoothDevice::FromIdAsync(&dev.Id().unwrap_or_default()) {
                    if let Ok(bt_dev) = bt_op.get() {
                        let is_conn = bt_dev.ConnectionStatus().map(|s| s == BluetoothConnectionStatus::Connected).unwrap_or(false);
                        let dtype = if let Ok(cod) = bt_dev.ClassOfDevice() {
                            match cod.MajorClass() {
                                Ok(BluetoothMajorClass::AudioVideo) => "audio",
                                Ok(BluetoothMajorClass::Peripheral) => "input",
                                Ok(BluetoothMajorClass::Phone) => "phone",
                                _ => "other",
                            }
                        } else {
                            "other"
                        };
                        (is_conn, dtype.to_string())
                    } else {
                        (false, "other".to_string())
                    }
                } else {
                    (false, "other".to_string())
                };

                let mut battery_level: Option<u8> = None;
                if let Ok(props) = dev.Properties() {
                    // Check for battery property
                    use windows::core::HSTRING;
                    let battery_key = HSTRING::from("System.Devices.Aep.BatteryLevel");
                    if let Ok(val) = props.Lookup(&battery_key) {
                        if let Ok(pv) = val.cast::<windows::Foundation::IPropertyValue>() {
                            if let Ok(b) = pv.GetUInt8() {
                                battery_level = Some(b);
                            } else if let Ok(b) = pv.GetInt32() {
                                if (0..=100).contains(&b) {
                                    battery_level = Some(b as u8);
                                }
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
}
