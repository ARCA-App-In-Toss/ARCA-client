import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// The shipped F01 story is a tracked copy of the local-only product source (docs/ is not in the
// repository). Where the source exists, the copy must match it byte for byte (04 §7.2 never edits it).
const source = join(import.meta.dirname, '../../docs/ARCA_INTRO_STORY.txt');

test.skipIf(!existsSync(source))('intro story copy matches the product source', () => {
  expect(readFileSync(join(import.meta.dirname, 'introStory.txt'), 'utf8')).toBe(readFileSync(source, 'utf8'));
});
