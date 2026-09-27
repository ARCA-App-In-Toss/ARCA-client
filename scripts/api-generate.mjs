#!/usr/bin/env node
// Derives wire TypeScript types and Zod 4 validators from the OpenAPI SSOT (06 §3.4).
// The generated directory is never edited by hand; `--check` fails on drift.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const input = join(root, '.claude/spec/arca.openapi.json');
const target = join(root, 'src/data/api/generated');
const check = process.argv.includes('--check');

// `additionalProperties: false` must reject unknown keys, not strip them (05 API-V-019
// keeps other objects open). The zod plugin only emits z.object, so closed objects are
// mapped to z.strictObject through the plugin's resolver hook instead of patching output.
function closedObjectResolver(ctx) {
  const { schema } = ctx;
  const closed = schema.additionalProperties?.type === 'never';
  if (!closed || !schema.properties || Object.keys(schema.properties).length === 0) return undefined;
  return ctx.$(ctx.symbols.z).attr('strictObject').call(ctx.nodes.shape(ctx));
}

const out = mkdtempSync(join(tmpdir(), 'arca-api-'));
try {
  await createClient({
    input,
    output: { path: out },
    logs: { level: 'silent' },
    plugins: [
      '@hey-api/typescript',
      { name: 'zod', compatibilityVersion: 4, '~resolvers': { object: closedObjectResolver } },
    ],
  });

  if (!check) {
    rmSync(target, { recursive: true, force: true });
    cpSync(out, target, { recursive: true });
    console.log('api:generate OK');
  } else {
    const files = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);
    const fresh = files(out);
    const current = files(target);
    const drift =
      fresh.join() !== current.join() ||
      fresh.some((name) => readFileSync(join(out, name), 'utf8') !== readFileSync(join(target, name), 'utf8'));
    if (drift) {
      console.error('api drift: src/data/api/generated differs from OpenAPI. Run `pnpm api:generate`.');
      process.exitCode = 1;
    } else {
      console.log('api drift OK');
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
