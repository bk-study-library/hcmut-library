// POST /xem-duyet/nap: chủ dự án hay người duyệt nạp tài liệu được gửi riêng, không qua Turnstile. Đường dẫn nằm dưới
// /xem-duyet nên ứng dụng Cloudflare Access của trang duyệt chặn trước (thành viên org, hay service token cho script);
// Worker vẫn tự kiểm JWT của Access. Phiếu, phần kiểm, mở PR như POST /submit; file vẫn qua kiem-file. Web không có
// link nào tới đây. File trên directMaxBytes thì tải theo phần như form (routes/upload.mjs).
import { accessConfigured } from '../access.mjs';
import { reply, MESSAGES } from '../http.mjs';
import { reviewer } from './review.mjs';
import { handleSubmit } from './submit.mjs';

export async function handleIntake(req, env, deps) {
  if (req.method !== 'POST') return reply(405, { ok: false, error: MESSAGES.method }, {}, { Allow: 'POST' });
  if (!accessConfigured(env)) return reply(503, { ok: false, error: MESSAGES.failed }, {});
  if (!(await reviewer(req, env, deps))) return reply(403, { ok: false, error: MESSAGES.intakeForbidden }, {});
  return handleSubmit(req, env, deps, {}, { trusted: true });
}
