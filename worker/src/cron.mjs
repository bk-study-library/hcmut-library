// Cron của Worker (lịch ở wrangler.jsonc): merge bài duyệt một phần đã đủ điều kiện, gửi email của bài đã đóng, xóa
// quyết định duyệt của bài đã đóng mà không có email. GitHub Actions không gọi được Worker (Cloudflare chặn runner).
import { reviewKey } from './review.mjs';
import { notifyKey } from './notify.mjs';
import { CODE } from './view.mjs';
import { logFailure } from './http.mjs';
import { githubFactory } from './deps.mjs';
import { asObject, continueMerge, recordBranch } from './routes/review.mjs';
import { notifyCode } from './routes/notify.mjs';

// Cron (wrangler.jsonc triggers.crons): GitHub Actions không gọi được Worker (Cloudflare chặn IP của
// runner), nên Worker tự đi một vòng: merge bài duyệt một phần đã đủ điều kiện, gửi email của bài đã
// đóng, xóa quyết định duyệt của bài đã đóng mà không có email. Lỗi một bài không chặn bài khác.
export const CRON_MAX = 50;

export async function sweep(env, deps) {
  const list = async (prefix) => ((await env.QUARANTINE.list({ prefix, limit: CRON_MAX })).objects ?? []).map((o) => o.key.slice(prefix.length));
  const codeOf = (name) => name.replace(/\.json$/, '');
  for (const code of (await list('review/')).map(codeOf).filter((c) => CODE.test(c))) {
    try {
      if (await continueMerge(env, deps, code)) continue;
      if (await env.QUARANTINE.head(notifyKey(code))) continue;
      const record = asObject((await (await env.QUARANTINE.get(reviewKey(code)))?.text()) ?? null) ?? {};
      const pr = await (await githubFactory(env, deps)()).findPr(recordBranch(code, record));
      if (pr && pr.state !== 'open') await env.QUARANTINE.delete(reviewKey(code));
    } catch (err) {
      logFailure('cron_review', err);
    }
  }
  for (const code of (await list('notify/')).filter((c) => CODE.test(c))) {
    try {
      await notifyCode(env, deps, code);
    } catch (err) {
      logFailure('cron_notify', err);
    }
  }
}
