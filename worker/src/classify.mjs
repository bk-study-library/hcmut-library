// Form phân loại của người duyệt cho tài liệu Chưa phân loại (trường unclassified, scripts/upload/triage.mjs): hàm thuần
// dựng trang và item mới. Route ở routes/classify.mjs; luật các ô dùng chung validateMeta của validate.mjs.
import { TYPES, EXAM_KINDS } from '../../scripts/lib/labels.mjs';
import { S } from '../../scripts/lib/strings.mjs';
import { extensionsFor } from '../../scripts/lib/extensions.mjs';
import { esc, htmlPage } from './view.mjs';

// Ô người duyệt sửa được, theo thứ tự trên form. Môn, file, giấy phép giữ nguyên (đổi môn là bài khác).
export const CLASSIFY_FIELDS = ['type', 'title', 'term', 'examKind', 'chapter', 'teacher', 'description'];
// Loại không chọn được: link đi theo Issue, sách tham khảo không có file.
const NOT_FILE_TYPES = new Set(['link', 'book-ref']);

export const CLASSIFY_MESSAGES = {
  title: (t) => `Phân loại: ${t}`,
  intro: 'Tài liệu đã đăng nhưng máy chưa chắc chắn. Sửa các ô cho đúng rồi bấm Lưu: bot mở PR, dựng lại dữ liệu và merge khi check qua; tài liệu rời mục Chưa phân loại.',
  reasons: 'Lý do chưa phân loại',
  viewFile: 'Xem file',
  type: 'Loại tài liệu',
  titleLabel: 'Tiêu đề',
  term: 'Học kỳ (dạng HK251)',
  termUnknown: 'Không rõ học kỳ (đề tổng hợp, đề mẫu)',
  examKind: 'Loại kiểm tra',
  none: 'Không ghi',
  chapter: 'Chương',
  teacher: 'Giảng viên',
  description: 'Mô tả',
  save: 'Lưu phân loại',
  notUnclassified: 'Tài liệu này không nằm trong mục Chưa phân loại.',
  typeExt: (ext) => `Loại này không nhận file ${ext}. Chọn loại khác.`,
  saved: 'Đã lưu. Bot đang dựng lại dữ liệu; tài liệu rời mục Chưa phân loại sau khi merge (vài phút).',
  pending: 'Tài liệu này đang có một lần phân loại chờ merge. Đợi merge xong rồi sửa tiếp.',
  back: 'Về danh sách Chưa phân loại',
  resultTitle: 'Kết quả phân loại',
};

// Loại hợp lệ cho file của item: loại có file và nhận đuôi file hiện có.
export function fileTypes(policy, item) {
  const ext = String(item?.files?.[0]?.name ?? '').replace(/^.*(\.[^.]+)$/, '$1').toLowerCase();
  return policy.openTypes.filter((t) => !NOT_FILE_TYPES.has(t) && (!ext || extensionsFor(policy, t).includes(ext)));
}

// Item sau khi phân loại: ô của form thay ô cũ (ô trống thì bỏ), bỏ unclassified, giữ thứ tự khóa cũ.
export function applyClassification(item, meta) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (k === 'unclassified') continue;
    if (CLASSIFY_FIELDS.includes(k)) {
      if (meta[k] !== undefined) out[k] = meta[k];
    } else out[k] = v;
  }
  for (const k of CLASSIFY_FIELDS) if (meta[k] !== undefined && !(k in out)) out[k] = meta[k];
  return out;
}

const field = (label, name, inner, error) =>
  `<p class="f"><label for="${name}">${esc(label)}</label>${inner}${error ? `<span class="warn small">${esc(error)}</span>` : ''}</p>`;

// values: giá trị đang hiện (item, hay ô vừa gửi khi có lỗi). errors: lỗi theo ô.
export function classifyPage({ item, policy, values = item, errors = {}, action, listUrl }) {
  const m = CLASSIFY_MESSAGES;
  const v = (k) => String(values[k] ?? '');
  const reasons = (item.unclassified || []).map((r) => S.vi.unclassifiedReasons[r] || r).join(', ');
  const url = item.files?.[0]?.url;
  const options = (list, current, label) => list.map((k) => `<option value="${esc(k)}"${k === current ? ' selected' : ''}>${esc(label(k))}</option>`).join('');
  const parts = [`<p class="muted">${esc(m.intro)}</p>`];
  if (reasons) parts.push(`<p class="warn">${esc(m.reasons)}: ${esc(reasons)}</p>`);
  if (typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(url)) parts.push(`<p class="actions"><a class="btn subtle" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(m.viewFile)}</a></p>`);
  parts.push(
    `<form method="post" action="${esc(action)}">`,
    field(m.type, 'type', `<select id="type" name="type">${options(fileTypes(policy, item), v('type'), (k) => TYPES[k]?.vi ?? k)}</select>`, errors.type),
    field(m.titleLabel, 'title', `<input id="title" name="title" required maxlength="${policy.fields.titleMax}" value="${esc(v('title'))}">`, errors.title),
    field(m.term, 'term', `<input id="term" name="term" pattern="HK[0-9]{3}" value="${esc(v('term'))}">`, errors.term),
    `<p class="f"><label><input type="checkbox" name="termUnknown"${values.termUnknown ? ' checked' : ''}> ${esc(m.termUnknown)}</label></p>`,
    field(m.examKind, 'examKind', `<select id="examKind" name="examKind"><option value="">${esc(m.none)}</option>${options(policy.fields.examKinds, v('examKind'), (k) => EXAM_KINDS[k] ?? k)}</select>`, errors.examKind),
    field(m.chapter, 'chapter', `<input id="chapter" name="chapter" maxlength="${policy.fields.chapterMax}" value="${esc(v('chapter'))}">`, errors.chapter),
    field(m.teacher, 'teacher', `<input id="teacher" name="teacher" maxlength="${policy.fields.teacherMax}" value="${esc(v('teacher'))}">`, errors.teacher),
    field(m.description, 'description', `<textarea id="description" name="description" maxlength="${policy.fields.descriptionMax}">${esc(v('description'))}</textarea>`, errors.description),
    `<div class="bar"><a class="small" href="${esc(listUrl)}">${esc(m.back)}</a><button class="btn" type="submit">${esc(m.save)}</button></div></form>`,
  );
  return htmlPage(Object.keys(errors).length ? 400 : 200, m.title(String(item.title ?? item.id)), parts.join(''), {}, { formSelf: true });
}

export function classifyResult(message, listUrl, ok = true) {
  return htmlPage(ok ? 200 : 409, CLASSIFY_MESSAGES.resultTitle, `<p${ok ? '' : ' class="warn"'}>${esc(message)}</p><p class="actions"><a class="btn" href="${esc(listUrl)}">${esc(CLASSIFY_MESSAGES.back)}</a></p>`);
}
