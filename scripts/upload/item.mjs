// Dựng mục tài liệu từ phiếu nộp. Chỉ dùng JS chuẩn để Worker đóng gói được.

const OPTIONAL = ['description', 'term', 'chapter', 'examKind', 'teacher'];

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
  if (form.displayName) item.authors = [form.displayName];
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
