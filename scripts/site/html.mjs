// Hàm nhỏ dựng HTML và đường dẫn: thoát ký tự, nút, JSON trong thẻ script, cắt chữ, ngày, đường dẫn trang.
import { SITE_URL } from '../lib/labels.mjs';

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Địa chỉ tuyệt đối của một trang, theo SITE_URL; bỏ index.html ở cuối.
export const absUrl = (p) => SITE_URL + String(p).replace(/(^|\/)index\.html$/, '$1');

// Cắt chữ dài ở ranh giới từ, thêm "..." (ba dấu chấm thường).
export function truncate(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 3);
  const at = cut.lastIndexOf(' ');
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,.;:]+$/, '')}...`;
}

export const jsonInScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

// Đường dẫn trang, tính từ gốc site, không có "/" đầu. Bản tiếng Anh nằm dưới en/.
export const pagePath = (lang, p) => (lang === 'en' ? `en/${p}` : p);

export function relPrefix(fromPath) {
  const depth = fromPath.split('/').length - 1;
  return depth ? '../'.repeat(depth) : './';
}

export const btn = (cls, href, label, extra = '') => `<a class="${cls}" href="${esc(href)}"${extra}>${esc(label)}</a>`;

// Ngày dạng YYYY-MM-DD thành 04/10/2026 (tiếng Việt) hoặc 4 Oct 2026 (tiếng Anh).
export function formatDate(t, d) {
  const [y, m, day] = d.split('-').map(Number);
  if (t.lang === 'en') return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
  return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
