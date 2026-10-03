import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyCheck, quarantineInfo, pickItemFile, piiFromPages, removedTags, findReportComment, failureReport, githubOutput,
  releaseName, validateResult,
} from '../scripts/upload/check.mjs';
import { releaseAssetUrl } from '../scripts/upload/term.mjs';
import { REPORT_MARKER } from '../scripts/upload/report.mjs';
import { validate } from '../scripts/lib/schema.mjs';

const itemSchema = JSON.parse(readFileSync(new URL('../schema/item.schema.json', import.meta.url), 'utf8'));
const REPO = 'bk-study-library/bk-study-library';
const NAME = 'MT1005_summary_tom-tat.pdf';
const OLD_SHA = 'a'.repeat(64);
const SHA = 'b1c2d3' + 'e'.repeat(58);
const item = {
  id: 'tom-tat',
  course: 'MT1005',
  type: 'summary',
  title: 'Tóm tắt',
  lang: 'vi',
  license: 'CC-BY-SA-4.0',
  origin: 'self-made',
  added: '2026-10-03',
  removed: false,
  files: [{ name: NAME, size: 2000, sha256: OLD_SHA, mime: 'application/pdf', quarantine: `pending/abcdEF1234/${NAME}` }],
};
const opts = { cleanName: NAME, size: 1500, sha256: SHA, mime: 'application/pdf', term: 'HK251', repo: REPO, existingAssets: new Map() };

test('applyCheck ghi url Release, sha256, size, mime và quarantine clean/', () => {
  const out = applyCheck(item, opts);
  const f = out.files[0];
  assert.equal(f.url, releaseAssetUrl(REPO, 'files-HK251', NAME));
  assert.equal(f.name, NAME);
  assert.equal(f.size, 1500);
  assert.equal(f.sha256, SHA);
  assert.equal(f.mime, 'application/pdf');
  assert.equal(f.quarantine, `clean/abcdEF1234/${NAME}`);
  assert.deepEqual(validate(itemSchema, out), []);
  // Không sửa mục gốc.
  assert.equal(item.files[0].url, undefined);
});

test('applyCheck thêm 6 ký tự sha256 khi Release có file cùng tên khác nội dung', () => {
  const out = applyCheck(item, { ...opts, existingAssets: new Map([[NAME, OLD_SHA]]) });
  const want = 'MT1005_summary_tom-tat-b1c2d3.pdf';
  assert.equal(out.files[0].name, want);
  assert.equal(out.files[0].url, releaseAssetUrl(REPO, 'files-HK251', want));
  assert.equal(out.files[0].quarantine, `clean/abcdEF1234/${want}`);
  assert.deepEqual(validate(itemSchema, out), []);
});

test('releaseName thêm hậu tố vào cuối khi tên không có dấu chấm', () => {
  assert.equal(releaseName('README', SHA, new Map([['README', OLD_SHA]])), 'README-b1c2d3');
  assert.equal(releaseName('README', SHA, new Map()), 'README');
});

const result = {
  code: 'abcdEF1234', name: NAME, virus: null, metadataRemoved: ['Author', 'Producer'], hasText: true,
  piiChecked: true, pii: [{ label: 'email', page: 2, match: 'an@hcmut.edu.vn' }], size: 1500, sha256: SHA,
};
const info = { code: 'abcdEF1234', key: `pending/abcdEF1234/${NAME}`, name: NAME, sha256: OLD_SHA };

test('validateResult nhận kết quả quét đúng dạng và chỉ giữ trường đã biết', () => {
  assert.deepEqual(validateResult({ ...result, extra: 'x' }, info), result);
  const virus = { code: 'abcdEF1234', name: NAME, virus: 'Eicar-Signature' };
  assert.deepEqual(validateResult(virus, info), { code: 'abcdEF1234', name: NAME, virus: 'Eicar-Signature' });
});

test('validateResult từ chối kết quả quét sai dạng', () => {
  const bad = [
    { ...result, code: 'zzzzzzzzzz' },
    { ...result, name: 'khac.pdf' },
    { ...result, virus: '<b>x</b>' },
    { ...result, sha256: 'x' },
    { ...result, size: 0 },
    { ...result, size: 1.5 },
    { ...result, hasText: 'yes' },
    { ...result, piiChecked: 1 },
    { ...result, metadataRemoved: ['<img src=x>'] },
    { ...result, metadataRemoved: 'Author' },
    { ...result, pii: [{ label: 'khác', page: 1, match: 'x' }] },
    { ...result, pii: [{ label: 'email', page: 0, match: 'x' }] },
    { ...result, pii: [{ label: 'email', page: 1, match: 'x'.repeat(201) }] },
    { ...result, pii: 'x' },
    null,
  ];
  for (const r of bad) assert.throws(() => validateResult(r, info), /kết quả quét/, JSON.stringify(r));
});

test('githubOutput dùng dấu phân cách, không cho giá trị chứa dấu phân cách', () => {
  assert.equal(githubOutput({ a: 'x', b: 'y\nz' }, 'EOF_1'), 'a<<EOF_1\nx\nEOF_1\nb<<EOF_1\ny\nz\nEOF_1\n');
  assert.throws(() => githubOutput({ a: 'x\nEOF_1\nb=1' }, 'EOF_1'));
});

test('applyCheck giữ tên khi Release có file cùng tên cùng sha256', () => {
  const out = applyCheck(item, { ...opts, existingAssets: new Map([[NAME, SHA]]) });
  assert.equal(out.files[0].name, NAME);
  assert.equal(out.files[0].url, releaseAssetUrl(REPO, 'files-HK251', NAME));
});

test('quarantineInfo đọc mã bài, khóa và kiểm nhánh', () => {
  const info = quarantineInfo(item, 'upload/abcdEF1234');
  assert.deepEqual(info, { code: 'abcdEF1234', key: `pending/abcdEF1234/${NAME}`, name: NAME, sha256: OLD_SHA });
  assert.throws(() => quarantineInfo(item, 'upload/zzzzzzzzzz'), /nhánh/);
  assert.throws(() => quarantineInfo({ ...item, files: [{ ...item.files[0], quarantine: '../x' }] }, 'upload/abcdEF1234'));
  assert.throws(() => quarantineInfo({ ...item, files: [] }, 'upload/abcdEF1234'));
  assert.throws(() => quarantineInfo({ ...item, files: [item.files[0], item.files[0]] }, 'upload/abcdEF1234'));
  assert.throws(() => quarantineInfo({ ...item, files: [{ ...item.files[0], sha256: 'x' }] }, 'upload/abcdEF1234'));
  for (const bad of ['a b.pdf', 'a\nb.pdf', 'tên.pdf', 'a$(x).pdf', '.', '..', '.pdf', 'a.', 'README', '..pdf']) {
    const f = { ...item.files[0], name: bad, quarantine: `pending/abcdEF1234/${bad}` };
    assert.throws(() => quarantineInfo({ ...item, files: [f] }), /tên file/, bad);
  }
});

test('pickItemFile cần đúng một mục tài liệu, chỉ thêm file sinh ra của môn đó', () => {
  const one = { filename: 'courses/MT1005/items/tom-tat.json', status: 'added' };
  const generated = ['index.json', 'index.min.json', 'v1/courses/MT1005.json', 'v1/index.json', 'courses/MT1005/README.md']
    .map((filename) => ({ filename, status: 'modified' }));
  assert.equal(pickItemFile([one]), one.filename);
  assert.equal(pickItemFile([one, ...generated]), one.filename);
  assert.throws(() => pickItemFile([]), /đúng một/);
  assert.throws(() => pickItemFile(generated), /đúng một/);
  assert.throws(() => pickItemFile([one, { filename: 'courses/MT1005/items/khac.json', status: 'added' }]), /đúng một/);
  assert.throws(() => pickItemFile([{ ...one, status: 'removed' }]), /đúng một/);
});

test('pickItemFile từ chối PR sửa file ngoài phạm vi', () => {
  const one = { filename: 'courses/MT1005/items/tom-tat.json', status: 'added' };
  for (const filename of ['scripts/validate.mjs', '.github/workflows/kiem-file.yml', 'courses/MT1005/course.json', 'courses/CO1005/README.md', 'courses/MT1005/items/sub/x.json', 'catalog/policy.json', 'courses/MT1005/items/a b.json', 'courses/MT1005/items/a\nb.json']) {
    assert.throws(() => pickItemFile([one, { filename, status: 'modified' }]), /ngoài phạm vi/, filename);
  }
});

test('pickItemFile kiểm cả đường dẫn cũ của file đổi tên', () => {
  const one = { filename: 'courses/MT1005/items/tom-tat.json', status: 'added' };
  // Đổi tên từ chỗ không được phép sang chỗ được phép vẫn bị chặn.
  assert.throws(() => pickItemFile([one, { filename: 'v1/x.json', status: 'renamed', previous_filename: 'scripts/x.mjs' }]), /ngoài phạm vi/);
  assert.throws(() => pickItemFile([{ ...one, status: 'renamed', previous_filename: 'scripts/x.json' }]), /ngoài phạm vi/);
  assert.throws(() => pickItemFile([{ ...one, status: 'renamed', previous_filename: 'courses/MT1005/items/cu.json' }]), /ngoài phạm vi/);
  assert.equal(pickItemFile([one, { filename: 'v1/b.json', status: 'renamed', previous_filename: 'v1/a.json' }]), one.filename);
});

test('piiFromPages ghi số trang và lớp chữ', () => {
  const r = piiFromPages(['', 'Liên hệ an@hcmut.edu.vn\nMSSV 2112345', '   ']);
  assert.equal(r.hasText, true);
  assert.deepEqual(r.pii.map((p) => [p.label, p.page, p.match]), [
    ['email', 2, 'an@hcmut.edu.vn'],
    ['MSSV 7 chữ số', 2, '2112345'],
  ]);
  assert.equal(piiFromPages([' ', '\n']).hasText, false);
  assert.equal(piiFromPages([]).hasText, false);
});

test('removedTags nêu thẻ đã mất sau khi làm sạch, bỏ nhóm File và System', () => {
  const before = { SourceFile: 'x.pdf', 'ExifTool:ExifToolVersion': 13, 'File:FileSize': '2 kB', 'PDF:Author': 'An', 'PDF:Producer': 'Word', 'XMP:Creator': 'An', 'PDF:PageCount': 3 };
  const after = { SourceFile: 'x.pdf', 'ExifTool:ExifToolVersion': 13, 'File:FileSize': '1 kB', 'PDF:PageCount': 3, 'PDF:Linearized': 'Yes' };
  assert.deepEqual(removedTags(before, after), ['Author', 'Producer', 'Creator']);
  assert.deepEqual(removedTags({ 'PDF:Creator': 'a', 'XMP:Creator': 'a' }, {}), ['Creator']);
  assert.deepEqual(removedTags(after, after), []);
});

test('findReportComment chỉ nhận comment của github-actions có marker', () => {
  const comments = [
    { id: 1, user: { login: 'someone' }, body: `${REPORT_MARKER}\ngiả` },
    { id: 2, user: { login: 'github-actions[bot]' }, body: 'khác' },
    { id: 3, user: { login: 'github-actions[bot]' }, body: `${REPORT_MARKER}\nthật` },
  ];
  assert.equal(findReportComment(comments), 3);
  assert.equal(findReportComment(comments.slice(0, 2)), null);
});

test('failureReport bắt đầu bằng marker và có link nhật ký', () => {
  const out = failureReport({ reason: 'Không tải được file.', runUrl: 'https://github.com/x/y/actions/runs/1' });
  assert.ok(out.startsWith(REPORT_MARKER));
  assert.match(out, /Không tải được file\./);
  assert.match(out, /actions\/runs\/1/);
  assert.ok(failureReport({ reason: '', runUrl: 'https://a' }).startsWith(REPORT_MARKER));
});
