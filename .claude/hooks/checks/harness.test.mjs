import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadState, nextAction, repoRoot, validateState } from './validate-state.mjs';
import { runCheck } from './gate-runner.mjs';

const specNames = ['00_INDEX', '01_UI_OVERVIEW', '02_DESIGN_SYSTEM', '03_SCREENS_SPEC', '04_INTERACTIONS_AND_COPY', '05_API_SPEC', '06_FRONTEND_SPEC', '07_MOCK_SCENARIOS', '08_QA_AND_INTEGRATION'];
const save = (root, path, data) => writeFileSync(join(root, path), JSON.stringify(data));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'arca-harness-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(repoRoot, '.claude/hooks'), join(root, '.claude/hooks'), { recursive: true });
  mkdirSync(join(root, '.claude/resource/phases'), { recursive: true });
  mkdirSync(join(root, '.claude/reviews'));
  mkdirSync(join(root, '.claude/spec'), { recursive: true });
  for (const name of specNames) writeFileSync(join(root, '.claude/spec', `${name}.md`), '# Synthetic spec\n');
  const state = loadState();
  for (const item of state.checklist) writeFileSync(join(root, item.phase_file), '# Synthetic phase\n');
  save(root, '.claude/build-state.json', state);
  return { root, state };
}
function invoke(root, script, args = [], input = '{}', cwd = root) {
  return spawnSync(process.execPath, [join(root, '.claude/hooks', script), ...args], {
    cwd, input, encoding: 'utf8', timeout: 10_000,
  });
}
function receipt(root, item, overrides = {}) {
  save(root, `.claude/reviews/${item.id}.json`, {
    id: item.id, reviewers: Object.fromEntries(item.required_reviewers.map((name) => [name, 'PASS'])),
    files: ['src/synthetic.ts'], ts: '2026-09-22T00:00:00Z',
    gate: { mode: item.id === 'step-8-integration' ? '--release' : '--full', result: 'PASS' },
    external_evidence: [], ...overrides,
  });
}
function packageFixture(root, failing = '') {
  const names = ['lint', 'typecheck', 'test', 'test:contract', 'build', 'test:browser'];
  const scripts = Object.fromEntries(names.map((name) => {
    const js = `require("node:fs").appendFileSync("ran",${JSON.stringify(`${name}\n`)});` + (name === failing ? 'console.error("SYNTHETIC_DIAGNOSTIC");process.exit(1);' : '');
    return [name, `node -e '${js}'`];
  }));
  save(root, 'package.json', { name: 'synthetic-harness-test', private: true, packageManager: 'npm@11.0.0', scripts });
  save(root, 'package-lock.json', { lockfileVersion: 3, packages: {} });
}
function cleanupFailureLogs(t, result) {
  for (const match of `${result.stdout}\n${result.stderr}`.matchAll(/로그: ([^)]+)\)/g)) {
    const log = match[1];
    t.after(() => rmSync(join(log, '..'), { recursive: true, force: true }));
  }
}

test('initial state is valid and ordinary session startup only points to work', (t) => {
  const { root, state } = fixture(t);
  assert.deepEqual(validateState(state, root), []);
  assert.equal(nextAction(state).kind, 'work');
  const result = invoke(root, 'session-start.mjs');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /빌드 요청 시 step-1-intake/);
});

test('manual review cannot fall through to a later TODO', (t) => {
  const { root, state } = fixture(t);
  state.checklist[0].status = 'manual-review';
  state.manual_review = [{ id: state.checklist[0].id, reason: 'missing host', next_action: 'provide host' }];
  assert.deepEqual(validateState(state, root), []);
  assert.equal(nextAction(state).kind, 'blocked');
  state.checklist[1].status = 'IN_PROGRESS';
  assert.ok(validateState(state, root).some((e) => e.includes('건너뜀')));
});

test('completion, skipping and approvals require evidence; final approval remains pending', (t) => {
  const { root, state } = fixture(t);
  const item = state.checklist[0];
  item.status = 'COMPLETED';
  assert.ok(validateState(state, root).some((e) => e.includes('리뷰 JSON')));
  receipt(root, item);
  assert.deepEqual(validateState(state, root), []);
  state.checklist[1].status = 'IN_PROGRESS';
  assert.ok(validateState(state, root).some((e) => e.includes('승인 없이')));
  state.checklist = [item];
  assert.equal(nextAction(state).kind, 'approval');
  state.approvals[item.id] = true;
  assert.ok(validateState(state, root).some((e) => e.includes('승인 시각')));
  state.approvals[item.id] = { ts: '2026-09-22', evidence: 'user approved' };
  assert.deepEqual(validateState(state, root), []);
  assert.equal(nextAction(state).kind, 'done');
  item.status = 'SKIPPED';
  assert.ok(validateState(state, root).some((e) => e.includes('SKIPPED')));
});

test('release completion requires external evidence as well as automated gate', (t) => {
  const { root, state } = fixture(t);
  const item = state.checklist.at(-1);
  state.checklist = [item];
  item.status = 'COMPLETED';
  receipt(root, item);
  assert.ok(validateState(state, root).some((e) => e.includes('실제 환경')));
  receipt(root, item, { external_evidence: [{ status: 'BLOCKED', ref: '08 device row' }] });
  assert.ok(validateState(state, root).some((e) => e.includes('실제 환경')));
  receipt(root, item, { external_evidence: [{ status: 'PASS', ref: '08 synthetic evidence' }] });
  assert.deepEqual(validateState(state, root), []);
});

test('malformed shapes, multiple active steps and unsafe paths fail without throwing', (t) => {
  const { root, state } = fixture(t);
  for (const invalid of [null, [], {}, { ...state, checklist: [null] }, { ...state, manual_review: null }, { ...state, approvals: [] }]) {
    assert.ok(validateState(invalid, root).length);
  }
  state.checklist[0].status = 'IN_PROGRESS';
  state.checklist[1].status = 'IN_PROGRESS';
  state.checklist[0].phase_file = '../outside.md';
  assert.ok(validateState(state, root).some((e) => e.includes('IN_PROGRESS가 2')));
  assert.ok(validateState(state, root).some((e) => e.includes('phase_file')));
});

test('exhausted repair count requires a recorded handoff', (t) => {
  const { root, state } = fixture(t);
  const item = state.checklist[0];
  item.status = 'IN_PROGRESS';
  state.retry[item.id] = { unit: 'synthetic', attempts: 2, reason: 'same failure' };
  assert.ok(validateState(state, root).some((e) => e.includes('한도 소진')));
  item.status = 'manual-review';
  state.manual_review = [{ id: item.id, reason: 'same failure', next_action: 'choose alternative' }];
  assert.deepEqual(validateState(state, root), []);
});

test('package absence is bootstrap-only and never full/release PASS', (t) => {
  const { root } = fixture(t);
  const nested = join(root, '.claude/spec');
  const fast = invoke(root, 'checks/gate-runner.mjs', ['fast'], '{}', nested);
  assert.equal(fast.status, 0);
  assert.match(fast.stdout, /BOOTSTRAP OK/);
  for (const mode of ['--full', '--release']) {
    const result = invoke(root, 'checks/gate-runner.mjs', [mode], '{}', nested);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /BLOCKED/);
  }
});

test('gate runs from project root, covers release scripts and stops on first failure', (t) => {
  const { root } = fixture(t);
  packageFixture(root);
  const result = invoke(root, 'checks/gate-runner.mjs', ['--release'], '{}', join(root, '.claude/spec'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS \(--release\)/);
  assert.deepEqual(readFileSync(join(root, 'ran'), 'utf8').trim().split('\n'), ['lint', 'typecheck', 'test', 'test:contract', 'build', 'test:browser']);
  rmSync(join(root, 'ran'));
  packageFixture(root, 'lint');
  const failed = invoke(root, 'checks/gate-runner.mjs', ['--full']);
  cleanupFailureLogs(t, failed);
  assert.equal(failed.status, 1);
  assert.equal(readFileSync(join(root, 'ran'), 'utf8'), 'lint\n');
  assert.doesNotMatch(failed.stdout + failed.stderr, /SYNTHETIC_DIAGNOSTIC/);
  assert.match(failed.stderr, /lint: EXIT_1/);
});

test('missing local specs stop before app checks and lockfile conflicts fail', (t) => {
  const { root } = fixture(t);
  packageFixture(root);
  rmSync(join(root, '.claude/spec/00_INDEX.md'));
  const missing = invoke(root, 'checks/gate-runner.mjs', ['--full']);
  cleanupFailureLogs(t, missing);
  assert.equal(missing.status, 1);
  assert.equal(existsSync(join(root, 'ran')), false);
  writeFileSync(join(root, 'pnpm-lock.yaml'), '# synthetic');
  const conflict = invoke(root, 'checks/run-package-script.mjs', ['lint']);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /단일 lockfile/);
});

test('Stop never runs build checks, permits handoff and blocks state repair at most once', (t) => {
  const { root, state } = fixture(t);
  packageFixture(root, 'lint');
  assert.equal(invoke(root, 'stop-gate.mjs').status, 0);
  assert.equal(existsSync(join(root, 'ran')), false);
  state.checklist[0].status = 'manual-review';
  state.manual_review = [{ id: state.checklist[0].id, reason: 'missing value', next_action: 'ask user' }];
  save(root, '.claude/build-state.json', state);
  assert.equal(invoke(root, 'stop-gate.mjs').status, 0);
  writeFileSync(join(root, '.claude/build-state.json'), '{invalid');
  assert.equal(invoke(root, 'stop-gate.mjs').status, 2);
  assert.equal(invoke(root, 'stop-gate.mjs', [], '{"stop_hook_active":true}').status, 0);
  assert.equal(invoke(root, 'stop-gate.mjs', [], '{invalid').status, 0);
});

test('checks terminate on timeout/output flood, handle missing binaries, isolate logs', async (t) => {
  const logDir = mkdtempSync(join(tmpdir(), 'arca-check-test-'));
  t.after(() => rmSync(logDir, { recursive: true, force: true }));
  const options = { cwd: logDir, logDir, timeoutMs: 300, maxBytes: 1024 };
  const timed = await runCheck('timeout', process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options);
  assert.equal(timed.result, 'TIMEOUT');
  const flooded = await runCheck('flood', process.execPath, ['-e', 'process.stdout.write("x".repeat(100000)); setInterval(() => {}, 1000)'], options);
  assert.equal(flooded.result, 'OUTPUT_LIMIT');
  assert.equal(statSync(flooded.log).size, 1024);
  assert.equal(statSync(flooded.log).mode & 0o777, 0o600);
  const missing = await runCheck('missing', join(logDir, 'absent-binary'), [], options);
  assert.equal(missing.result, 'START_FAILED');
  const passed = await runCheck('pass', process.execPath, ['-e', 'console.log("ok")'], options);
  assert.equal(passed.result, 'PASS');
  assert.equal(existsSync(passed.log), false);
  assert.notEqual(flooded.log, timed.log);
});

test('env examples can be written but real env files remain guarded', (t) => {
  const { root } = fixture(t);
  for (const [path, code] of [['.env.example', 0], ['.env', 2], ['.env.production', 2]]) {
    const result = invoke(root, 'pretool-guard.mjs', [], JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(root, path) } }));
    assert.equal(result.status, code);
  }
});

test('token lint catches color/spacing issues, caps output and ignores symbolic-link cycles', (t) => {
  const { root } = fixture(t);
  mkdirSync(join(root, 'src/ui'), { recursive: true });
  writeFileSync(join(root, 'src/ui/tokens.css'), ':root { --color: #abcd; }');
  writeFileSync(join(root, 'src/ui/view.tsx'), '// color: #abc\nconst anchor = "#abcdef";\n');
  symlinkSync(join(root, 'src'), join(root, 'src/cycle'));
  assert.equal(invoke(root, 'checks/token-lint.mjs', [], '{}', join(root, 'src')).status, 0);
  writeFileSync(join(root, 'src/ui/view.tsx'), 'const color = "#abcd";\n' + 'const cls = "bg-[#12345678] w-[13px]";\n'.repeat(25));
  const failed = invoke(root, 'checks/token-lint.mjs');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /51건/);
  assert.equal(failed.stderr.trim().split('\n').length, 21);
});

test('configured hooks resolve from another cwd with a project path containing spaces', (t) => {
  const { root } = fixture(t);
  const alias = join(root, 'project alias');
  symlinkSync(root, alias);
  const settings = JSON.parse(readFileSync(join(repoRoot, '.claude/settings.json'), 'utf8'));
  for (const event of ['SessionStart', 'Stop']) {
    const hook = settings.hooks[event][0].hooks[0];
    const result = spawnSync('sh', ['-c', hook.command], {
      cwd: tmpdir(), input: '{}', encoding: 'utf8', timeout: 5000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: alias },
    });
    assert.equal(result.status, 0, result.stderr);
    if (event === 'SessionStart') assert.match(result.stdout, /step-1-intake/);
  }
});
