/**
 * Utility functions for ISO-8601 calendar calculations and date formatting.
 */

export const GERMAN_MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export const GERMAN_WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/**
 * Calculates the ISO 8601 week number (KW) for a given Date.
 * Week 1 is the week with the first Thursday of the year.
 */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Formats year, month (0-indexed), and day into ISO string YYYY-MM-DD.
 */
export function formatDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export interface CalendarDayItem {
  year: number;
  month: number; // 0-indexed
  day: number;
  dateKey: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isoWeek: number;
}

export interface CalendarWeekRow {
  isoWeek: number;
  days: CalendarDayItem[];
}

/**
 * Generates the full 7-day rows (with ISO KW numbers) for a given year and month.
 * Starts on Monday (ISO standard).
 */
export function getCalendarGrid(year: number, month: number, today = new Date()): CalendarWeekRow[] {
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const firstDay = new Date(year, month, 1);
  // (0 for Sunday -> 6 for Monday offset)
  const startDayOffset = (firstDay.getDay() + 6) % 7; // 0 = Monday, ..., 6 = Sunday

  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const dayItems: CalendarDayItem[] = [];

  // Previous month padding
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  for (let i = startDayOffset - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const key = formatDateKey(prevYear, prevMonth, d);
    const dateObj = new Date(prevYear, prevMonth, d);
    dayItems.push({
      year: prevYear,
      month: prevMonth,
      day: d,
      dateKey: key,
      isCurrentMonth: false,
      isToday: key === todayKey,
      isoWeek: getISOWeek(dateObj),
    });
  }

  // Current month days
  for (let d = 1; d <= daysInCurrentMonth; d++) {
    const key = formatDateKey(year, month, d);
    const dateObj = new Date(year, month, d);
    dayItems.push({
      year,
      month,
      day: d,
      dateKey: key,
      isCurrentMonth: true,
      isToday: key === todayKey,
      isoWeek: getISOWeek(dateObj),
    });
  }

  // Next month padding to fill remaining days in last week
  const remainder = dayItems.length % 7;
  if (remainder !== 0) {
    const nextYear = month === 11 ? year + 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const fillCount = 7 - remainder;
    for (let d = 1; d <= fillCount; d++) {
      const key = formatDateKey(nextYear, nextMonth, d);
      const dateObj = new Date(nextYear, nextMonth, d);
      dayItems.push({
        year: nextYear,
        month: nextMonth,
        day: d,
        dateKey: key,
        isCurrentMonth: false,
        isToday: key === todayKey,
        isoWeek: getISOWeek(dateObj),
      });
    }
  }

  // Group into weeks
  const weeks: CalendarWeekRow[] = [];
  for (let i = 0; i < dayItems.length; i += 7) {
    const weekDays = dayItems.slice(i, i + 7);
    // In ISO 8601, the week number is represented by the Thursday of that week (index 3)
    const thursday = weekDays[3] || weekDays[0];
    const isoWeek = getISOWeek(new Date(thursday.year, thursday.month, thursday.day));
    weeks.push({
      isoWeek,
      days: weekDays,
    });
  }

  return weeks;
}

/**
 * Formats YYYY-MM-DD into German locale string like "25. Oktober 2026".
 */
export function formatDateGerman(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const monthName = GERMAN_MONTHS[month] ?? "";
  return `${day}. ${monthName} ${year}`;
}
