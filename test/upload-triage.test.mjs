// Phân loại bài sau khi quét (scripts/upload/triage.mjs): đăng ngay, Chưa phân loại, hay chờ người duyệt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triageFile, triageBatch } from '../scripts/upload/triage.mjs';
import { renderReport } from '../scripts/upload/report.mjs';
import { hasSimilarTitle } from '../scripts/lib/similar.mjs';

const rules = { reviewTypes: ['exam-past'], bookPagesMin: 150 };
const clean = { warnings: [], pii: [], hasText: true, totalPages: 20 };
const slides = { id: 'a', type: 'lecture-slides', title: 'Chương 1' };
const ctx = { newCourse: false, similar: false };

test('sạch, loại thường, môn có sẵn: đăng ngay', () => {
  assert.deepEqual(triageFile(clean, slides, ctx, rules), { decision: 'publish', review: [], unclassified: [] });
});

test('cần người duyệt: đề thi, file dày như sách, trùng tên tài liệu cũ, cảnh báo nặng hay không quét hết', () => {
  assert.deepEqual(triageFile(clean, slides, { ...ctx, similar: true }, rules).review, ['duplicate']);
  assert.deepEqual(triageFile(clean, { ...slides, type: 'exam-past' }, ctx, rules).review, ['type']);
  assert.deepEqual(triageFile({ ...clean, totalPages: 300 }, slides, ctx, rules).review, ['book-like']);
  assert.deepEqual(triageFile({ ...clean, warnings: ['office-macro'] }, slides, ctx, rules).review, ['manual']);
  assert.equal(triageFile({ ...clean, unscannable: 'Heuristics.Encrypted.Zip' }, slides, ctx, rules).decision, 'review');
});

test('Chưa phân loại: môn mới, thông tin cá nhân, không lớp chữ, cảnh báo nhẹ, bản cập nhật', () => {
  const r = triageFile({ ...clean, pii: [{ label: 'MSSV', page: 1 }], hasText: false, warnings: ['pdf-openaction'] }, { ...slides, replaces: 'MT1005/x' }, { newCourse: true, similar: false }, rules);
  assert.equal(r.decision, 'unclassified');
  assert.deepEqual(r.unclassified, ['new-course', 'pii', 'no-text', 'warning', 'update']);
  // Cảnh báo nặng thắng.
  assert.equal(triageFile({ ...clean, warnings: ['pdf-javascript'], pii: [{}] }, slides, ctx, rules).decision, 'review');
});

test('cả bài lấy mức nặng nhất', () => {
  assert.equal(triageBatch([{ decision: 'publish' }, { decision: 'unclassified' }]), 'unclassified');
  assert.equal(triageBatch([{ decision: 'unclassified' }, { decision: 'review' }, { decision: 'publish' }]), 'review');
  assert.equal(triageBatch([{ decision: 'publish' }]), 'publish');
});

test('comment ghi kết quả phân loại', () => {
  const f = (t) => ({ name: 'a.pdf', size: 1, ...clean, triage: t });
  assert.match(renderReport({ code: 'Abc1234567', files: [f({ review: [], unclassified: [] })], decision: 'publish' }), /Tự đăng: bot merge ở lượt chạy kế tiếp/);
  assert.match(renderReport({ code: 'Abc1234567', files: [f({ review: [], unclassified: ['new-course'] })], decision: 'unclassified', reviewers: ['xeroz369'], unclassifiedUrl: 'https://x/chua-phan-loai/' }), /Chưa phân loại \(môn mới\).* @xeroz369 phân loại ở https:\/\/x\/chua-phan-loai\//);
  assert.match(renderReport({ code: 'Abc1234567', files: [f({ review: ['type'], unclassified: [] })], decision: 'review' }), /Cần người duyệt: loại tài liệu cần người duyệt\./);
});

test('trùng tên dùng cùng quy tắc với form gửi', () => {
  assert.equal(hasSimilarTitle('Tóm tắt giới hạn đạo hàm', [{ title: 'Tóm tắt giới hạn và đạo hàm' }]), true);
  assert.equal(hasSimilarTitle('Slide chương 1', [{ title: 'Đề giữa kỳ 2023' }]), false);
});
