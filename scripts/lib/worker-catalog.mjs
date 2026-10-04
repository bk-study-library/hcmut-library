// Danh mục gọn cho Worker nhận bài (worker/src/catalog.mjs): môn, mã môn hiện tại, id mục đã dùng,
// sha256 tài liệu đang có (cả bản đã làm sạch lẫn file gốc người gửi tải lên) và sha256 tài liệu đã gỡ
// (blocked): file bị gỡ theo yêu cầu không gửi lại được qua form.
//
// JS chuẩn, không dùng node:*, để Worker import chung. validate.mjs --write ghi kết quả ra
// worker-catalog.json ở gốc repo (vài trăm KB), để Worker không phải đọc và parse cả index.json.

export const WORKER_CATALOG_VERSION = 1;

// index: dạng index.json (faculties[].courses[].items[]).
export function summarizeIndex(index) {
  const courses = [];
  const shas = [];
  const blocked = [];
  for (const faculty of index.faculties ?? []) {
    for (const c of faculty.courses ?? []) {
      const items = c.items ?? [];
      courses.push({ id: c.id, code: c.code, status: c.status, ids: items.map((i) => i.id) });
      for (const it of items) {
        const into = it.removed ? blocked : shas;
        for (const f of it.files ?? []) {
          if (f.sha256) into.push(f.sha256);
          if (f.uploadSha256) into.push(f.uploadSha256);
        }
      }
    }
  }
  return { courses, shas, blocked };
}

// Nội dung worker-catalog.json: một dòng mỗi môn cho gọn mà vẫn đọc được diff.
export function workerCatalog(index) {
  return { schemaVersion: WORKER_CATALOG_VERSION, ...(index.generated ? { generated: index.generated } : {}), ...summarizeIndex(index) };
}

export function serializeWorkerCatalog(index) {
  const c = workerCatalog(index);
  const rows = (list) => (list.length ? `[\n${list.map((x) => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]` : '[]');
  const generated = c.generated ? `\n  "generated": ${JSON.stringify(c.generated)},` : '';
  return `{\n  "schemaVersion": ${c.schemaVersion},${generated}\n  "courses": ${rows(c.courses)},\n  "shas": ${rows(c.shas)},\n  "blocked": ${rows(c.blocked)}\n}\n`;
}
