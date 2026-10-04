// Đợt gửi nhiều file: một PR có nhiều mục tài liệu cùng môn, cùng mã bài.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickItemFile, pickItemFiles, batchManifest, batchReport } from '../scripts/upload/check.mjs';
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

test('batchManifest: cùng mã bài theo nhánh; sách không file không gửi chung đợt', () => {
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

test('batchReport: một file giữ báo cáo cũ; nhiều file thì một comment, mỗi file một mục', () => {
  const r = (code, line) => `${REPORT_MARKER}\n## Kết quả kiểm file ${code}\n\n${line}\n`;
  assert.equal(batchReport('X', [{ name: 'a.pdf', report: r('X', 'Không phát hiện virus.') }]), r('X', 'Không phát hiện virus.'));
  const out = batchReport('X', [{ name: 'a.pdf', report: r('X', 'Không phát hiện virus.') }, { name: 'b.pdf', report: r('X', 'Cảnh báo: Y') }]);
  assert.ok(out.startsWith(`${REPORT_MARKER}\n## Kết quả kiểm đợt gửi X (2 tài liệu)`));
  assert.equal(out.split(REPORT_MARKER).length, 2);
  assert.match(out, /### 1\. a\.pdf\n\nKhông phát hiện virus\.\n\n### 2\. b\.pdf\n\nCảnh báo: Y\n$/);
});
