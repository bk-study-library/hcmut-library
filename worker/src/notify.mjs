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

export function notifyMessage({ code, merged, reason, siteUrl, statusUrl }) {
  const subject = merged ? `Bài ${code} đã được duyệt` : `Bài ${code} chưa được duyệt`;
  const lines = merged
    ? [
        `Bài gửi ${code} của bạn đã được duyệt và đăng lên BK Study Library.`,
        `Tài liệu sẽ hiện trên web sau vài phút: ${siteUrl}`,
      ]
    : [
        `Bài gửi ${code} của bạn chưa được duyệt.`,
        reason ? `Lý do từ người duyệt:\n\n${reason}` : 'Người duyệt không ghi lý do cụ thể.',
        'Bạn có thể sửa theo lý do trên rồi gửi lại qua form.',
      ];
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
