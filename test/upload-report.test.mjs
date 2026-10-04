import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClamscan, renderReport, REPORT_MARKER } from '../scripts/upload/report.mjs';

// Cùng bộ ký tự với test/style.test.mjs, viết bằng mã escape để file này không tự vi phạm.
const BANNED = /[\u2014\u2013\u2192\u21d2\u2194\u00b7\u2026\u201c\u201d\u2018\u2019\u2605\u2713\u2714]|\p{Extended_Pictographic}/u;

const URL = 'https://example.org/release/MT1005.pdf';
const clean = { code: 'MT1005', virus: null, metadataRemoved: [], hasText: true, pii: [], url: URL };

test('parseClamscan đọc kết quả sạch, có virus và lỗi', () => {
  assert.deepEqual(parseClamscan('x: Eicar-Signature FOUND\n', 1), { infected: true, signature: 'Eicar-Signature' });
  assert.deepEqual(parseClamscan('x: OK\n', 0), { infected: false });
  assert.throws(() => parseClamscan('x: ERROR\n', 2));
});

test('báo cáo có virus nêu chữ ký và không đưa link Release', () => {
  const out = renderReport({ ...clean, virus: 'Eicar-Signature' });
  assert.ok(out.startsWith(REPORT_MARKER));
  assert.match(out, /Có virus/);
  assert.match(out, /Eicar-Signature/);
  assert.ok(!out.includes(URL));
});

test('báo cáo sạch có link, siêu dữ liệu đã xóa', () => {
  const out = renderReport({ ...clean, metadataRemoved: ['Author', 'Creator'] });
  assert.ok(out.startsWith(REPORT_MARKER));
  assert.ok(out.includes(URL));
  assert.match(out, /Author, Creator/);
});

test('báo cáo che thông tin cá nhân và nêu số trang', () => {
  const out = renderReport({ ...clean, pii: [{ label: 'MSSV', page: 3, match: '21123455' }] });
  assert.match(out, /MSSV/);
  assert.match(out, /trang 3/);
  assert.ok(out.includes('21*****5'));
  assert.ok(!out.includes('21123455'));
  assert.ok(!BANNED.test(out));
});

test('báo cáo cảnh báo khi file không có lớp chữ', () => {
  const out = renderReport({ ...clean, hasText: false });
  assert.match(out, /không có lớp chữ/);
  assert.ok(!/không có lớp chữ/.test(renderReport({ ...clean, hasText: null })));
});

test('mọi báo cáo qua BANNED và bắt đầu bằng marker', () => {
  const cases = [
    clean,
    { ...clean, virus: 'Win.Test' },
    { ...clean, hasText: false, metadataRemoved: ['Author'], pii: [{ label: 'Email', page: 1, match: 'a@b.vn' }] },
    { ...clean, hasText: null },
  ];
  for (const c of cases) {
    const out = renderReport(c);
    assert.ok(out.startsWith(REPORT_MARKER));
    assert.ok(!BANNED.test(out), out);
  }
});

test('parseClamscan không nhận chữ giả từ đường dẫn file', () => {
  assert.throws(() => parseClamscan('x: <b>evil</b> FOUND\n', 1));
  assert.throws(() => parseClamscan('x: <b> FOUND.pdf\n', 1));
  assert.throws(() => parseClamscan('', 1));
  const r = parseClamscan('/tmp/<img src=x> FOUND.pdf: Real.Sig-1 FOUND\n', 1);
  assert.equal(r.signature, 'Real.Sig-1');
  assert.ok(!renderReport({ ...clean, virus: r.signature }).includes('<img'));
});

test('báo cáo che hết chuỗi ngắn và bỏ dòng siêu dữ liệu khi rỗng', () => {
  const out = renderReport({ ...clean, pii: [{ label: 'Email', page: 1, match: 'abcd' }] });
  assert.ok(out.includes('****'));
  assert.ok(!out.includes('abcd'));
  assert.ok(!out.includes('Đã xóa siêu dữ liệu'));
});

test('renderReport chịu được thiếu metadataRemoved và pii', () => {
  assert.doesNotThrow(() => renderReport({ code: 'MT1005', virus: null, hasText: true, url: URL }));
});

test('báo cáo nói rõ chưa kiểm thông tin cá nhân khi loại file không đọc được chữ', () => {
  const out = renderReport({ ...clean, hasText: null, piiChecked: false });
  assert.match(out, /Chưa kiểm thông tin cá nhân/);
  assert.ok(!/Chưa kiểm/.test(renderReport(clean)));
  assert.ok(!BANNED.test(out));
});

test('báo cáo có link xem file cho người duyệt khi có reviewUrl, báo cáo virus thì không', () => {
  const reviewUrl = 'https://upload.example.org/xem-duyet/Abc123XYZ0';
  const out = renderReport({ ...clean, reviewUrl });
  assert.ok(out.includes(`Xem file (người duyệt): ${reviewUrl}`));
  assert.ok(!BANNED.test(out));
  assert.ok(!renderReport(clean).includes('Xem file'));
  assert.ok(!renderReport({ ...clean, virus: 'Win.Test', reviewUrl }).includes(reviewUrl));
});
