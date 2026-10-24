# TOFIX WP-05 — Round 2
Diff: 4df2d63af221bbe6b3d3204cac699aa5eb6c54d5..34ef7d943347f9f394c99b9a3ae06eb1a744b776   Verdict: APPROVED

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | MAJOR | src/widgets/weather/DailyForecast.tsx:14 | Timezone off-by-one bug: `new Date("YYYY-MM-DD")` parsed as UTC midnight formatted to previous weekday in western timezones. | Verified fixed: explicitly sets `timeZone: "UTC"` in `toLocaleDateString`. | fixed |
| 2 | MAJOR | src/hooks/useWeather.ts:106 | Excessive API re-fetching: `resolveCoordinates` depended on full `[config]` object, retriggering on every UI layout change. | Verified fixed: narrowed dependency array to `[config.weather_settings]`. | fixed |
| 3 | MINOR | src-tauri/src/lib.rs:3,12,56 | `geo` module and `get_windows_location` command unexported / unregistered in Tauri handler. | Verified fixed: `pub mod geo;` registered and added to `generate_handler![]`. | fixed |
| 4 | MINOR | src/hooks/useWeather.ts:83 | Missing `AbortSignal` propagation in `searchCity`. | Verified fixed: `signal` passed through `resolveCoordinates` down to `searchCity`. | fixed |
| 5 | MINOR | src/widgets/weather/WeatherWidget.tsx:26,38 | Unmanaged `setTimeout` in `handleManualRefresh` on component unmount. | Verified fixed: tracked via `refreshTimeoutRef` and cleared on unmount. | fixed |

## Questioned Decisions
- **D-027 Open-Meteo & Native Windows Geolocation with Offline Cache Resilience**: Upheld. Zero API keys, graceful offline fallback, and WinRT location resolution work reliably.

## Previously rejected items — judgement
None.
