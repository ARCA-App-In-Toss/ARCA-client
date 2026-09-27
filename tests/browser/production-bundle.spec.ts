import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// 06 §12 step 4 / 08 §7: the production bundle carries no mock world, scenario, synthetic identity or
// MSW worker, so no build can enter the app through a mock ACTIVE passenger or a boarding bypass.
const FORBIDDEN = [
  'arca.mock.invalid',
  'synthetic-anon-key',
  'MS-SES-001-active',
  'mockServiceWorker',
  'setupWorker',
  'SYNTHETIC_POLICIES',
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test('production bundle contains no mock entry', () => {
  const dist = join(process.cwd(), 'dist');
  const leaks = files(dist).flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    return FORBIDDEN.filter((marker) => text.includes(marker)).map((marker) => `${path}: ${marker}`);
  });
  expect(leaks).toEqual([]);
});
