import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClamscan, renderReport, REPORT_MARKER, WARNINGS, MANUAL_LABEL, needsManualReview, fenced } from '../scripts/upload/report.mjs';

// Cùng bộ ký tự với test/style.test.mjs, viết bằng mã escape để file này không tự vi phạm.
const BANNED = /[\u2014\u2013\u2192\u21d2\u2194\u00b7\u2026\u201c\u201d\u2018\u2019\u2605\u2713\u2714]|\p{Extended_Pictographic}/u;

const REVIEW = 'https://upload.example.org/xem-duyet/Abc123XYZ0';
const file = (over = {}) => ({ name: 'MT1005_slides_a.pdf', size: 326846, virus: null, hasText: true, pii: [], piiChecked: true, warnings: [], ...over });
const report = (files, reviewUrl = REVIEW) => renderReport({ code: 'Abc123XYZ0', reviewUrl, files });

test('parseClamscan đọc kết quả sạch, có virus và lỗi', () => {
  assert.deepEqual(parseClamscan('x: Eicar-Signature FOUND\n', 1), { infected: true, signature: 'Eicar-Signature' });
  assert.deepEqual(parseClamscan('x: OK\n', 0), { infected: false });
  assert.throws(() => parseClamscan('x: ERROR\n', 2));
});

test('báo cáo: một bảng, một link duyệt, mỗi file một dòng có tên và cỡ', () => {
  const out = report([file(), file({ name: 'MT1005_slides_b.pdf', size: 3 * 1024 * 1024 })]);
  assert.ok(out.startsWith(`${REPORT_MARKER}\n## Kiểm file bài Abc123XYZ0: 2 file, không có virus\n`));
  assert.equal(out.split(REVIEW).length, 2);
  assert.match(out, /\| 1 \| MT1005_slides_a\.pdf, 319 KB \| Không \|/);
  assert.match(out, /\| 2 \| MT1005_slides_b\.pdf, 3\.0 MB \| Không \|/);
  assert.doesNotMatch(out, /releases\/download/);
  assert.ok(!BANNED.test(out));
});

test('báo cáo có virus: nêu chữ ký, báo đóng bài, không có link duyệt', () => {
  const out = report([file(), file({ name: 'b.pdf', virus: 'Eicar-Signature' })]);
  assert.match(out, /CÓ VIRUS/);
  assert.match(out, /Có virus: Eicar-Signature/);
  assert.ok(!out.includes(REVIEW));
  assert.doesNotMatch(out, /Metadata đã được xóa/);
});

test('báo cáo: thông tin cá nhân gom theo loại và trang, không in giá trị', () => {
  const out = report([file({ pii: [{ label: 'MSSV', page: 4, match: '2112345' }, { label: 'MSSV', page: 2, match: '2112346' }, { label: 'Email', page: 1, match: 'a@b.vn' }] })]);
  assert.match(out, /Có thể có MSSV \(trang 2, 4\); Có thể có Email \(trang 1\)/);
  assert.ok(!out.includes('2112345'));
  assert.ok(!out.includes('a@b.vn'));
});

test('báo cáo: không quét được, cảnh báo, label cần xem tay, đọc chữ có giới hạn, không lớp chữ', () => {
  const out = report([file({ unscannable: 'Heuristics.Encrypted.Zip', warnings: ['zip-encrypted', 'zip-images'] })]);
  assert.match(out, /ClamAV không quét hết \(Heuristics\.Encrypted\.Zip\); \.zip có mật khẩu; Ảnh trong \.zip còn metadata/);
  assert.ok(out.includes(`\`${MANUAL_LABEL}\``));

  const soft = report([file({ warnings: ['pdf-openaction'] })]);
  assert.ok(!soft.includes(MANUAL_LABEL));
  assert.match(soft, /PDF có OpenAction/);

  assert.match(report([file({ textPages: 200, totalPages: 350 })]), /Chỉ đọc chữ 200\/350 trang/);
  assert.doesNotMatch(report([file({ textPages: 12, totalPages: 12 })]), /Chỉ đọc chữ/);
  assert.match(report([file({ hasText: false })]), /PDF không có lớp chữ/);
  assert.match(report([file({ hasText: null, piiChecked: false })]), /Chưa kiểm thông tin cá nhân/);
  // Mã cảnh báo lạ bị bỏ qua, không in nguyên.
  assert.doesNotMatch(report([file({ warnings: ['<b>x</b>'] })]), /<b>/);
});

test('báo cáo: chữ chưa tin không phá được bảng hay chèn HTML, link, gọi tên người', () => {
  const r = parseClamscan('/tmp/<img src=x> FOUND.pdf: Real.Sig-1 FOUND\n', 1);
  const out = report([file({ name: 'a|b<img>@x#1[y].pdf' }), file({ virus: r.signature })]);
  assert.doesNotMatch(out, /<img|@x|#1|\[y\]|a\|b/);
  assert.match(out, /Real\.Sig-1/);
});

test('mọi báo cáo qua BANNED và bắt đầu bằng marker; không có reviewUrl thì bỏ dòng Duyệt', () => {
  for (const files of [[file()], [file({ virus: 'Win.Test' })], [file({ hasText: false, pii: [{ label: 'Email', page: 1, match: 'a@b.vn' }] })]]) {
    const out = report(files);
    assert.ok(out.startsWith(REPORT_MARKER));
    assert.ok(!BANNED.test(out), out);
  }
  assert.doesNotMatch(report([file()], ''), /Duyệt:/);
});

test('parseClamscan không nhận chữ giả từ đường dẫn file', () => {
  assert.throws(() => parseClamscan('x: <b>evil</b> FOUND\n', 1));
  assert.throws(() => parseClamscan('x: <b> FOUND.pdf\n', 1));
  assert.throws(() => parseClamscan('', 1));
  assert.equal(parseClamscan('/tmp/<img src=x> FOUND.pdf: Real.Sig-1 FOUND\n', 1).signature, 'Real.Sig-1');
});

test('parseClamscan: file mã hóa hay vượt giới hạn là không quét được, không phải sạch hay virus', () => {
  assert.deepEqual(parseClamscan('/x/a.zip: Heuristics.Encrypted.Zip FOUND\n', 1), { infected: false, unscannable: 'Heuristics.Encrypted.Zip' });
  assert.deepEqual(parseClamscan('/x/a.zip: Heuristics.Limits.Exceeded.MaxFileSize FOUND\n', 1), { infected: false, unscannable: 'Heuristics.Limits.Exceeded.MaxFileSize' });
  assert.deepEqual(parseClamscan('/x/a.pdf: Heuristics.Limits.Exceeded FOUND\n', 1), { infected: false, unscannable: 'Heuristics.Limits.Exceeded' });
  // Có cả virus thật thì virus thắng.
  const both = '/x/a.zip: Heuristics.Encrypted.Zip FOUND\n/x/a.zip: Win.Test.EICAR_HDB-1 FOUND\n';
  assert.deepEqual(parseClamscan(both, 1), { infected: true, signature: 'Win.Test.EICAR_HDB-1' });
  // Heuristics khác (không phải mã hóa, giới hạn) vẫn là virus.
  assert.deepEqual(parseClamscan('/x/a.doc: Heuristics.OLE2.ContainsMacros FOUND\n', 1), { infected: true, signature: 'Heuristics.OLE2.ContainsMacros' });
});

test('needsManualReview: theo bảng WARNINGS và kết quả ClamAV', () => {
  assert.equal(needsManualReview({ warnings: [] }), false);
  assert.equal(needsManualReview({ warnings: ['pdf-openaction', 'pdf-embedded', 'office-comments', 'zip-images'] }), false);
  for (const w of ['pdf-javascript', 'pdf-launch', 'office-macro', 'office-external', 'zip-encrypted', 'zip-unsafe-path', 'zip-symlink', 'zip-nested', 'zip-other-type', 'zip-large']) {
    assert.equal(needsManualReview({ warnings: [w] }), true, w);
  }
  assert.equal(needsManualReview({ unscannable: 'Heuristics.Encrypted.PDF', warnings: [] }), true);
  for (const w of Object.values(WARNINGS)) assert.ok(!BANNED.test(w.text));
});

test('fenced: rào dài hơn đoạn backtick dài nhất, ít nhất 3, có giới hạn', () => {
  assert.equal(fenced('abc'), '```text\nabc\n```');
  assert.ok(fenced('a ```` b').startsWith('`````text\n'));
  const long = fenced('y'.repeat(50), 10);
  assert.match(long, /^```text\ny{10}\n\(còn nữa, xem nhật ký\)\n```$/);
});
