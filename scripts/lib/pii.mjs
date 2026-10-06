// Mẫu thông tin cá nhân dùng chung cho validate.mjs, kiem-file và Worker. Chỉ dùng JS chuẩn
// (không import node:) để Worker đóng gói được.

// MSSV Bách Khoa: 7 chữ số, hai số đầu là khóa (ví dụ 19..., 21...). Số tròn (bốn số cuối là 0000, như 1000000 trong
// đề lập trình hay 2500000 đồng) không phải MSSV.
// Số điện thoại Việt Nam: 0 hoặc +84, rồi 9 chữ số (cho phép cách bằng dấu cách, chấm, gạch).
export const PII_PATTERNS = [
  { code: 'PII_STUDENT_ID', label: 'MSSV 7 chữ số', re: /(?<![\p{L}\p{N}.,])[12]\d{2}(?!0000)\d{4}(?![\p{L}\p{N}])/gu },
  { code: 'PII_EMAIL', label: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { code: 'PII_PHONE', label: 'số điện thoại', re: /(?<![\p{N}.,])(?:\+84[ .-]?|0)[235789]\d(?:[ .-]?\d){7}(?!\p{N})/gu },
];

// Dòng có chú thích "pii-ok" được bỏ qua (dùng khi chắc chắn không phải thông tin cá nhân).
// skipMarked false: không bỏ qua dòng nào (cho chữ người gửi tự nhập).
export function scanText(text, { skipMarked = true } = {}) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (skipMarked && line.includes('pii-ok')) return;
    for (const p of PII_PATTERNS) {
      for (const m of line.matchAll(p.re)) hits.push({ code: p.code, label: p.label, line: i + 1, match: m[0] });
    }
  });
  return hits;
}
