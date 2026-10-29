use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct AudioVolumeUpdate {
    pub volume: f32,
    pub is_muted: bool,
}

pub struct VolumeNotifierGuard {
    #[cfg(windows)]
    _inner: Option<win::InnerGuard>,
}

unsafe impl Send for VolumeNotifierGuard {}
unsafe impl Sync for VolumeNotifierGuard {}

#[cfg(windows)]
mod win {
    use super::AudioVolumeUpdate;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tauri::{AppHandle, Emitter, Runtime};
    use windows::Win32::Media::Audio::AUDIO_VOLUME_NOTIFICATION_DATA;
    use windows::Win32::Media::Audio::Endpoints::{
        IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
    };
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    type CallbackFn = Box<dyn Fn(AudioVolumeUpdate) + Send + Sync + 'static>;

    #[windows::core::implement(IAudioEndpointVolumeCallback)]
    struct AudioEndpointVolumeCallback {
        handler: CallbackFn,
    }

    impl IAudioEndpointVolumeCallback_Impl for AudioEndpointVolumeCallback_Impl {
        fn OnNotify(&self, pnotify: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> windows::core::Result<()> {
            if !pnotify.is_null() {
                unsafe {
                    let data = &*pnotify;
                    let volume = (data.fMasterVolume.clamp(0.0, 1.0) * 100.0).round() / 100.0;
                    let is_muted = data.bMuted.as_bool();
                    let payload = AudioVolumeUpdate { volume, is_muted };
                    (self.handler)(payload);
                }
            }
            Ok(())
        }
    }

    pub struct InnerGuard {
        endpoint: IAudioEndpointVolume,
        callback: IAudioEndpointVolumeCallback,
        is_registered: Arc<AtomicBool>,
    }

    unsafe impl Send for InnerGuard {}
    unsafe impl Sync for InnerGuard {}

    impl Drop for InnerGuard {
        fn drop(&mut self) {
            if self.is_registered.swap(false, Ordering::SeqCst) {
                let _com = crate::geo::winrt::ComGuard::new();
                unsafe {
                    let _ = self.endpoint.UnregisterControlChangeNotify(&self.callback);
                }
            }
        }
    }

    pub fn register<R: Runtime>(app: &AppHandle<R>) -> Result<InnerGuard, String> {
        let _com = crate::geo::winrt::ComGuard::new();
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("Failed to create MMDeviceEnumerator: {e}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .map_err(|e| format!("Failed to get default audio endpoint: {e}"))?;
            let endpoint: IAudioEndpointVolume = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("Failed to activate IAudioEndpointVolume: {e}"))?;

            let app_handle = app.clone();
            let callback_impl = AudioEndpointVolumeCallback {
                handler: Box::new(move |payload: AudioVolumeUpdate| {
                    let _ = app_handle.emit_to("main", "audio-volume-update", &payload);
                    let _ = app_handle.emit_to("widget_quick_settings", "audio-volume-update", &payload);
                }),
            };

            let callback: IAudioEndpointVolumeCallback = callback_impl.into();
            endpoint
                .RegisterControlChangeNotify(&callback)
                .map_err(|e| format!("Failed to register IAudioEndpointVolumeCallback: {e}"))?;

            Ok(InnerGuard {
                endpoint,
                callback,
                is_registered: Arc::new(AtomicBool::new(true)),
            })
        }
    }
}

/// Registers native Windows COM IAudioEndpointVolumeCallback on the default audio endpoint.
/// Pushes "audio-volume-update" events to frontend when system volume or mute toggles.
pub fn register_volume_notifier<R: Runtime>(app: &AppHandle<R>) -> Result<VolumeNotifierGuard, String> {
    #[cfg(windows)]
    {
        match win::register(app) {
            Ok(guard) => {
                log::info!("Successfully registered native audio endpoint volume notifier");
                Ok(VolumeNotifierGuard { _inner: Some(guard) })
            }
            Err(e) => {
                log::warn!("Could not register audio volume notifier (falling back to polling): {}", e);
                Ok(VolumeNotifierGuard { _inner: None })
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        log::info!("Audio volume notification not supported on non-Windows platforms");
        Ok(VolumeNotifierGuard {})
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_volume_update_serialization() {
        let update = AudioVolumeUpdate {
            volume: 0.75,
            is_muted: false,
        };
        let json = serde_json::to_string(&update).expect("Serialize AudioVolumeUpdate");
        let deserialized: AudioVolumeUpdate =
            serde_json::from_str(&json).expect("Deserialize AudioVolumeUpdate");
        assert_eq!(update, deserialized);
    }
}
