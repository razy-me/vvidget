# TOFIX Wave 2 Batch Part 1 — Review Findings (WP-05, WP-06, WP-07)

Commit Diff: `HEAD~1..HEAD` (`59666a5`) — **Verdict: APPROVED**

## Review Scope & Focus Verification

### 1. Command Injection & Path Traversal Prevention (`launcher` & `actions`)
- **Strict Target Validation**: `validate_launch_target` in `src-tauri/src/launcher/mod.rs` strips and inspects all targets before execution. Control characters (`\0`, `\r`, `\n`) and command interpreter patterns (`cmd.exe`, `powershell`, `pwsh`, `wscript`, `cscript`, `mshta`, `-enc `, `-encodedcommand`, `-command`, `/c `, `/k `) are strictly blocked.
- **URI Scheme Allowlist**: Only explicit allowlisted schemes (`steam://`, `steam:`, `com.epicgames.launcher://`, `com.epicgames.launcher:`, `https://`, `http://`) are permitted. URIs containing spaces or command separators (`|`, `;`, `>`, `<`, `"`, `'`, '`', `$`) are rejected.
- **Path Traversal & Extension Whitelist**: Non-URI targets must be absolute paths (`is_absolute()`), must exist on disk (`path.exists()`), must be regular files (`path.is_file()`), and must strictly match allowed executable/shortcut extensions (`.exe`, `.lnk`, `.url`). Directory traversal attempts (`..` sequences escaping system folders) and shell operators (`&`, `|`, `;`, `>`, `<`, `"`, `'`, '`', `$`, `%`) are blocked.
- **Safe Execution**: Execution uses Win32 `ShellExecuteW(HWND(null), w!("open"), wide_target, null, null, SW_SHOWNORMAL)` without command-line parameter pass-through or shell wrapping.
- **Actions Module Security**: `src-tauri/src/actions/mod.rs` maps standard system quick settings to hardcoded, static Windows Settings URI literals (`ms-settings:sound`, `ms-settings:bluetooth`, etc.) and `taskmgr.exe`. Custom action inputs are capped at 2048 chars, stripped of control characters, and blocked from shell chaining characters (`&`, `|`, `;`, '`').

### 2. Speedtest Error Safety, Async Timeouts & Non-Blocking IPC (`speedtest`)
- **Configured Async Timeouts**: HTTP client is configured with a 6s connection timeout and 10s idle pool timeout. Ping phase enforces a 5s per-request timeout across 5 iterations; download and upload streaming phases enforce a 25s timeout each. No network request can hang indefinitely.
- **Non-Blocking Progress Streaming**: During download streaming, IPC event emissions (`speedtest-progress`) are throttled to at most every 100ms (`last_emit.elapsed() >= 100ms`), preventing IPC saturation and UI frame stutter while still delivering smooth 10 FPS gauge updates.
- **Resilience & Math Safety**: Jitter calculation (`calculate_jitter`) safely handles empty and single-element samples without division-by-zero. Throughput rate calculations guard against zero elapsed seconds. All phases handle network/DNS failures gracefully by emitting typed error progress events (`stage: "error"`) before returning an `Err` result.
- **Config Persistence**: Benchmark history is atomically stored in `AppConfig.speedtest_history` and capped to the most recent 10 runs in Rust (and most recent 5 runs in the frontend hook). Event listeners (`speedtest-progress`, `config-changed`) clean up on unmount.

### 3. Quick Settings Multi-Instance, Actions & Config Persistence (`quick_settings`)
- **Independent Cloning**: `duplicate_quick_settings_widget` in `src-tauri/src/lib.rs` clones the target configuration into a new instance ID (`quick_settings_<id>`), sets a default title `"<Title> (Kopie)"`, places the clone adjacent to the source (+360px offset) clamped to monitor bounds, saves config immediately, and launches an independent WebviewWindow.
- **Action Execution**: Quick tiles support 8 system actions and arbitrary custom paths/URLs. Tile clicks trigger `execute_quick_action` with tactile visual feedback (accent border glow and localized `"Gestartet"` status with auto-reset after 700ms).
- **Reactive Persistence**: Title editing, tile visibility toggling, custom tile additions, and tile reordering (Move Up / Move Down) immediately synchronize to `AppConfig.quick_settings_instances` via `update_quick_settings_instance` and emit `config-changed`.

### 4. Fluent Design Token Consistency & Test Validity
- **Windows 11 Fluent Tokens**: All three new widgets consistently utilize design tokens:
  - Acrylic card backdrops: `bg-[var(--fluent-acrylic-bg)]`, `backdrop-blur-xl`, `border-[var(--fluent-stroke)]`.
  - Content containers: `bg-[var(--fluent-card-bg)]`, `hover:bg-[var(--fluent-card-hover)]`.
  - Accent indicators: `text-[var(--fluent-accent)]`, `bg-[var(--fluent-accent-subtle)]`.
  - Typography: Native Segoe UI Variable typography (`font-['Segoe_UI_Variable_Text',_'Segoe_UI',_sans-serif]`).
- **German Localization**: High-polish native Windows 11 copy across all states (`"Bereit"`, `"Download testen..."`, `"Test abgeschlossen"`, `"+ Duplizieren"`, `"Aktionen konfigurieren"`, `"Spiele neu scannen"`, `"Hinzufügen"`, `"Starten"`).
- **Test Suite Verification**:
  - **Vitest Suite**: 25 test files, 179 tests passing (100%).
  - **Cargo Test Suite**: 118 unit tests passing.

---

## Findings

| # | Sev | File:Line | Finding | Suggested fix | Status |
|---|-----|-----------|---------|---------------|--------|
| 1 | ENHANCEMENT | `src/App.tsx:128-170` | `App.tsx` routes independent window requests for `speedtest` and `quick_settings_*`, but `launcher` routing is not yet registered in `App.tsx` (it falls through to canvas/dock view when launched with `?widget=launcher`). | Wire `widgetId === "launcher"` to `GameLauncherWidget` in `App.tsx` during WP-11 (Wave 3 multi-window shell integration). | open (deferred to WP-11) |
| 2 | MINOR | `src-tauri/src/actions/mod.rs:43-55` | `validate_custom_target` blocks shell metacharacters (`&`, `|`, `;`, '`') and control characters, but does not strictly check file extensions for local executables like `launcher::validate_launch_target` does. | Optionally unify custom target executable validation across `actions` and `launcher` to enforce `.exe`/`.lnk`/`.url` extensions for local paths. | open (non-blocking) |

---

## Conclusion

Wave 2 Batch Part 1 (WP-05 Speedtest, WP-06 Game Launcher, WP-07 Quick Settings) is thoroughly validated. Command injection and path traversal protections are robust, speedtest async timeouts and non-blocking IPC progress events operate smoothly, quick settings multi-instance duplication and reactive persistence function correctly, and Fluent Design token consistency is preserved. Zero critical or major bugs were identified.

**Verdict: APPROVED.**
