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
                logical_x: 40.0,
                logical_y: 40.0,
                logical_width: 320.0,
                logical_height: 180.0,
                scale_factor: 1.0,
                monitor_id: None,
            },
        );

        widgets.insert(
            "spotify".to_string(),
            WidgetPlacement {
                id: "spotify".to_string(),
                visible: true,
                logical_x: 40.0,
                logical_y: 240.0,
                logical_width: 320.0,
                logical_height: 140.0,
                scale_factor: 1.0,
                monitor_id: None,
            },
        );

        widgets.insert(
            "weather".to_string(),
            WidgetPlacement {
                id: "weather".to_string(),
                visible: true,
                logical_x: 40.0,
                logical_y: 400.0,
                logical_width: 320.0,
                logical_height: 160.0,
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
