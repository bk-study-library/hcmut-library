// Môn trùng tên (Đồ án tốt nghiệp, Thực tập ngoài trường...): ngữ cảnh ngành lúc build, cách hiện trên web,
// và khóa khoa cũ (movedTo) không vào danh sách nào.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildSite, searchCourses } from '../scripts/build-site.mjs';
import { nameKey, sameNameGroups, yearRanges, courseContexts } from '../scripts/lib/course-context.mjs';
import { S } from '../scripts/lib/strings.mjs';
import { loadRepo, TOOL_ROOT } from '../scripts/lib/repo.mjs';
import { buildV1 } from '../scripts/lib/v1.mjs';
import { copyFixture, editJson, writeJson } from './helpers.mjs';

test('nameKey: bỏ khác biệt hoa thường và khoảng trắng, giữ dấu', () => {
  assert.equal(nameKey('Đồ án  Tốt nghiệp '), nameKey('đồ án tốt nghiệp'));
  assert.notEqual(nameKey('Đồ án tốt nghiệp'), nameKey('Đề án tốt nghiệp'));
});

test('yearRanges: năm liền thành đoạn', () => {
  const r = S.vi.yearRange;
  assert.equal(yearRanges(['2019', '2020', '2021', '2024'], r), '2019 đến 2021, 2024');
  assert.equal(yearRanges(['2026'], r), '2026');
  assert.equal(yearRanges(['2023', '2021', '2021'], S.en.yearRange), '2021, 2023');
});

// Dữ liệu nhỏ: hai ngành, bốn môn cùng tên, một môn không thuộc chương trình nào.
function mini() {
  const majors = new Map([
    ['M1', { code: 'M1', name: 'Kỹ thuật Hóa học', nameEn: 'Chemical Engineering', faculty: 'che' }],
    ['M2', { code: 'M2', name: 'Công nghệ Thực phẩm', faculty: 'che' }],
    ['M3', { code: 'M3', name: 'Kỹ thuật Hóa học', faculty: 'che', level: 'thac-si' }],
  ]);
  const programs = new Map(
    [
      { code: 'P1_2019', major: 'M1', year: '2019' },
      { code: 'P1_2020', major: 'M1', year: '2020' },
      { code: 'P1_2025', major: 'M1', year: '2025' },
      { code: 'P2_2024', major: 'M2', year: '2024' },
      { code: 'P3_2025', major: 'M3', year: '2025', level: 'thac-si' },
      { code: 'NHAP', major: 'M2', year: '2024', listed: false },
    ].map((p) => [p.code, p]),
  );
  const c = (id, name, progs, faculty = 'che') => [id, { id, name, faculty, programs: progs.map((program) => ({ program, block: 'B' })) }];
  const courses = new Map([
    c('CH4357', 'Đồ án Tốt nghiệp', ['P1_2019', 'P1_2020']),
    c('CH4359', 'Đồ án tốt nghiệp', ['P1_2025']),
    c('CH4367', 'Đồ án tốt nghiệp', ['P2_2024', 'NHAP']),
    c('CH4399', 'Đồ án tốt nghiệp', []),
    c('CH6011', 'Đồ án tốt nghiệp', ['P3_2025']),
    c('CH1001', 'Hóa đại cương', ['P1_2019']),
  ]);
  const faculties = new Map([['che', { key: 'che', name: { vi: 'Khoa Kỹ thuật Hóa học', en: 'Faculty of Chemical Engineering' } }]]);
  return { courses, programs, majors, faculties, listed: (p) => p.listed !== false };
}

test('courseContexts: ngành của môn; trùng ngành thì thêm khóa; không thuộc ngành nào thì ghi khoa; có cả sau đại học thì ghi bậc', () => {
  const m = mini();
  assert.deepEqual([...sameNameGroups(m.courses.values()).values()], [['CH4357', 'CH4359', 'CH4367', 'CH4399', 'CH6011']]);
  const vi = courseContexts({ ...m, t: S.vi });
  assert.equal(vi.get('CH4357'), 'Kỹ thuật Hóa học, khóa 2019 đến 2020');
  assert.equal(vi.get('CH4359'), 'Kỹ thuật Hóa học, khóa 2025');
  // Bản nháp (listed: false) không tính.
  assert.equal(vi.get('CH4367'), 'Công nghệ Thực phẩm');
  assert.equal(vi.get('CH4399'), 'Khoa Kỹ thuật Hóa học');
  assert.equal(vi.get('CH6011'), 'Thạc sĩ Kỹ thuật Hóa học');
  // Môn không trùng tên không có ngữ cảnh.
  assert.equal(vi.has('CH1001'), false);
  const en = courseContexts({ ...m, t: S.en });
  assert.equal(en.get('CH4357'), 'Chemical Engineering, cohorts 2019 to 2020');
  assert.equal(en.get('CH4359'), 'Chemical Engineering, cohort 2025');
  assert.equal(en.get('CH6011'), 'Kỹ thuật Hóa học (Master)');
});

test('courseContexts: nhiều ngành thì ghi ngành có nhiều chương trình nhất và số ngành còn lại', () => {
  const majors = new Map(['A', 'B', 'C'].map((k) => [k, { code: k, name: `Ngành ${k}`, faculty: 'x' }]));
  const programs = new Map([
    ['A1', { code: 'A1', major: 'A' }],
    ['B1', { code: 'B1', major: 'B' }],
    ['B2', { code: 'B2', major: 'B' }],
    ['C1', { code: 'C1', major: 'C' }],
  ]);
  const courses = new Map([
    ['X1', { id: 'X1', name: 'Giải tích 1', faculty: 'x', programs: ['A1', 'B1', 'B2', 'C1'].map((program) => ({ program })) }],
    ['X2', { id: 'X2', name: 'Giải tích 1', faculty: 'x', programs: [{ program: 'A1' }, { program: 'C1' }] }],
  ]);
  const ctx = courseContexts({ courses, programs, majors, faculties: new Map(), t: S.vi });
  assert.equal(ctx.get('X1'), 'Ngành B và 2 ngành khác');
  assert.equal(ctx.get('X2'), 'Ngành A, Ngành C');
});

test('searchCourses: bản gọn của v1 cho ô tìm, bỏ trường không dùng, thêm ngữ cảnh theo hai thứ tiếng', () => {
  const v1 = {
    faculties: [{ key: 'che', name: { vi: 'K', en: 'F' } }],
    courses: [
      { id: 'CH4357', code: 'CH4357', name: 'Đồ án', nameEn: 'Thesis', credits: 4, faculty: 'che', aliases: [], oldNames: [], status: 'active', items: 0, url: 'u', detail: 'd' },
      { id: 'CH1', code: 'CH1', name: 'Hóa', faculty: 'che', aliases: ['CH0'], oldNames: ['Hóa cũ'], status: 'retired', replacedBy: 'CH2', items: 2, teachers: ['A'], url: 'u', detail: 'd' },
    ],
  };
  const out = searchCourses(v1, { vi: new Map([['CH4357', 'Kỹ thuật Hóa học']]), en: new Map([['CH4357', 'Chemical Engineering']]) });
  assert.deepEqual(out.courses[0], { id: 'CH4357', code: 'CH4357', name: 'Đồ án', nameEn: 'Thesis', faculty: 'che', ctx: 'Kỹ thuật Hóa học', ctxEn: 'Chemical Engineering' });
  assert.deepEqual(out.courses[1], { id: 'CH1', code: 'CH1', name: 'Hóa', faculty: 'che', aliases: ['CH0'], oldNames: ['Hóa cũ'], status: 'retired', items: 2, teachers: ['A'] });
  assert.deepEqual(out.faculties, v1.faculties);
});

test('dữ liệu thật: assets/courses.json nhỏ hơn v1/index.json khi nén, mọi môn trùng tên có ngữ cảnh', () => {
  const repo = loadRepo(TOOL_ROOT);
  const v1 = buildV1(repo).index;
  const courses = new Map(v1.courses.map((c) => [c.id, { ...repo.courses.get(c.id) }]));
  const groups = sameNameGroups(courses.values());
  const majors = repo.majors || new Map();
  const faculties = new Map(repo.faculties.faculties.map((f) => [f.key, f]));
  const contexts = Object.fromEntries(['vi', 'en'].map((l) => [l, courseContexts({ courses, programs: repo.programs, majors, faculties, t: S[l], listed: (p) => p.listed !== false, groups })]));
  const ids = [...groups.values()].flat();
  assert.ok(ids.length > 0);
  for (const id of ids) assert.ok(contexts.vi.get(id), id);
  const gz = (s) => zlib.gzipSync(s, { level: 9 }).length;
  const slim = gz(JSON.stringify(searchCourses(v1, contexts)) + '\n');
  const full = gz(JSON.stringify(v1, null, 2) + '\n');
  // Ghi ra để so khi đổi: cỡ nén của bản gọn (kể cả ngữ cảnh) phải dưới 85% bản v1 mà ô tìm từng tải.
  assert.ok(slim < full * 0.85, `courses.json ${slim} B, v1/index.json ${full} B (gzip)`);
});

// Site dựng từ fixture có thêm: hai ngành, ba môn "Đồ án tốt nghiệp", một khóa khoa cũ.
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
  writeJson(dir, 'catalog/courses/EE4367.json', course('EE4367', 'Đồ án Tốt nghiệp', [{ program: 'EE_DTVT_2024', block: 'B1', required: true }]));
  writeJson(dir, 'catalog/courses/EE4399.json', course('EE4399', 'Đồ án tốt nghiệp', []));
  const prog = (code, major, id) => ({ code, name: 'x', faculty: 'EE', year: '2024', major, type: 'CQ', blocks: [{ id: 'B1', name: 'Tốt nghiệp', required: true, courses: [id] }], updated: '2026-10-01' });
  writeJson(dir, 'catalog/programs/EE_DIEN_2024.json', prog('EE_DIEN_2024', '7520201', 'EE4347'));
  writeJson(dir, 'catalog/programs/EE_DTVT_2024.json', prog('EE_DTVT_2024', '7520207', 'EE4367'));
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-same-name-'));
  buildSite({ root: dir, out: o });
  return o;
})();
const read = (p) => fs.readFileSync(path.join(out, p), 'utf8');

test('trang môn trùng tên: ngữ cảnh dưới tên, trong title; ghi chú số môn cùng tên kèm link tìm', () => {
  const html = read('course/EE4347/index.html');
  assert.match(html, /<h1><span class="code">EE4347<\/span> Đồ án tốt nghiệp<\/h1>\n<p class="subtitle">Kỹ thuật Điện<\/p>/);
  assert.match(html, /<title>EE4347 Đồ án tốt nghiệp \(Kỹ thuật Điện\) \| BK Study Library<\/title>/);
  assert.match(html, /<p class="muted small twins">Tên này còn dùng cho 2 môn khác\. <a href="\.\.\/\.\.\/\?q=%C4%90%E1%BB%93%20%C3%A1n%20t%E1%BB%91t%20nghi%E1%BB%87p">Xem các môn cùng tên<\/a><\/p>/);
  // Không thuộc ngành nào: ghi khoa.
  assert.match(read('course/EE4399/index.html'), /<p class="subtitle">Khoa Điện - Điện tử<\/p>/);
  assert.match(read('en/course/EE4367/index.html'), /<p class="muted small twins">2 other courses have the same name\./);
  // Môn không trùng tên: không có dòng phụ, không có ghi chú.
  const one = read('course/EE1009/index.html');
  assert.doesNotMatch(one, /class="subtitle"|class="muted small twins"/);
});

test('bảng môn của khoa: môn trùng tên có dòng phụ ghi ngành; trang chương trình không lặp', () => {
  const fac = read('faculty/EE/index.html');
  assert.match(fac, /course\/EE4347\/">Đồ án tốt nghiệp<\/a><span class="sub">Kỹ thuật Điện<\/span>/);
  assert.match(fac, /course\/EE4367\/">Đồ án Tốt nghiệp<\/a><span class="sub">Kỹ thuật Điện tử - Viễn thông<\/span>/);
  assert.doesNotMatch(read('program/EE_DIEN_2024/index.html'), /class="sub"/);
});

test('assets/courses.json: có ngữ cảnh môn trùng tên, không có url, detail; trang chủ và form gửi đọc file này', () => {
  const data = JSON.parse(read('assets/courses.json'));
  const byId = Object.fromEntries(data.courses.map((c) => [c.id, c]));
  assert.equal(byId.EE4347.ctx, 'Kỹ thuật Điện');
  assert.equal(byId.EE1009.ctx, undefined);
  assert.ok(data.courses.every((c) => !('url' in c) && !('detail' in c)));
  assert.match(fs.readFileSync(path.join(out, 'assets', 'search.js'), 'utf8'), /assets\/courses\.json/);
  assert.match(fs.readFileSync(path.join(out, 'assets', 'upload.js'), 'utf8'), /assets\/courses\.json/);
  assert.match(read('index.html'), /"groupMin":3/);
  // v1 không đổi: không có ctx.
  assert.ok(JSON.parse(read('v1/index.json')).courses.every((c) => !('ctx' in c)));
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
