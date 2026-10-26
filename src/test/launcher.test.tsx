import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { GameLauncherWidget } from "@/widgets/launcher/GameLauncherWidget";
import type { LauncherItem } from "@/types/config";

const mockItems: LauncherItem[] = [
  {
    id: "steam_620",
    name: "Portal 2",
    path_or_uri: "steam://rungameid/620",
    source: "steam",
    icon_type: "steam",
    icon_url: "data:image/jpeg;base64,fakeportal2icon",
  },
  {
    id: "steam_1942280",
    name: "Brotato",
    path_or_uri: "steam://rungameid/1942280",
    source: "steam",
    icon_type: "steam",
  },
  {
    id: "epic_Fortnite",
    name: "Fortnite",
    path_or_uri: "com.epicgames.launcher://apps/Fortnite?action=launch&silent=true",
    source: "epic",
    icon_type: "epic",
  },
  {
    id: "custom_geforce",
    name: "GeForce NOW",
    path_or_uri: "https://play.geforcenow.com",
    source: "custom",
    icon_type: "custom",
  },
];

describe("GameLauncherWidget Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders compact search header, category pills, and games list with real icon", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    expect(screen.getByPlaceholderText("Suchen nach Spiel oder App...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spiel oder App hinzufügen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spiele neu scannen" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Alle" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Steam" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Epic" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Eigene" })).toBeInTheDocument();

    expect(screen.getByText("Portal 2")).toBeInTheDocument();
    expect(screen.getByText("Brotato")).toBeInTheDocument();
    expect(screen.getByText("Fortnite")).toBeInTheDocument();
    expect(screen.getByText("GeForce NOW")).toBeInTheDocument();

    // Verify real icon image rendered for item with icon_url
    const portalImg = screen.getByAltText("Portal 2");
    expect(portalImg).toBeInTheDocument();
    expect(portalImg).toHaveAttribute("src", "data:image/jpeg;base64,fakeportal2icon");
  });

  it("filters items using search query", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    const searchInput = screen.getByPlaceholderText("Suchen nach Spiel oder App...");
    fireEvent.change(searchInput, { target: { value: "Portal" } });

    expect(screen.getByText("Portal 2")).toBeInTheDocument();
    expect(screen.queryByText("Brotato")).not.toBeInTheDocument();
    expect(screen.queryByText("Fortnite")).not.toBeInTheDocument();
    expect(screen.queryByText("GeForce NOW")).not.toBeInTheDocument();
  });

  it("displays empty search state when query matches nothing", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    const searchInput = screen.getByPlaceholderText("Suchen nach Spiel oder App...");
    fireEvent.change(searchInput, { target: { value: "NonExistentGameXYZ" } });

    expect(screen.getByText("Keine Treffer für deine Suche")).toBeInTheDocument();
  });

  it("filters items by category tab", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    // Click "Steam"
    fireEvent.click(screen.getByRole("tab", { name: "Steam" }));
    expect(screen.getByText("Portal 2")).toBeInTheDocument();
    expect(screen.getByText("Brotato")).toBeInTheDocument();
    expect(screen.queryByText("Fortnite")).not.toBeInTheDocument();
    expect(screen.queryByText("GeForce NOW")).not.toBeInTheDocument();

    // Click "Epic"
    fireEvent.click(screen.getByRole("tab", { name: "Epic" }));
    expect(screen.queryByText("Portal 2")).not.toBeInTheDocument();
    expect(screen.getByText("Fortnite")).toBeInTheDocument();

    // Click "Eigene"
    fireEvent.click(screen.getByRole("tab", { name: "Eigene" }));
    expect(screen.queryByText("Fortnite")).not.toBeInTheDocument();
    expect(screen.getByText("GeForce NOW")).toBeInTheDocument();

    // Click "Alle"
    fireEvent.click(screen.getByRole("tab", { name: "Alle" }));
    expect(screen.getByText("Portal 2")).toBeInTheDocument();
    expect(screen.getByText("Fortnite")).toBeInTheDocument();
    expect(screen.getByText("GeForce NOW")).toBeInTheDocument();
  });

  it("handles 1-click launch interaction", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    const launchButtons = screen.getAllByRole("button", { name: /starten/i });
    expect(launchButtons.length).toBeGreaterThan(0);

    fireEvent.click(launchButtons[0]);

    await waitFor(() => {
      // Button transitions to temporary active/launching state or returns
      expect(screen.getByText("Portal 2")).toBeInTheDocument();
    });
  });

  it("opens add modal, validates empty inputs, and adds custom item", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    const addBtn = screen.getByLabelText("Spiel oder App hinzufügen");
    fireEvent.click(addBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Spiel oder App hinzufügen")).toBeInTheDocument();

    // Try submit empty
    const submitBtn = screen.getByRole("button", { name: "Hinzufügen" });
    fireEvent.click(submitBtn);

    expect(screen.getByText("Bitte gib einen Namen ein.")).toBeInTheDocument();

    // Fill name only
    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Xbox Cloud Gaming" } });
    fireEvent.click(submitBtn);

    expect(screen.getByText("Bitte gib einen Pfad oder eine URL ein.")).toBeInTheDocument();

    // Fill target
    const targetInput = screen.getByLabelText("Pfad (.exe) oder URL (https://)");
    fireEvent.change(targetInput, { target: { value: "https://xbox.com/play" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Xbox Cloud Gaming")).toBeInTheDocument();
  });

  it("allows removing a custom item", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    const deleteBtn = screen.getByLabelText("GeForce NOW entfernen");
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByText("GeForce NOW")).not.toBeInTheDocument();
    });
  });

  it("regression M6-04: declares relative positioning on Card container so modal stays bounded", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    const card = screen.getByTestId("game-launcher-widget");
    expect(card.className).toContain("relative");
  });

  it("regression M6-03: image onError manages state reactively so fallback initials persist across re-renders", async () => {
    await act(async () => {
      render(<GameLauncherWidget initialItems={mockItems} autoScan={false} />);
    });

    const portalImg = screen.getByAltText("Portal 2");
    expect(portalImg).toBeInTheDocument();

    // Trigger image loading failure
    await act(async () => {
      fireEvent.error(portalImg);
    });

    // Image is removed and initials fallback is displayed
    expect(screen.queryByAltText("Portal 2")).not.toBeInTheDocument();
    expect(screen.getByText("P2")).toBeInTheDocument();

    // Trigger re-render by typing into search input
    const searchInput = screen.getByPlaceholderText("Suchen nach Spiel oder App...");
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "Port" } });
    });

    // Initials fallback MUST still be visible, not disappear or leave an empty hole
    expect(screen.queryByAltText("Portal 2")).not.toBeInTheDocument();
    expect(screen.getByText("P2")).toBeInTheDocument();
  });
});
