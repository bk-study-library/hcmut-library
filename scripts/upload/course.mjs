// Dựng file catalog/courses/<MÃ>.json cho môn mới người gửi đề xuất kèm bài qua form.
// Chỉ dùng JS chuẩn để Worker đóng gói được. Người duyệt kiểm mã và tên trên Sổ tay rồi mới gộp.
import { inferParts } from '../lib/parts.mjs';

export const NEW_COURSE_NOTE = 'Môn mới do người gửi đề xuất, chờ người duyệt xác nhận.';
const COURSE_SCHEMA = '../../schema/course.schema.json';

// Đường dẫn file môn mới trong repo (Worker ghi, kiem-file cho phép trong PR của bài).
export const newCoursePath = (code) => `catalog/courses/${code}.json`;

// Khoa theo tiền tố đầu tiên khớp trong catalog/faculties.json (prefixes); không khớp thì unknown.
export function facultyFor(code, prefixes) {
  for (const p of prefixes ?? []) {
    try {
      if (new RegExp(p.pattern).test(code)) return p.faculty;
    } catch {
      // Mẫu hỏng thì bỏ qua; validate.mjs báo lỗi mẫu này.
    }
  }
  return 'unknown';
}

// Link trang môn trên Sổ tay từ mẫu handbookSubjectUrl của catalog/site.json ({code} là chỗ điền mã).
// Mẫu trống, không có {code} hay không phải https thì không có link.
export function handbookUrlFor(code, template) {
  const t = String(template ?? '');
  if (!t.startsWith('https://') || !t.includes('{code}')) return null;
  return t.replace('{code}', encodeURIComponent(code));
}

// code đã qua mẫu mã môn của schema, name đã qua kiểm của Worker.
export function buildNewCourse({ code, name, today, prefixes, handbookTemplate }) {
  const course = {
    $schema: COURSE_SCHEMA,
    id: code,
    code,
    name,
    faculty: facultyFor(code, prefixes),
    aliases: [],
    status: 'active',
    programs: [],
    parts: inferParts(name),
    related: [],
  };
  const handbookUrl = handbookUrlFor(code, handbookTemplate);
  if (handbookUrl) course.handbookUrl = handbookUrl;
  course.note = NEW_COURSE_NOTE;
  course.updated = today;
  return course;
}
