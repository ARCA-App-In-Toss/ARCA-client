#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { loadState, validateState, repoRoot } from './checks/validate-state.mjs';

// Stop is a conversation boundary, not a build-completion event.
let event;
try { event = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
if (event.stop_hook_active) process.exit(0);
try {
  const errors = validateState(loadState(repoRoot), repoRoot);
  if (errors.length) {
    process.stderr.write(`상태 기록 확인 필요: ${errors.slice(0, 4).join('; ')}\n자동 게이트를 재실행하지 말고 기록을 정정하거나 사용자에게 원인을 보고하세요.\n`);
    process.exitCode = 2;
  }
} catch {
  process.stderr.write('build-state.json을 읽을 수 없습니다. 구현을 멈추고 상태 복구에 필요한 사실을 사용자에게 보고하세요.\n');
  process.exitCode = 2;
}
