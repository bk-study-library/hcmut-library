// Dựng dữ liệu công khai /v1/ cho web và app BK Study Desk.
//
//   v1/index.json           danh sách môn (nhẹ, dùng để tìm và ghép môn)
//   v1/courses/<ID>.json    tài liệu của một môn
//
// Hợp đồng v1 (đổi tên, xóa hay đổi nghĩa trường thì ra /v2/, giữ /v1/ ít nhất 6 tháng):
// - Trường tùy chọn vắng mặt khi không có, không dùng null. Bên đọc bỏ qua trường lạ.
// - Ngày dạng YYYY-MM-DD. generated là ngày thay đổi gần nhất, để file không đổi khi dữ liệu không đổi.
// - Mục còn hiệu lực luôn có updated (ngày file đổi gần nhất, mặc định bằng added).
// - Mục đã gỡ chỉ còn id, type, removed, removedReason, added; bên đọc xóa bản lưu của mục đó.
// Mô tả cho người đọc: docs/v1.md.

import path from 'node:path';
import { SITE_URL, RAW_URL } from './labels.mjs';

export const SCHEMA_VERSION = 1;

const uniq = (list) => [...new Set(list)];

function latestDate(repo) {
  const dates = [];
  for (const c of repo.courses.values()) dates.push(c.updated);
  for (const p of repo.programs.values()) dates.push(p.updated);
  for (const it of repo.items) dates.push(it.added, it.updated);
  return dates.filter(Boolean).sort().pop() || null;
}

// Mỗi file cần ít nhất một link tải: link ngoài (+ mirrors), hoặc file .md nằm trong git
// (web phục vụ ở files/<ID>/<tên>, kèm bản raw trên GitHub làm dự phòng).
function fileUrls(courseId, f, site) {
  if (f.url) return uniq([f.url, ...(f.mirrors || [])]);
  if (f.path) {
    const name = f.path.split('/').pop();
    return [`${site}files/${encodeURIComponent(courseId)}/${encodeURIComponent(name)}`, `${RAW_URL}courses/${courseId}/${f.path}`];
  }
  return [];
}

const ITEM_FIELDS = ['id', 'type', 'title', 'description', 'lang', 'term', 'teacher', 'examKind', 'chapter', 'lab', 'license', 'origin', 'source', 'authors', 'added', 'example', 'book'];

// mime của file: ưu tiên giá trị ghi trong item, không có thì theo đuôi trong policy.
function fileMime(f, extensions) {
  if (f.mime) return f.mime;
  const ext = path.extname(f.name).toLowerCase();
  if (!extensions[ext]) throw new Error(`Không suy ra được mime của ${f.name}: đuôi ${ext || '(trống)'} không có trong catalog/policy.json`);
  return extensions[ext].mime;
}

function v1Item(it, site, extensions) {
  if (it.removed) return { id: it.id, type: it.type, removed: true, removedReason: it.removedReason, added: it.added };
  const out = {};
  for (const k of ITEM_FIELDS) {
    if (it[k] === undefined) continue;
    if (k === 'lab') out.lab = String(it.lab);
    else if (k === 'authors' && !it.authors.length) continue;
    else out[k] = it[k];
  }
  out.updated = it.updated || it.added;
  if (it.type === 'link') {
    out.url = it.url;
    return out;
  }
  if (it.type === 'book-ref') return out;
  // quarantine là chỗ chứa nội bộ, không bao giờ chép sang v1.
  const files = (it.files || []).map((f) => ({ name: f.name, mime: fileMime(f, extensions), size: f.size, sha256: f.sha256, urls: fileUrls(it.course, f, site) }));
  // Mục có file chưa tải lên chỗ nào thì chưa đưa ra ngoài.
  if (!files.length || files.some((f) => !f.urls.length)) return null;
  out.files = files;
  return out;
}

export function buildV1(repo, { site = SITE_URL } = {}) {
  const generated = latestDate(repo);
  const details = new Map();
  const counts = { courses: 0, items: 0 };
  const courses = [...repo.courses.values()].sort((a, b) => a.id.localeCompare(b.id));
  const itemsOf = new Map();
  for (const it of repo.items) {
    if (!itemsOf.has(it.course)) itemsOf.set(it.course, []);
    itemsOf.get(it.course).push(it);
  }

  const list = courses.map((c) => {
    const items = (itemsOf.get(c.id) || [])
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((it) => v1Item(it, site, repo.policy.extensions))
      .filter(Boolean);
    const live = items.filter((i) => !i.removed).length;
    counts.courses++;
    counts.items += live;
    details.set(c.id, { schemaVersion: SCHEMA_VERSION, id: c.id, code: c.code, name: c.name, items });

    const row = { id: c.id, code: c.code, name: c.name };
    if (c.nameEn) row.nameEn = c.nameEn;
    if (c.credits != null) row.credits = c.credits;
    row.faculty = c.faculty;
    row.aliases = uniq((c.aliases || []).map((a) => a.code).filter((x) => x !== c.code));
    row.oldNames = uniq((c.aliases || []).map((a) => a.name).filter((x) => x && x !== c.name));
    row.status = c.status;
    if (c.replacedBy) row.replacedBy = c.replacedBy;
    row.items = live;
    // Tên giảng viên ghi trong các mục còn hiệu lực, để tìm môn theo giảng viên.
    const teachers = uniq(items.filter((i) => !i.removed && i.teacher).map((i) => i.teacher)).sort((a, b) => a.localeCompare(b, 'vi'));
    if (teachers.length) row.teachers = teachers;
    row.url = `${site}course/${encodeURIComponent(c.id)}/`;
    row.detail = `courses/${c.id}.json`;
    return row;
  });

  const index = {
    schemaVersion: SCHEMA_VERSION,
    generated,
    site,
    counts,
    faculties: repo.faculties.faculties.map((f) => ({ key: f.key, name: f.name })),
    courses: list,
  };
  return { index, details };
}

// Danh sách [đường dẫn tính từ thư mục v1, nội dung].
export function serializeV1({ index, details }) {
  const out = [['index.json', JSON.stringify(index, null, 2) + '\n']];
  for (const [id, d] of details) out.push([`courses/${id}.json`, JSON.stringify(d, null, 2) + '\n']);
  return out;
}
