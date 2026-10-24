# TOFIX WP-03 — Round 1
Diff: 4d05d82d14bca7029247aa0d4960716909bddb52..555c97193e5d296fec943ed79d922b668aacd0ac   Verdict: CHANGES_REQUESTED

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | CRITICAL | src-tauri/src/lib.rs:2 | Uncommitted WP-04 code (`pub mod media;`, media command handlers, URI scheme protocol, and media monitor) committed in `555c971`. When commit `555c971` is checked out cleanly, build fails with `error[E0583]: file not found for module 'media'`. | Revert WP-04 imports, module declarations, URI scheme, and media monitor invocation from `src-tauri/src/lib.rs`. Let WP-04 commit its own dependencies when ready. | fixed |
| 2 | MAJOR | src-tauri/src/lib.rs:25 | `shared_metrics` state is initialized to `SystemMetrics::default()` with `timestamp_ms: 0` and zero values. Because `start_metrics_worker` takes >200ms to collect its first sample, an immediate `get_system_metrics` call from the frontend returns uninitialized zero metrics and 0.0% CPU, violating AC-2 and D-025. | Populate `shared_metrics` with an initial valid metrics snapshot before `app.manage()`, or in `get_system_metrics` verify `guard.timestamp_ms > 0` before returning cached snapshot. | fixed |
| 3 | MINOR | src/hooks/useSystemMetrics.ts:112 | Unhandled async listener teardown race. If the component unmounts before dynamic `import("@tauri-apps/api/event")` or `listen` resolves, `unlistenFn` remains undefined during cleanup and the listener leaks permanently. | Add an `isDisposed` flag in the effect. When the `listen` promise resolves, immediately invoke `unlisten()` if `isDisposed` is true. | fixed |
| 4 | MINOR | src/widgets/resources/ResourceWidget.tsx:41 | `selectedDiskIndex` defaults to 0 and `activeDisk` ignores `primaryDisk` (system drive C:) whenever `selectedDiskIndex >= 0`. If `metrics.disks[0]` is not drive C:, the widget initially renders an auxiliary drive rather than the system drive. | Default `selectedDiskIndex` to the index of `primaryDisk` in `metrics.disks`. | fixed |
| 5 | MINOR | src-tauri/src/sysinfo/collector.rs:33 | Duplicate cache state: `MetricsCollector` contains internal `cached_metrics` Arc while `start_metrics_worker` manages and writes to an external `shared_metrics` Arc. | Consolidate state into a single Arc reference or initialize `shared_metrics` directly from `collector.cached_handle()`. | fixed |
| 6 | ENHANCEMENT | src/hooks/useSystemMetrics.ts:100 | React `act(...)` warning in test harness caused by `useSystemMetrics` dispatching asynchronous `refresh()` on mount in mock/browser mode despite state already having `MOCK_SYSTEM_METRICS`. | In `useSystemMetrics`, avoid asynchronous fallback fetch when `!isTauri()` or handle state initialization synchronously in test mode. | fixed |

## Questioned Decisions
- **D-025**: Addressed. `shared_metrics` is now initialized synchronously with `metrics_collector.cached_handle()` (which performs the 200ms CPU warmup and holds a valid snapshot with `timestamp_ms > 0`) before `app.manage()`, and `get_system_metrics` enforces `guard.timestamp_ms > 0`.

## Previously rejected items — judgement
None (Round 1 review).
