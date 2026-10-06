// Worker nhận bài gửi từ form web và phục vụ trang duyệt, trang người gửi, xem trước, email kết quả.
// File này chỉ định tuyến; mỗi việc ở một file trong routes/ (xem docs/kien-truc.md).
import { handlePreview } from './preview.mjs';
import { CODE, failedPage, methodPage, notFoundPage } from './view.mjs';
import { corsHeaders, reply, logFailure, MESSAGES } from './http.mjs';
import { handleSubmit } from './routes/submit.mjs';
import { handleUploadPart, handleUploadDone } from './routes/upload.mjs';
import { handleReview, handleContinue } from './routes/review.mjs';
import { handleOwner } from './routes/owner.mjs';
import { handleNotify } from './routes/notify.mjs';
import { CLASSIFY_PATH, handleClassify } from './routes/classify.mjs';
import { sweep } from './cron.mjs';

// /xem-duyet/<mã>, /xem-duyet/<mã>/file, /xem-duyet/<mã>/file/<tên>, /xem-duyet/<mã>/duyet (POST).
const REVIEW_PATH = /^\/xem-duyet\/([^/]+)(?:(\/file)(?:\/([A-Za-z0-9_-][A-Za-z0-9._-]*))?|(\/duyet))?$/;

const OWNER_PATH = /^\/xem\/([^/]+)(\/file)?$/;

const PREVIEW_PATH = '/xem-truoc';

// Tải file lớn theo phần: /submit/<mã>/<i>/<phần> hay /submit/<mã>/xong.
const UPLOAD_PATH = /^\/submit\/([A-Za-z0-9]{10})\/(?:([0-9]{1,2})\/([0-9]{1,5})|xong)$/;

async function handleView(req, env, deps, path) {
  const review = REVIEW_PATH.exec(path);
  // Chỉ quyết định duyệt dùng POST; mọi trang khác chỉ GET.
  if (req.method !== (review && review[4] ? 'POST' : 'GET')) return methodPage();
  const owner = review ? null : OWNER_PATH.exec(path);
  const code = (review ?? owner)?.[1] ?? '';
  try {
    if (review) return await handleReview(req, env, deps, code, Boolean(review[2]), review[3] ?? null, Boolean(review[4]));
    if (!CODE.test(code)) return notFoundPage();
    return await handleOwner(req, env, deps, code, Boolean(owner[2]));
  } catch (err) {
    logFailure('view', err);
    return failedPage();
  }
}

export function createHandler(deps = {}) {
  const d = {
    fetch: deps.fetch ?? ((...args) => fetch(...args)),
    now: deps.now ?? (() => Date.now()),
    random: deps.random ?? ((n) => crypto.getRandomValues(new Uint8Array(n))),
    cache: deps.cache ?? (() => caches.default),
  };
  return {
    async fetch(req, env) {
      const url = new URL(req.url);
      const cors = corsHeaders(req, env);
      if (url.pathname === PREVIEW_PATH) return handlePreview(req, env, d);
      if (url.pathname === '/bao-ket-qua') return handleNotify(req, env, d);
      if (url.pathname === '/duyet-tiep') return handleContinue(req, env, d);
      // Form phân loại của người duyệt (sau Cloudflare Access): routes/classify.mjs.
      const classify = CLASSIFY_PATH.exec(url.pathname);
      if (classify) return handleClassify(req, env, d, classify[1], classify[2]);
      if (REVIEW_PATH.test(url.pathname) || OWNER_PATH.test(url.pathname)) return handleView(req, env, d, url.pathname);
      const up = UPLOAD_PATH.exec(url.pathname);
      if (url.pathname !== '/submit' && !up) return reply(404, { ok: false, error: MESSAGES.notFound }, cors);
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      // /submit/<mã>/<i>/<phần> (PUT) và /submit/<mã>/xong (POST): tải file lớn theo phần (routes/upload.mjs).
      const method = up ? (up[2] ? 'PUT' : 'POST') : 'POST';
      if (req.method !== method) return reply(405, { ok: false, error: MESSAGES.method }, cors, { Allow: `${method}, OPTIONS` });
      // Lỗi không lường trước vẫn trả JSON kèm CORS để form hiện được thông báo.
      try {
        if (up) return await (up[2] ? handleUploadPart(req, env, d, cors, up[1], Number(up[2]), Number(up[3])) : handleUploadDone(req, env, d, cors, up[1]));
        return await handleSubmit(req, env, d, cors);
      } catch (err) {
        logFailure('unexpected', err);
        return reply(500, { ok: false, error: MESSAGES.failed }, cors);
      }
    },
    async scheduled(event, env, ctx) {
      ctx.waitUntil(sweep(env, d));
    },
  };
}

export default createHandler();
