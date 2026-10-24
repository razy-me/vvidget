# TOFIX WP-00 — Round 1
Diff: b01170a68961dbc69f5c3ed5b783f15301776625..fc7cf4a5309abec31357cd581149a5ac7424f0a2   Verdict: APPROVED

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | MINOR | src/components/ui/ProgressBar.tsx:31 | Division by zero results in NaN when `max === min` (`style={{ width: 'NaN%' }}`). | Guard percentage calculation: `const percentage = max === min ? 0 : Math.round(((clampedValue - min) / (max - min)) * 100);` | fixed |
| 2 | MINOR | src/components/ui/Tooltip.tsx:21 | Delay timeout (`timeoutRef.current`) is not cleared on component unmount, potentially setting state on an unmounted component. | Add a cleanup `useEffect` that calls `clearTimeout(timeoutRef.current)` on unmount. | fixed |
| 3 | MINOR | src-tauri/capabilities/default.json:6 | `autostart:default` is omitted from permissions, which will block frontend `@tauri-apps/plugin-autostart` IPC calls in subsequent WPs. | Add `"autostart:default"` to the `permissions` array in `capabilities/default.json`. | fixed |
| 4 | ENHANCEMENT | src/components/ui/Tooltip.tsx:55 | Trigger lacks `aria-describedby` linking to tooltip id for screen reader accessibility. | Generate a unique id for tooltip and attach `aria-describedby={id}` to the trigger element when visible. | open |
| 5 | ENHANCEMENT | src/components/ui/Card.tsx:37 | `variant === "solid"` utilizes semitransparent `--fluent-acrylic-bg` (`rgba(..., 0.72)`) without an opaque fallback. | Define an opaque token `--fluent-solid-bg` (e.g. `#1e1e1e` / `#f3f3f3`) or document intended translucency. | open |

## Questioned Decisions
None. D-001 through D-014 are well-reasoned and align with the Windows 11 Fluent architecture and performance constraints.

## Previously rejected items — judgement
None.
