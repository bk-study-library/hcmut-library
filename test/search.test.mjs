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

test('tìm theo tên giảng viên và lọc theo khoa', () => {
  const mini = {
    courses: [
      { id: 'MT1005', code: 'MT1005', name: 'Giải tích 2', faculty: 'fas', aliases: [], oldNames: [], status: 'active', items: 3, teachers: ['Nguyễn Văn An'] },
      { id: 'EE2033', code: 'EE2033', name: 'Mạch điện', faculty: 'eee', aliases: [], oldNames: [], status: 'active', items: 1, teachers: ['Lê Thị Bình'] },
      { id: 'EE1009', code: 'EE1009', name: 'Nhập môn', faculty: 'eee', aliases: [], oldNames: [], status: 'active', items: 5 },
    ],
  };
  const m = BkSearch.prepare(mini);
  // Kết quả tạo trong vm context khác realm: so qua JSON.
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const byTeacher = BkSearch.search(m, 'nguyen van an');
  assert.deepEqual(plain(byTeacher.map((h) => [h.id, h.teacher])), [['MT1005', 'Nguyễn Văn An']]);
  assert.deepEqual(plain(BkSearch.search(m, 'le thi binh').map((h) => h.id)), ['EE2033']);
  // Tên môn khớp thì không gắn teacher, và đứng trước kết quả theo giảng viên.
  assert.equal(BkSearch.search(m, 'mach dien')[0].teacher, undefined);
  assert.equal(BkSearch.search(m, 'nguyen van an', { faculty: 'eee' }).length, 0);
  assert.deepEqual(plain(BkSearch.list(m, { faculty: 'eee' }).map((h) => h.id)), ['EE1009', 'EE2033']);
  assert.equal(BkSearch.list(m).length, 3);
});
