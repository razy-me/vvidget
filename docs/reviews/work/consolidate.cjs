const fs = require('fs');

const downgraded = {
  'M6-01': 'MINOR',
  'X2-02': 'MINOR',
  'X2-03': 'MINOR',
  'X2-04': 'MINOR'
};

const partFiles = [
  'docs/reviews/work/part-M1.md',
  'docs/reviews/work/part-M2.md',
  'docs/reviews/work/part-M3.md',
  'docs/reviews/work/part-M4.md',
  'docs/reviews/work/part-M5.md',
  'docs/reviews/work/part-M6.md',
  'docs/reviews/work/cross-ipc-contracts.md',
  'docs/reviews/work/cross-fluent-ui.md'
];

const findings = [];
const seenIds = new Set();

for (const pf of partFiles) {
  const content = fs.readFileSync(pf, 'utf8');
  const sections = content.split(/\n(?=### \[)/);
  for (const sec of sections) {
    if (!sec.trim().startsWith('### [')) continue;
    const headerMatch = sec.match(/^###\s*\[(CRITICAL|MAJOR|MINOR|ENHANCEMENT)\]\s*\[(OPEN|FIXED)\]\s*([A-Za-z0-9_-]+)\s*(.*)/);
    if (!headerMatch) continue;
    let [_, sev, status, id, title] = headerMatch;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    if (downgraded[id]) {
      sev = downgraded[id];
    }

    // Reconstruct header with potentially downgraded severity
    let body = sec.trim().replace(/^###\s*\[(CRITICAL|MAJOR|MINOR|ENHANCEMENT)\]/, '### [' + sev + ']');
    findings.push({ id, sev, status, title: title.trim(), body });
  }
}

const sevOrder = { CRITICAL: 0, MAJOR: 1, MINOR: 2, ENHANCEMENT: 3 };
findings.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);

const counts = { CRITICAL: 0, MAJOR: 0, MINOR: 0, ENHANCEMENT: 0 };
findings.forEach(f => counts[f.sev]++);

let out = '';
out += '# Review Findings\n\n';
out += '## Review: Complete vvidget Application & Windows 11 Fluent UX\n';
out += '**Date**: 2026-10-26 | **Tier**: 3 (Full Repository Audit)\n';
out += '**Files**: 104 | **Agents Used**: 9\n\n';
out += '| CRITICAL | MAJOR | MINOR | ENHANCEMENT |\n';
out += '|---|---|---|---|\n';
out += `| ${counts.CRITICAL} | ${counts.MAJOR} | ${counts.MINOR} | ${counts.ENHANCEMENT} |\n\n`;

out += '### Fix First (top items)\n';
out += '1. [CRITICAL] [OPEN] M1-01 Win+D / Show Desktop Protection Broken by `WM_SHOWWINDOW` Self-Defeat -- `src-tauri/src/window/win32.rs:492`\n';
out += '2. [CRITICAL] [OPEN] M1-02 Synchronous Desktop-Wide Erase and Redraw Stalls DWM and Causes Global Screen Flash -- `src-tauri/src/window/win32.rs:306`\n';
out += '3. [CRITICAL] [OPEN] M2-01 Destructive Non-Atomic Fallback in `save_config_atomic` Deletes Both Target and Temp File on Transient Lock -- `src-tauri/src/config/storage.rs:86`\n';
out += '4. [CRITICAL] [OPEN] M3-03 Bluetooth Device Enumeration Sequentially Blocks on Remote Device Resolution & Fails Battery Loading -- `src-tauri/src/bluetooth/mod.rs:135`\n\n';

out += '### Systemic Patterns\n';
out += '- **Blocking I/O on Async Runtime Worker Threads**: Multiple async Tauri commands (`scan_installed_games`, `get_system_metrics`, `execute_quick_action`, WinRT geolocation) call synchronous Win32 APIs, disk I/O, or thread sleep directly on Tokio reactor threads without `tokio::task::spawn_blocking`.\n';
out += '- **Asynchronous Listener Cleanup Races**: React hooks (`useConfig`, `useSpeedtest`) invoke asynchronous `listen()` from `@tauri-apps/api/event` without disposal guards, permanently leaking listener closures when components quickly unmount (e.g. StrictMode, navigation).\n';
out += '- **State Desynchronization & Reversion**: React state mutation using stale refs (`latestConfigRef` in `useConfig`), additive spread resurrecting deleted keys (`useCalendar`), and imperative DOM mutations (`img.onError` in Launcher) leading to out-of-sync UI.\n';
out += '- **Windows 11 Fluent Design Material Depth & WinUI 3 Controls**: Missing `backdrop-filter: blur(20px)` on `.fluent-acrylic` surfaces leaves widgets without optical blur over wallpapers; widgets rely on stadium pill capsules instead of native WinUI 3 rectangular segmented controls; retro all-caps tracked headers violate Windows 11 typography.\n\n';

out += '### Findings\n\n';
for (const f of findings) {
  out += f.body + '\n\n';
}

out += '### Coverage / Not Reviewed\n';
out += '- **Reviewed**: Full codebase (104 non-test files across `src-tauri/src/**`, `src/**`, `src/styles/fluent.css`, `index.css`, UI layout & widgets against Windows 11 design screenshot).\n';
out += '- **Excluded / Not Reviewed**: Auto-generated ACL capability schemas (`src-tauri/gen/**`), third-party packages in `node_modules`, compiled binaries in `dist` and `target`.\n';

fs.writeFileSync('docs/reviews/r-review-findings.md', out, 'utf8');
console.log('Successfully written docs/reviews/r-review-findings.md with length:', out.length);
