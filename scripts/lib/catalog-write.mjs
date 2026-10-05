// Ghi file dữ liệu trong catalog/ cho các script nhập (import-research, import-ctdt, import-sdh): thứ tự khóa
// chung, và updated chỉ đổi khi nội dung đổi. Dùng chung để chạy lại script nào cũng không làm xáo file do script
// khác ghi.
import fs from 'node:fs';

export const json = (o) => JSON.stringify(o, null, 2) + '\n';

// Thứ tự khóa của file môn, chương trình, ngành. Khóa không có trong danh sách đứng sau, giữ thứ tự cũ.
export const COURSE_ORDER = ['$schema', 'id', 'code', 'name', 'nameEn', 'credits', 'faculty', 'levels', 'aliases', 'status', 'replacedBy', 'replaces', 'programs', 'parts', 'related', 'handbookUrl', 'note', 'updated'];
export const PROGRAM_ORDER = ['$schema', 'code', 'name', 'nameEn', 'faculty', 'year', 'major', 'type', 'track', 'level', 'orientation', 'degree', 'totalCredits', 'variant', 'listed', 'note', 'reviewNote', 'source', 'ctdtUrl', 'planUrl', 'handbookUrl', 'groups', 'blocks', 'updated'];
export const MAJOR_ORDER = ['code', 'name', 'nameEn', 'faculty', 'level', 'programTypes', 'aliases', 'handbookUrl', 'note'];

export function ordered(obj, order) {
  const o = {};
  for (const k of order) if (obj[k] !== undefined) o[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in o) && obj[k] !== undefined) o[k] = obj[k];
  return o;
}

// Bản ghi môn để ghi file: khóa theo COURSE_ORDER, mục programs xếp theo mã chương trình rồi khối. Thứ tự cố định
// nên chạy các script nhập theo thứ tự nào cũng ra cùng file.
export function courseRecord(c) {
  const programs = c.programs ? [...c.programs].sort((a, b) => a.program.localeCompare(b.program) || String(a.block).localeCompare(String(b.block))) : c.programs;
  return ordered({ ...c, programs }, COURSE_ORDER);
}

// Ghi file JSON; updated chỉ đổi khi nội dung (trừ updated) đổi.
export function writeKeepDate(p, obj, date) {
  if (fs.existsSync(p)) {
    const cur = JSON.parse(fs.readFileSync(p, 'utf8'));
    obj.updated = JSON.stringify({ ...cur, updated: null }) === JSON.stringify({ ...obj, updated: null }) ? cur.updated : date;
  }
  fs.writeFileSync(p, json(obj));
}
