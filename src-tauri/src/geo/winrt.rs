#[cfg(windows)]
pub struct ComGuard {
    initialized: bool,
}

#[cfg(windows)]
impl ComGuard {
    pub fn new() -> Self {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        Self {
            initialized: hr.is_ok(),
        }
    }
}

#[cfg(windows)]
impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe {
                windows::Win32::System::Com::CoUninitialize();
            }
        }
    }
}

#[cfg(not(windows))]
pub struct ComGuard;

#[cfg(not(windows))]
impl ComGuard {
    pub fn new() -> Self {
        Self
    }
}

#[cfg(windows)]
pub fn get_geoposition_coords() -> Result<(f64, f64), String> {
    let _com_guard = ComGuard::new();
    use windows::Devices::Geolocation::Geolocator;

    let geolocator = Geolocator::new().map_err(|e| format!("Failed to create Geolocator: {e}"))?;

    // Request geoposition with 10s maximum timeout at WinRT level to release the thread
    let timeout = windows::Foundation::TimeSpan {
        Duration: 100_000_000, // 10 seconds in 100-nanosecond units
    };
    let max_age = windows::Foundation::TimeSpan { Duration: 0 };
    let async_op = geolocator
        .GetGeopositionAsyncWithAgeAndTimeout(max_age, timeout)
        .map_err(|e| format!("Failed to request geoposition async: {e}"))?;

    let geoposition = async_op
        .get()
        .map_err(|e| format!("Failed to acquire geoposition from Windows Location API: {e}"))?;

    let coordinate = geoposition
        .Coordinate()
        .map_err(|e| format!("Failed to extract Coordinate: {e}"))?;

    let point = coordinate
        .Point()
        .map_err(|e| format!("Failed to extract Geopoint: {e}"))?;

    let pos = point
        .Position()
        .map_err(|e| format!("Failed to extract BasicGeoposition: {e}"))?;

    Ok((pos.Latitude, pos.Longitude))
}

#[cfg(not(windows))]
pub fn get_geoposition_coords() -> Result<(f64, f64), String> {
    Err("Windows Location API is not supported on this platform".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_com_guard_raii_lifecycle() {
        let guard = ComGuard::new();
        // Inner guard on the same thread should also cleanly acquire and drop
        let inner = ComGuard::new();
        drop(inner);
        drop(guard);
    }
}
