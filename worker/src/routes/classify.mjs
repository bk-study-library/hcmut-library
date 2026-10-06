// Form phân loại cho người duyệt (sau Cloudflare Access): GET /xem-duyet/phan-loai/<môn>/<id> hiện form, POST lưu.
// Lưu là mở PR phan-loai/<mã> sửa đúng item đó (main được bảo vệ, chỉ đổi qua PR), ghi quyết định review/<mã>.json như
// bài đã duyệt: workflow cap-nhat-pr dựng lại generated file, cron của Worker merge khi check qua (continueMerge).
// Người duyệt không cần dùng git hay sửa JSON.
import { SITE_URL } from '../../../scripts/lib/labels.mjs';
import { accessConfigured } from '../access.mjs';
import { validateMeta } from '../validate.mjs';
import { reviewKey } from '../review.mjs';
import { applyClassification, classifyPage, classifyResult, CLASSIFY_MESSAGES, fileTypes } from '../classify.mjs';
import { failedPage, forbiddenPage, methodPage, notFoundPage, unconfiguredPage } from '../view.mjs';
import { logFailure } from '../http.mjs';
import { githubFactory, catalogFor } from '../deps.mjs';
import { asObject, reviewer, sameOriginForm } from './review.mjs';
import { makeCode } from './submit.mjs';

export const CLASSIFY_PATH = /^\/xem-duyet\/phan-loai\/([A-Za-z0-9_-]+)\/([a-z0-9][a-z0-9-]*)$/;
export const CLASSIFY_LABEL = 'phan-loai';
const LIST_URL = `${SITE_URL}chua-phan-loai/`;
// Một item chỉ có một lần phân loại chờ merge: khóa giữ mã của lần đó.
const pendingKey = (course, id) => `phan-loai/${course}/${id}`;

async function waitingCode(env, course, id) {
  const code = await (await env.QUARANTINE.get(pendingKey(course, id)))?.text();
  if (!code) return null;
  const record = asObject(await (await env.QUARANTINE.get(reviewKey(code)))?.text() ?? null);
  return record?.waiting ? code : null;
}

export async function handleClassify(req, env, deps, course, id) {
  if (!accessConfigured(env)) return unconfiguredPage();
  const who = await reviewer(req, env, deps);
  if (!who) return forbiddenPage();
  if (req.method !== 'GET' && req.method !== 'POST') return methodPage();
  if (req.method === 'POST' && !sameOriginForm(req)) return forbiddenPage();
  const github = githubFactory(env, deps);
  const path = `courses/${course}/items/${id}.json`;
  try {
    const gh = await github();
    const item = asObject(await gh.getRaw(path, env.BRANCH));
    if (!item || item.id !== id || item.course !== course) return notFoundPage();
    if (!Array.isArray(item.unclassified) || !item.unclassified.length) return classifyResult(CLASSIFY_MESSAGES.notUnclassified, LIST_URL, false);
    if (await waitingCode(env, course, id)) return classifyResult(CLASSIFY_MESSAGES.pending, LIST_URL, false);
    const { policy } = await catalogFor(env, deps, github);
    const action = new URL(req.url).pathname;
    if (req.method === 'GET') return classifyPage({ item, policy, action, listUrl: LIST_URL });

    const form = await req.formData().catch(() => null);
    const fields = {};
    if (form) for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v;
    const { errors, meta } = validateMeta(fields, policy);
    if (!errors.type && !fileTypes(policy, item).includes(meta.type)) errors.type = CLASSIFY_MESSAGES.typeExt(String(item.files?.[0]?.name ?? '').replace(/^.*\./, '.'));
    if (Object.keys(errors).length) return classifyPage({ item, policy, values: fields, errors, action, listUrl: LIST_URL });

    const code = makeCode(deps.random);
    const branch = `phan-loai/${code}`;
    const text = `${JSON.stringify(applyClassification(item, meta), null, 2)}\n`;
    await gh.createBranch(branch, await gh.branchSha(env.BRANCH));
    try {
      await gh.putFile(path, text, branch, `phan-loai: ${course}/${id}`);
      const pr = await gh.openPr({ head: branch, base: env.BRANCH, title: `Phân loại ${course}/${id}`, body: `Người duyệt phân loại tài liệu \`${course}/${id}\` trên form phân loại. Bot dựng lại dữ liệu và merge khi check qua.` });
      await gh.addLabels(pr.number, [CLASSIFY_LABEL]);
    } catch (err) {
      await gh.deleteBranch(branch).catch((e) => logFailure('classify_cleanup', e));
      throw err;
    }
    const record = { reviewer: who.email, at: new Date(deps.now()).toISOString(), keep: [id], drop: [], titles: { [id]: meta.title }, waiting: true, branch, kind: 'phan-loai' };
    await env.QUARANTINE.put(reviewKey(code), JSON.stringify(record));
    await env.QUARANTINE.put(pendingKey(course, id), code);
    return classifyResult(CLASSIFY_MESSAGES.saved, LIST_URL);
  } catch (err) {
    logFailure('classify', err);
    return failedPage();
  }
}
