#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './validate-state.mjs';

const root = repoRoot;
const srcDir = join(root, 'src');
if (!existsSync(srcDir)) {
  console.log('token-lint: src 전 — 스킵');
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const allow = readFileSync(join(here, 'token-lint.allow.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));
const hex = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]|[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/;
const arbitraryPx = /[a-z]+-\[-?\d+(?:\.\d+)?px\]/;
const arbitraryColor = /(?:bg|text|border|fill|stroke|ring|shadow|outline|decoration|accent|caret|from|via|to)-\[#[0-9a-fA-F]+\]/;
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    const path = join(dir, name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!['node_modules', 'generated', 'dist'].includes(name)) walk(path);
    } else if (/\.(css|[jt]sx?)$/.test(name)) {
      files.push(path);
    }
  }
}
walk(srcDir);

const violations = [];
let total = 0;
const add = (message) => { total++; if (violations.length < 20) violations.push(message); };
for (const file of files) {
  const rel = relative(root, file).replaceAll('\\', '/');
  if (allow.some((entry) => rel === entry || rel.startsWith(`${entry}/`))) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    // Ignore prose/comments and URL fragment IDs; this is a heuristic, not a CSS parser.
    if (/^\s*(?:\/\/|\/\*|\*|<!--)/.test(line)) return;
    if (arbitraryColor.test(line) || (hex.test(line) && /(?:color|background|border|fill|stroke|shadow|outline|gradient)\b/i.test(line))) add(`${rel}:${index + 1} raw hex`);
    if (arbitraryPx.test(line)) add(`${rel}:${index + 1} arbitrary px`);
  });
}

if (violations.length === 0) {
  console.log('token-lint OK');
  process.exit(0);
}
console.error(`token-lint FAIL (${total}건, 최대 20건 표시)`);
for (const violation of violations) console.error(`  - ${violation}`);
process.exit(1);
