import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarNote } from "@/types/config";
import { useConfig } from "@/hooks/useConfig";
import {
  formatDateKey,
  getCalendarGrid,
  type CalendarWeekRow,
} from "@/widgets/calendar/calendarUtils";

const isTauri = (): boolean => {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
};

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return Promise.reject(new Error(`Tauri IPC not available for ${cmd}`));
}

export interface UseCalendarOptions {
  initialEvents?: Record<string, CalendarNote[]>;
  initialDate?: Date;
}

export interface UseCalendarReturn {
  currentDate: Date;
  selectedDateKey: string;
  events: Record<string, CalendarNote[]>;
  selectedNotes: CalendarNote[];
  gridRows: CalendarWeekRow[];
  currentYear: number;
  currentMonth: number;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToToday: () => void;
  selectDate: (dateKey: string) => void;
  addNote: (text: string) => Promise<void>;
  removeNote: (noteId: string) => Promise<void>;
  toggleNote: (noteId: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function useCalendar(options?: UseCalendarOptions): UseCalendarReturn {
  const { config } = useConfig();
  const [currentDate, setCurrentDate] = useState<Date>(
    () => options?.initialDate ?? new Date()
  );

  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => {
    const d = options?.initialDate ?? new Date();
    return formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
  });

  const [events, setEvents] = useState<Record<string, CalendarNote[]>>(() => {
    return options?.initialEvents ?? config.calendar_events ?? {};
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with config if initialEvents was not explicitly passed
  useEffect(() => {
    if (!options?.initialEvents && config.calendar_events) {
      setEvents(config.calendar_events);
    }
  }, [config.calendar_events, options?.initialEvents]);

  // Fetch initial events from backend in Tauri environment
  useEffect(() => {
    if (options?.initialEvents) return;
    if (!isTauri()) return;

    let isMounted = true;
    setIsLoading(true);

    safeInvoke<Record<string, CalendarNote[]>>("get_calendar_events")
      .then((res) => {
        if (isMounted && res) {
          setEvents(res);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [options?.initialEvents]);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const goToPrevMonth = useCallback(() => {
    setCurrentDate((prev) => {
      const prevMonth = prev.getMonth() - 1;
      return new Date(prev.getFullYear(), prevMonth, 1);
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentDate((prev) => {
      const nextMonth = prev.getMonth() + 1;
      return new Date(prev.getFullYear(), nextMonth, 1);
    });
  }, []);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateKey(formatDateKey(today.getFullYear(), today.getMonth(), today.getDate()));
  }, []);

  const selectDate = useCallback((dateKey: string) => {
    setSelectedDateKey(dateKey);
  }, []);

  const addNote = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const newNote: CalendarNote = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text: trimmed,
        completed: false,
      };

      setEvents((prev) => {
        const currentList = prev[selectedDateKey] ? [...prev[selectedDateKey]] : [];
        return {
          ...prev,
          [selectedDateKey]: [...currentList, newNote],
        };
      });

      try {
        await safeInvoke("add_calendar_note", {
          date: selectedDateKey,
          note: newNote,
        });
      } catch {
        // Ignored in non-Tauri / mock environments
      }
    },
    [selectedDateKey]
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      setEvents((prev) => {
        const currentList = prev[selectedDateKey] ?? [];
        const nextList = currentList.filter((n) => n.id !== noteId);
        const nextMap = { ...prev };
        if (nextList.length === 0) {
          delete nextMap[selectedDateKey];
        } else {
          nextMap[selectedDateKey] = nextList;
        }
        return nextMap;
      });

      try {
        await safeInvoke("remove_calendar_note", {
          date: selectedDateKey,
          noteId,
        });
      } catch {
        // Ignored in non-Tauri / mock environments
      }
    },
    [selectedDateKey]
  );

  const toggleNote = useCallback(
    async (noteId: string) => {
      setEvents((prev) => {
        const currentList = prev[selectedDateKey] ?? [];
        const nextList = currentList.map((n) =>
          n.id === noteId ? { ...n, completed: !n.completed } : n
        );
        return {
          ...prev,
          [selectedDateKey]: nextList,
        };
      });

      try {
        await safeInvoke("toggle_calendar_note", {
          date: selectedDateKey,
          noteId,
        });
      } catch {
        // Ignored in non-Tauri / mock environments
      }
    },
    [selectedDateKey]
  );

  const gridRows = useMemo(() => {
    return getCalendarGrid(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const selectedNotes = useMemo(() => {
    return events[selectedDateKey] ?? [];
  }, [events, selectedDateKey]);

  return {
    currentDate,
    selectedDateKey,
    events,
    selectedNotes,
    gridRows,
    currentYear,
    currentMonth,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
    selectDate,
    addNote,
    removeNote,
    toggleNote,
    isLoading,
    error,
  };
}
