export interface TimezoneOption {
  id: string;
  label: string;
  timeZone?: string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: "local", label: "Lokal (Systemzeit)" },
  { id: "berlin", label: "Berlin (MEZ / MESZ)", timeZone: "Europe/Berlin" },
  { id: "london", label: "London (GMT / BST)", timeZone: "Europe/London" },
  { id: "newyork", label: "New York (EST / EDT)", timeZone: "America/New_York" },
  { id: "tokyo", label: "Tokio (JST)", timeZone: "Asia/Tokyo" },
  { id: "utc", label: "UTC", timeZone: "UTC" },
];

export function formatDigitalTime(date: Date, timeZone?: string): {
  hours: string;
  minutes: string;
  seconds: string;
  formatted: string;
} {
  try {
    const opts: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    };
    const parts = new Intl.DateTimeFormat("de-DE", opts).formatToParts(date);
    const hours = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minutes = parts.find((p) => p.type === "minute")?.value ?? "00";
    const seconds = parts.find((p) => p.type === "second")?.value ?? "00";
    return {
      hours,
      minutes,
      seconds,
      formatted: `${hours}:${minutes}:${seconds}`,
    };
  } catch {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return {
      hours,
      minutes,
      seconds,
      formatted: `${hours}:${minutes}:${seconds}`,
    };
  }
}

export function formatDateWithWeekdayGerman(date: Date, timeZone?: string): string {
  try {
    const opts: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    };
    return new Intl.DateTimeFormat("de-DE", opts).format(date);
  } catch {
    return date.toLocaleDateString("de-DE");
  }
}

export function formatTimerSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatStopwatchMs(ms: number): {
  display: string;
  minutes: string;
  seconds: string;
  centiseconds: string;
} {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const cs = Math.floor((safeMs % 1000) / 10);
  const minutes = String(m).padStart(2, "0");
  const seconds = String(s).padStart(2, "0");
  const centiseconds = String(cs).padStart(2, "0");
  return {
    display: `${minutes}:${seconds}.${centiseconds}`,
    minutes,
    seconds,
    centiseconds,
  };
}
