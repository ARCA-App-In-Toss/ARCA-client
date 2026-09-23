#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = [
  '00_INDEX.md',
  '01_UI_OVERVIEW.md',
  '02_DESIGN_SYSTEM.md',
  '03_SCREENS_SPEC.md',
  '04_INTERACTIONS_AND_COPY.md',
  '05_API_SPEC.md',
  '06_FRONTEND_SPEC.md',
  '07_MOCK_SCENARIOS.md',
  '08_QA_AND_INTEGRATION.md',
];

export function checkSpecPresence(repoRoot) {
  const specDir = join(repoRoot, '.claude', 'spec');
  return REQUIRED
    .filter((name) => !existsSync(join(specDir, name)))
    .map((name) => `.claude/spec/${name} 부재`);
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, '..', '..', '..');
  const errors = checkSpecPresence(repoRoot);
  if (errors.length === 0) {
    console.log('spec-presence OK');
    process.exit(0);
  }
  console.error('spec-presence FAIL');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
