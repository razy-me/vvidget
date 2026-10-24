/**
 * Weather type definitions matching TODO.md data models and Open-Meteo schemas.
 */

export interface WeatherCondition {
  code: number;
  label: string;
  iconName: string;
}

export interface CurrentWeather {
  temperatureC: number;
  feelsLikeC: number;
  condition: WeatherCondition;
  humidity: number;
  windSpeedKmh: number;
}

export interface DailyForecastItem {
  date: string;
  minTempC: number;
  maxTempC: number;
  condition: WeatherCondition;
}

export interface HourlyForecastItem {
  time: string;
  tempC: number;
  condition: WeatherCondition;
}

export interface WeatherData {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  current: CurrentWeather;
  forecastDaily: DailyForecastItem[];
  forecastHourly: HourlyForecastItem[];
  isOffline: boolean;
  lastUpdated: string;
}

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  timezone?: string;
}

export interface GeocodingApiResponse {
  results?: GeocodingResult[];
  generationtime_ms?: number;
}
