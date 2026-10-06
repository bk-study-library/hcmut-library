// Phân loại bài gửi sau khi quét (workflow kiem-file): đăng ngay, đăng vào mục Chưa phân loại, hay chờ người duyệt.
// Hàm thuần; ngưỡng ở catalog/policy.json (triage). Có virus thì workflow đã đóng PR trước bước này.
//
//   review        cần người duyệt: cảnh báo nặng (macro, JavaScript, không quét hết), loại dễ dính bản quyền
//                 (policy.triage.reviewTypes, hiện không có), file dày như sách (từ bookPagesMin trang), tên gần
//                 giống tài liệu đã có. Bot yêu cầu review.
//   unclassified  an toàn nhưng chưa phân loại được: môn mới, thông tin cá nhân (trừ liên hệ giảng viên trong loại
//                 policy.triage.contactTypes), PDF không có lớp chữ (máy không đọc được để kiểm), cảnh báo nhẹ, bản cập nhật. Vẫn đăng, item ghi lý do
//                 ở trường unclassified; bot nhắc người duyệt phân loại ở trang chua-phan-loai/.
//   publish       còn lại.
import { needsManualReview, WARNINGS } from './report.mjs';
import { PII_PATTERNS } from '../lib/pii.mjs';

// Email, số điện thoại trong loại do giảng viên soạn (policy.triage.contactTypes, ví dụ slide bài giảng) là liên hệ của
// giảng viên in ở chân trang, không phải thông tin của sinh viên; MSSV thì vẫn tính.
const CONTACT_LABELS = new Set(PII_PATTERNS.filter((p) => p.code !== 'PII_STUDENT_ID').map((p) => p.label));

const RANK = { publish: 0, unclassified: 1, review: 2 };

// file: kết quả quét của một file ({ warnings, unscannable, pii, hasText, textPages, totalPages }).
// item: mục tài liệu. ctx: { newCourse, similar } (similar: có tài liệu cùng môn tên gần giống).
export function triageFile(file, item, ctx, rules) {
  const review = [];
  const unclassified = [];
  if (needsManualReview(file)) review.push('manual');
  if ((rules.reviewTypes || []).includes(item.type)) review.push('type');
  if (rules.bookPagesMin && Number.isInteger(file.totalPages) && file.totalPages >= rules.bookPagesMin) review.push('book-like');
  if (ctx.similar) review.push('duplicate');
  if (ctx.newCourse) unclassified.push('new-course');
  const contact = (rules.contactTypes || []).includes(item.type);
  if ((file.pii || []).some((p) => !(contact && CONTACT_LABELS.has(p.label)))) unclassified.push('pii');
  if (file.hasText === false) unclassified.push('no-text');
  if ((file.warnings || []).some((w) => WARNINGS[w] && !WARNINGS[w].manual)) unclassified.push('warning');
  if (item.replaces) unclassified.push('update');
  const decision = review.length ? 'review' : unclassified.length ? 'unclassified' : 'publish';
  return { decision, review, unclassified };
}

// Quyết định của cả bài (đợt gửi): mức nặng nhất trong các file.
export function triageBatch(results) {
  return results.reduce((d, r) => (RANK[r.decision] > RANK[d] ? r.decision : d), 'publish');
}
