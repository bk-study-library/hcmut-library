import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildItem } from '../scripts/upload/item.mjs';
import { validate } from '../scripts/lib/schema.mjs';

const itemSchema = JSON.parse(readFileSync(new URL('../schema/item.schema.json', import.meta.url), 'utf8'));
const file = { name: 'MT1005_summary_x.pdf', size: 1234, sha256: 'a'.repeat(64), mime: 'application/pdf', quarantine: 'pending/abcdEF1234/MT1005_summary_x.pdf' };
const base = { course: 'MT1005', type: 'summary', title: 'Tóm tắt', lang: 'vi', license: 'CC-BY-SA-4.0', displayName: '' };

test('buildItem không có authors khi displayName rỗng', () => {
  const item = buildItem(base, file, '2026-10-03', 'tom-tat');
  assert.equal(item.authors, undefined);
  assert.equal(item.origin, 'self-made');
  assert.equal(item.added, '2026-10-03');
  assert.equal(item.removed, false);
  assert.equal(item.course, 'MT1005');
  assert.deepEqual(validate(itemSchema, item), []);
});

test('buildItem có file thì files[0] có quarantine, không có url', () => {
  const item = buildItem({ ...base, displayName: 'An', term: 'HK251', chapter: '3', examKind: '', teacher: '' }, file, '2026-10-03', 'tom-tat');
  assert.deepEqual(item.authors, ['An']);
  assert.equal(item.files[0].quarantine, file.quarantine);
  assert.equal(item.files[0].url, undefined);
  assert.equal(item.term, 'HK251');
  assert.equal('examKind' in item, false);
  assert.equal('teacher' in item, false);
  assert.deepEqual(validate(itemSchema, item), []);
});

test('buildItem book-ref có book, không có files', () => {
  const form = { ...base, type: 'book-ref', book: { title: 'Giải tích', authors: ['A'], year: 2020 } };
  const item = buildItem(form, undefined, '2026-10-03', 'giai-tich');
  assert.deepEqual(item.book, form.book);
  assert.equal('files' in item, false);
  assert.deepEqual(validate(itemSchema, item), []);
});

test('buildItem giữ sha256 của file gốc trong uploadSha256', () => {
  const item = buildItem(base, { ...file, uploadSha256: file.sha256 }, '2026-10-03', 'tom-tat');
  assert.equal(item.files[0].uploadSha256, file.sha256);
  assert.deepEqual(validate(itemSchema, item), []);
  assert.equal('uploadSha256' in buildItem(base, file, '2026-10-03', 'tom-tat').files[0], false);
});

test('buildItem bỏ danh xưng, học hàm trước tên giảng viên', async () => {
  const { normalizeTeacher } = await import('../scripts/upload/item.mjs');
  assert.equal(normalizeTeacher('Thầy  Nguyễn Văn A'), 'Nguyễn Văn A');
  assert.equal(normalizeTeacher('PGS.TS. Lê Thị B'), 'Lê Thị B');
  assert.equal(normalizeTeacher('ThS.Phạm D'), 'Phạm D');
  // Không cắt nhầm tên bắt đầu bằng các chữ đó, và không để trống.
  assert.equal(normalizeTeacher('Ksor H Mon'), 'Ksor H Mon');
  assert.equal(normalizeTeacher('Cô'), 'Cô');
  const item = buildItem({ ...base, teacher: 'Cô Trần Thị C' }, file, '2026-10-03', 'tom-tat');
  assert.equal(item.teacher, 'Trần Thị C');
});
