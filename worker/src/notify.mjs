// Email báo kết quả duyệt (không bắt buộc). Người gửi để lại email ở form; Worker giữ trong kho cách ly
// R2 ở notify/<mã bài>, không bao giờ ghi vào repo, PR hay log. Khi PR của bài được gộp hoặc đóng,
// workflow gọi POST /bao-ket-qua { code }: Worker tự hỏi GitHub trạng thái PR (không tin dữ liệu gọi
// vào), gửi một email qua Resend rồi xóa email khỏi kho. Gọi lại khi đã gửi hay PR còn mở: không làm gì.

export const notifyKey = (code) => `notify/${code}`;

const RESEND_API = 'https://api.resend.com/emails';
// Lý do lấy từ bình luận mới nhất của PR: chỉ giữ chữ, bỏ khối mã, cắt độ dài.
const REASON_MAX = 1200;

export function plainReason(body) {
  if (!body) return '';
  const text = String(body)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > REASON_MAX ? `${text.slice(0, REASON_MAX).replace(/\s+\S*$/, '')} (còn tiếp trên PR)` : text;
}

// Kết quả từng file khi người duyệt quyết trên trang duyệt (review/<mã>.json): { keep, drop, titles }.
// Trả null khi không có hay hỏng, để email dùng lý do từ PR như trước.
export function reviewFiles(record) {
  if (!record || !Array.isArray(record.keep) || !Array.isArray(record.drop)) return null;
  const title = (id) => String(record.titles?.[id] ?? id).slice(0, 200);
  return {
    keep: record.keep.map(title),
    drop: record.drop.map((d) => ({ title: title(d.id), reason: String(d.reason ?? '').slice(0, 500) })),
  };
}

export function notifyMessage({ code, merged, reason, siteUrl, statusUrl, files = null }) {
  const partial = merged && files?.drop.length > 0;
  const subject = merged ? `Bài ${code} đã được duyệt${partial ? ' một phần' : ''}` : `Bài ${code} chưa được duyệt`;
  const kept = files?.keep.length ? `File được duyệt:\n${files.keep.map((t) => `- ${t}`).join('\n')}` : '';
  const dropped = files?.drop.length ? `File không được duyệt:\n${files.drop.map((d) => `- ${d.title}: ${d.reason}`).join('\n')}` : '';
  const lines = merged
    ? [
        `Bài gửi ${code} của bạn đã được duyệt${partial ? ' một phần' : ''} và đăng lên BK Study Library.`,
        kept,
        dropped,
        `Tài liệu sẽ hiện trên web sau vài phút: ${siteUrl}`,
      ].filter(Boolean)
    : [
        `Bài gửi ${code} của bạn chưa được duyệt.`,
        dropped || (reason ? `Lý do từ người duyệt:\n\n${reason}` : 'Người duyệt không ghi lý do cụ thể.'),
        'Bạn có thể sửa theo lý do trên rồi gửi lại qua form.',
      ];
  if (partial) lines.push('File không được duyệt có thể sửa theo lý do trên rồi gửi lại qua form.');
  if (statusUrl) lines.push(`Trạng thái bài: ${statusUrl}`);
  lines.push('', 'Email này gửi một lần theo yêu cầu của bạn khi gửi bài. Địa chỉ email của bạn đã được xóa khỏi hệ thống.');
  return { subject, text: lines.join('\n\n') };
}

export async function sendEmail({ apiKey, from, to, subject, text, fetch }) {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}
