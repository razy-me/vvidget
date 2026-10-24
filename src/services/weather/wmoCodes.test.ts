import { describe, it, expect } from "vitest";
import { getWeatherCondition, formatTemperature } from "./wmoCodes";

describe("wmoCodes service", () => {
  it("maps clear sky and sunny codes accurately", () => {
    const clear = getWeatherCondition(0);
    expect(clear.code).toBe(0);
    expect(clear.label).toBe("Clear sky");
    expect(clear.iconName).toBe("Sun");

    const mainlyClear = getWeatherCondition(1);
    expect(mainlyClear.label).toBe("Mainly clear");
    expect(mainlyClear.iconName).toBe("Sun");
  });

  it("maps cloudy, overcast and fog codes", () => {
    const partlyCloudy = getWeatherCondition(2);
    expect(partlyCloudy.label).toBe("Partly cloudy");
    expect(partlyCloudy.iconName).toBe("CloudSun");

    const overcast = getWeatherCondition(3);
    expect(overcast.label).toBe("Overcast");
    expect(overcast.iconName).toBe("Cloud");

    const fog = getWeatherCondition(45);
    expect(fog.label).toBe("Fog");
    expect(fog.iconName).toBe("CloudFog");
  });

  it("maps precipitation codes (rain, snow, thunderstorms)", () => {
    const rain = getWeatherCondition(63);
    expect(rain.label).toBe("Moderate rain");
    expect(rain.iconName).toBe("CloudRain");

    const snow = getWeatherCondition(73);
    expect(snow.label).toBe("Moderate snow fall");
    expect(snow.iconName).toBe("CloudSnow");

    const thunder = getWeatherCondition(95);
    expect(thunder.label).toBe("Thunderstorm");
    expect(thunder.iconName).toBe("CloudLightning");
  });

  it("handles unknown or boundary codes with sensible fallbacks", () => {
    const unknown = getWeatherCondition(999);
    expect(unknown.code).toBe(999);
    expect(unknown.label).toBe("Partly cloudy");
    expect(unknown.iconName).toBe("CloudSun");
  });

  it("formats temperatures correctly with rounding", () => {
    expect(formatTemperature(18.4)).toBe("18°C");
    expect(formatTemperature(18.6)).toBe("19°C");
    expect(formatTemperature(-3.2)).toBe("-3°C");
    expect(formatTemperature(0)).toBe("0°C");
  });
});
