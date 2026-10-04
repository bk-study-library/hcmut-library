// Môn trùng tên (Đồ án tốt nghiệp, Thực tập ngoài trường, Luận văn thạc sĩ phần 1...): mỗi môn có một ngữ cảnh
// ngắn để phân biệt, ví dụ "Kỹ thuật Hóa học" hay "Kỹ thuật Cơ điện tử, khóa 2019 đến 2022".
// Chỉ web dùng (trang môn, bảng môn của khoa, ô tìm trang chủ, form gửi tài liệu), không thuộc hợp đồng v1.

import { LEVELS, isPostgrad } from './labels.mjs';

// Khóa so tên: bỏ khác biệt chữ hoa, chữ thường và khoảng trắng ("Đồ án Tốt nghiệp" và "Đồ án tốt nghiệp" là một).
// search.js dùng cùng cách so để gộp kết quả.
export function nameKey(name) {
  return String(name || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Nhóm môn cùng tên: Map khóa tên -> danh sách id (chỉ nhóm có từ 2 môn).
export function sameNameGroups(courses) {
  const groups = new Map();
  for (const c of courses) {
    const k = nameKey(c.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c.id);
  }
  for (const [k, ids] of groups) if (ids.length < 2) groups.delete(k);
  return groups;
}

// Năm khóa gọn thành đoạn liền: [2019, 2020, 2021, 2024] -> "2019 đến 2021, 2024".
export function yearRanges(years, range) {
  const ys = [...new Set(years.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < ys.length; i++) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++;
    out.push(j > i ? range(ys[i], ys[j]) : String(ys[i]));
    i = j;
  }
  return out.join(', ');
}

// Ngữ cảnh cho mọi môn nằm trong nhóm trùng tên. Trả về Map id -> chữ.
//   courses: Map id -> môn (có programs: [{ program, block }] như index trong bộ nhớ)
//   programs: Map mã -> chương trình; majors: Map mã -> ngành; faculties: Map khóa -> khoa
//   t: chữ của một ngôn ngữ (strings.mjs): contextMore, contextCohorts, yearRange, levelName
//   listed: chương trình nào được tính (bản nháp nguồn không tính)
export function courseContexts({ courses, programs, majors, faculties, t, listed = () => true, groups = sameNameGroups(courses.values()) }) {
  const lang = t.lang;
  const majorName = (m) => (lang === 'en' && m.nameEn ? m.nameEn : m.name);
  const facultyName = (f) => (f ? f.name[lang] || f.name.vi : '');
  const out = new Map();
  for (const ids of groups.values()) {
    const info = ids.map((id) => {
      const c = courses.get(id);
      const byMajor = new Map();
      const years = [];
      for (const ref of c.programs || []) {
        const p = programs.get(ref.program);
        if (!p || !listed(p)) continue;
        if (p.year) years.push(p.year);
        const m = p.major ? majors.get(p.major) : null;
        if (!m) continue;
        byMajor.set(m.code, { m, n: (byMajor.get(m.code)?.n || 0) + 1 });
      }
      return { c, majors: [...byMajor.values()], years };
    });
    // Cùng tên mà có cả môn đại học lẫn sau đại học: ngành sau đại học ghi thêm bậc.
    const levels = new Set(info.flatMap((x) => x.majors.map(({ m }) => (isPostgrad(m) ? m.level : 'dai-hoc'))));
    const label = (m) => (levels.size > 1 && isPostgrad(m) && LEVELS[m.level] ? t.levelName(LEVELS[m.level][lang], majorName(m)) : majorName(m));
    for (const x of info) {
      const names = [...new Set(x.majors.sort((a, b) => b.n - a.n || label(a.m).localeCompare(label(b.m), lang)).map(({ m }) => label(m)))];
      x.text = !names.length ? facultyName(faculties.get(x.c.faculty)) : names.length <= 2 ? names.join(', ') : t.contextMore(names[0], names.length - 1);
    }
    // Hai môn cùng tên vẫn trùng ngữ cảnh (cùng ngành, khác khóa): ghi thêm các khóa có môn đó.
    const seen = new Map();
    for (const x of info) seen.set(x.text, (seen.get(x.text) || 0) + 1);
    for (const x of info) {
      const ys = seen.get(x.text) > 1 && x.years.length ? yearRanges(x.years, t.yearRange) : '';
      const text = [x.text, ys ? t.contextCohorts(ys) : ''].filter(Boolean).join(', ');
      if (text) out.set(x.c.id, text);
    }
  }
  return out;
}
