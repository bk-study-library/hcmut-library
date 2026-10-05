// Bảng môn và dòng môn trên trang khoa, chương trình, ngành.
import { STATUS } from '../lib/labels.mjs';
import { state } from './state.mjs';
import { esc, pagePath } from './html.mjs';

export function itemsCountOf(course) {
  return course.items.filter((i) => !i.removed).length;
}

// Một dòng môn: link tới trang môn theo tên khi mã thuộc môn nhiều mã.
export function courseRow(t, c, root) {
  const href = `${root}${pagePath(t.lang, state.page.path(c.id))}`;
  const n = itemsCountOf(c);
  return `<tr${c.status === 'retired' ? ' class="retired"' : ''}><th scope="row"><a href="${href}">${esc(c.code)}</a></th><td><a href="${href}">${esc(t.lang === 'en' && c.nameEn ? c.nameEn : c.name)}</a>${c.status === 'retired' ? ` <span class="tag">${esc(STATUS.retired[t.lang])}</span>` : ''}</td><td class="num">${c.credits ?? ''}</td><td class="num">${n || `<span class="muted">${esc(t.noMaterial)}</span>`}</td></tr>`;
}

// Bảng dài (vài trăm môn ở trang khoa): trình duyệt bỏ qua phần ngoài màn hình khi vẽ (CSS .table-wrap.long).
export const LONG_TABLE = 60;

// Môn có tài liệu lên trước, môn chưa có xuống sau, giữ thứ tự cũ trong mỗi phần (chỉ đổi thứ tự).
export function docsFirst(courses) {
  return [...courses.filter((c) => itemsCountOf(c) > 0), ...courses.filter((c) => !itemsCountOf(c))];
}

export function courseTableHtml(t, courses, root, caption) {
  return `<div class="table-wrap${courses.length > LONG_TABLE ? ' long' : ''}"><table><caption class="sr">${esc(caption)}</caption><thead><tr><th scope="col">${esc(t.code)}</th><th scope="col">${esc(t.name)}</th><th scope="col" class="num">${esc(t.credits)}</th><th scope="col" class="num">${esc(t.materials)}</th></tr></thead><tbody>${courses
    .map((c) => courseRow(t, c, root))
    .join('')}</tbody></table></div>`;
}

// Bảng môn: môn có tài liệu trước. Bảng dài (từ state.page.collapseMin môn, noDocsCollapseMin trong site.json): môn
// chưa có tài liệu gập trong "Môn chưa có tài liệu (N)".
export function courseTable(t, courses, root, caption) {
  if (!courses.length) return `<p class="muted">${esc(t.noCourses)}</p>`;
  const list = docsFirst(courses);
  const empty = list.filter((c) => !itemsCountOf(c));
  if (courses.length < state.page.collapseMin || !empty.length) return courseTableHtml(t, list, root, caption);
  const withDocs = list.filter((c) => itemsCountOf(c) > 0);
  return `${withDocs.length ? courseTableHtml(t, withDocs, root, caption) : ''}<details class="no-docs"><summary>${esc(t.noDocsCourses(empty.length))}</summary>${courseTableHtml(t, empty, root, caption)}</details>`;
}

export function facultyName(t, f) {
  return f ? f.name[t.lang] || f.name.vi : '';
}
