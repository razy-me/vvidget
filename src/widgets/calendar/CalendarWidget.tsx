import { useState, type FC, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useCalendar, type UseCalendarOptions, type UseCalendarReturn } from "@/hooks/useCalendar";
import {
  GERMAN_MONTHS,
  GERMAN_WEEKDAYS_SHORT,
  formatDateGerman,
} from "./calendarUtils";
import { cn } from "@/utils/cn";

export interface CalendarWidgetProps extends UseCalendarOptions {
  hookOverride?: UseCalendarReturn;
  className?: string;
}

export const CalendarWidget: FC<CalendarWidgetProps> = ({
  initialEvents,
  initialDate,
  hookOverride,
  className = "",
}) => {
  const internalHook = useCalendar({ initialEvents, initialDate });
  const {
    currentYear,
    currentMonth,
    selectedDateKey,
    events,
    selectedNotes,
    gridRows,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
    selectDate,
    addNote,
    removeNote,
    toggleNote,
  } = hookOverride ?? internalHook;

  const [inputText, setInputText] = useState("");

  const handleAddNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    await addNote(inputText);
    setInputText("");
  };

  const monthLabel = `${GERMAN_MONTHS[currentMonth]} ${currentYear}`;
  const selectedDateLabel = formatDateGerman(selectedDateKey);

  return (
    <Card
      data-testid="calendar-widget"
      variant="acrylic"
      padded={false}
      className={cn(
        "w-full h-full max-w-[360px] max-h-[384px] flex flex-col overflow-hidden text-[var(--fluent-text-primary)] select-none",
        className
      )}
    >
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1 border-b border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)]/40 shrink-0">
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-[var(--fluent-accent)]" />
          <span
            data-testid="month-title"
            className="text-xs font-semibold tracking-wide"
          >
            {monthLabel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="prev-month-btn"
            aria-label="Vorheriger Monat"
            onClick={goToPrevMonth}
            className="p-1 rounded-md hover:bg-[var(--fluent-card-hover)] active:bg-[var(--fluent-card-active)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="today-btn"
            aria-label="Zu heute wechseln"
            onClick={goToToday}
            className="px-2 py-0.5 rounded-md text-[11px] font-medium border border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] active:scale-95 transition-all"
          >
            Heute
          </button>

          <button
            type="button"
            data-testid="next-month-btn"
            aria-label="Nächster Monat"
            onClick={goToNextMonth}
            className="p-1 rounded-md hover:bg-[var(--fluent-card-hover)] active:bg-[var(--fluent-card-active)] text-[var(--fluent-text-secondary)] hover:text-[var(--fluent-text-primary)] transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Monthly Grid with ISO KW */}
      <div className="px-2 pt-1 pb-1 shrink-0">
        {/* Weekday headers */}
        <div className="grid grid-cols-8 gap-0.5 text-center text-[10px] font-semibold text-[var(--fluent-text-tertiary)] pb-1">
          <div className="w-6 text-[9px] uppercase tracking-wider text-center">KW</div>
          {GERMAN_WEEKDAYS_SHORT.map((wd) => (
            <div key={wd} className="flex-1 text-center">
              {wd}
            </div>
          ))}
        </div>

        {/* Calendar Rows */}
        <div className="space-y-0.5">
          {gridRows.map((row) => (
            <div key={`kw-${row.isoWeek}-${row.days[0].dateKey}`} className="grid grid-cols-8 gap-0.5 items-center">
              {/* ISO Week Number */}
              <div
                className="w-6 text-[9px] text-[var(--fluent-text-tertiary)] font-mono text-center select-none"
                title={`Kalenderwoche ${row.isoWeek}`}
              >
                {row.isoWeek}
              </div>

              {/* Day cells */}
              {row.days.map((day) => {
                const isSelected = day.dateKey === selectedDateKey;
                const hasNotes = (events[day.dateKey]?.length ?? 0) > 0;

                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    aria-label={`${day.day}. ${GERMAN_MONTHS[day.month]} ${day.year}`}
                    onClick={() => selectDate(day.dateKey)}
                    className={cn(
                      "relative h-6 flex flex-col items-center justify-center rounded-md text-[11px] font-medium transition-all group",
                      !day.isCurrentMonth && "text-[var(--fluent-text-tertiary)] opacity-40",
                      day.isCurrentMonth && !isSelected && "text-[var(--fluent-text-primary)] hover:bg-[var(--fluent-card-hover)]",
                      day.isToday && !isSelected && "border border-[var(--fluent-accent)] font-bold text-[var(--fluent-accent)]",
                      isSelected &&
                        "bg-[var(--fluent-accent)] text-black font-semibold shadow-sm"
                    )}
                  >
                    <span>{day.day}</span>
                    {hasNotes && (
                      <span
                        data-testid="note-dot"
                        className={cn(
                          "absolute bottom-0.5 w-1 h-1 rounded-full",
                          isSelected ? "bg-black" : "bg-[var(--fluent-accent)]"
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected Day Agenda View */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)]/20 px-3 py-2 overflow-hidden">
        {/* Selected date header */}
        <div className="flex items-center justify-between pb-1.5 shrink-0">
          <span className="text-[11px] font-semibold text-[var(--fluent-text-secondary)] truncate">
            {selectedDateLabel}
          </span>
          {selectedNotes.length > 0 && (
            <span className="text-[10px] text-[var(--fluent-text-tertiary)]">
              {selectedNotes.filter((n) => n.completed).length}/{selectedNotes.length} erledigt
            </span>
          )}
        </div>

        {/* Quick add note input */}
        <form onSubmit={handleAddNote} className="flex items-center gap-1.5 pb-2 shrink-0">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Notiz hinzufügen..."
            className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md border border-[var(--fluent-stroke)] bg-[var(--fluent-card-bg)] text-[var(--fluent-text-primary)] placeholder-[var(--fluent-text-tertiary)] focus:outline-none focus:border-[var(--fluent-accent)] transition-colors"
          />
          <button
            type="submit"
            aria-label="Notiz hinzufügen"
            disabled={!inputText.trim()}
            className="p-1 rounded-md bg-[var(--fluent-accent)] text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Scrollable list of notes */}
        <div
          data-testid="notes-list"
          className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 custom-scrollbar"
        >
          {selectedNotes.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center py-2">
              <span className="text-[11px] text-[var(--fluent-text-tertiary)]">
                Keine Notizen für diesen Tag
              </span>
            </div>
          ) : (
            selectedNotes.map((note) => (
              <div
                key={note.id}
                className={cn(
                  "group flex items-center justify-between gap-2 px-2 py-1 rounded-md text-xs border border-[var(--fluent-stroke-subtle)] bg-[var(--fluent-card-bg)] hover:bg-[var(--fluent-card-hover)] transition-colors",
                  note.completed && "opacity-60"
                )}
              >
                <button
                  type="button"
                  aria-label={`Notiz erledigen: ${note.text}`}
                  onClick={() => toggleNote(note.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
                >
                  {note.completed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--fluent-accent)] shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-[var(--fluent-text-tertiary)] shrink-0" />
                  )}
                  <span
                    className={cn(
                      "truncate text-xs",
                      note.completed && "line-through text-[var(--fluent-text-tertiary)]"
                    )}
                  >
                    {note.text}
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={`Notiz löschen: ${note.text}`}
                  onClick={() => removeNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[var(--fluent-text-tertiary)] hover:text-[var(--fluent-error)] transition-all shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
};
