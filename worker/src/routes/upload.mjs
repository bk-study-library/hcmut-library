// Tải file lớn theo phần (R2 multipart; mỗi request dưới giới hạn thân request 100 MB của Worker):
//   POST /submit với upload=chunked      kiểm như bài thường (routes/submit.mjs), startUpload tạo phiên upload/<mã>.json
//   PUT  /submit/<mã>/<i>/<phần>?k=<mã>   ghi một phần của file thứ i (cỡ uploadPartBytes, phần cuối nhỏ hơn)
//   POST /submit/<mã>/xong?k=<mã>         { parts: [[{ partNumber, etag }]] }: ghép file, kiểm cỡ, mở PR (openSubmission)
// Phiên hết hạn sau SESSION_MS. R2 tự hủy multipart dở dang sau 7 ngày; file phiên xóa theo lifecycle 30 ngày.
import { reply, logFailure, MESSAGES } from '../http.mjs';
import { CODE, newToken, tokenMatches } from '../view.mjs';
import { openSubmission } from './submit.mjs';

const SESSION_MS = 6 * 60 * 60 * 1000;
const sessionKey = (code) => `upload/${code}.json`;

export async function startUpload(env, deps, draft, policy, cors) {
  const partSize = policy.uploadPartBytes;
  const token = await newToken(deps.random);
  const files = [];
  for (const [index, e] of draft.entries.entries()) {
    if (!e.stored) continue;
    const mp = await env.QUARANTINE.createMultipartUpload(e.stored.quarantine, { httpMetadata: { contentType: e.stored.mime } });
    files.push({ index, key: e.stored.quarantine, uploadId: mp.uploadId, size: e.stored.size, parts: Math.max(1, Math.ceil(e.stored.size / partSize)) });
  }
  await env.QUARANTINE.put(sessionKey(draft.code), JSON.stringify({ draft, files, partSize, tokenHash: token.hash, expires: deps.now() + SESSION_MS }));
  return reply(200, { ok: true, code: draft.code, upload: { token: token.token, partSize, files: files.map(({ index, parts }) => ({ index, parts })) } }, cors);
}

// Phiên của bài khi mã bí mật đúng và chưa hết hạn, không thì null.
async function session(env, deps, code, k) {
  if (!CODE.test(code)) return null;
  const obj = await env.QUARANTINE.get(sessionKey(code));
  if (!obj) return null;
  const s = await obj.json();
  return s.expires > deps.now() && (await tokenMatches(k, s.tokenHash)) ? s : null;
}

const notFound = (cors) => reply(404, { ok: false, error: MESSAGES.uploadExpired }, cors);

export async function handleUploadPart(req, env, deps, cors, code, index, part) {
  const s = await session(env, deps, code, new URL(req.url).searchParams.get('k'));
  if (!s) return notFound(cors);
  const f = s.files.find((x) => x.index === index);
  if (!f || part < 1 || part > f.parts) return reply(400, { ok: false, error: MESSAGES.badForm }, cors);
  // Phần nào cũng đúng partSize, trừ phần cuối là phần còn lại.
  const want = part < f.parts ? s.partSize : f.size - s.partSize * (f.parts - 1);
  if (Number(req.headers.get('Content-Length')) !== want || !req.body) return reply(400, { ok: false, error: MESSAGES.badForm }, cors);
  try {
    const up = await env.QUARANTINE.resumeMultipartUpload(f.key, f.uploadId).uploadPart(part, req.body);
    return reply(200, { ok: true, partNumber: up.partNumber, etag: up.etag }, cors);
  } catch (err) {
    logFailure('upload_part', err);
    return reply(502, { ok: false, error: MESSAGES.failed }, cors);
  }
}

export async function handleUploadDone(req, env, deps, cors, code) {
  const s = await session(env, deps, code, new URL(req.url).searchParams.get('k'));
  if (!s) return notFound(cors);
  let parts;
  try {
    parts = (await req.json()).parts;
  } catch {
    return reply(400, { ok: false, error: MESSAGES.badForm }, cors);
  }
  const keys = [];
  try {
    for (const f of s.files) {
      const list = Array.isArray(parts?.[f.index]) ? parts[f.index] : [];
      const obj = await env.QUARANTINE.resumeMultipartUpload(f.key, f.uploadId).complete(list.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })));
      keys.push(f.key);
      if (obj.size !== f.size) throw new Error('cỡ file khác cỡ đã khai');
    }
  } catch (err) {
    logFailure('upload_done', err);
    if (keys.length) await env.QUARANTINE.delete(keys).catch((e) => logFailure('cleanup', e));
    return reply(400, { ok: false, error: MESSAGES.uploadBroken }, cors);
  }
  await env.QUARANTINE.delete(sessionKey(code)).catch((e) => logFailure('cleanup', e));
  return openSubmission(env, deps, s.draft, keys, cors);
}
