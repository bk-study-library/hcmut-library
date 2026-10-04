import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { HERE } from './helpers.mjs';

const ROOT = path.join(HERE, '..');

// Nạp search-core.js đúng như trình duyệt và WebView nạp: một script thường, gắn BkSearch vào globalThis.
export function loadSearchCore() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', 'search-core.js'), 'utf8'), ctx);
  return ctx.BkSearch;
}

const BkSearch = loadSearchCore();
const spec = JSON.parse(fs.readFileSync(path.join(HERE, 'search-cases.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(ROOT, spec.index), 'utf8'));
const idx = BkSearch.prepare(index);

for (const c of spec.cases) {
  test(`tìm "${c.q}"`, () => {
    const ids = BkSearch.search(idx, c.q).map((h) => h.id);
    if (c.none) assert.equal(ids.length, 0, `kết quả: ${ids.join(", ")}`);
    if (c.top) assert.equal(ids[0], c.top, `kết quả: ${ids.join(', ')}`);
    if (c.in) for (const id of c.in) assert.ok(ids.slice(0, c.within).includes(id), `${id} không nằm trong ${c.within} kết quả đầu: ${ids.join(', ')}`);
  });
}

test('mọi id trong bộ câu tìm có trong index', () => {
  const known = new Set(index.courses.map((c) => c.id));
  for (const c of spec.cases) for (const id of [c.top, ...(c.in || [])].filter(Boolean)) assert.ok(known.has(id), id);
});
