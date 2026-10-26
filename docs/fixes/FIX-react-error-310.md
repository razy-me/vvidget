# Fix: Minified React Error #310 in AppContent

## Symptom
Application crashes on launch or on certain routes with:
"Something went wrong - Minified React error #310; visit https://react.dev/errors/310 for the full message..."
Error #310 in React means: "Rendered more hooks than during the previous render" (or different number of hooks across renders due to early returns before hooks).

## Root Cause
In `src/App.tsx`, lines 38-305:
```tsx
export const AppContent: FC = () => {
  const { config, setWidgetsLocked, setLayoutMode } = useConfig();
  const { widgetId, isSettingsView, isSkeletonView } = useMemo(...);
  const handleOpenSettings = useCallback(...);
  const handleToggleLock = useCallback(...);

  // EARLY RETURNS!
  if (isSettingsView) return <SettingsModal />;
  if (isSkeletonView) return <SkeletonWidget />;
  if (widgetId === "resources") return ...;
  if (widgetId === "spotify") return ...;
  ...
  if (config.layout_mode === "docked") return ...;

  // HOOK AFTER EARLY RETURNS!
  const dynamicQuickSettings = useMemo(() => {
    ...
  }, [config.widgets]);
```
`dynamicQuickSettings = useMemo(...)` is declared at line 298, which is AFTER all the conditional early returns (`if (isSettingsView)`, `if (widgetId === ...)`, `if (config.layout_mode === "docked")`).
When the app renders in canvas mode (`widgetId === null`, `config.layout_mode === "independent"`), it calls 5 hooks (`useConfig`, `useMemo`, `useCallback`, `useCallback`, `useMemo`).
When it then renders or switches to a single widget window or docked view or settings view, only 4 hooks are called because `dynamicQuickSettings` is skipped!
React detects a mismatch in the hook count or ordering ("Rendered fewer / more hooks than during the previous render"), causing the React ErrorBoundary to catch Error #310 ("Something went wrong")!

## Fix
Move `const dynamicQuickSettings = useMemo(...)` up to the top of `AppContent` alongside all other hooks (`useConfig`, `useMemo`, `useCallback`), BEFORE any conditional early return statements.
