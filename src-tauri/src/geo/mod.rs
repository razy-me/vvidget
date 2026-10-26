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
    tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::task::spawn_blocking(winrt::get_geoposition_coords),
    )
    .await
    .map_err(|_| "Geolocation request timed out after 10s".to_string())?
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

    #[test]
    fn test_geo_location_extreme_coordinates() {
        let north_pole = GeoLocation { latitude: 90.0, longitude: 0.0 };
        let south_pole = GeoLocation { latitude: -90.0, longitude: 0.0 };
        let antimeridian = GeoLocation { latitude: 0.0, longitude: 180.0 };

        assert_eq!(north_pole.latitude, 90.0);
        assert_eq!(south_pole.latitude, -90.0);
        assert_eq!(antimeridian.longitude, 180.0);
    }

    #[test]
    fn test_geo_location_invalid_json() {
        let invalid = r#"{"latitude": "north", "longitude": 10.0}"#;
        let res: Result<GeoLocation, _> = serde_json::from_str(invalid);
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_geolocation_timeout_wrapper() {
        let timeout_res = tokio::time::timeout(
            std::time::Duration::from_millis(50),
            tokio::task::spawn_blocking(|| {
                std::thread::sleep(std::time::Duration::from_millis(300));
                (0.0f64, 0.0f64)
            }),
        )
        .await;

        assert!(timeout_res.is_err(), "Blocked geolocation call must be cleanly aborted by timeout");
    }
}
