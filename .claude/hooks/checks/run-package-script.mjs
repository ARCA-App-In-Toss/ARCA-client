#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { repoRoot } from './validate-state.mjs';

const root = repoRoot;
const packagePath = join(root, 'package.json');
const script = process.argv[2];

if (!script) {
  console.error('script 이름 필요');
  process.exit(1);
}
if (!existsSync(packagePath)) {
  console.error(`${script}: package.json 부재 — BLOCKED`);
  process.exit(1);
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
} catch (error) {
  console.error(`package.json 파싱 불가: ${error.message}`);
  process.exit(1);
}
if (!pkg.scripts?.[script]) {
  console.error(`필수 package script 없음: ${script}`);
  process.exit(1);
}

const managers = ['pnpm', 'yarn', 'npm'];
const declared = pkg.packageManager ? String(pkg.packageManager).split('@')[0] : null;
const lockManagers = [['pnpm', 'pnpm-lock.yaml'], ['yarn', 'yarn.lock'], ['npm', 'package-lock.json']]
  .filter(([, file]) => existsSync(join(root, file))).map(([name]) => name);
if ((declared && !managers.includes(declared)) || lockManagers.length !== 1 || (declared && lockManagers[0] !== declared)) {
  console.error('packageManager와 단일 lockfile을 확인해야 함; 설치·lockfile 변경으로 추측 복구하지 않음');
  process.exit(1);
}
let command = declared || lockManagers[0];
let args = ['run', script];
if (command === 'yarn') args = [script];

const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', timeout: 180_000, killSignal: 'SIGKILL', env: { ...process.env, CI: 'true' } });
if (result.error) console.error(`${command} 실행 실패: ${result.error.message}`);
process.exit(result.status ?? 1);
