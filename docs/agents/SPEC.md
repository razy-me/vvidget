# SPEC: Native Windows 11 UI/UX Overhaul (Gemini 4 Argon Audit)

## Verbatim Request
 Umsetzung des ehrlichen Feedbacks von Gemini 4 Argon:
1. Redundante Header-Zeilen abbauen (Outer Header nur bei Hover einblenden)
2. Sprach-Konsistenz (100% Deutsch-Lokalisierung)
3. Typografie & Text-Kollisionen beheben (flex-width / justify-between in MetricBar & Clock Tabs)
4. Nativere Buttons (WinUI 3 Segmented Controls statt Pills)
5. Echter DWM Acrylic/Mica & Translucency
6. Weather & Battery Polish (Open-Meteo dezenter, Akkustatus & Verlaufsplatzhalter)
7. Bluetooth Clipping-Fix, Akkustand & Schnellaktion (Trennen/Verbinden)
8. Media Controls Album-Cover & dynamischer Blur-Hintergrund
9. Speedtest (Clipping & Klick-Aktion), Launcher (Suchzeilen-Plus & echte Icons), Calendar & Clock Polish

## Numbered Requirements
- `R1`: Outer HeaderBar fades in smoothly on widget hover or while dragging (`opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`), without consuming vertical layout space. Remove redundant inner headers.
- `R2`: 100% German UI localization across Weather, Battery, Resources, Spotify, Calendar, and HeaderBar.
- `R3`: Tooltip wrapper and MetricBar width fixed so labels are left-aligned and values right-aligned with no text collisions (`Memory13.4 GB`). Fix Clock tab text/icon collision.
- `R4`: Replace round pills with WinUI 3 segmented controls (`rounded-[5px]`, crisp selection pill).
- `R5`: Desktop translucency: lower `--fluent-acrylic-bg` opacity to 0.56, apply DWM corner & backdrop attributes.
- `R6`: Weather watermark opacity 0.35. Battery sparkline placeholder `"Sammle Daten..."` when `<= 1` sample, translated badges.
- `R7`: Bluetooth clipping fix (2 cards fit cleanly), PnP battery property lookup, inline `Trennen / Verbinden` hover action.
- `R8`: GSMTC album art data URI serving & dynamic blurred cover backdrop in Spotify widget.
- `R9`: Speedtest sub-card clipping fix + gauge play action. Launcher compact header + real Steam/App icons. Calendar inline accent `+` button. Clock icon-only inactive tabs & remove redundant bottom timezone footer.

## Non-Functional Requirements
- Zero regression on existing test suites (vitest + cargo test).
- Zero GPU idle load regressions (no infinite keyframe animations).
- Safe fallbacks when hardware/WinRT APIs return empty.
