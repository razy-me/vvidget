const fs = require('fs');

const partFiles = [
  'docs/reviews/work/part-M1.md',
  'docs/reviews/work/part-M2.md',
  'docs/reviews/work/part-M3.md',
  'docs/reviews/work/part-M4.md',
  'docs/reviews/work/part-M5.md',
  'docs/reviews/work/part-M6.md',
  'docs/reviews/work/cross-ipc-concurrency.md',
  'docs/reviews/work/cross-fluent-ux-security.md'
];

const rejected = new Set(['X-fluent-ux-security-05']);
const duplicates = new Set(['X-ipc-concurrency-08', 'X-fluent-ux-security-08']);
const downgraded = {
  'X-fluent-ux-security-09': 'ENHANCEMENT'
};

const findings = [];
const seen = new Set();

for (const pf of partFiles) {
  const content = fs.readFileSync(pf, 'utf8');
  const sections = content.split(/\n(?=### \[)/);
  for (const sec of sections) {
    if (!sec.trim().startsWith('### [')) continue;
    const headerMatch = sec.match(/^###\s*\[(CRITICAL|MAJOR|MINOR|ENHANCEMENT)\]\s*\[(OPEN|FIXED)\]\s*([A-Za-z0-9_-]+)\s*(.*)/);
    if (!headerMatch) continue;
    let [_, sev, status, id, title] = headerMatch;
    if (rejected.has(id) || duplicates.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    if (downgraded[id]) {
      sev = downgraded[id];
    }

    let body = sec.trim();
    if (downgraded[id]) {
      body = body.replace(/^###\s*\[(CRITICAL|MAJOR|MINOR|ENHANCEMENT)\]/, '### [' + sev + ']');
    }

    // Replace M1-05 fix with corrected Win32 fix
    if (id === 'M1-05') {
      body = body.replace(/```diff[\s\S]*?```/, '```diff\n-        WM_SYSCOMMAND => {\n-            if (wparam.0 as u32) & 0xFFF0 == SC_MINIMIZE {\n-                return LRESULT(0);\n-            }\n-            DefSubclassProc(hwnd, umsg, wparam, lparam)\n-        }\n+        WM_SYSCOMMAND => {\n+            let cmd = (wparam.0 as u32) & 0xFFF0;\n+            if cmd == SC_MINIMIZE || (cmd == SC_MOVE && is_positions_locked()) {\n+                return LRESULT(0);\n+            }\n+            DefSubclassProc(hwnd, umsg, wparam, lparam)\n+        }\n```');
    }

    // Extract 'Where'
    const whereMatch = body.match(/- \*\*Where\*\*:\s*`?([^`\r\n]+)`?/);
    const where = whereMatch ? whereMatch[1] : '';

    findings.push({ id, sev, status, title: title.trim(), where, body });
  }
}

const sevOrder = { CRITICAL: 0, MAJOR: 1, MINOR: 2, ENHANCEMENT: 3 };
findings.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);

const counts = { CRITICAL: 0, MAJOR: 0, MINOR: 0, ENHANCEMENT: 0 };
findings.forEach(f => counts[f.sev]++);

let out = '';
out += '# Review Findings\n\n';
out += '## Review: Complete vvidget Application & Windows 11 Fluent UX\n';
out += '**Date**: 2026-10-27 | **Tier**: 3 (Full Repository Audit)\n';
out += '**Files**: 145 | **Agents Used**: 9\n\n';
out += '| CRITICAL | MAJOR | MINOR | ENHANCEMENT |\n';
out += '|---|---|---|---|\n';
out += `| ${counts.CRITICAL} | ${counts.MAJOR} | ${counts.MINOR} | ${counts.ENHANCEMENT} |\n\n`;

out += '### Fix First (top items)\n';
const criticals = findings.filter(f => f.sev === 'CRITICAL');
criticals.forEach((f, idx) => {
  out += `${idx + 1}. [CRITICAL] [OPEN] ${f.id} ${f.title} -- \`${f.where}\`\n`;
});
out += '\n';

out += '### Systemic Patterns\n';
out += '- **Remote UNC / SMB Path Validation Gaps (NetNTLM Leak)**: Custom action targets (`actions/mod.rs`) and game launcher executables (`launcher/mod.rs`) lack comprehensive UNC validation, allowing network share paths or `smb://` protocols that can trigger automated outbound SMB authentication and credential exposure.\n';
out += '- **Synchronous Win32 & Disk I/O on Tokio Worker Threads**: Multiple async commands (`launch_app_or_uri`, `execute_quick_action`, `scan_installed_games`, sysinfo metric queries) execute blocking Win32 APIs (`ShellExecuteW`), filesystem traversals, and registry queries directly on async reactor threads instead of offloading to `tokio::task::spawn_blocking`.\n';
out += '- **Read-Modify-Write Concurrency & Inconsistent State Persistence**: Several commands (`set_widgets_locked`, `set_autostart`, quick actions) bypass `ConfigManager::update_config` for atomic mutation, causing lost updates when racing with concurrent actions or background debounced disk saves.\n';
out += '- **WinRT COM Safety & Null Dereference Guards**: COM collections and iterators in Bluetooth device inspection omit null checks, risking panics/crashes when device properties contain unexpected COM types.\n';
out += '- **Windows 11 Fluent Layout & Contrast Clipping**: Hardcoded card dimensions (e.g. BatteryWidget 360x384px in 320x360px window, SpeedtestWidget hardcoded pixel widths) cause container overflow and scrollbars; missing light-theme tokens in fluent.css cause illegible status badges.\n\n';

out += '### Findings\n\n';
for (const f of findings) {
  out += f.body + '\n\n';
}

out += '### Coverage / Not Reviewed\n';
out += '- **Reviewed**: Entire repository (145 files across `src-tauri/src/**`, `src/**`, `src/styles/fluent.css`, `index.css`, UI layout & widgets against Windows 11 Fluent Design System guidelines).\n';
out += '- **Excluded / Not Reviewed**: Auto-generated ACL capability schemas (`src-tauri/gen/**`), third-party packages in `node_modules`, compiled binaries in `dist` and `target`.\n';

fs.writeFileSync('docs/reviews/r-review-findings.md', out, 'utf8');
console.log('Successfully written docs/reviews/r-review-findings.md with length:', out.length);
