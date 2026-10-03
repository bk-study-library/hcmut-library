import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPolicy } from '../scripts/lib/policy.mjs';
import { TOOL_ROOT } from '../scripts/lib/repo.mjs';

test('openTypes có đủ 14 loại', () => {
  const t = loadPolicy(TOOL_ROOT).openTypes;
  assert.equal(t.length, 14);
  assert.ok(t.includes('book-ref') && t.includes('summary'));
});

test('extensions: mime và magic', () => {
  const e = loadPolicy(TOOL_ROOT).extensions;
  assert.deepEqual(e['.pdf'], { mime: 'application/pdf', magic: '25504446' });
  assert.equal(e['.zip'].magic, '504b0304');
  assert.equal(e['.md'].mime, 'text/markdown');
});

test('maxFileBytes là 20 MB', () => {
  assert.equal(loadPolicy(TOOL_ROOT).maxFileBytes, 20 * 1024 * 1024);
});

test('terms gom đủ 12 tháng, không tháng nào thuộc hai học kỳ', () => {
  const all = Object.values(loadPolicy(TOOL_ROOT).terms).flat();
  assert.equal(all.length, 12);
  assert.deepEqual([...new Set(all)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('thiếu policy.json thì báo lỗi nêu catalog/policy.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pol-'));
  assert.throws(() => loadPolicy(dir), /catalog\/policy\.json/);
});
