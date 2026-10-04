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

// Chạy search.js của trang chủ trên một DOM giả tối thiểu, với v1/index.json thật.
async function homeSearch(q, fac = '') {
  const el = (tag) => {
    const e = { tagName: tag, children: [], className: '', href: '', value: '', disabled: true, listeners: {} };
    let text = '';
    Object.defineProperty(e, 'textContent', {
      get: () => text,
      set: (v) => {
        text = String(v);
        e.children = [];
      },
    });
    e.appendChild = (c) => e.children.push(c);
    e.addEventListener = (ev, fn) => (e.listeners[ev] ||= []).push(fn);
    return e;
  };
  const byId = { q: el('input'), 'q-results': el('ul'), 'q-status': el('p'), 'q-fac': el('select'), 'search-strings': el('script') };
  byId['search-strings'].textContent = JSON.stringify({ results: ['Không có môn nào khớp', '1 môn khớp', '2 môn khớp'], teacher: 'Giảng viên', lang: 'vi' });
  byId['q-fac'].value = fac;
  const document = {
    documentElement: { getAttribute: (k) => ({ 'data-root': './', 'data-lang-prefix': '' })[k] ?? null },
    getElementById: (id) => byId[id] || null,
    createElement: el,
  };
  const ctx = vm.createContext({ document, setTimeout, clearTimeout, fetch: async () => ({ ok: true, json: async () => index }) });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', 'search-core.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', 'search.js'), 'utf8'), ctx);
  byId.q.value = q;
  for (const fn of byId.q.listeners.focus) fn();
  await new Promise((r) => setTimeout(r, 20));
  return byId['q-results'].children.map((li) => li.children[0].children.map((s) => s.textContent));
}

test('ô tìm trang chủ: dòng kết quả có mã, tên, khoa; mã dùng lại ghi ID kèm năm', async () => {
  const rows = await homeSearch('GE3239');
  assert.deepEqual(rows.map((r) => r[0]), ['GE3239', 'GE3239']);
  assert.match(rows[0][2], /^Khoa Kỹ thuật Địa chất và Dầu khí$/);
  assert.match(rows[1][2], /^Khoa Kỹ thuật Địa chất và Dầu khí, ID GE3239-2024$/);
  // Tên trùng: mỗi dòng có mã riêng và khoa, đủ để phân biệt khi không lọc khoa.
  const dup = await homeSearch('do an tot nghiep');
  const names = dup.filter((r) => r[1] === 'Đồ án tốt nghiệp');
  assert.ok(names.length >= 2);
  assert.equal(new Set(names.map((r) => r[0])).size, names.length);
  assert.ok(names.every((r) => r[2].length > 0));
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
