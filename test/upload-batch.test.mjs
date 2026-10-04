// Đợt gửi nhiều file: một PR có nhiều item cùng môn, cùng mã bài.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickItemFile, pickItemFiles, batchManifest, batchReport, clamFor, alreadyScanned } from '../scripts/upload/check.mjs';
import path from 'node:path';
import { REPORT_MARKER } from '../scripts/upload/report.mjs';

const f = (filename, status = 'added') => ({ filename, status });
const SHA = 'a'.repeat(64);
const item = (code, name) => ({ type: 'summary', files: [{ name, sha256: SHA, quarantine: `pending/${code}/${name}` }] });

test('pickItemFiles: nhiều mục cùng môn, theo thứ tự; khác môn, quá giới hạn, file ngoài phạm vi thì lỗi', () => {
  const files = [f('courses/MT1003/items/b.json'), f('courses/MT1003/items/a.json'), f('index.json', 'modified'), f('courses/MT1003/README.md', 'modified')];
  assert.deepEqual(pickItemFiles(files, 10), ['courses/MT1003/items/a.json', 'courses/MT1003/items/b.json']);
  assert.throws(() => pickItemFiles(files, 1), /đúng một file/);
  assert.throws(() => pickItemFiles([f('courses/MT1003/items/a.json'), f('courses/MT1005/items/b.json')], 10), /cùng một môn/);
  assert.throws(() => pickItemFiles([f('courses/MT1003/items/a.json'), f('catalog/policy.json', 'modified')], 10), /ngoài phạm vi/);
  assert.throws(() => pickItemFiles([f('index.json', 'modified')], 10), /từ 1 tới 10/);
  // pickItemFile vẫn chỉ nhận đúng một mục.
  assert.equal(pickItemFile([f('courses/MT1003/items/a.json')]), 'courses/MT1003/items/a.json');
});

test('batchManifest: cùng mã bài theo branch; sách không file không gửi chung đợt', () => {
  const items = { 'courses/MT1003/items/a.json': item('Abcde12345', 'MT1003_summary_a.pdf'), 'courses/MT1003/items/b.json': item('Abcde12345', 'MT1003_summary_b.pdf') };
  const list = batchManifest(Object.keys(items), (rel) => items[rel], 'upload/Abcde12345');
  assert.deepEqual(list.map((x) => [x.item, x.name, x.light]), [
    ['courses/MT1003/items/a.json', 'MT1003_summary_a.pdf', 'false'],
    ['courses/MT1003/items/b.json', 'MT1003_summary_b.pdf', 'false'],
  ]);
  assert.throws(() => batchManifest(Object.keys(items), (rel) => items[rel], 'upload/Zzzzz99999'), /Mã bài không khớp/);
  const book = { type: 'book-ref', book: { title: 'S', authors: ['A'] } };
  assert.throws(() => batchManifest(['courses/MT1003/items/a.json', 'courses/MT1003/items/s.json'], (rel) => (rel.endsWith('s.json') ? book : items[rel]), 'upload/Abcde12345'), /gửi riêng/);
});

test('batchReport: một comment cho cả bài, một bảng, một link duyệt', () => {
  const out = batchReport('Abcde12345', [{ file: { name: 'a.pdf', size: 2048, pii: [], warnings: [] } }, { file: { name: 'b.pdf', size: 4096, pii: [], warnings: ['pdf-embedded'] } }]);
  assert.ok(out.startsWith(`${REPORT_MARKER}\n## Kiểm file bài Abcde12345: 2 file, không có virus`));
  assert.equal(out.split(REPORT_MARKER).length, 2);
  assert.equal(out.split('/xem-duyet/Abcde12345').length, 2);
  assert.ok(out.includes('| 2 | b.pdf, 4 KB | PDF có file đính kèm |'));
});

test('clamFor: tách kết quả clamscan của cả bài theo từng file', () => {
  const a = path.resolve('/r/in/0/file/a.pdf');
  const b = path.resolve('/r/in/1/file/b.pdf');
  const all = { status: 1, stdout: `${b}: Win.Test.EICAR_HDB-1 FOUND\n${a}.bak: X FOUND\n` };
  assert.deepEqual(clamFor(all, a), { status: 0, stdout: '' });
  assert.deepEqual(clamFor(all, b), { status: 1, stdout: `${b}: Win.Test.EICAR_HDB-1 FOUND` });
  assert.deepEqual(clamFor({ status: 0, stdout: '' }, a), { status: 0, stdout: '' });
  assert.equal(clamFor({ status: 2, stdout: '' }, a).status, 2);
});

test('alreadyScanned: chỉ khi file ở clean/ và đã có link Release của repo', () => {
  const f = { name: 'a.pdf', sha256: 'a'.repeat(64), quarantine: 'clean/Abcde12345/a.pdf', url: 'https://github.com/o/r/releases/download/files-HK261/a.pdf' };
  assert.equal(alreadyScanned({ files: [f] }, 'o/r'), true);
  assert.equal(alreadyScanned({ files: [{ ...f, quarantine: 'pending/Abcde12345/a.pdf' }] }, 'o/r'), false);
  assert.equal(alreadyScanned({ files: [{ ...f, url: undefined }] }, 'o/r'), false);
  assert.equal(alreadyScanned({ files: [f] }, 'khac/repo'), false);
  assert.equal(alreadyScanned({ files: [f] }, ''), false);
});
