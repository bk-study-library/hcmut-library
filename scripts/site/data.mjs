// Dữ liệu cho ô tìm trên web (assets/courses.json, assets/items.json): chỉ web dùng, không thuộc hợp đồng v1.
import { EXAM_KINDS, TYPE_ORDER, DEFAULT_LEVEL } from '../lib/labels.mjs';
import { truncate } from './html.mjs';

// Danh sách tài liệu cho ô tìm trang chủ (chỉ web dùng, không thuộc hợp đồng v1): mục chưa gỡ,
// mới thêm trước. url là link tới mục trên trang môn (trang môn theo tên nếu mã thuộc môn nhiều mã), tính
// từ gốc site (bản tiếng Anh thêm en/). courseName là tên môn theo tên khi có.
//   pageOf(id) -> { path, name, nameEn, anchor(it) }; không truyền thì là trang course/<ID>/ của mã đó.
export function docIndex(items, courses, { descriptionMax = 200, pageOf = null } = {}) {
  const rows = [];
  for (const it of items) {
    if (it.removed) continue;
    const c = courses.get(it.course);
    if (!c) continue;
    const page = pageOf ? pageOf(c.id) : { path: `course/${c.id}/`, name: c.name, nameEn: c.nameEn, anchor: (x) => x.id };
    const row = { id: it.id, course: c.id, code: c.code, courseName: page.name };
    if (page.nameEn) row.courseNameEn = page.nameEn;
    row.faculty = c.faculty;
    row.title = it.title;
    if (it.description) row.description = truncate(it.description, descriptionMax);
    row.type = it.type;
    for (const k of ['term', 'examKind', 'chapter', 'teacher']) if (it[k]) row[k] = it[k];
    // Bậc của môn, chỉ ghi khi khác mặc định (đại học), cho ô lọc Bậc.
    if (Array.isArray(c.levels) && c.levels.length && !(c.levels.length === 1 && c.levels[0] === DEFAULT_LEVEL)) row.levels = c.levels;
    row.added = it.added;
    row.url = `${page.path}#${page.anchor(it)}`;
    rows.push(row);
  }
  return rows.sort((a, b) => b.added.localeCompare(a.added) || a.course.localeCompare(b.course) || a.id.localeCompare(b.id));
}

// Danh sách môn cho ô tìm trang chủ và form Gửi tài liệu (chỉ web dùng, không thuộc hợp đồng v1): cùng dạng
// với v1/index.json (search-core.js đọc được như nhau) nhưng bỏ trường ô tìm không dùng (url, detail, credits,
// replacedBy), bỏ giá trị mặc định (aliases, oldNames rỗng; status active), để tải nhẹ hơn. progs: số chương
// trình có mã này, để form chọn mã mặc định của môn nhiều mã (subject-core.js pickCode). Môn theo tên không
// ghi ở đây: trình duyệt tự gộp bằng subject-core.js, cùng quy tắc với build.
// extra: Map id -> { prog, progEn, types }: nhãn chương trình của mã (scripts/lib/program-label.mjs) và loại
// chương trình có mã này, cho ô lọc Hệ.
export function searchCourses(v1Index, progs = new Map(), extra = new Map()) {
  return {
    faculties: v1Index.faculties,
    courses: v1Index.courses.map((c) => {
      const row = { id: c.id, code: c.code, name: c.name };
      if (c.nameEn) row.nameEn = c.nameEn;
      row.faculty = c.faculty;
      if (c.levels) row.levels = c.levels;
      if (c.aliases && c.aliases.length) row.aliases = c.aliases;
      if (c.oldNames && c.oldNames.length) row.oldNames = c.oldNames;
      if (c.status !== 'active') row.status = c.status;
      if (c.items) row.items = c.items;
      if (c.teachers) row.teachers = c.teachers;
      if (progs.get(c.id)) row.progs = progs.get(c.id);
      const x = extra.get(c.id);
      if (x && x.prog) row.prog = x.prog;
      if (x && x.progEn && x.progEn !== x.prog) row.progEn = x.progEn;
      if (x && x.types && x.types.length) row.types = x.types;
      return row;
    }),
  };
}

// Giá trị cho ô lọc tài liệu, chỉ gồm giá trị có trong danh sách: loại theo TYPE_ORDER,
// học kỳ mới nhất trước, kỳ thi theo thứ tự của EXAM_KINDS.
export function docFilterValues(docs) {
  const has = (k) => new Set(docs.map((d) => d[k]).filter(Boolean));
  const types = has('type');
  const kinds = has('examKind');
  return {
    types: TYPE_ORDER.filter((x) => types.has(x)),
    terms: [...has('term')].sort().reverse(),
    examKinds: Object.keys(EXAM_KINDS).filter((x) => kinds.has(x)),
  };
}

// Chương trình có listed: false (bản nháp nguồn) vẫn có trang riêng nhưng không vào danh sách.
export const isListed = (p) => p.listed !== false;
