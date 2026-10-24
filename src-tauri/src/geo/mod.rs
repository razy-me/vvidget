pub mod winrt;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct GeoLocation {
    pub latitude: f64,
    pub longitude: f64,
}

/// Asynchronous Tauri command querying Windows location service (Windows.Devices.Geolocation)
#[tauri::command]
#[specta::specta]
pub async fn get_windows_location() -> Result<(f64, f64), String> {
    tokio::task::spawn_blocking(winrt::get_geoposition_coords)
        .await
        .map_err(|e| format!("Geolocation task failed to join: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_geo_location_struct() {
        let loc = GeoLocation {
            latitude: 52.520008,
            longitude: 13.404954,
        };
        assert_eq!(loc.latitude, 52.520008);
        assert_eq!(loc.longitude, 13.404954);

        let json = serde_json::to_string(&loc).expect("serialization failed");
        let parsed: GeoLocation = serde_json::from_str(&json).expect("deserialization failed");
        assert!((parsed.latitude - 52.520008).abs() < 1e-6);
        assert!((parsed.longitude - 13.404954).abs() < 1e-6);
    }
}
