// Logic của form Gửi tài liệu khi chưa có môn: gợi ý môn gần mã, môn trùng tên, kiểm môn mới.
// Nạp search-core.js và upload-core.js như trình duyệt: script thường gắn vào globalThis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { HERE } from './helpers.mjs';

const ROOT = path.join(HERE, '..');
const ctx = vm.createContext({});
for (const f of ['search-core.js', 'upload-core.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'site-src', 'assets', f), 'utf8'), ctx);
const { BkSearch, BkUpload } = ctx;
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

test('gợi ý dùng cùng dữ liệu với ô chọn môn (assets/courses.json) và giữ nhãn ngữ cảnh', async () => {
  const { searchCourses } = await import('../scripts/build-site.mjs');
  const ctxs = { vi: new Map([['EE5429', 'Thạc sĩ Kỹ thuật điện tử']]), en: new Map() };
  const web = JSON.parse(JSON.stringify(searchCourses(index, ctxs)));
  const near = BkUpload.nearCodes(web.courses, 'EE5430', 2);
  assert.deepEqual(ids(near), ['EE5429', 'EE5431']);
  assert.equal(near[0].ctx, 'Thạc sĩ Kỹ thuật điện tử');
  const webIdx = BkSearch.prepare(web);
  const byId = Object.fromEntries(web.courses.map((c) => [c.id, c]));
  assert.deepEqual(ids(BkUpload.nameMatches(BkSearch, webIdx, byId, 'Kỹ thuật và hệ thống siêu cao tần', 3)), ['EE5429']);
  assert.equal(BkUpload.checkNewCourse({ code: 'EE5429', name: 'X' }, { pattern: PATTERN, nameMax: 10, courses: web.courses }).existing.id, 'EE5429');
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
