// Môn theo tên (Đồ án tốt nghiệp, Giải tích 1...): mã cùng tên gộp thành một môn có trang mon/<slug>/.
// Quy tắc ở site-src/assets/subject-core.js, dùng chung cho build (scripts/lib/subject.mjs) và trình duyệt.
// Cuối file: khóa khoa cũ (movedTo) không vào danh sách nào.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { buildSite, searchCourses } from '../scripts/build-site.mjs';
import { nameKey, baseName, slugOf, groups, title, pickCode, subjectIndex } from '../scripts/lib/subject.mjs';
import { loadRepo, buildIndex, TOOL_ROOT } from '../scripts/lib/repo.mjs';
import { buildV1 } from '../scripts/lib/v1.mjs';
import { copyFixture, editJson, writeJson } from './helpers.mjs';

// Bản trình duyệt: nạp đúng file như trang web (script thường, gắn BkSubject vào globalThis).
function browserSubject() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(TOOL_ROOT, 'site-src', 'assets', 'subject-core.js'), 'utf8'), ctx);
  return ctx.BkSubject;
}

test('nameKey: bỏ phần ngoặc cuối, hoa thường, khoảng trắng; giữ dấu', () => {
  assert.equal(nameKey('Đồ án  Tốt nghiệp '), 'đồ án tốt nghiệp');
  assert.equal(nameKey('Đồ án Tốt nghiệp (Khoa học Máy tính)'), nameKey('đồ án tốt nghiệp'));
  assert.notEqual(nameKey('Đồ án tốt nghiệp'), nameKey('Đề án tốt nghiệp'));
  // Chỉ bỏ ngoặc ở cuối tên.
  assert.equal(nameKey('Vật lý (đại cương) 1'), 'vật lý (đại cương) 1');
  assert.equal(baseName('Giải tích 1 (mở rộng)'), 'Giải tích 1');
  // Chữ dựng sẵn và chữ tổ hợp (NFD) cho cùng khóa.
  assert.equal(nameKey('Giải tích'.normalize('NFD')), nameKey('Giải tích'));
});

test('slugOf: ASCII, bỏ dấu, đ thành d, gạch nối; tên quá dài cắt ở ranh giới từ', () => {
  assert.equal(slugOf('đồ án tốt nghiệp'), 'do-an-tot-nghiep');
  assert.equal(slugOf('giải tích 1'), 'giai-tich-1');
  assert.equal(slugOf('c++ & java'), 'c-java');
  assert.equal(slugOf('!!!'), 'mon');
  const long = slugOf('luận văn thạc sĩ nghiên cứu chuyên sâu phần một của chương trình đào tạo thạc sĩ khoa học máy tính');
  assert.ok(long.length <= 80 && !long.endsWith('-'), long);
});

test('groups: từ 2 mã cùng tên; slug trùng (chỉ khác dấu) thêm -2, -3, bỏ qua slug gốc của nhóm khác; luôn cùng kết quả', () => {
  const courses = [
    { id: 'A1', name: 'Vẽ kỹ thuật' },
    { id: 'A2', name: 'Vẽ kỹ thuật (Cơ khí)' },
    { id: 'B1', name: 'Về kỹ thuật' },
    { id: 'B2', name: 'về  kỹ thuật' },
    { id: 'C1', name: 'Ve ky thuat 2' },
    { id: 'C2', name: 'Ve ky thuat 2' },
    { id: 'D1', name: 'Môn một mã' },
  ];
  const g = groups(courses);
  assert.deepEqual(
    g.map((x) => [x.slug, x.ids]),
    [
      // 'vẽ' (U+1EBD) xếp trước 'về' (U+1EC1) nên giữ slug gốc; ve-ky-thuat-2 là slug gốc của nhóm C.
      ['ve-ky-thuat', ['A1', 'A2']],
      ['ve-ky-thuat-2', ['C1', 'C2']],
      ['ve-ky-thuat-3', ['B1', 'B2']],
    ],
  );
  // Thứ tự đầu vào không đổi kết quả.
  assert.deepEqual(groups(courses.slice().reverse()), g);
  // Ngưỡng 3: không nhóm nào đủ.
  assert.deepEqual(groups(courses, 3), []);
});

test('title: cách viết gặp nhiều nhất, bằng nhau thì ít chữ hoa hơn; pickCode: nhiều chương trình nhất', () => {
  assert.equal(title(['Đồ án Tốt nghiệp', 'Đồ án tốt nghiệp', 'Đồ án tốt nghiệp (KHMT)']), 'Đồ án tốt nghiệp');
  assert.equal(title(['Đồ án Tốt nghiệp', 'Đồ án tốt nghiệp']), 'Đồ án tốt nghiệp');
  const list = [
    { id: 'X3', code: 'X3', progs: 2, items: 0 },
    { id: 'X1', code: 'X1', progs: 5, items: 0, status: 'retired' },
    { id: 'X2', code: 'X2', progs: 5, items: 1 },
  ];
  assert.equal(pickCode(list).id, 'X2');
  assert.equal(pickCode([{ id: 'Y2', code: 'Y2' }, { id: 'Y1', code: 'Y1' }]).id, 'Y1');
});

test('build và trình duyệt dùng cùng một quy tắc: slug, nhóm, tên giống nhau trên dữ liệu thật', () => {
  const repo = loadRepo(TOOL_ROOT);
  const index = buildIndex(repo);
  const all = new Map();
  for (const f of index.faculties) for (const c of f.courses) all.set(c.id, c);
  const { subjects } = subjectIndex(all);
  const B = browserSubject();
  const v1 = buildV1(repo).index;
  const web = JSON.parse(JSON.stringify(B.groups(v1.courses, 2)));
  assert.deepEqual(
    web.map((g) => [g.slug, g.ids]),
    [...subjects.values()].map((s) => [s.slug, s.ids]),
  );
  // Môn hay tìm: Giải tích 1 và Đồ án tốt nghiệp là môn nhiều mã.
  const gt1 = subjects.get('giai-tich-1');
  assert.ok(gt1 && gt1.ids.includes('MT1003') && gt1.ids.length >= 2);
  assert.equal(gt1.name, 'Giải tích 1');
  assert.ok(subjects.get('do-an-tot-nghiep').ids.length > 10);
});

test('searchCourses: bản gọn của v1 cho ô tìm, bỏ trường không dùng, thêm progs; không có ngữ cảnh', () => {
  const v1 = {
    faculties: [{ key: 'che', name: { vi: 'K', en: 'F' } }],
    courses: [
      { id: 'CH4357', code: 'CH4357', name: 'Đồ án', nameEn: 'Thesis', credits: 4, faculty: 'che', aliases: [], oldNames: [], status: 'active', items: 0, url: 'u', detail: 'd' },
      { id: 'CH1', code: 'CH1', name: 'Hóa', faculty: 'che', aliases: ['CH0'], oldNames: ['Hóa cũ'], status: 'retired', replacedBy: 'CH2', items: 2, teachers: ['A'], url: 'u', detail: 'd' },
    ],
  };
  const out = searchCourses(v1, new Map([['CH4357', 3]]));
  assert.deepEqual(out.courses[0], { id: 'CH4357', code: 'CH4357', name: 'Đồ án', nameEn: 'Thesis', faculty: 'che', progs: 3 });
  assert.deepEqual(out.courses[1], { id: 'CH1', code: 'CH1', name: 'Hóa', faculty: 'che', aliases: ['CH0'], oldNames: ['Hóa cũ'], status: 'retired', items: 2, teachers: ['A'] });
  assert.deepEqual(out.faculties, v1.faculties);
});

test('dữ liệu thật: assets/courses.json nhỏ hơn v1/index.json khi nén', () => {
  const repo = loadRepo(TOOL_ROOT);
  const v1 = buildV1(repo).index;
  const progs = new Map([...repo.courses.values()].map((c) => [c.id, new Set((c.programs || []).map((p) => p.program)).size]));
  const gz = (s) => zlib.gzipSync(s, { level: 9 }).length;
  const slim = gz(JSON.stringify(searchCourses(v1, progs)) + '\n');
  const full = gz(JSON.stringify(v1, null, 2) + '\n');
  assert.ok(slim < full * 0.85, `courses.json ${slim} B, v1/index.json ${full} B (gzip)`);
});

// Site dựng từ fixture có thêm: hai ngành, ba mã "Đồ án tốt nghiệp" (một mã có tài liệu), một khóa khoa cũ.
const out = (() => {
  const dir = copyFixture();
  editJson(dir, 'catalog/faculties.json', (f) => {
    f.faculties.push({ key: 'cu', name: { vi: 'Đơn vị cũ', en: 'Old unit' }, movedTo: 'EE' });
  });
  writeJson(dir, 'catalog/majors.json', {
    updated: '2026-10-01',
    majors: [
      { code: '7520201', name: 'Kỹ thuật Điện', faculty: 'EE', programTypes: ['CQ'] },
      { code: '7520207', name: 'Kỹ thuật Điện tử - Viễn thông', faculty: 'EE', programTypes: ['CQ'] },
    ],
  });
  const course = (id, name, programs) => ({ id, code: id, name, credits: 9, faculty: 'EE', aliases: [], status: 'active', programs, parts: [], related: [], updated: '2026-10-01' });
  writeJson(dir, 'catalog/courses/EE4347.json', course('EE4347', 'Đồ án tốt nghiệp', [{ program: 'EE_DIEN_2024', block: 'B1', required: true }]));
  writeJson(dir, 'catalog/courses/EE4367.json', course('EE4367', 'Đồ án Tốt nghiệp (Điện tử)', [{ program: 'EE_DTVT_2024', block: 'B1', required: true }]));
  writeJson(dir, 'catalog/courses/EE4399.json', course('EE4399', 'Đồ án tốt nghiệp', []));
  const prog = (code, major, id) => ({ code, name: 'x', faculty: 'EE', year: '2024', major, type: 'CQ', blocks: [{ id: 'B1', name: 'Tốt nghiệp', required: true, courses: [id] }], updated: '2026-10-01' });
  writeJson(dir, 'catalog/programs/EE_DIEN_2024.json', prog('EE_DIEN_2024', '7520201', 'EE4347'));
  writeJson(dir, 'catalog/programs/EE_DTVT_2024.json', prog('EE_DTVT_2024', '7520207', 'EE4367'));
  // Hai mã cùng id tài liệu: trên trang chung, neo của mục thứ hai thêm mã phía trước.
  const item = (course, id, added) => ({ id, course, type: 'link', title: `Link ${course}`, lang: 'vi', license: 'CC-BY-4.0', origin: 'link', url: `https://example.org/${course}`, added, removed: false });
  writeJson(dir, `courses/EE4347/items/huong-dan.json`, item('EE4347', 'huong-dan', '2026-09-01'));
  writeJson(dir, `courses/EE4367/items/huong-dan.json`, item('EE4367', 'huong-dan', '2026-10-02'));
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-same-name-'));
  buildSite({ root: dir, out: o });
  return o;
})();
const read = (p) => fs.readFileSync(path.join(out, p), 'utf8');
const mainOf = (html) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));

test('trang môn theo tên: h1 là tên gặp nhiều nhất, một dòng mã, mọi tài liệu mới trước; không có ngữ cảnh', () => {
  const html = mainOf(read('mon/do-an-tot-nghiep/index.html'));
  assert.match(html, /<h1>Đồ án tốt nghiệp<\/h1>\n<p class="codes"><span class="sr">Mã môn: <\/span><span class="code-chip"><span class="code">EE4347<\/span>[^<]*<\/span> <span class="code-chip"><span class="code">EE4367<\/span>[^<]*<\/span> <span class="code-chip"><span class="code">EE4399<\/span>[^<]*<\/span><\/p>/);
  assert.doesNotMatch(html, /subtitle|twins|Kỹ thuật Điện|theo ngành hoặc khóa|class="facts"/);
  // Id trùng giữa hai mã: neo riêng, mới trước.
  const a = html.indexOf('id="ee4367-huong-dan"');
  const b = html.indexOf('id="ee4347-huong-dan"');
  assert.ok(a > 0 && b > a, `${a} ${b}`);
  // Mã mặc định cho form gửi: một trong hai mã có chương trình (bằng nhau thì mã nhỏ trước).
  assert.match(html, /gui-tai-lieu\/\?course=EE4347">Gửi tài liệu cho môn này/);
  assert.match(read('mon/do-an-tot-nghiep/index.html'), /<title>Đồ án tốt nghiệp \| BK Study Library<\/title>/);
  // Link tài liệu mới ở trang chủ trỏ tới đúng neo trên trang chung.
  assert.match(read('index.html'), /href="\.\/mon\/do-an-tot-nghiep\/#ee4367-huong-dan"/);
  const docs = JSON.parse(read('assets/items.json'));
  assert.equal(docs.find((d) => d.course === 'EE4347').url, 'mon/do-an-tot-nghiep/#ee4347-huong-dan');
});

test('trang môn theo tên chưa có tài liệu: một câu và một nút chính', () => {
  const dir = copyFixture();
  const course = (id) => ({ id, code: id, name: 'Môn trống', credits: 3, faculty: 'EE', aliases: [], status: 'active', programs: [], parts: [], related: [], updated: '2026-10-01' });
  writeJson(dir, 'catalog/courses/EE2001.json', course('EE2001'));
  writeJson(dir, 'catalog/courses/EE2003.json', course('EE2003'));
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-subject-empty-'));
  buildSite({ root: dir, out: o });
  const html = mainOf(fs.readFileSync(path.join(o, 'mon', 'mon-trong', 'index.html'), 'utf8'));
  assert.match(html, /<div class="note" role="note"><p>Chưa có tài liệu cho môn này\.<\/p><\/div>\n<p class="actions"><a class="btn primary" href="\.\.\/\.\.\/gui-tai-lieu\/\?course=EE2001">Gửi tài liệu cho môn này<\/a><\/p>/);
  assert.equal((html.match(/class="btn/g) || []).length, 1);
});

test('mã trong môn nhiều mã: trang chuyển hướng, mọi link nội bộ trỏ thẳng trang môn theo tên', () => {
  for (const id of ['EE4347', 'EE4367', 'EE4399']) assert.match(read(`course/${id}/index.html`), /url=\.\.\/\.\.\/mon\/do-an-tot-nghiep\//, id);
  const fac = read('faculty/EE/index.html');
  assert.match(fac, /<a href="\.\.\/\.\.\/mon\/do-an-tot-nghiep\/">EE4347<\/a>/);
  assert.doesNotMatch(fac, /course\/EE4347\/|class="sub"/);
  assert.match(read('program/EE_DIEN_2024/index.html'), /href="\.\.\/\.\.\/mon\/do-an-tot-nghiep\/"/);
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /mon\/do-an-tot-nghiep\/<\/loc>/);
  assert.doesNotMatch(sitemap, /course\/EE4347\//);
  // Không còn chữ của bản trước.
  for (const p of ['mon/do-an-tot-nghiep/index.html', 'faculty/EE/index.html', 'index.html']) {
    assert.doesNotMatch(read(p), /Tên này còn dùng cho|chung cho \d+ ngành|mã, theo ngành hoặc khóa/, p);
  }
});

test('assets/courses.json: không có ngữ cảnh, url, detail; có progs; trang chủ nạp subject-core.js trước search.js', () => {
  const data = JSON.parse(read('assets/courses.json'));
  const byId = Object.fromEntries(data.courses.map((c) => [c.id, c]));
  assert.equal(byId.EE4347.progs, 1);
  assert.equal(byId.EE4399.progs, undefined);
  assert.ok(data.courses.every((c) => !('url' in c) && !('detail' in c) && !('ctx' in c)));
  const home = read('index.html');
  assert.ok(home.indexOf('assets/subject-core.js') > 0 && home.indexOf('assets/subject-core.js') < home.indexOf('assets/search.js'));
  assert.match(home, /"groupMin":2,"chipsMax":4/);
  // v1 không đổi: không có progs, không có môn theo tên.
  assert.ok(JSON.parse(read('v1/index.json')).courses.every((c) => !('progs' in c) && !('subject' in c)));
});

test('khóa khoa cũ (movedTo): không có trong danh sách khoa, ô lọc, sitemap; trang khoa chuyển hướng ngắn tới khoa mới', () => {
  for (const p of ['index.html', 'en/index.html']) {
    const html = read(p);
    assert.doesNotMatch(html, /faculty\/cu\/|Đơn vị cũ|Old unit/, p);
  }
  assert.doesNotMatch(read('sitemap.xml'), /faculty\/cu\//);
  const r = read('faculty/cu/index.html');
  assert.match(r, /<meta http-equiv="refresh" content="0; url=\.\.\/EE\/">/);
  assert.match(r, /<link rel="canonical" href="[^"]+faculty\/EE\/">/);
  assert.match(r, /Đang chuyển tới <a href="\.\.\/EE\/">Khoa Điện - Điện tử<\/a>\./);
  assert.doesNotMatch(r, /<main|chưa có môn/);
  assert.match(read('en/faculty/cu/index.html'), /Redirecting to <a href="\.\.\/EE\/">Faculty of Electrical and Electronics Engineering<\/a>/);
});

test('kiểm danh mục: khóa khoa cũ không được dùng cho môn, chương trình, ngành, tiền tố', () => {
  const dir = copyFixture();
  editJson(dir, 'catalog/faculties.json', (f) => {
    f.faculties.push({ key: 'cu', name: { vi: 'Đơn vị cũ', en: 'Old unit' }, movedTo: 'EE' });
    f.faculties.push({ key: 'cu2', name: { vi: 'Đơn vị cũ 2', en: 'Old unit 2' }, movedTo: 'cu' });
  });
  editJson(dir, 'catalog/courses/EE1010.json', (c) => {
    c.faculty = 'cu';
  });
  const repo = loadRepo(dir);
  const codes = repo.errors.map((e) => `${e.code} ${e.msg}`);
  assert.ok(codes.some((x) => /^FACULTY_MOVED .*môn ghi khoa "cu"/.test(x)), codes.join('\n'));
  assert.ok(codes.some((x) => /^FACULTY_MISSING .*cu2: movedTo "cu"/.test(x)), codes.join('\n'));
});
