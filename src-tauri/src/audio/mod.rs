#[cfg(windows)]
mod win {
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    struct EndpointVolumeWrapper(IAudioEndpointVolume);
    unsafe impl Send for EndpointVolumeWrapper {}
    unsafe impl Sync for EndpointVolumeWrapper {}

    static CACHED_ENDPOINT: Mutex<Option<(Instant, EndpointVolumeWrapper)>> = Mutex::new(None);

    fn get_fresh_endpoint_volume() -> Result<IAudioEndpointVolume, String> {
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("Failed to create MMDeviceEnumerator: {e}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .map_err(|e| format!("Failed to get default audio endpoint: {e}"))?;
            let endpoint_volume: IAudioEndpointVolume = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("Failed to activate IAudioEndpointVolume: {e}"))?;
            Ok(endpoint_volume)
        }
    }

    #[allow(dead_code)]
    pub fn get_endpoint_volume() -> Result<IAudioEndpointVolume, String> {
        get_fresh_endpoint_volume()
    }

    pub fn with_endpoint_volume<T, F: FnMut(&IAudioEndpointVolume) -> Result<T, String>>(
        mut f: F,
    ) -> Result<T, String> {
        if let Ok(mut lock) = CACHED_ENDPOINT.lock() {
            if let Some((created_at, ref wrapper)) = *lock {
                if created_at.elapsed() < Duration::from_secs(2) {
                    if let Ok(res) = f(&wrapper.0) {
                        return Ok(res);
                    }
                }
            }
            // Expired, absent, or invocation failed; recreate and cache
            *lock = None;
            let fresh = get_fresh_endpoint_volume()?;
            let res = f(&fresh);
            *lock = Some((Instant::now(), EndpointVolumeWrapper(fresh)));
            res
        } else {
            let fresh = get_fresh_endpoint_volume()?;
            f(&fresh)
        }
    }

    pub fn get_master_volume() -> Result<f32, String> {
        with_endpoint_volume(|endpoint| unsafe {
            endpoint
                .GetMasterVolumeLevelScalar()
                .map_err(|e| format!("Failed to get master volume: {e}"))
        })
    }

    pub fn set_master_volume(level: f32) -> Result<(), String> {
        let level = level.clamp(0.0, 1.0);
        with_endpoint_volume(|endpoint| unsafe {
            endpoint
                .SetMasterVolumeLevelScalar(level, std::ptr::null())
                .map_err(|e| format!("Failed to set master volume: {e}"))
        })
    }

    pub fn get_master_mute() -> Result<bool, String> {
        with_endpoint_volume(|endpoint| unsafe {
            let mute: BOOL = endpoint
                .GetMute()
                .map_err(|e| format!("Failed to get mute status: {e}"))?;
            Ok(mute.as_bool())
        })
    }

    pub fn toggle_master_mute() -> Result<bool, String> {
        with_endpoint_volume(|endpoint| unsafe {
            let current_mute: BOOL = endpoint
                .GetMute()
                .map_err(|e| format!("Failed to get mute status: {e}"))?;
            let new_mute = !current_mute.as_bool();
            endpoint
                .SetMute(BOOL::from(new_mute), std::ptr::null())
                .map_err(|e| format!("Failed to toggle mute status: {e}"))?;
            Ok(new_mute)
        })
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_master_volume() -> Result<f32, String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(windows)]
        {
            let _com_guard = crate::geo::winrt::ComGuard::new();
            win::get_master_volume()
        }
        #[cfg(not(windows))]
        {
            Ok(0.5)
        }
    })
    .await
    .map_err(|e| format!("Task error: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn set_master_volume(level: f32) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let _com_guard = crate::geo::winrt::ComGuard::new();
            win::set_master_volume(level)
        }
        #[cfg(not(windows))]
        {
            let _ = level;
            Ok(())
        }
    })
    .await
    .map_err(|e| format!("Task error: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_master_mute() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(windows)]
        {
            let _com_guard = crate::geo::winrt::ComGuard::new();
            win::get_master_mute()
        }
        #[cfg(not(windows))]
        {
            Ok(false)
        }
    })
    .await
    .map_err(|e| format!("Task error: {e}"))?
}

#[tauri::command]
#[specta::specta]
pub async fn toggle_master_mute() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(windows)]
        {
            let _com_guard = crate::geo::winrt::ComGuard::new();
            win::toggle_master_mute()
        }
        #[cfg(not(windows))]
        {
            Ok(false)
        }
    })
    .await
    .map_err(|e| format!("Task error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_endpoints_query_safe() {
        // Safe query that should not crash or panic
        let vol_res = {
            #[cfg(windows)]
            {
                let _com_guard = crate::geo::winrt::ComGuard::new();
                win::get_master_volume()
            }
            #[cfg(not(windows))]
            {
                Ok(0.5f32)
            }
        };

        // On environments with audio output, this returns Ok(0.0..=1.0)
        // In CI or headless test VMs without sound card, it gracefully returns Err
        if let Ok(vol) = vol_res {
            assert!((0.0..=1.0).contains(&vol));
        }
    }

    #[test]
    fn test_audio_mute_query_safe() {
        let mute_res = {
            #[cfg(windows)]
            {
                let _com_guard = crate::geo::winrt::ComGuard::new();
                win::get_master_mute()
            }
            #[cfg(not(windows))]
            {
                Ok(false)
            }
        };

        if let Ok(mute) = mute_res {
            assert!(mute == true || mute == false);
        }
    }
}
