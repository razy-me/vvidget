# Fix: Settings Modal Scrolling Issue (Widget List)

## Symptom
In the Settings window (`SettingsModal`), the user cannot scroll the content, particularly in the "Widgets" tab which contains the 10+ widgets list.

## Repro / Root Cause Analysis
1. In `src/index.css`:
   `html, body, #root { height: 100%; overflow: hidden; }`
2. In `src/pages/settings/SettingsModal.tsx:153-156`:
   ```tsx
   <div className="min-h-screen bg-[var(--fluent-acrylic-bg)] text-[var(--fluent-text-primary)] flex flex-col font-sans select-none">
   ```
   Notice `min-h-screen` on the root container inside a `#root` that has `height: 100%; overflow: hidden;`.
   When inside a flex container with `min-h-screen`, `flex-1 flex overflow-hidden` (line 182) can grow beyond the screen bounds instead of being constrained to the viewport height `h-screen` or `h-full`.
3. In `SettingsModal.tsx:182`:
   ```tsx
   <div className="flex-1 flex overflow-hidden">
     <aside className="w-44 ...">...</aside>
     <main className="flex-1 p-5 overflow-y-auto space-y-4">
   ```
   Because the outer container is `min-h-screen` instead of `h-full` or `h-screen max-h-screen`, flex items in Chrome/Blink don't get an explicit height boundary unless `min-h-0` is present on the flex child (`flex-1 min-h-0 flex overflow-hidden`), OR `h-screen overflow-hidden` is used on the parent.
   Without `min-h-0` or a strict height, the `main` container expands with content height, causing the scroll to be pushed outside the window viewport, where `html, body { overflow: hidden; }` clips it completely. As a result, the scrollbar is off-screen or the container never triggers `overflow-y-auto`!

## Success Criterion
1. `SettingsModal` is strictly constrained to the window dimensions (`h-full` or `h-screen`).
2. The inner flex containers have `min-h-0` so `main.overflow-y-auto` correctly bounds its height and scrolls via mouse wheel, touch, and scrollbar.
3. User can scroll smoothly through the entire list of 10+ widgets in the "Widgets" tab.
