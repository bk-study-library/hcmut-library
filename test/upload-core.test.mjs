// Logic của form Gửi tài liệu: chọn môn theo tên (mã mặc định, giảng viên của môn), gợi ý môn gần mã, kiểm môn mới.
// Nạp search-core.js, subject-core.js và upload-core.js như trình duyệt: script thường gắn vào globalThis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { HERE } from './helpers.mjs';

const ROOT = path.join(HERE, '..');
const ctx = vm.createContext({});
for (const f of ['search-core.js', 'subject-core.js', 'upload-core.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', f), 'utf8'), ctx);
const { BkSearch, BkSubject, BkUpload } = ctx;
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'v1', 'index.json'), 'utf8'));
const idx = BkSearch.prepare(index);
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'course.schema.json'), 'utf8'));
const PATTERN = schema.properties.code.pattern;
const ids = (list) => Array.from(list, (c) => c.id);

test('normCode: bỏ khoảng trắng, chữ hoa', () => {
  assert.equal(BkUpload.normCode(' ee 5430 '), 'EE5430');
  assert.equal(BkUpload.normCode(''), '');
});

test('looksLikeCode: khớp mẫu mã môn của schema và có chữ số', () => {
  for (const q of ['EE5430', 'ee5430', ' co3001 ', '400111', 'ENG_B2']) assert.equal(BkUpload.looksLikeCode(q, PATTERN), true, q);
  for (const q of ['giai tich', 'giai', 'EE', 'EE5430-2024', 'EE54.30', 'ABCDEFGHIJKLM1']) assert.equal(BkUpload.looksLikeCode(q, PATTERN), false, q);
});

test('findCourse: theo id, mã hiện tại và mã cũ', () => {
  const courses = [
    { id: 'GE4169-2024', code: 'GE4169', aliases: [] },
    { id: 'CO3001', code: 'CO3001', aliases: ['CO3010'] },
  ];
  assert.equal(BkUpload.findCourse(courses, 'GE4169').id, 'GE4169-2024');
  assert.equal(BkUpload.findCourse(courses, 'GE4169-2024').id, 'GE4169-2024');
  assert.equal(BkUpload.findCourse(courses, 'CO3010').id, 'CO3001');
  assert.equal(BkUpload.findCourse(courses, 'CO3002'), null);
});

test('nearCodes: cùng tiền tố, số lệch trong khoảng span, gần trước', () => {
  assert.deepEqual(ids(BkUpload.nearCodes(index.courses, 'EE5430', 2)), ['EE5429', 'EE5431']);
  assert.deepEqual(ids(BkUpload.nearCodes(index.courses, 'EE5430', 1)), ['EE5429', 'EE5431']);
  assert.deepEqual(ids(BkUpload.nearCodes(index.courses, 'EE5430', 0)), []);
  // Không gợi ý chính mã đó, không qua tiền tố khác.
  const fake = [
    { id: 'AB1001', code: 'AB1001', aliases: [] },
    { id: 'AB1002', code: 'AB1002', aliases: [] },
    { id: 'AC1001', code: 'AC1001', aliases: [] },
    { id: 'AB1004', code: 'AB1004', aliases: [] },
    { id: 'AB0999', code: 'AB0999', aliases: [] },
  ];
  assert.deepEqual(ids(BkUpload.nearCodes(fake, 'AB1002', 2)), ['AB1001', 'AB1004']);
  assert.deepEqual(ids(BkUpload.nearCodes(fake, 'AB1000', 2)), ['AB0999', 'AB1001', 'AB1002']);
  assert.deepEqual(ids(BkUpload.nearCodes(fake, 'giai tich', 2)), []);
});

test('nameMatches: tên gõ khớp tên môn đã có (bỏ dấu) thì gợi ý môn đó', () => {
  const byId = Object.fromEntries(index.courses.map((c) => [c.id, c]));
  assert.deepEqual(ids(BkUpload.nameMatches(BkSearch, idx, byId, 'Kỹ thuật và hệ thống siêu cao tần', 3)), ['EE5429']);
  assert.deepEqual(ids(BkUpload.nameMatches(BkSearch, idx, byId, 'ky thuat va he thong sieu cao tan', 3)), ['EE5429']);
  assert.deepEqual(ids(BkUpload.nameMatches(BkSearch, idx, byId, 'ab', 3)), []);
  assert.deepEqual(ids(BkUpload.nameMatches(BkSearch, idx, byId, 'Môn này chắc chắn không có zzqx', 3)), []);
});

test('gợi ý dùng cùng dữ liệu với ô chọn môn (assets/courses.json)', async () => {
  const { searchCourses } = await import('../scripts/build-site.mjs');
  const web = JSON.parse(JSON.stringify(searchCourses(index, new Map([['EE5429', 2]]))));
  const near = BkUpload.nearCodes(web.courses, 'EE5430', 2);
  assert.deepEqual(ids(near), ['EE5429', 'EE5431']);
  assert.equal(near[0].progs, 2);
  const webIdx = BkSearch.prepare(web);
  const byId = Object.fromEntries(web.courses.map((c) => [c.id, c]));
  assert.deepEqual(ids(BkUpload.nameMatches(BkSearch, webIdx, byId, 'Kỹ thuật và hệ thống siêu cao tần', 3)), ['EE5429']);
  assert.equal(BkUpload.checkNewCourse({ code: 'EE5429', name: 'X' }, { pattern: PATTERN, nameMax: 10, courses: web.courses }).existing.id, 'EE5429');
});

// Dữ liệu nhỏ: một môn ba mã (A2 thuộc nhiều chương trình nhất), một môn một mã.
const mini = [
  { id: 'A1', code: 'A1', name: 'Đồ án tốt nghiệp', progs: 1, teachers: ['Trần B'] },
  { id: 'A2', code: 'A2', name: 'Đồ án Tốt nghiệp', progs: 4, teachers: ['Nguyễn A', 'Trần B'] },
  { id: 'A3', code: 'A3', name: 'Đồ án tốt nghiệp (KHMT)' },
  { id: 'B1', code: 'B1', name: 'Giải tích 2', teachers: ['Lê C'] },
];
const miniById = Object.fromEntries(mini.map((c) => [c.id, c]));
const miniSubjects = BkUpload.subjectIndex(BkSubject, mini, 2);

test('subjectIndex: mã cùng tên (bỏ phần ngoặc cuối) về một môn, tên gặp nhiều nhất', () => {
  assert.equal(miniSubjects.of.A1, 'do-an-tot-nghiep');
  assert.equal(miniSubjects.of.A3, 'do-an-tot-nghiep');
  assert.equal(miniSubjects.of.B1, undefined);
  assert.deepEqual(Array.from(miniSubjects.all['do-an-tot-nghiep'].ids), ['A1', 'A2', 'A3']);
  assert.equal(miniSubjects.all['do-an-tot-nghiep'].name, 'Đồ án tốt nghiệp');
});

test('subjectRows: mỗi môn một dòng, đặt ở chỗ mã xếp đầu; khớp đúng mã thì id là mã đó', () => {
  const hits = [{ id: 'B1', score: 1.7 }, { id: 'A3', score: 1.7 }, { id: 'A1', score: 1.7 }, { id: 'A2', score: 1.7 }];
  const rows = BkUpload.subjectRows(hits, miniSubjects);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { slug: '', id: 'B1', exact: false },
    { slug: 'do-an-tot-nghiep', id: 'A3', exact: false },
  ]);
  const typed = BkUpload.subjectRows([{ id: 'A1', score: 0 }, { id: 'B1', score: 1.7 }, { id: 'A2', score: 1.7 }], miniSubjects);
  assert.deepEqual(JSON.parse(JSON.stringify(typed)), [
    { slug: 'do-an-tot-nghiep', id: 'A1', exact: true },
    { slug: '', id: 'B1', exact: false },
  ]);
  // Khớp tên giảng viên không thành dòng môn.
  assert.equal(BkUpload.subjectRows([{ id: 'B1', score: 4, teacher: 'Lê C' }], miniSubjects).length, 0);
});

test('subjectChoice: chọn môn nhiều mã thì mã thuộc nhiều chương trình nhất; gõ đúng mã thì mã đó; môn một mã không có ô mã', () => {
  const pick = BkUpload.subjectChoice(BkSubject, miniSubjects, miniById, 'A3', '');
  assert.equal(pick.id, 'A2');
  assert.equal(pick.name, 'Đồ án tốt nghiệp');
  assert.deepEqual(JSON.parse(JSON.stringify(pick.codes)), [{ id: 'A1', code: 'A1' }, { id: 'A2', code: 'A2' }, { id: 'A3', code: 'A3' }]);
  assert.equal(BkUpload.subjectChoice(BkSubject, miniSubjects, miniById, 'A3', 'A3').id, 'A3');
  const one = BkUpload.subjectChoice(BkSubject, miniSubjects, miniById, 'B1', '');
  assert.equal(one.id, 'B1');
  assert.equal(one.codes.length, 0);
});

test('subjectTeachers: tên giảng viên của mọi mã trong môn, bỏ trùng, xếp theo chữ', () => {
  const list = miniSubjects.all['do-an-tot-nghiep'].ids.map((id) => miniById[id]);
  assert.deepEqual(Array.from(BkUpload.subjectTeachers(list)), ['Nguyễn A', 'Trần B']);
  assert.deepEqual(Array.from(BkUpload.subjectTeachers([miniById.A3])), []);
});

test('dữ liệu thật: "do an tot nghiep" ra một dòng môn nhiều mã; "MT1005" ra môn Giải tích 2 với đúng mã MT1005', () => {
  const byId = Object.fromEntries(index.courses.map((c) => [c.id, c]));
  const subjects = BkUpload.subjectIndex(BkSubject, index.courses, 2);
  const rows = BkUpload.subjectRows(BkSearch.search(idx, 'do an tot nghiep', { limit: 500 }), subjects);
  assert.equal(rows[0].slug, 'do-an-tot-nghiep');
  assert.ok(subjects.all['do-an-tot-nghiep'].ids.length > 10);
  const exact = BkUpload.subjectRows(BkSearch.search(idx, 'MT1005', { limit: 500 }), subjects);
  assert.equal(exact[0].id, 'MT1005');
  assert.equal(exact[0].exact, true);
  assert.equal(BkUpload.subjectChoice(BkSubject, subjects, byId, exact[0].id, exact[0].id).id, 'MT1005');
  assert.equal(BkUpload.exactCode(BkSearch.search(idx, 'mt1005', { limit: 500 }), byId).id, 'MT1005');
  assert.equal(BkUpload.exactCode(BkSearch.search(idx, 'giai tich 2', { limit: 500 }), byId), null);
});

test('codeChips: tối đa max mã, phần còn lại ghi +N', () => {
  const g = ['A', 'B', 'C', 'D', 'E', 'F'].map((code) => ({ code }));
  assert.deepEqual({ ...BkUpload.codeChips(g, 4) }, { codes: ['A', 'B', 'C', 'D'], more: 2 });
  const r = BkUpload.codeChips(g.slice(0, 3), 4);
  assert.deepEqual(Array.from(r.codes), ['A', 'B', 'C']);
  assert.equal(r.more, 0);
});

test('checkNewCourse: mã theo mẫu, chưa có trong thư viện, tên có giới hạn', () => {
  const opts = { pattern: PATTERN, nameMax: 10, courses: index.courses };
  const ok = BkUpload.checkNewCourse({ code: ' ee5430 ', name: ' Siêu cao  ' }, opts);
  assert.deepEqual({ ...ok.errors }, {});
  assert.equal(ok.code, 'EE5430');
  assert.equal(ok.name, 'Siêu cao');
  assert.equal(ok.existing, null);
  assert.deepEqual({ ...BkUpload.checkNewCourse({ code: '', name: '' }, opts).errors }, { newCourseCode: 'codeEmpty', newCourseName: 'nameEmpty' });
  assert.deepEqual({ ...BkUpload.checkNewCourse({ code: 'EE5430-2024', name: 'A' }, opts).errors }, { newCourseCode: 'codePattern' });
  assert.deepEqual({ ...BkUpload.checkNewCourse({ code: 'EE5430', name: 'A'.repeat(11) }, opts).errors }, { newCourseName: 'nameLong' });
  const dup = BkUpload.checkNewCourse({ code: 'ee5429', name: 'X' }, opts);
  assert.equal(dup.existing.id, 'EE5429');
  assert.deepEqual({ ...dup.errors }, {});
});

test('cảnh báo trùng tên: trùng hẳn, chứa nhau, chung đa số từ; tiêu đề quá ngắn thì bỏ qua', () => {
  const fold = BkSearch.fold;
  const docs = [
    { id: 'a', course: 'MT1003', code: 'MT1003', title: 'Tóm tắt giới hạn và đạo hàm', added: '2026-10-01' },
    { id: 'b', course: 'MT1003', code: 'MT1003', title: 'Đề thi cuối kỳ HK241', added: '2026-10-02' },
    { id: 'c', course: 'MT1011', code: 'MT1011', title: 'Bảng công thức tích phân', added: '2026-10-03' },
  ];
  assert.deepEqual(ids(BkUpload.similarDocs('tom tat gioi han va dao ham', docs, fold)), ['a']);
  assert.deepEqual(ids(BkUpload.similarDocs('Tóm tắt giới hạn, đạo hàm (bản mới)', docs, fold)), ['a']);
  assert.deepEqual(ids(BkUpload.similarDocs('De thi cuoi ky HK241 ca 2', docs, fold)), ['b']);
  assert.deepEqual(ids(BkUpload.similarDocs('Slide chương 5', docs, fold)), []);
  assert.deepEqual(ids(BkUpload.similarDocs('Đề', docs, fold)), []);
  // Tài liệu của môn: chỉ các mã trong môn, mới nhất trước.
  assert.deepEqual(ids(BkUpload.subjectDocs(docs, ['MT1003', 'MT1011'])), ['c', 'b', 'a']);
  assert.deepEqual(ids(BkUpload.subjectDocs(docs, ['MT1003'])), ['b', 'a']);
});
