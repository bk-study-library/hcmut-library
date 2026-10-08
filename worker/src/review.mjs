// Duyệt ngay trên trang /xem-duyet/<mã>: người duyệt chọn Duyệt hay Không duyệt cho từng file của
// bài (đợt gửi), ghi lý do khi không duyệt, rồi bấm Hoàn tất. Worker ghi quyết định vào bucket quarantine
// (review/<mã>.json), bỏ file không duyệt khỏi PR và merge hay đóng PR thay người duyệt.
// Phần này là hàm thuần để test; gọi GitHub và R2 nằm ở routes/review.mjs.

export const reviewKey = (code) => `review/${code}.json`;

// Người duyệt sửa một item qua form (routes/item-edit.mjs): mỗi loại một tiền tố branch <loại>/<mã>, một label, tiêu đề
// PR và tiêu đề merge. Cron merge và xóa branch như nhau cho mọi loại (routes/review.mjs, continueMerge).
export const EDIT_KINDS = {
  'phan-loai': { label: 'phan-loai', title: (x) => `Phân loại ${x}`, merge: (code) => `Gộp phân loại ${code} (người duyệt)` },
  go: { label: 'go-tai-lieu', title: (x) => `Gỡ tài liệu ${x}`, merge: (code) => `Gộp gỡ tài liệu ${code} (người duyệt)` },
};

// id mục: phần tên file của courses/<môn>/items/<id>.json.
export const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const REASON_MAX = 500;

export const REVIEW_MESSAGES = {
  missing: 'Chưa chọn Duyệt hay Không duyệt cho mọi file.',
  reason: 'File không duyệt cần chọn lý do, hoặc ghi lý do (ít nhất 5 ký tự) khi chọn Lý do khác.',
  long: `Lý do quá dài. Rút xuống tối đa ${REASON_MAX} ký tự.`,
  checks: 'Bài chưa qua bước kiểm file trên GitHub (đang chạy hoặc lỗi). Đợi bước kiểm xong rồi duyệt lại.',
  closed: 'PR của bài đã đóng hoặc đã merge.',
  stale: 'Bài vừa có thay đổi mới. Tải lại trang rồi duyệt lại.',
  done: 'Đã duyệt xong. PR đã được merge; file sẽ lên thư viện sau vài phút.',
  rejected: 'Đã đóng bài: không file nào được duyệt. Người gửi được báo lý do nếu có để lại email.',
  waiting: (n) => `Đã bỏ ${n} file khỏi bài. GitHub đang dựng lại dữ liệu; PR sẽ tự merge khi bước kiểm qua.`,
};

// Check run của commit: đã xong hết và không cái nào lỗi. Không có check nào thì coi là chưa xong.
export function checksGreen(runs) {
  if (!Array.isArray(runs) || !runs.length) return false;
  return runs.every((r) => r.status === 'completed' && ['success', 'skipped', 'neutral'].includes(r.conclusion));
}

// Chữ lý do: bỏ ký tự điều khiển, gộp khoảng trắng, cắt hai đầu.
export function cleanReason(s) {
  return String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

// Lý do hay gặp, chọn nhanh trên trang duyệt (p-<id>); ô r-<id> ghi thêm. "khac" thì bắt buộc ghi.
export const REVIEW_REASONS = [
  ['trung', 'Trùng tài liệu đã có trong thư viện'],
  ['sai-mon', 'Sai môn hoặc sai loại tài liệu'],
  ['chat-luong', 'File mờ, thiếu trang hoặc khó đọc'],
  ['ca-nhan', 'Có thông tin cá nhân chưa xóa'],
  ['ban-quyen', 'Không rõ quyền chia sẻ (sách, tài liệu có bản quyền)'],
  ['khac', 'Lý do khác'],
];

// fields: các ô của form duyệt (d-<id> = keep | drop, p-<id> = lý do chọn sẵn, r-<id> = ghi thêm).
// all=keep: nút Duyệt tất cả. ids: mục đang có trên branch.
// Trả { ok, keep: [id], drop: [{ id, reason }] } hoặc { ok: false, error }.
export function parseDecisions(fields, ids) {
  if (fields.all === 'keep') return { ok: true, keep: [...ids], drop: [] };
  const keep = [];
  const drop = [];
  for (const id of ids) {
    const d = fields[`d-${id}`];
    if (d === 'keep') keep.push(id);
    else if (d === 'drop') {
      const preset = REVIEW_REASONS.find(([k]) => k === fields[`p-${id}`] && k !== 'khac');
      const extra = cleanReason(fields[`r-${id}`]);
      if (!preset && extra.length < 5) return { ok: false, error: REVIEW_MESSAGES.reason };
      const reason = preset ? (extra ? `${preset[1]}. ${extra}` : preset[1]) : extra;
      if (reason.length > REASON_MAX) return { ok: false, error: REVIEW_MESSAGES.long };
      drop.push({ id, reason });
    } else return { ok: false, error: REVIEW_MESSAGES.missing };
  }
  return { ok: true, keep, drop };
}

// Chữ lý do trong comment PR: không để @ (gọi tên người), # (link issue), dấu bảng hay HTML có tác dụng.
const md = (s) => String(s).replace(/[&<>@#[\]|`*_]/g, (c) => `&#${c.charCodeAt(0)};`);

// Comment ghi kết quả duyệt vào PR. Không ghi tên hay email người duyệt (PR công khai); email nằm
// trong review/<mã>.json để tra khi cần.
export function decisionComment({ keep, drop, pending = false }) {
  const lines = ['Kết quả duyệt (người duyệt xác nhận qua trang duyệt của thư viện):', ''];
  if (keep.length) lines.push('Được duyệt:', ...keep.map((id) => `- \`${id}\``), '');
  if (drop.length) lines.push('Không duyệt:', ...drop.map((d) => `- \`${d.id}\`: ${md(d.reason)}`), '');
  if (pending) lines.push('Các file không duyệt đã được bỏ khỏi PR. PR sẽ tự merge khi GitHub dựng lại dữ liệu và bước kiểm qua.');
  else if (!keep.length) lines.push('Không file nào được duyệt, PR được đóng.');
  return `${lines.join('\n').trim()}\n`;
}
