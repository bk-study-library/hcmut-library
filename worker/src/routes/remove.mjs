// Form gỡ tài liệu cho người duyệt (sau Cloudflare Access), thay bước sửa item bằng git trong TAKEDOWN.md.
// GET /xem-duyet/go: ô dán tiêu đề issue Yêu cầu gỡ (hay <môn> <id>), chuyển tới form của tài liệu đó.
// GET /xem-duyet/go/<môn>/<id>: form chọn lý do. POST: mở PR go/<mã> đặt removed, removedReason (routes/item-edit.mjs);
// merge xong thì workflow phat-hanh-file xóa file trên Release.
import { accessConfigured } from '../access.mjs';
import { applyRemoval, gitFiles, lookupPage, parseTarget, removalReason, removePage, removeResult, REMOVE_MESSAGES } from '../remove.mjs';
import { failedPage, forbiddenPage, methodPage, notFoundPage, unconfiguredPage } from '../view.mjs';
import { logFailure } from '../http.mjs';
import { githubFactory } from '../deps.mjs';
import { reviewer, sameOriginForm } from './review.mjs';
import { editPending, openItemEdit, readItem } from './item-edit.mjs';

export const REMOVE_PATH = /^\/xem-duyet\/go(?:\/([A-Za-z0-9_-]+)\/([a-z0-9][a-z0-9-]*))?$/;

export async function handleRemove(req, env, deps, course, id) {
  if (!accessConfigured(env)) return unconfiguredPage();
  const who = await reviewer(req, env, deps);
  if (!who) return forbiddenPage();
  if (req.method !== 'GET' && (req.method !== 'POST' || !course)) return methodPage();
  if (req.method === 'POST' && !sameOriginForm(req)) return forbiddenPage();
  const url = new URL(req.url);
  if (!course) {
    const value = url.searchParams.get('t');
    if (value === null) return lookupPage();
    const target = parseTarget(value);
    if (!target) return lookupPage({ value, error: REMOVE_MESSAGES.lookupBad });
    return new Response(null, { status: 303, headers: { Location: `/xem-duyet/go/${target.course}/${target.id}`, 'Cache-Control': 'no-store' } });
  }
  try {
    const gh = await githubFactory(env, deps)();
    const found = await readItem(gh, env, course, id);
    if (!found) return notFoundPage();
    const { item } = found;
    if (item.removed) return removeResult(REMOVE_MESSAGES.already, false);
    if (await editPending(env, course, id)) return removeResult(REMOVE_MESSAGES.pending, false);
    if (req.method === 'GET') return removePage({ item, action: url.pathname });

    const form = await req.formData().catch(() => null);
    const fields = {};
    if (form) for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v;
    const { reason, errors } = removalReason(fields);
    if (errors) return removePage({ item, action: url.pathname, values: fields, errors });
    const body = `Người duyệt gỡ tài liệu \`${course}/${id}\` trên form gỡ tài liệu. Bot dựng lại dữ liệu và merge khi check qua; workflow phat-hanh-file xóa file trên Release.`;
    await openItemEdit({ env, deps, gh, who, kind: 'go', course, id, item: applyRemoval(item, reason), sha: found.sha, body, deletePaths: gitFiles(item) });
    return removeResult(REMOVE_MESSAGES.saved);
  } catch (err) {
    logFailure('remove', err);
    return failedPage();
  }
}
