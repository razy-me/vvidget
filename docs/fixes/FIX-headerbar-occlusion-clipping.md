# Fix: HeaderBar Occludes Widget Buttons and Information on Hover (`FIX-headerbar-occlusion-clipping.md`)

- **Status**: IN_PROGRESS
- **Mode**: `r-fix-this`
- **Date**: 2026-10-26
- **Base Commit**: `d82e98e0b32a013a7f2607dde88c0eae728fd0a5`

## 1. Symptom & Success Criterion
- **Actual**:
  When the user hovers over any independent desktop widget (e.g. Clock & Timers, Game & App Launcher, Calendar & Notes, Weather, Bluetooth, Spotify), the floating `HeaderBar` fades in (`opacity-100 group-hover:pointer-events-auto`) at `absolute top-0 left-0 right-0 z-20`.
  Because `HeaderBar` is positioned as an absolute overlay directly on top of the widget's content without reserving vertical space, it physically covers and intercepts clicks for:
  - The "Neuladen" (Refresh) buttons (Weather, Launcher, Bluetooth, Spotify)
  - Essential widget buttons (Clock tabs "Uhr/Timer/Stoppuhr/Wecker", Calendar navigation "< Heute >", Launcher search input & "+" button)
  - Crucial widget information (Clock tabs, Calendar month title, Weather city location)
- **Expected**:
  Widget controls (refresh buttons, search inputs, tabs, navigation) and text must never be occluded or blocked by the widget header. The user must be able to click all buttons freely, and the header must look and feel like a native Windows 11 feature (clean in-flow header bar at the top of the card or non-overlapping controls).
- **Trigger**: Hovering the cursor over any independent widget card.
- **Frequency**: 100% reproducible whenever hovering.
- **Environment**: Windows 11 Fluent UI, React 19, Tailwind CSS.
- **Success Criterion**:
  1. In independent layout mode, `HeaderBar` does not sit on top of widget content (`children`).
  2. All top-level widget buttons ("Neuladen", tabs, search input, calendar navigation) remain 100% visible and clickable when the widget is hovered.
  3. `layout.test.tsx` and all widget test suites pass with regression tests proving no occlusion.

## 2. Hypotheses
- **H1 (In-Flow HeaderBar Layout)**:
  `HeaderBar` should be part of the normal vertical flex flow (`relative w-full flex-shrink-0`), not an `absolute top-0` overlay that sits on top of `{children}`. In Windows 11 Fluent Design (WinUI 3 / Widgets Board), widget cards have a clean top header (title + icon on left, grip/lock/settings on right) and content flows directly below it. Removing the absolute positioning and making `HeaderBar` in-flow guarantees zero occlusion under all conditions.
- **H2 (Padded Content Box)**:
  Keep `HeaderBar` absolute, but add top padding `pt-9` to the content container.
  *Refutation*: If content is padded `pt-9` while `HeaderBar` is invisible (`opacity-0` when unhovered), every widget has an empty 36px dead gap at the top when not hovered, looking broken.
- **H3 (HeaderBar Embedded Actions)**:
  Remove outer `HeaderBar` entirely and move drag/lock/settings into each individual widget.
  *Refutation*: Violates DRY, requires modifying 10 widgets, and breaks modularity of `WidgetContainer`.

## 3. Attempt Ledger
### Attempt 1: In-Flow HeaderBar in `HeaderBar.tsx` & `WidgetContainer.tsx`
- **Hypothesis**: H1
- **Changes**:
  1. In `src/components/layout/HeaderBar.tsx`, change `!isDocked && ["absolute top-0 left-0 right-0 z-20..."]` to in-flow layout (`relative w-full flex-shrink-0`).
  2. Header controls (drag grip, lock, settings) can smoothly show hover elevation/opacity without covering `{children}`.
  3. Ensure `Card` in `WidgetContainer.tsx` maintains clean flex column flow where `HeaderBar` is the top child and `{children}` is the scrollable body below it.
