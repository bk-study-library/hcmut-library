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
