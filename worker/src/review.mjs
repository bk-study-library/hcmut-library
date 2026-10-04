// Duyệt ngay trên trang /xem-duyet/<mã>: người duyệt chọn Duyệt hay Không duyệt cho từng file của
// bài (đợt gửi), ghi lý do khi không duyệt, rồi bấm Hoàn tất. Worker ghi quyết định vào bucket quarantine
// (review/<mã>.json), bỏ file không duyệt khỏi PR và merge hay đóng PR thay người duyệt.
// Phần này là hàm thuần để test; gọi GitHub và R2 nằm ở index.mjs.

export const reviewKey = (code) => `review/${code}.json`;

// id mục: phần tên file của courses/<môn>/items/<id>.json.
export const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const REASON_MAX = 500;

export const REVIEW_MESSAGES = {
  missing: 'Chưa chọn Duyệt hay Không duyệt cho mọi file.',
  reason: 'File không duyệt cần ghi lý do (ít nhất 5 ký tự) để báo người gửi.',
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

// fields: các ô của form duyệt (d-<id> = keep | drop, r-<id> = lý do). ids: mục đang có trên branch.
// Trả { ok, keep: [id], drop: [{ id, reason }] } hoặc { ok: false, error }.
export function parseDecisions(fields, ids) {
  const keep = [];
  const drop = [];
  for (const id of ids) {
    const d = fields[`d-${id}`];
    if (d === 'keep') keep.push(id);
    else if (d === 'drop') {
      const reason = cleanReason(fields[`r-${id}`]);
      if (reason.length < 5) return { ok: false, error: REVIEW_MESSAGES.reason };
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
