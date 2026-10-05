// Email kết quả: POST /bao-ket-qua { code } và notifyCode (cron cũng gọi). Nội dung email ở ../notify.mjs.
import site from '../../../catalog/site.json';
import { reviewKey } from '../review.mjs';
import { notifyKey, notifyMessage, plainReason, reviewFiles, sendEmail } from '../notify.mjs';
import { CODE } from '../view.mjs';
import { reply, logFailure, MESSAGES } from '../http.mjs';
import { githubFactory } from '../deps.mjs';

// POST /bao-ket-qua { code }: gửi email kết quả nếu người gửi có để lại email và PR đã đóng.
// Không cần khóa: Worker tự hỏi GitHub trạng thái PR; gọi thừa không gửi gì, gọi lại sau khi gửi cũng vậy.
export async function handleNotify(req, env, deps) {
  if (req.method !== 'POST') return reply(405, { ok: false, error: MESSAGES.method }, {}, { Allow: 'POST' });
  let code = '';
  try {
    code = String((await req.json()).code ?? '');
  } catch {
    return reply(400, { ok: false }, {});
  }
  if (!CODE.test(code)) return reply(400, { ok: false }, {});
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM) return reply(503, { ok: false }, {});
  try {
    return reply(200, { ok: true, sent: await notifyCode(env, deps, code) }, {});
  } catch (err) {
    logFailure('notify', err);
    return reply(502, { ok: false }, {});
  }
}

// Gửi email kết quả khi PR đã đóng, rồi xóa email và quyết định duyệt khỏi kho. Trả true khi đã gửi.
export async function notifyCode(env, deps, code) {
  const obj = await env.QUARANTINE.get(notifyKey(code));
  if (!obj || !env.RESEND_API_KEY || !env.NOTIFY_FROM) return false;
  const { email, course } = JSON.parse(await obj.text());
  const gh = await githubFactory(env, deps)();
  const pr = await gh.findPr(`upload/${code}`);
  if (!pr || pr.state === 'open') return false;
  const reason = pr.merged ? '' : plainReason(await gh.lastComment(pr.number));
  const site = String(env.SITE_BASE ?? '');
  // Quyết định trên trang duyệt (nếu có) cho kết quả và lý do từng file.
  const review = await env.QUARANTINE.get(reviewKey(code));
  const files = review ? reviewFiles(await review.json().catch(() => null)) : null;
  const msg = notifyMessage({ code, merged: pr.merged, reason, siteUrl: course ? `${site}course/${course}/` : site, statusUrl: null, files });
  await sendEmail({ apiKey: env.RESEND_API_KEY, from: env.NOTIFY_FROM, to: email, ...msg, fetch: deps.fetch });
  await env.QUARANTINE.delete([notifyKey(code), reviewKey(code)]);
  return true;
}
