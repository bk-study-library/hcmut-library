// Form gỡ tài liệu của người duyệt (TAKEDOWN.md): hàm thuần dựng trang và item đã gỡ. Route ở routes/remove.mjs.
import { scanText } from '../../scripts/lib/pii.mjs';
import { TYPES } from '../../scripts/lib/labels.mjs';
import { esc, htmlPage } from './view.mjs';

// Lý do gỡ chọn sẵn (theo form Yêu cầu gỡ, .github/ISSUE_TEMPLATE/yeu-cau-go.yml). removedReason là chữ công khai trên
// web và v1, nên chỉ ghi lý do, không ghi thông tin cá nhân.
export const REMOVE_REASONS = [
  ['ban-quyen', 'Vi phạm bản quyền'],
  ['ca-nhan', 'Có thông tin cá nhân'],
  ['rut-lai', 'Người gửi rút lại'],
  ['sach', 'File sách có bản quyền'],
  ['sai', 'Sai môn hay sai nội dung'],
  ['trung', 'Trùng tài liệu đã có'],
];
const NOTE_MAX = 200;

export const REMOVE_MESSAGES = {
  lookupTitle: 'Gỡ tài liệu',
  lookupIntro: 'Dán tiêu đề issue Yêu cầu gỡ (dạng [Gỡ] MT1005 slide-chuong-1), hay ghi mã môn và id tài liệu.',
  lookupLabel: 'Tài liệu cần gỡ',
  lookupBad: 'Không đọc được mã môn và id. Ghi dạng MT1005 slide-chuong-1.',
  open: 'Mở',
  title: (t) => `Gỡ: ${t}`,
  intro: 'Gỡ thì file bị xóa khỏi Release sau khi merge; trang môn và v1 chỉ còn id, loại, lý do. Item vẫn giữ để link cũ không hỏng. Không gỡ ngược được, gửi lại thì là bài mới.',
  reason: 'Lý do gỡ',
  note: 'Ghi thêm (không bắt buộc, công khai, không ghi thông tin cá nhân)',
  reasonMissing: 'Chọn một lý do.',
  noteLong: `Phần ghi thêm tối đa ${NOTE_MAX} ký tự.`,
  notePii: 'Phần ghi thêm có thể có thông tin cá nhân (email, số điện thoại, MSSV). Bỏ phần đó.',
  confirm: 'Tôi đã đọc yêu cầu gỡ và đồng ý gỡ tài liệu này.',
  confirmMissing: 'Đánh dấu ô xác nhận.',
  submit: 'Gỡ tài liệu',
  already: 'Tài liệu này đã gỡ.',
  pending: 'Tài liệu này đang có một lần sửa (phân loại hay gỡ) chờ merge. Đợi merge xong rồi làm tiếp.',
  saved: 'Đã gửi yêu cầu gỡ. Bot dựng lại dữ liệu và merge khi check qua (vài phút); sau đó file trên Release bị xóa.',
  resultTitle: 'Kết quả gỡ tài liệu',
  back: 'Gỡ tài liệu khác',
};

// "[Gỡ] MT1005 slide-chuong-1", "MT1005/slide-chuong-1", "MT1005 slide-chuong-1" thành { course, id }, hay null.
export function parseTarget(text) {
  const m = /(?:^|[\s\]])([A-Z][A-Z0-9_]{2,11}(?:-[0-9]{4})?)[\s/]+([a-z0-9][a-z0-9-]*)\s*$/.exec(String(text ?? '').trim());
  return m ? { course: m[1], id: m[2] } : null;
}

// Lý do (chọn sẵn, kèm phần ghi thêm) từ form. Trả { reason } hay { errors }.
export function removalReason(fields) {
  const errors = {};
  const preset = REMOVE_REASONS.find(([k]) => k === fields.reason);
  const note = String(fields.note ?? '').trim().replace(/\s+/g, ' ');
  if (!preset) errors.reason = REMOVE_MESSAGES.reasonMissing;
  if (note.length > NOTE_MAX) errors.note = REMOVE_MESSAGES.noteLong;
  else if (scanText(note, { skipMarked: false }).length) errors.note = REMOVE_MESSAGES.notePii;
  if (!fields.confirm) errors.confirm = REMOVE_MESSAGES.confirmMissing;
  if (Object.keys(errors).length) return { errors };
  return { reason: note ? `${preset[1]}. ${note}` : preset[1] };
}

// Item đã gỡ: removed và removedReason, bỏ unclassified. Giữ id và files: workflow phat-hanh-file đọc url trong files để
// biết xóa file nào trên Release (TAKEDOWN.md).
export function applyRemoval(item, reason) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (k === 'unclassified' || k === 'removedReason') continue;
    out[k] = v;
    if (k === 'removed') out.removedReason = reason;
  }
  out.removed = true;
  if (!out.removedReason) out.removedReason = reason;
  return out;
}

// File .md nằm trong git của item (files[].path): xóa cùng lần gỡ.
export const gitFiles = (item) => (item.files || []).filter((f) => typeof f.path === 'string' && /^files\/[^/\\]+\.md$/.test(f.path)).map((f) => `courses/${item.course}/${f.path}`);

const warn = (e) => (e ? `<span class="warn small">${esc(e)}</span>` : '');

export function lookupPage({ value = '', error = '' } = {}) {
  const m = REMOVE_MESSAGES;
  const body = [
    `<p class="muted">${esc(m.lookupIntro)}</p>`,
    '<form method="get" action="/xem-duyet/go">',
    `<p class="f"><label for="t">${esc(m.lookupLabel)}</label><input id="t" name="t" required value="${esc(value)}">${warn(error)}</p>`,
    `<p class="actions"><button class="btn" type="submit">${esc(m.open)}</button></p></form>`,
  ].join('');
  return htmlPage(error ? 400 : 200, m.lookupTitle, body, {}, { formSelf: true });
}

export function removePage({ item, action, values = {}, errors = {} }) {
  const m = REMOVE_MESSAGES;
  const url = item.files?.[0]?.url;
  const parts = [`<p class="warn">${esc(m.intro)}</p>`, `<p class="muted">${esc([item.course, TYPES[item.type]?.vi ?? item.type, item.added].filter(Boolean).join(', '))}</p>`];
  if (typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(url)) parts.push(`<p class="actions"><a class="btn subtle" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Xem file</a></p>`);
  parts.push(
    `<form method="post" action="${esc(action)}"><fieldset><legend>${esc(m.reason)}</legend>`,
    REMOVE_REASONS.map(([k, label]) => `<p class="f"><label><input type="radio" name="reason" value="${esc(k)}"${values.reason === k ? ' checked' : ''} required> ${esc(label)}</label></p>`).join(''),
    `${warn(errors.reason)}</fieldset>`,
    `<p class="f"><label for="note">${esc(m.note)}</label><textarea id="note" name="note" maxlength="${NOTE_MAX}">${esc(values.note ?? '')}</textarea>${warn(errors.note)}</p>`,
    `<p class="f"><label><input type="checkbox" name="confirm" required${values.confirm ? ' checked' : ''}> ${esc(m.confirm)}</label>${warn(errors.confirm)}</p>`,
    `<div class="bar"><a class="small" href="/xem-duyet/go">${esc(m.back)}</a><button class="btn" type="submit">${esc(m.submit)}</button></div></form>`,
  );
  return htmlPage(Object.keys(errors).length ? 400 : 200, m.title(String(item.title ?? item.id)), parts.join(''), {}, { formSelf: true });
}

export function removeResult(message, ok = true) {
  const m = REMOVE_MESSAGES;
  return htmlPage(ok ? 200 : 409, m.resultTitle, `<p${ok ? '' : ' class="warn"'}>${esc(message)}</p><p class="actions"><a class="btn" href="/xem-duyet/go">${esc(m.back)}</a></p>`);
}
