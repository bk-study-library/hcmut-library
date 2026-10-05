// Nhãn chương trình của một mã môn ("CQ", "CTTT, CQ", "Thạc sĩ"; mã viết tắt từ program-types.mjs): mã này dạy cho hệ nào,
// để phân biệt các mã của cùng một môn. Chỉ web dùng (trang môn theo tên, ô tìm, form gửi), không thuộc v1.
//
// Thứ tự ưu tiên: phần ngoặc cuối tên nếu nó gọi tên chương trình ("Giải tích 2 (CT Tiên tiến)"); không thì loại
// của các chương trình (được liệt kê) có mã này, hai loại gặp nhiều nhất (sau đại học ghi bậc); không thuộc
// chương trình nào thì tên khoa bỏ chữ "Khoa".

import { LEVELS, isPostgrad } from './labels.mjs';
import { PROGRAM_TYPES } from './program-types.mjs';

// Phần ngoặc cuối gọi tên chương trình (không phải tên ngành): CT Tiên tiến, Việt Pháp, PFIEV, Tài năng...
const PROGRAM_TAIL = /(ti[eê]n ti[eế]n|vi[eệ]t ph[aá]p|pfiev|t[aà]i n[aă]ng|ti[eế]ng anh|ch[aấ]t l[uư][oợ]ng cao|song ng[aà]nh|nh[aậ]t b[aả]n|v[uừ]a l[aà]m|chuy[eể]n ti[eế]p|\bclc\b|\bcttt\b|\bctta\b)/i;
const TAIL = /\(([^()]*)\)\s*$/;

export function programTail(name) {
  const m = TAIL.exec(String(name || ''));
  return m && PROGRAM_TAIL.test(m[1]) ? m[1].replace(/\s+/g, ' ').trim() : '';
}

const typeText = (type) => PROGRAM_TYPES[type]?.abbr ?? type;
const facultyShort = (f, lang) => (f ? String(f.name[lang] || f.name.vi).replace(/^(Khoa|Faculty of)\s+/i, '') : '');

// Loại chương trình (type) của các chương trình có mã này, không trùng, theo thứ tự order. Dùng cho ô lọc Hệ.
export function courseTypes(course, { programs, listed = () => true, order = [] }) {
  const seen = new Set();
  for (const ref of course.programs || []) {
    const p = programs.get(ref.program);
    if (p && listed(p) && p.type) seen.add(p.type);
  }
  const rank = (x) => (order.indexOf(x) < 0 ? order.length : order.indexOf(x));
  return [...seen].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

//   course: môn (name, nameEn, faculty, programs: [{ program }])
//   programs: Map mã -> chương trình; faculties: Map khóa -> khoa; order: thứ tự loại (programTypeOrder)
export function programLabel(course, { programs, faculties, lang = 'vi', listed = () => true, order = [] }) {
  const tail = programTail(lang === 'en' && course.nameEn && programTail(course.nameEn) ? course.nameEn : course.name);
  if (tail) return tail;
  const count = new Map();
  const seen = new Set();
  for (const ref of course.programs || []) {
    const p = programs.get(ref.program);
    if (!p || !listed(p) || seen.has(p.code)) continue;
    seen.add(p.code);
    const key = isPostgrad(p) ? `level:${p.level}` : p.type || 'CQ';
    count.set(key, (count.get(key) || 0) + 1);
  }
  const rank = (k) => (k.startsWith('level:') ? order.length + 1 : order.indexOf(k) < 0 ? order.length : order.indexOf(k));
  const top = [...count]
    .sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([k]) => (k.startsWith('level:') ? (LEVELS[k.slice(6)] || { [lang]: k.slice(6) })[lang] : typeText(k, lang)));
  if (top.length) return top.join(', ');
  return facultyShort(faculties.get(course.faculty), lang);
}
