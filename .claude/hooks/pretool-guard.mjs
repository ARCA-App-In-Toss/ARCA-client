#!/usr/bin/env node
let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let event = {};
  try { event = JSON.parse(raw || '{}'); } catch { process.exit(0); }

  const tool = event.tool_name || '';
  const input = event.tool_input || {};
  const block = (reason) => {
    process.stderr.write(`차단: ${reason}\n`);
    process.exit(2);
  };

  if (tool === 'Bash') {
    const command = String(input.command || '');
    const dangerous = [
      [/rm\s+-[^\n]*r[^\n]*f[^\n]*\s+(\/|~|\.\.)/, '광범위 삭제'],
      [/git\s+push\b/, 'git push는 사람이 수행'],
      [/gh\s+(release|pr\s+merge|repo\s+delete)\b/, '원격 release/merge/delete는 사람이 수행'],
      [/(npm|pnpm|yarn)\s+publish\b/, 'package publish는 사람이 수행'],
      [/(vercel|netlify|firebase|gh-pages)[^\n]*(deploy|--prod)\b/, '배포는 사람이 수행'],
      [/curl[^|\n]*\|\s*(sh|bash)\b/, '원격 스크립트 파이프 실행'],
    ];
    for (const [pattern, reason] of dangerous) if (pattern.test(command)) block(reason);
  }

  if (/^(Write|Edit|MultiEdit)$/.test(tool)) {
    const path = String(input.file_path || input.path || '').replaceAll('\\', '/');
    if (/(^|\/)\.env(?:\.|$)/.test(path) && !/(^|\/)\.env\.example$/.test(path)) block('.env 값은 사람이 입력하고 하네스는 구조만 생성');
  }
  process.exit(0);
});

