// Form phân loại cho người duyệt (sau Cloudflare Access): GET /xem-duyet/phan-loai/<môn>/<id> hiện form, POST lưu.
// Lưu là mở PR phan-loai/<mã> sửa đúng item đó (routes/item-edit.mjs). Người duyệt không cần dùng git hay sửa JSON.
import { SITE_URL } from '../../../scripts/lib/labels.mjs';
import { accessConfigured } from '../access.mjs';
import { validateMeta } from '../validate.mjs';
import { applyClassification, classifyPage, classifyResult, CLASSIFY_MESSAGES, fileTypes } from '../classify.mjs';
import { failedPage, forbiddenPage, methodPage, notFoundPage, unconfiguredPage } from '../view.mjs';
import { logFailure } from '../http.mjs';
import { githubFactory, catalogFor } from '../deps.mjs';
import { reviewer, sameOriginForm } from './review.mjs';
import { editPending, openItemEdit, readItem } from './item-edit.mjs';

export const CLASSIFY_PATH = /^\/xem-duyet\/phan-loai\/([A-Za-z0-9_-]+)\/([a-z0-9][a-z0-9-]*)$/;
const LIST_URL = `${SITE_URL}chua-phan-loai/`;

export async function handleClassify(req, env, deps, course, id) {
  if (!accessConfigured(env)) return unconfiguredPage();
  const who = await reviewer(req, env, deps);
  if (!who) return forbiddenPage();
  if (req.method !== 'GET' && req.method !== 'POST') return methodPage();
  if (req.method === 'POST' && !sameOriginForm(req)) return forbiddenPage();
  const github = githubFactory(env, deps);
  try {
    const gh = await github();
    const found = await readItem(gh, env, course, id);
    if (!found) return notFoundPage();
    const { item } = found;
    if (!Array.isArray(item.unclassified) || !item.unclassified.length) return classifyResult(CLASSIFY_MESSAGES.notUnclassified, LIST_URL, false);
    if (await editPending(env, course, id)) return classifyResult(CLASSIFY_MESSAGES.pending, LIST_URL, false);
    const { policy } = await catalogFor(env, deps, github);
    const action = new URL(req.url).pathname;
    if (req.method === 'GET') return classifyPage({ item, policy, action, listUrl: LIST_URL });

    const form = await req.formData().catch(() => null);
    const fields = {};
    if (form) for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v;
    const { errors, meta } = validateMeta(fields, policy);
    if (!errors.type && !fileTypes(policy, item).includes(meta.type)) errors.type = CLASSIFY_MESSAGES.typeExt(String(item.files?.[0]?.name ?? '').replace(/^.*\./, '.'));
    if (Object.keys(errors).length) return classifyPage({ item, policy, values: fields, errors, action, listUrl: LIST_URL });

    const body = `Người duyệt phân loại tài liệu \`${course}/${id}\` trên form phân loại. Bot dựng lại dữ liệu và merge khi check qua.`;
    await openItemEdit({ env, deps, gh, who, kind: 'phan-loai', course, id, item: applyClassification(item, meta), sha: found.sha, body });
    return classifyResult(CLASSIFY_MESSAGES.saved, LIST_URL);
  } catch (err) {
    logFailure('classify', err);
    return failedPage();
  }
}
