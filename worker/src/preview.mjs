// Xem trước file đã đăng: GET /xem-truoc?u=<link đã mã hóa>. Chỉ nhận link trong danh sách ở
// scripts/lib/preview.mjs, trả file để trình duyệt mở ngay (inline) trong khung sandbox.
// Không ghi log link hay tên file.
import policy from '../../catalog/policy.json';
import { SITE_URL } from '../../scripts/lib/labels.mjs';
import { PREVIEW_TYPES, previewTarget } from '../../scripts/lib/preview.mjs';

const MAX_REDIRECTS = 3;
// File Release của GitHub nằm sau chuyển hướng tới máy chủ này.
const REDIRECT_HOST = /(^|\.)githubusercontent\.com$/;

export const PREVIEW_MESSAGES = {
  bad: 'Không xem trước được link này. Chỉ xem trước được file PDF, ảnh PNG, JPG và Markdown đã đăng trong thư viện.',
  method: 'Không hỗ trợ cách gọi này.',
  notFound: 'Không tìm thấy file. File có thể đã bị gỡ.',
  tooLarge: 'File quá lớn để xem trước. Hãy tải file về.',
  failed: 'Chưa tải được file. Thử lại sau ít phút.',
};

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

function text(status, message, extra = {}) {
  return new Response(`${message}\n`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...BASE_HEADERS, ...extra },
  });
}

// Gốc site có / cuối; lấy từ biến SITE_BASE, không có thì dùng địa chỉ web công khai.
export const siteBase = (env) => {
  const s = String(env.SITE_BASE || SITE_URL);
  return s.endsWith('/') ? s : `${s}/`;
};

// Tải file, tự đi theo chuyển hướng (tối đa MAX_REDIRECTS) nhưng chỉ tới máy chủ được phép.
async function fetchAllowed(target, fetchFn) {
  let url = target.url;
  for (let hop = 0; ; hop++) {
    const res = await fetchFn(url, { redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) return { res };
    const loc = res.headers.get('Location');
    if (!loc || hop >= MAX_REDIRECTS || target.kind !== 'release') return { error: 'redirect' };
    const next = URL.canParse(loc, url) ? new URL(loc, url) : null;
    if (!next || next.protocol !== 'https:' || !REDIRECT_HOST.test(next.hostname) || next.username || next.password || next.port) {
      return { error: 'redirect' };
    }
    url = next.href;
  }
}

// Đếm byte khi chuyển tiếp; vượt max thì cắt luồng, kể cả khi Content-Length nói sai.
function capped(body, max) {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) controller.error(new Error('Vượt giới hạn'));
        else controller.enqueue(chunk);
      },
    }),
  );
}

export async function handlePreview(req, env, deps) {
  if (req.method !== 'GET') return text(405, PREVIEW_MESSAGES.method, { Allow: 'GET' });
  const u = new URL(req.url).searchParams.get('u');
  const target = previewTarget(u, { repo: env.REPO, site: siteBase(env) });
  if (!target) return text(400, PREVIEW_MESSAGES.bad);

  let got;
  try {
    got = await fetchAllowed(target, deps.fetch);
  } catch {
    return text(502, PREVIEW_MESSAGES.failed);
  }
  if (got.error) return text(400, PREVIEW_MESSAGES.bad);
  const { res } = got;
  if (res.status === 404) return text(404, PREVIEW_MESSAGES.notFound);
  if (!res.ok || !res.body) return text(502, PREVIEW_MESSAGES.failed);

  const max = policy.maxFileBytes;
  const declared = Number(res.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > max) {
    await res.body.cancel();
    return text(413, PREVIEW_MESSAGES.tooLarge);
  }
  const headers = {
    'Content-Type': PREVIEW_TYPES[target.ext],
    'Content-Disposition': `inline; filename="${target.name}"`,
    'Content-Security-Policy': 'sandbox',
    'Cache-Control': 'public, max-age=3600',
    ...BASE_HEADERS,
  };
  return new Response(capped(res.body, max), { status: 200, headers });
}
