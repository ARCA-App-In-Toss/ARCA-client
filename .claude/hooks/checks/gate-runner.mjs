#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, closeSync, writeSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './validate-state.mjs';

// Bound both execution and captured output. Never inject raw test output into context.
export function runCheck(name, command, args, { cwd, logDir, timeoutMs = 180_000, maxBytes = 262_144 }) {
  return new Promise((resolveResult) => {
    const log = join(logDir, `${name}.log`);
    const fd = openSync(log, 'wx', 0o600);
    let bytes = 0;
    let stopped;
    const child = spawn(command, args, { cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: 'true', FORCE_COLOR: '0' } });
    const stop = (reason) => {
      if (stopped) return;
      stopped = reason;
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch { /* Already exited. */ }
    };
    const capture = (chunk) => {
      const room = maxBytes - bytes;
      if (room > 0) { const part = chunk.subarray(0, room); writeSync(fd, part); bytes += part.length; }
      if (chunk.length > room) stop('OUTPUT_LIMIT');
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.on('error', () => { stopped = 'START_FAILED'; });
    const timer = setTimeout(() => stop('TIMEOUT'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      closeSync(fd);
      const result = stopped || (code === 0 ? 'PASS' : signal ? `SIGNAL_${signal}` : `EXIT_${code}`);
      if (result === 'PASS') rmSync(log);
      resolveResult({ name, result, log });
    });
  });
}

async function main() {
  const mode = process.argv[2] || 'fast';
  if (!['fast', '--full', '--release'].includes(mode)) {
    console.error(`지원하지 않는 gate mode: ${mode}`);
    return 2;
  }
  const here = fileURLToPath(new URL('.', import.meta.url));
  const logDir = mkdtempSync(join(tmpdir(), 'arca-gate-'));
  const deadline = Date.now() + 600_000;
  const run = (name, file, args = []) => runCheck(name, process.execPath, [join(here, file), ...args], {
    cwd: repoRoot, logDir, timeoutMs: Math.max(1, Math.min(180_000, deadline - Date.now())),
  });
  const failures = [];
  const report = () => {
    if (!failures.length) { rmSync(logDir, { recursive: true }); return; }
    console.error(`FAIL (${mode})\n${failures.map((r) => `- ${r.name}: ${r.result} (로그: ${r.log})`).join('\n')}`);
  };
  // Broken state or missing local specs need input, not six expensive failed checks.
  for (const name of ['validate-state', 'spec-presence']) {
    const result = await run(name, `${name}.mjs`);
    if (result.result !== 'PASS') failures.push(result);
  }
  if (failures.length) { report(); return 1; }
  if (!existsSync(join(repoRoot, 'package.json'))) {
    report();
    console.log(mode === 'fast' ? 'BOOTSTRAP OK (상태·명세만 검사; 앱 미검증)' : `BLOCKED (${mode}): package.json 부재 — 앱 게이트 미실행`);
    return mode === 'fast' ? 0 : 1;
  }
  const checks = [['lint', 'run-package-script.mjs', ['lint']], ['typecheck', 'run-package-script.mjs', ['typecheck']], ['token-lint', 'token-lint.mjs', []]];
  if (mode !== 'fast') checks.push(['test', 'run-package-script.mjs', ['test']], ['contract', 'run-package-script.mjs', ['test:contract']], ['build', 'run-package-script.mjs', ['build']]);
  if (mode === '--release') checks.push(['smoke', 'run-package-script.mjs', ['test:browser']]);
  for (const [name, file, args] of checks) {
    const result = await run(name, file, args);
    if (result.result !== 'PASS') {
      failures.push(result);
      break; // Repair the first cause, then run the completion gate once.
    }
  }
  report();
  if (!failures.length) console.log(`PASS (${mode})`);
  return failures.length ? 1 : 0;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(`게이트 실행 불가: ${error.code || error.name}`); process.exitCode = 1; }
}
