use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Placement and dimensions for a single desktop widget.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct WidgetPlacement {
    pub id: String,
    pub visible: bool,
    pub logical_x: f64,
    pub logical_y: f64,
    pub logical_width: f64,
    pub logical_height: f64,
    pub scale_factor: f64,
    pub monitor_id: Option<String>,
}

impl Default for WidgetPlacement {
    fn default() -> Self {
        Self {
            id: String::new(),
            visible: true,
            logical_x: 40.0,
            logical_y: 40.0,
            logical_width: 320.0,
            logical_height: 180.0,
            scale_factor: 1.0,
            monitor_id: None,
        }
    }
}

/// Configurable refresh intervals for background collectors.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct PollingRates {
    /// Polling interval for CPU and RAM metrics in milliseconds (default: 1500ms).
    pub resources_cpu_ram_ms: u64,
    /// Polling interval for Disk metrics in milliseconds (default: 15000ms).
    pub resources_disk_ms: u64,
    /// Polling interval for weather forecast queries in minutes (default: 30m).
    pub weather_minutes: u64,
}

impl Default for PollingRates {
    fn default() -> Self {
        Self {
            resources_cpu_ram_ms: 1500,
            resources_disk_ms: 15000,
            weather_minutes: 30,
        }
    }
}

/// Weather location preferences.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct WeatherSettings {
    /// Whether to attempt automatic location lookup via Windows Location API.
    pub use_windows_location: bool,
    /// Manual city name for fallback or explicit location.
    pub manual_city: Option<String>,
    /// Latitude coordinate if manual location chosen.
    pub latitude: Option<f64>,
    /// Longitude coordinate if manual location chosen.
    pub longitude: Option<f64>,
}

impl Default for WeatherSettings {
    fn default() -> Self {
        Self {
            use_windows_location: true,
            manual_city: None,
            latitude: None,
            longitude: None,
        }
    }
}

pub const DESKTOP_GRID_LOGICAL_X: f64 = 103.5;
pub const DESKTOP_GRID_LOGICAL_Y: f64 = 84.5;

/// Root application configuration persisted in %APPDATA%/Widgetz/config.json.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct AppConfig {
    pub version: u32,
    pub lock_positions: bool,
    pub always_on_top: bool,
    pub snap_to_edges: bool,
    /// Layout mode: "independent" (floating multi-window) or "docked" (dock desktop stack).
    pub layout_mode: String,
    pub auto_start: bool,
    /// Theme preference: "auto" (system), "light", or "dark".
    pub theme: String,
    pub polling_rates: PollingRates,
    pub weather_settings: WeatherSettings,
    pub widgets: HashMap<String, WidgetPlacement>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut widgets = HashMap::new();

        widgets.insert(
            "resources".to_string(),
            WidgetPlacement {
                id: "resources".to_string(),
                visible: true,
                logical_x: 828.0,
                logical_y: 84.5,
                logical_width: 310.5,
                logical_height: 338.0,
                scale_factor: 1.0,
                monitor_id: None,
            },
        );

        widgets.insert(
            "spotify".to_string(),
            WidgetPlacement {
                id: "spotify".to_string(),
                visible: true,
                logical_x: 828.0,
                logical_y: 422.5,
                logical_width: 310.5,
                logical_height: 253.5,
                scale_factor: 1.0,
                monitor_id: None,
            },
        );

        widgets.insert(
            "weather".to_string(),
            WidgetPlacement {
                id: "weather".to_string(),
                visible: true,
                logical_x: 517.5,
                logical_y: 84.5,
                logical_width: 310.5,
                logical_height: 422.5,
                scale_factor: 1.0,
                monitor_id: None,
            },
        );

        Self {
            version: 1,
            lock_positions: false,
            always_on_top: false,
            snap_to_edges: true,
            layout_mode: "independent".to_string(),
            auto_start: false,
            theme: "auto".to_string(),
            polling_rates: PollingRates::default(),
            weather_settings: WeatherSettings::default(),
            widgets,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_config_starter_widgets_defaults() {
        let config = AppConfig::default();
        assert_eq!(config.version, 1);
        assert!(!config.lock_positions);
        assert!(!config.always_on_top);
        assert!(config.snap_to_edges);
        assert_eq!(config.layout_mode, "independent");
        assert_eq!(config.theme, "auto");
        assert!(!config.auto_start);

        // Three starter widgets must be present: resources, spotify, weather
        assert!(config.widgets.contains_key("resources"));
        assert!(config.widgets.contains_key("spotify"));
        assert!(config.widgets.contains_key("weather"));

        let res = &config.widgets["resources"];
        assert!(res.visible);
        assert_eq!(res.logical_width, 310.5);
        assert_eq!(res.logical_height, 338.0);

        let spotify = &config.widgets["spotify"];
        assert!(spotify.visible);
        assert_eq!(spotify.logical_width, 310.5);
        assert_eq!(spotify.logical_height, 253.5);

        let weather = &config.widgets["weather"];
        assert!(weather.visible);
        assert_eq!(weather.logical_width, 310.5);
        assert_eq!(weather.logical_height, 422.5);
    }

    #[test]
    fn test_polling_rates_defaults() {
        let rates = PollingRates::default();
        assert_eq!(rates.resources_cpu_ram_ms, 1500);
        assert_eq!(rates.resources_disk_ms, 15000);
        assert_eq!(rates.weather_minutes, 30);
    }

    #[test]
    fn test_weather_settings_defaults() {
        let ws = WeatherSettings::default();
        assert!(ws.use_windows_location);
        assert!(ws.manual_city.is_none());
        assert!(ws.latitude.is_none());
        assert!(ws.longitude.is_none());
    }

    #[test]
    fn test_widget_placement_defaults() {
        let wp = WidgetPlacement::default();
        assert!(wp.visible);
        assert_eq!(wp.logical_x, 40.0);
        assert_eq!(wp.logical_y, 40.0);
        assert_eq!(wp.logical_width, 320.0);
        assert_eq!(wp.logical_height, 180.0);
        assert_eq!(wp.scale_factor, 1.0);
        assert!(wp.monitor_id.is_none());
    }

    #[test]
    fn test_config_serde_roundtrip_complete() {
        let mut original = AppConfig::default();
        original.lock_positions = true;
        original.layout_mode = "docked".to_string();
        original.theme = "dark".to_string();
        original.polling_rates.resources_cpu_ram_ms = 2000;
        original.weather_settings.manual_city = Some("Berlin".to_string());
        original.weather_settings.latitude = Some(52.52);
        original.weather_settings.longitude = Some(13.405);

        let json = serde_json::to_string(&original).expect("Serialization failed");
        let parsed: AppConfig = serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(original, parsed);
    }
}
