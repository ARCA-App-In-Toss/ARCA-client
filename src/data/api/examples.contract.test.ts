import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { ZodType } from 'zod';
import * as wire from './generated/zod.gen.ts';

type ExampleCase = { name: string; schema: string; valid: boolean; value: unknown };

const examplesPath = join(import.meta.dirname, '../../../.claude/spec/contract_examples.json');
const { cases } = JSON.parse(readFileSync(examplesPath, 'utf8')) as { cases: ExampleCase[] };
const validators = wire as unknown as Record<string, ZodType | undefined>;

describe('OpenAPI contract examples against generated Zod validators', () => {
  test('examples exist', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  test.each(cases.map((c) => [`${c.schema}: ${c.name}`, c] as const))('%s', (_label, c) => {
    const validator = validators[`z${c.schema}`];
    expect(validator, `generated validator for ${c.schema}`).toBeDefined();
    expect(validator?.safeParse(c.value).success).toBe(c.valid);
  });
});
