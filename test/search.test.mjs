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
// programs: nội dung assets/programs.json (mặc định không có); kết quả chương trình nằm ở homeSearch.programs.
const LEVEL_STRINGS = { 'thac-si': ['Thạc sĩ', 'Master'], 'tien-si': ['Tiến sĩ', 'Doctoral'] };
async function homeSearch(q, fac = '', programs = null) {
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
  const byId = { q: el('input'), 'q-results': el('ul'), 'q-status': el('p'), 'q-fac': el('select'), 'search-strings': el('script'), 'q-prog': el('div'), 'q-prog-list': el('ul') };
  byId['search-strings'].textContent = JSON.stringify({ results: ['Không có môn nào khớp', '1 môn khớp', '2 môn khớp'], teacher: 'Giảng viên', lang: 'vi', levels: LEVEL_STRINGS });
  byId['q-fac'].value = fac;
  const document = {
    documentElement: { getAttribute: (k) => ({ 'data-root': './', 'data-lang-prefix': '' })[k] ?? null },
    getElementById: (id) => byId[id] || null,
    createElement: el,
  };
  const ctx = vm.createContext({ document, setTimeout, clearTimeout, fetch: async (url) => ({ ok: true, json: async () => (String(url).endsWith('programs.json') ? programs || [] : index) }) });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', 'search-core.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', 'search.js'), 'utf8'), ctx);
  byId.q.value = q;
  for (const fn of byId.q.listeners.focus) fn();
  await new Promise((r) => setTimeout(r, 20));
  const rows = byId['q-results'].children.map((li) => li.children[0].children.map((s) => s.textContent));
  rows.programs = byId['q-prog-list'].children.map((li) => (li.children[0] ? li.children[0].children.map((s) => s.textContent) : [li.textContent]));
  rows.tags = byId['q-results'].children.map((li) => li.children[0].children.filter((s) => s.className === 'tag').map((s) => s.textContent));
  return rows;
}

test('ô tìm trang chủ: môn có ở sau đại học có nhãn bậc cuối dòng; môn đại học không có', async () => {
  const pg = await homeSearch('GK5007');
  assert.equal(pg[0][0], 'GK5007');
  assert.deepEqual(pg.tags[0], ['Tiến sĩ']);
  const both = await homeSearch('ENG_B2');
  assert.deepEqual(both.tags[0], ['Thạc sĩ, Tiến sĩ']);
  const ug = await homeSearch('MT1005');
  assert.equal(ug[0][0], 'MT1005');
  assert.deepEqual(ug.tags[0], []);
});

test('ô tìm trang chủ: ngành, chương trình sau đại học ghi bậc, tìm được bằng "thạc sĩ", xếp sau đại học', async () => {
  const programs = [
    { kind: 'major', code: '7520103', key: '7520103', name: 'Kỹ thuật Cơ khí', faculty: 'fme', types: ['CQ'], programs: 2 },
    { kind: 'major', code: '8520103', key: '8520103', name: 'Kỹ thuật cơ khí', faculty: 'fme', level: 'thac-si', types: ['UD'], programs: 1 },
    { kind: 'major', code: '9520103', key: '9520103', name: 'Kỹ thuật Cơ khí', faculty: 'fme', level: 'tien-si', types: ['PT1'], programs: 1 },
    { code: 'FME_THAC_SI_KY_THUAT_CO_KHI_2025_UD', name: 'Kỹ thuật cơ khí', year: '2025', variant: 'Thạc sĩ định hướng ứng dụng', type: 'UD', major: '8520103', faculty: 'fme', level: 'thac-si', courses: 9 },
    { code: 'FME_THAC_SI_KY_THUAT_CO_KHI_2022', name: 'Kỹ thuật cơ khí', year: '2022', type: 'CQ', major: '8520103', faculty: 'fme', level: 'thac-si', courses: 0 },
  ];
  const all = (await homeSearch('ky thuat co khi', '', programs)).programs;
  assert.deepEqual(all.map((r) => r[1].split(', ')[0]), ['Khoa Cơ khí', 'Thạc sĩ', 'Tiến sĩ', 'Khoa Cơ khí', 'Thạc sĩ']);
  assert.match(all[1][1], /^Thạc sĩ, Khoa Cơ khí, Ngành, mã 8520103, 1 chương trình$/);
  // Chương trình có nhãn loại (variant) đã ghi bậc thì không lặp; chương trình tiêu chuẩn ghi bậc.
  assert.match(all[3][1], /^Khoa Cơ khí, Thạc sĩ định hướng ứng dụng, 9 môn$/);
  assert.match(all[4][1], /^Thạc sĩ, Khoa Cơ khí, chưa có danh sách môn$/);
  const ths = (await homeSearch('thac si co khi', '', programs)).programs;
  assert.ok(ths.length >= 2 && ths.every((r) => /Thạc sĩ/.test(r[1])));
  const ud = (await homeSearch('UD', '', programs)).programs;
  assert.deepEqual(ud.map((r) => r[0]), ['Kỹ thuật cơ khí', 'Kỹ thuật cơ khí (2025)']);
});

test('tìm môn: môn chỉ có ở sau đại học xếp sau môn đại học cùng mức khớp, trừ khi gõ đúng mã', () => {
  const mini = {
    courses: [
      { id: 'GK5025', code: 'GK5025', name: 'Quản lý dự án', faculty: 'chung', levels: ['thac-si'], aliases: [], oldNames: [], status: 'active', items: 3 },
      { id: 'IM3001', code: 'IM3001', name: 'Quản lý dự án', faculty: 'sim', aliases: [], oldNames: [], status: 'active', items: 0 },
      { id: 'PH1003', code: 'PH1003', name: 'Quản lý dự án', faculty: 'chung', levels: ['dai-hoc', 'thac-si'], aliases: [], oldNames: [], status: 'active', items: 0 },
    ],
  };
  const m = BkSearch.prepare(mini);
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(plain(BkSearch.search(m, 'quan ly du an').map((h) => h.id)), ['IM3001', 'PH1003', 'GK5025']);
  assert.deepEqual(plain(BkSearch.search(m, 'GK5025').map((h) => [h.id, h.score])), [['GK5025', 0]]);
  assert.deepEqual(plain(BkSearch.list(m, { faculty: 'chung' }).map((h) => h.id)), ['GK5025', 'PH1003']);
});

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

// Tìm tài liệu (search-docs.js): nạp sau search-core.js như trên trang chủ.
function loadDocs() {
  const ctx = vm.createContext({});
  for (const f of ['search-core.js', 'search-docs.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', f), 'utf8'), ctx);
  return ctx.BkDocs;
}

const DOCS = [
  { id: 'de-gk-241', course: 'MT1005', code: 'MT1005', courseName: 'Giải tích 2', faculty: 'fas', title: 'Đề giữa kỳ HK241', type: 'exam-past', term: 'HK241', examKind: 'gk', lang: 'vi', added: '2026-09-01', url: 'course/MT1005/#de-gk-241' },
  { id: 'de-ck-241', course: 'MT1005', code: 'MT1005', courseName: 'Giải tích 2', faculty: 'fas', title: 'Đề thi', type: 'exam-past', term: 'HK241', examKind: 'ck', lang: 'vi', added: '2026-10-01', url: 'course/MT1005/#de-ck-241' },
  { id: 'tom-tat-mach', course: 'EE2033', code: 'EE2033', courseName: 'Giải tích mạch', faculty: 'eee', title: 'Tóm tắt mạch điện', description: 'Phasor, quá độ bậc một', type: 'summary', term: 'HK251', teacher: 'Lê Thị Bình', chapter: '3', lang: 'vi', added: '2026-08-01', url: 'course/EE2033/#tom-tat-mach' },
  { id: 'ghi-chu-gt', course: 'MT1005', code: 'MT1005', courseName: 'Giải tích 2', faculty: 'fas', title: 'Ghi chú tích phân bội', type: 'notes', lang: 'vi', added: '2026-07-01', url: 'course/MT1005/#ghi-chu-gt' },
];
const LABELS = {
  types: { 'exam-past': ['Đề cũ', 'Past exams (public)'], summary: ['Tóm tắt', 'Summaries'], notes: ['Ghi chú', 'Notes'] },
  examKinds: { gk: ['Giữa kỳ', 'Midterm'], ck: ['Cuối kỳ', 'Final'] },
};
// Kết quả tạo trong vm context khác realm: so qua JSON.
const plainIds = (list) => JSON.parse(JSON.stringify(list.map((x) => x.id)));

test('tìm tài liệu: theo học kỳ, kỳ thi, mã môn, tên môn, loại, mô tả, giảng viên, không dấu', () => {
  const D = loadDocs();
  const d = D.prepare(DOCS, LABELS);
  const ids = (q, f) => plainIds(D.search(d, q, f));
  // Mục có học kỳ trong tiêu đề đứng trước mục mới hơn chỉ khớp theo trường term.
  assert.deepEqual(ids('HK241'), ['de-gk-241', 'de-ck-241']);
  assert.deepEqual(ids('241'), ['de-gk-241', 'de-ck-241']);
  assert.deepEqual(ids('hk 241'), ['de-ck-241', 'de-gk-241']);
  assert.deepEqual(ids('cuoi ky'), ['de-ck-241']);
  assert.deepEqual(ids('giữa kỳ'), ['de-gk-241']);
  assert.deepEqual(ids('final'), ['de-ck-241']);
  assert.deepEqual(ids('ee2033'), ['tom-tat-mach']);
  assert.deepEqual(ids('phasor'), ['tom-tat-mach']);
  assert.deepEqual(ids('le thi binh'), ['tom-tat-mach']);
  assert.deepEqual(ids('tom tat'), ['tom-tat-mach']);
  assert.deepEqual(ids('de cu giai tich 2'), ['de-ck-241', 'de-gk-241']);
  assert.deepEqual(ids('khong co gi'), []);
  assert.deepEqual(ids('   '), []);
});

test('tìm tài liệu: tiêu đề chứa cả cụm đứng trước, cùng mức thì mới thêm trước', () => {
  const D = loadDocs();
  const d = D.prepare(DOCS, LABELS);
  // "giai tich" khớp tên môn của mọi mục, không mục nào có cụm này trong tiêu đề: mới nhất trước.
  assert.deepEqual(plainIds(D.search(d, 'giai tich')), ['de-ck-241', 'de-gk-241', 'tom-tat-mach', 'ghi-chu-gt']);
  // "tich phan" nằm trong tiêu đề của mục cũ nhất: đứng đầu.
  assert.equal(D.search(d, 'tich phan')[0].id, 'ghi-chu-gt');
  assert.equal(D.search(d, 'de giua ky')[0].id, 'de-gk-241');
});

test('tìm tài liệu: bộ lọc loại, học kỳ, kỳ thi, khoa; liệt kê khi chưa gõ, mới nhất trước', () => {
  const D = loadDocs();
  const d = D.prepare(DOCS, LABELS);
  assert.deepEqual(plainIds(D.search(d, 'giai tich', { type: 'notes' })), ['ghi-chu-gt']);
  assert.deepEqual(plainIds(D.search(d, 'giai tich', { faculty: 'eee' })), ['tom-tat-mach']);
  assert.deepEqual(plainIds(D.list(d, { term: 'HK241' })), ['de-ck-241', 'de-gk-241']);
  assert.deepEqual(plainIds(D.list(d, { term: 'HK241', examKind: 'gk' })), ['de-gk-241']);
  assert.deepEqual(plainIds(D.list(d, { type: 'exam-past', faculty: 'eee' })), []);
  assert.deepEqual(plainIds(D.list(d, {})), ['de-ck-241', 'de-gk-241', 'tom-tat-mach', 'ghi-chu-gt']);
});

// Trang chủ với DOM giả có ô lọc tài liệu, địa chỉ trang và lịch sử giả; fetch trả file theo đường dẫn.
async function homeDocs({ q = '', search = '', type = '', term = '' } = {}) {
  const el = (tag) => {
    const e = { tagName: tag, children: [], className: '', href: '', value: '', hidden: false, disabled: true, listeners: {}, options: [] };
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
  const ids = ['q', 'q-results', 'q-status', 'q-fac', 'q-type', 'q-term', 'q-kind', 'q-docs', 'q-docs-list', 'q-docs-status', 'search-strings'];
  const byId = Object.fromEntries(ids.map((id) => [id, el(id)]));
  for (const [id, values] of Object.entries({ 'q-type': ['exam-past', 'summary', 'notes'], 'q-term': ['HK251', 'HK241'], 'q-kind': ['gk', 'ck'] })) {
    byId[id].options = ['', ...values].map((value) => ({ value }));
  }
  byId['q-docs'].hidden = true;
  byId['q-type'].value = type;
  byId['q-term'].value = term;
  byId['search-strings'].textContent = JSON.stringify({
    results: ['Không có môn nào khớp', '1 môn khớp', '2 môn khớp'],
    teacher: 'Giảng viên',
    lang: 'vi',
    docs: { max: 2, count: ['Không có tài liệu nào khớp.', '1 tài liệu khớp', '{n} tài liệu khớp'], more: 'Còn {n} tài liệu nữa.', chapter: 'Chương', ...LABELS },
  });
  const document = {
    documentElement: { getAttribute: (k) => ({ 'data-root': './', 'data-lang-prefix': '' })[k] ?? null },
    getElementById: (id) => byId[id] || null,
    createElement: el,
  };
  const loc = { search, pathname: '/', hash: '' };
  const history = {
    replaceState: (_s, _t, url) => {
      loc.last = url;
    },
  };
  const files = { './v1/index.json': index, './assets/programs.json': [], './assets/items.json': DOCS };
  const fetched = [];
  const fetch = async (url) => {
    fetched.push(url);
    return { ok: url in files, json: async () => files[url] };
  };
  const ctx = vm.createContext({ document, setTimeout, clearTimeout, fetch, location: loc, history, URLSearchParams });
  ctx.window = ctx;
  for (const f of ['search-core.js', 'search-docs.js', 'search.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', f), 'utf8'), ctx);
  const settle = () => new Promise((r) => setTimeout(r, 20));
  if (q) byId.q.value = q;
  if (!search) for (const fn of byId.q.listeners.focus) fn();
  await settle();
  const rows = () => byId['q-docs-list'].children.map((li) => (li.children[0] ? li.children[0].children.map((s) => s.textContent) : li.textContent));
  return { byId, loc, fetched, rows, settle };
}

test('trang chủ: khối Tài liệu hiện kết quả có mã môn, tiêu đề, meta, link tới mục trên trang môn', async () => {
  const h = await homeDocs({ q: 'giai tich' });
  assert.ok(h.fetched.includes('./assets/items.json'));
  assert.equal(h.byId['q-docs'].hidden, false);
  assert.equal(h.byId['q-docs-status'].textContent, '4 tài liệu khớp');
  const rows = h.rows();
  // Hiện tối đa max (2), rồi dòng "còn nữa".
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ['MT1005', 'Đề thi', 'Giải tích 2, Đề cũ, HK241, Cuối kỳ']);
  assert.equal(rows[2], 'Còn 2 tài liệu nữa.');
  assert.equal(h.byId['q-docs-list'].children[0].children[0].href, './course/MT1005/#de-ck-241');
  assert.match(h.loc.last, /\?q=giai\+tich$/);
  // Câu tìm không khớp tài liệu nào: khối ẩn, không thêm dòng trống.
  const none = await homeDocs({ q: 'khong co tai lieu nay' });
  assert.equal(none.byId['q-docs'].hidden, true);
});

test('trang chủ: chọn bộ lọc khi chưa gõ thì liệt kê tài liệu, ghi bộ lọc lên địa chỉ trang', async () => {
  const h = await homeDocs({ term: 'HK241' });
  h.byId['q-term'].listeners.change[0]();
  await h.settle();
  assert.equal(h.byId['q-docs'].hidden, false);
  assert.deepEqual(h.rows().map((r) => r[1]), ['Đề thi', 'Đề giữa kỳ HK241']);
  assert.match(h.loc.last, /\?hk=HK241$/);
  // Bộ lọc không có mục nào: vẫn hiện khối, ghi rõ không có tài liệu khớp.
  h.byId['q-type'].value = 'summary';
  h.byId['q-type'].listeners.change[0]();
  assert.equal(h.byId['q-docs-status'].textContent, 'Không có tài liệu nào khớp.');
  assert.equal(h.byId['q-docs'].hidden, false);
  assert.match(h.loc.last, /loai=summary/);
  assert.match(h.loc.last, /hk=HK241/);
});

test('trang chủ: đọc ?loai=, ?hk=, ?ky= từ địa chỉ trang; giá trị lạ bị bỏ qua', async () => {
  const h = await homeDocs({ search: '?hk=HK241&ky=gk&loai=khong-co' });
  assert.equal(h.byId['q-term'].value, 'HK241');
  assert.equal(h.byId['q-kind'].value, 'gk');
  assert.equal(h.byId['q-type'].value, '');
  assert.deepEqual(h.rows().map((r) => r[1]), ['Đề giữa kỳ HK241']);
  const q = await homeDocs({ search: '?q=phasor' });
  assert.equal(q.byId.q.value, 'phasor');
  assert.deepEqual(q.rows()[0], ['EE2033', 'Tóm tắt mạch điện', 'Giải tích mạch, Tóm tắt, HK251, Chương 3, Giảng viên: Lê Thị Bình', 'Phasor, quá độ bậc một']);
});
