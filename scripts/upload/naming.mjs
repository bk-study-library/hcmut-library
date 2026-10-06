// Đặt tên: slug, tên file, id không trùng. Chỉ dùng JS chuẩn để Worker đóng gói được.

export function slugify(text, max = 60) {
  const s = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  // Cắt theo ranh giới '-' nếu còn từ nguyên vẹn phía trước.
  const at = s[max] === '-' ? max : cut.lastIndexOf('-');
  const out = at > 0 ? s.slice(0, at) : cut;
  return out.replace(/-+$/, '');
}

export function fileName({ code, type, slug, term, ext }) {
  const tail = term ? `_${term}` : '';
  return `${code}_${type}_${slug}${tail}${String(ext).toLowerCase()}`;
}
