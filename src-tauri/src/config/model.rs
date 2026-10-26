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
            logical_height: 240.0,
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

pub const DESKTOP_GRID_LOGICAL_X: f64 = 160.0;
pub const DESKTOP_GRID_LOGICAL_Y: f64 = 120.0;

/// Discovered or user-pinned application/game in the Launcher widget.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct LauncherItem {
    pub id: String,
    pub name: String,
    pub path_or_uri: String,
    pub icon_type: Option<String>,
    pub source: String, // "steam" | "epic" | "custom"
    pub last_launched: Option<u64>,
}

impl Default for LauncherItem {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            path_or_uri: String::new(),
            icon_type: None,
            source: "custom".to_string(),
            last_launched: None,
        }
    }
}

/// Dynamic instance configuration for Quick Settings widget.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct QuickSettingsInstance {
    pub id: String,
    pub title: String,
    pub pinned_actions: Vec<String>,
}

impl Default for QuickSettingsInstance {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: "Quick Settings".to_string(),
            pinned_actions: Vec::new(),
        }
    }
}

/// Calendar day task note.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct CalendarNote {
    pub id: String,
    pub text: String,
    pub completed: Option<bool>,
}

impl Default for CalendarNote {
    fn default() -> Self {
        Self {
            id: String::new(),
            text: String::new(),
            completed: Some(false),
        }
    }
}

/// Internet speedtest benchmark result entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct SpeedtestResult {
    pub timestamp: u64,
    pub ping_ms: f64,
    pub jitter_ms: f64,
    pub download_mbps: f64,
    pub upload_mbps: f64,
}

impl Default for SpeedtestResult {
    fn default() -> Self {
        Self {
            timestamp: 0,
            ping_ms: 0.0,
            jitter_ms: 0.0,
            download_mbps: 0.0,
            upload_mbps: 0.0,
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
    pub launcher_items: Vec<LauncherItem>,
    pub quick_settings_instances: HashMap<String, QuickSettingsInstance>,
    pub calendar_events: HashMap<String, Vec<CalendarNote>>,
    pub speedtest_history: Vec<SpeedtestResult>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut widgets = HashMap::new();

        widgets.insert(
            "resources".to_string(),
            WidgetPlacement {
                id: "resources".to_string(),
                visible: true,
                logical_x: 960.0,
                logical_y: 120.0,
                logical_width: 320.0,
                logical_height: 360.0,
                scale_factor: 1.0,
                monitor_id: None,
            },
        );

        widgets.insert(
            "spotify".to_string(),
            WidgetPlacement {
                id: "spotify".to_string(),
                visible: true,
                logical_x: 960.0,
                logical_y: 480.0,
                logical_width: 320.0,
                logical_height: 240.0,
                scale_factor: 1.0,
                monitor_id: None,
            },
        );

        widgets.insert(
            "weather".to_string(),
            WidgetPlacement {
                id: "weather".to_string(),
                visible: true,
                logical_x: 640.0,
                logical_y: 120.0,
                logical_width: 320.0,
                logical_height: 480.0,
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
            launcher_items: Vec::new(),
            quick_settings_instances: HashMap::new(),
            calendar_events: HashMap::new(),
            speedtest_history: Vec::new(),
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
        assert_eq!(res.logical_width, 320.0);
        assert_eq!(res.logical_height, 360.0);

        let spotify = &config.widgets["spotify"];
        assert!(spotify.visible);
        assert_eq!(spotify.logical_width, 320.0);
        assert_eq!(spotify.logical_height, 240.0);

        let weather = &config.widgets["weather"];
        assert!(weather.visible);
        assert_eq!(weather.logical_width, 320.0);
        assert_eq!(weather.logical_height, 480.0);

        // Verify extended collections default to empty
        assert!(config.launcher_items.is_empty());
        assert!(config.quick_settings_instances.is_empty());
        assert!(config.calendar_events.is_empty());
        assert!(config.speedtest_history.is_empty());
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
        assert_eq!(wp.logical_height, 240.0);
        assert_eq!(wp.scale_factor, 1.0);
        assert!(wp.monitor_id.is_none());
    }

    #[test]
    fn test_extended_models_defaults() {
        let launcher = LauncherItem::default();
        assert_eq!(launcher.source, "custom");
        assert!(launcher.icon_type.is_none());

        let qs = QuickSettingsInstance::default();
        assert_eq!(qs.title, "Quick Settings");
        assert!(qs.pinned_actions.is_empty());

        let note = CalendarNote::default();
        assert_eq!(note.completed, Some(false));

        let speedtest = SpeedtestResult::default();
        assert_eq!(speedtest.ping_ms, 0.0);
        assert_eq!(speedtest.download_mbps, 0.0);
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

        original.launcher_items.push(LauncherItem {
            id: "steam_game_1".to_string(),
            name: "Portal 2".to_string(),
            path_or_uri: "steam://rungameid/620".to_string(),
            icon_type: Some("steam".to_string()),
            source: "steam".to_string(),
            last_launched: Some(1670000000),
        });

        original.quick_settings_instances.insert(
            "quick_settings_1".to_string(),
            QuickSettingsInstance {
                id: "quick_settings_1".to_string(),
                title: "Media Toggles".to_string(),
                pinned_actions: vec!["volume".to_string(), "bluetooth".to_string()],
            },
        );

        let json = serde_json::to_string(&original).expect("Serialization failed");
        let parsed: AppConfig = serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(original, parsed);
    }
}
