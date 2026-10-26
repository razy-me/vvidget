import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CalendarWidget } from "@/widgets/calendar/CalendarWidget";
import type { CalendarNote } from "@/types/config";

describe("CalendarWidget Component", () => {
  const fixedDate = new Date(2026, 9, 26); // 26. Oktober 2026

  const initialNotes: Record<string, CalendarNote[]> = {
    "2026-10-26": [
      { id: "note_1", text: "Team Standup", completed: false },
      { id: "note_2", text: "Code Review", completed: true },
    ],
    "2026-10-28": [
      { id: "note_3", text: "Sprint Planning", completed: false },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders monthly grid with month title, week numbers (KW), and weekday headers", async () => {
    await act(async () => {
      render(
        <CalendarWidget
          initialDate={fixedDate}
          initialEvents={initialNotes}
        />
      );
    });

    expect(screen.getByTestId("month-title")).toHaveTextContent("Oktober 2026");
    expect(screen.getByText("KW")).toBeInTheDocument();
    expect(screen.getByText("Mo")).toBeInTheDocument();
    expect(screen.getByText("So")).toBeInTheDocument();
    expect(screen.getByText("Heute")).toBeInTheDocument();
  });

  it("navigates forward and backward between months", async () => {
    await act(async () => {
      render(<CalendarWidget initialDate={fixedDate} />);
    });

    expect(screen.getByTestId("month-title")).toHaveTextContent("Oktober 2026");

    // Click Next Month
    await act(async () => {
      fireEvent.click(screen.getByTestId("next-month-btn"));
    });
    expect(screen.getByTestId("month-title")).toHaveTextContent("November 2026");

    // Click Prev Month twice
    await act(async () => {
      fireEvent.click(screen.getByTestId("prev-month-btn"));
    });
    expect(screen.getByTestId("month-title")).toHaveTextContent("Oktober 2026");

    await act(async () => {
      fireEvent.click(screen.getByTestId("prev-month-btn"));
    });
    expect(screen.getByTestId("month-title")).toHaveTextContent("September 2026");

    // Click "Heute" button to return
    await act(async () => {
      fireEvent.click(screen.getByTestId("today-btn"));
    });
    // Month will be current real month
    const now = new Date();
    const months = [
      "Januar", "Februar", "März", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember"
    ];
    expect(screen.getByTestId("month-title")).toHaveTextContent(
      `${months[now.getMonth()]} ${now.getFullYear()}`
    );
  });

  it("displays notes for the selected day with completion status", async () => {
    await act(async () => {
      render(
        <CalendarWidget
          initialDate={fixedDate}
          initialEvents={initialNotes}
        />
      );
    });

    expect(screen.getByText("Team Standup")).toBeInTheDocument();
    expect(screen.getByText("Code Review")).toBeInTheDocument();
    expect(screen.getByText("1/2 erledigt")).toBeInTheDocument();
  });

  it("adds a new note for the selected day", async () => {
    await act(async () => {
      render(
        <CalendarWidget
          initialDate={fixedDate}
          initialEvents={initialNotes}
        />
      );
    });

    const input = screen.getByPlaceholderText("Notiz hinzufügen...");
    const submitBtn = screen.getByLabelText("Notiz hinzufügen");

    await act(async () => {
      fireEvent.change(input, { target: { value: "Deploy to Production" } });
    });

    expect(submitBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(screen.getByText("Deploy to Production")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("toggles note completion status", async () => {
    await act(async () => {
      render(
        <CalendarWidget
          initialDate={fixedDate}
          initialEvents={initialNotes}
        />
      );
    });

    const noteButton = screen.getByLabelText("Notiz erledigen: Team Standup");
    const noteText = screen.getByText("Team Standup");

    expect(noteText).not.toHaveClass("line-through");

    await act(async () => {
      fireEvent.click(noteButton);
    });

    expect(noteText).toHaveClass("line-through");
  });

  it("deletes a note from the selected day", async () => {
    await act(async () => {
      render(
        <CalendarWidget
          initialDate={fixedDate}
          initialEvents={initialNotes}
        />
      );
    });

    expect(screen.getByText("Team Standup")).toBeInTheDocument();
    const deleteBtn = screen.getByLabelText("Notiz löschen: Team Standup");

    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(screen.queryByText("Team Standup")).not.toBeInTheDocument();
  });

  it("switches selected date and displays its notes or empty state", async () => {
    await act(async () => {
      render(
        <CalendarWidget
          initialDate={fixedDate}
          initialEvents={initialNotes}
        />
      );
    });

    // October 28 has a note "Sprint Planning"
    const day28 = screen.getByLabelText("28. Oktober 2026");
    await act(async () => {
      fireEvent.click(day28);
    });

    expect(screen.getByText("Sprint Planning")).toBeInTheDocument();
    expect(screen.queryByText("Team Standup")).not.toBeInTheDocument();

    // October 15 has no notes
    const day15 = screen.getByLabelText("15. Oktober 2026");
    await act(async () => {
      fireEvent.click(day15);
    });

    expect(screen.getByText("Keine Notizen für diesen Tag")).toBeInTheDocument();
  });

  it("displays indicator dots on days with notes", async () => {
    await act(async () => {
      render(
        <CalendarWidget
          initialDate={fixedDate}
          initialEvents={initialNotes}
        />
      );
    });

    const dots = screen.getAllByTestId("note-dot");
    expect(dots.length).toBeGreaterThanOrEqual(2);
  });
});
