# TOFIX WP-05 — Round 1
Diff: 4d05d82d14bca7029247aa0d4960716909bddb52..4df2d63af221bbe6b3d3204cac699aa5eb6c54d5   Verdict: CHANGES_REQUESTED

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | MAJOR | src/widgets/weather/DailyForecast.tsx:14 | Timezone off-by-one bug: `new Date("YYYY-MM-DD")` parses as UTC midnight. For timezones west of UTC (e.g. Americas UTC-1 to UTC-12), `toLocaleDateString` evaluates to the previous calendar day (e.g., Monday Oct 26 displays as "Sun"). | Explicitly specify UTC timezone in date formatting: `date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })`. | fixed |
| 2 | MAJOR | src/hooks/useWeather.ts:102 | Excessive API re-fetching: `resolveCoordinates` depends on `[config]` (entire `AppConfig` object). Any unrelated config mutation (dragging widgets, toggling lock, changing theme) recreates `resolveCoordinates` and `loadWeather`, causing the `useEffect` to abort and fire an immediate redundant Open-Meteo API query. | Narrow `resolveCoordinates` dependency array from `[config]` to `[config.weather_settings]` (or its primitive values). | fixed |
| 3 | MINOR | src-tauri/src/geo/mod.rs:14 | `pub mod geo;` is not declared in `src-tauri/src/lib.rs` and `get_windows_location` is not registered in `tauri::generate_handler![]`. The Rust module is currently dead code and `invoke("get_windows_location")` in `useWeather.ts` always throws and logs a warning before falling back. | Register `pub mod geo;` and add `geo::get_windows_location` to `generate_handler` in `src-tauri/src/lib.rs` (hand-off / prerequisite for WP-06 integration). | fixed |
| 4 | MINOR | src/hooks/useWeather.ts:80 | Missing AbortSignal propagation: `searchCity` is called without passing `controller.signal`. If `loadWeather` is cancelled while city search is in flight, the HTTP request is not aborted. | Pass `controller.signal` to `searchCity`: `searchCity(weather_settings.manual_city.trim(), 1, controller.signal)`. | fixed |
| 5 | MINOR | src/widgets/weather/WeatherWidget.tsx:32 | Unmanaged timer in `handleManualRefresh`: `setTimeout(() => setIsRefreshing(false), 500)` is not cleared if the component unmounts during refresh. | Track timeout ID in a ref and clear on component unmount cleanup. | fixed |

## Questioned Decisions
- **D-027 Open-Meteo & Native Windows Geolocation with Offline Cache Resilience**: Accepted. Privacy-first, zero-key approach with native WinRT fallback and localStorage caching is well-architected.

## Previously rejected items — judgement
None (Round 1).
