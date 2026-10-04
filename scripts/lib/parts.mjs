// Phần học của môn (lý thuyết, thí nghiệm, đồ án) suy ra từ tên. Chỉ dùng JS chuẩn (không import
// node:) để Worker đóng gói được; import-seed.mjs và các script nhập CTĐT dùng chung.

export function inferParts(name) {
  const n = String(name).toLowerCase();
  if (n.includes('ngoài trường')) return [];
  if (n.includes('thí nghiệm') || n.startsWith('thực tập')) return ['lab'];
  if (n.startsWith('đồ án')) return ['project'];
  return ['theory'];
}
