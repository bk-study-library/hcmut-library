// Phản hồi HTTP dùng chung: JSON kèm header an toàn, CORS theo ALLOWED_ORIGINS, log lỗi (không ghi dữ liệu người gửi),
// câu báo lỗi của form.
import { GitHubError } from './github.mjs';

export const MESSAGES = {
  notFound: 'Không tìm thấy địa chỉ này.',
  method: 'Không hỗ trợ cách gửi này. Gửi bằng POST.',
  badForm: 'Không đọc được dữ liệu gửi lên. Tải lại trang rồi gửi lại.',
  tooLarge: (max) => `File quá lớn. Chọn file nhỏ hơn ${max}.`,
  turnstile: 'Không xác minh được bạn. Tải lại trang rồi gửi lại.',
  rateLimit: 'Bạn gửi quá nhiều lần. Đợi một lát rồi gửi lại.',
  exists: 'Tài liệu này đã có trong thư viện.',
  pending: 'Tài liệu này đang chờ duyệt.',
  removed: 'Tài liệu này đã bị gỡ khỏi thư viện nên không nhận lại.',
  dailyCap: 'Hôm nay thư viện đã nhận đủ số bài. Gửi lại vào ngày mai.',
  failed: 'Chưa gửi được. Thử lại sau ít phút.',
  batchTooLarge: (max) => `Tổng các file quá lớn. Gửi tối đa ${max} mỗi lần, chia thành nhiều lần gửi.`,
  batchCount: (max) => `Mỗi lần gửi tối đa ${max} file. Chia thành nhiều lần gửi.`,
  batchSame: 'Có hai file giống hệt nhau trong lần gửi này. Bỏ bớt một file.',
  batchReplaces: 'Bản cập nhật chỉ gửi được từng file một. Gửi riêng file này.',
  oneCourse: 'Mỗi bài chỉ gửi cho một môn. Tải lại trang rồi chọn lại môn.',
};

export const allowedOrigins = (env) => String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export function reply(status, body, cors, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
  });
}

// Chỉ ghi bước và mã lỗi, không ghi IP, tên, tên file hay tiêu đề.
export function logFailure(step, err) {
  console.error(JSON.stringify({ event: 'submit_failed', step, status: err instanceof GitHubError ? err.status : null, error: err?.name ?? 'Error' }));
}
