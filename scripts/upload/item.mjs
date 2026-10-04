// Dựng mục tài liệu từ phiếu nộp. Chỉ dùng JS chuẩn để Worker đóng gói được.

const OPTIONAL = ['description', 'term', 'chapter', 'examKind', 'teacher'];

// Bỏ danh xưng và học hàm ở đầu ("Thầy", "Cô", "TS.", "PGS.TS."...) để cùng một giảng viên
// không thành nhiều tên khi tìm. Người duyệt vẫn sửa tay được trong PR.
const TEACHER_PREFIX = /^(?:(?:thầy|thay|cô|co|gv|giảng viên|giang vien|gs|pgs|ts|ths|tskh|ks|cn)(?:\.\s*|\s+))+/iu;

export function normalizeTeacher(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  const stripped = clean.replace(TEACHER_PREFIX, '').trim();
  return stripped || clean;
}

export function buildItem(form, file, today, id) {
  const item = {
    id,
    course: form.course,
    type: form.type,
    title: form.title,
    lang: form.lang,
    license: form.license,
    origin: 'self-made',
    added: today,
    removed: false,
  };
  for (const key of OPTIONAL) {
    if (form[key]) item[key] = form[key];
  }
  if (item.teacher) item.teacher = normalizeTeacher(item.teacher);
  if (form.displayName) item.authors = [form.displayName];
  // Bản cập nhật: tài liệu cũ bị ẩn khi bài này được duyệt (scripts/lib/repo.mjs). Email báo kết quả
  // (form.notifyEmail) không bao giờ ghi vào mục tài liệu.
  if (form.replaces) item.replaces = form.replaces;
  if (form.type === 'book-ref' && form.book) {
    item.book = form.book;
  } else if (file) {
    item.files = [{
      name: file.name,
      size: file.size,
      sha256: file.sha256,
      mime: file.mime,
      quarantine: file.quarantine,
    }];
    // sha256 file gốc: kiem-file thay sha256 bằng bản đã làm sạch, Worker vẫn cần bản gốc để chặn trùng.
    if (file.uploadSha256) item.files[0].uploadSha256 = file.uploadSha256;
  }
  return item;
}
