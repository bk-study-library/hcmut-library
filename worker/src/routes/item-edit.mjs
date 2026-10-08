// Sửa một item trên main thay người duyệt (form phân loại routes/classify.mjs, form gỡ tài liệu routes/remove.mjs). main
// được bảo vệ nên mở PR <loại>/<mã> có label (EDIT_KINDS), ghi quyết định review/<mã>.json như bài đã duyệt: workflow
// cap-nhat-pr dựng lại generated file, cron của Worker merge khi check qua rồi xóa branch (continueMerge).
// Mỗi item chỉ có một lần sửa chờ merge, để hai form không sửa chồng lên nhau.
import { EDIT_KINDS, reviewKey } from '../review.mjs';
import { logFailure } from '../http.mjs';
import { asObject } from './review.mjs';
import { makeCode } from './submit.mjs';

export const itemPath = (course, id) => `courses/${course}/items/${id}.json`;
// Khóa giữ mã của lần sửa đang chờ merge (lifecycle rule của bucket xóa sau 30 ngày).
const pendingKey = (course, id) => `sua/${course}/${id}`;

// Item trên main kèm sha của file (cần khi sửa), hay null khi không có hay không khớp đường dẫn.
export async function readItem(gh, env, course, id) {
  const file = await gh.getFile(itemPath(course, id), env.BRANCH);
  const item = asObject(file?.text ?? null);
  return item && item.id === id && item.course === course ? { item, sha: file.sha } : null;
}

export async function editPending(env, course, id) {
  const code = await (await env.QUARANTINE.get(pendingKey(course, id)))?.text();
  if (!code) return false;
  const record = asObject((await (await env.QUARANTINE.get(reviewKey(code)))?.text()) ?? null);
  return Boolean(record?.waiting);
}

// item: item mới. sha: sha của file item trên main. deletePaths: file trong git cần xóa cùng (file .md của tài liệu gỡ).
export async function openItemEdit({ env, deps, gh, who, kind, course, id, item, sha, body, deletePaths = [] }) {
  const k = EDIT_KINDS[kind];
  const code = makeCode(deps.random);
  const branch = `${kind}/${code}`;
  const message = `${kind}: ${course}/${id}`;
  await gh.createBranch(branch, await gh.branchSha(env.BRANCH));
  try {
    await gh.putFile(itemPath(course, id), `${JSON.stringify(item, null, 2)}\n`, branch, message, sha);
    if (deletePaths.length) await gh.deleteFiles(deletePaths, branch, message, await gh.branchSha(branch));
    const pr = await gh.openPr({ head: branch, base: env.BRANCH, title: k.title(`${course}/${id}`), body });
    await gh.addLabels(pr.number, [k.label]);
  } catch (err) {
    await gh.deleteBranch(branch).catch((e) => logFailure('edit_cleanup', e));
    throw err;
  }
  const record = { reviewer: who.email, at: new Date(deps.now()).toISOString(), keep: [id], drop: [], titles: { [id]: String(item.title ?? id) }, waiting: true, branch, kind };
  await env.QUARANTINE.put(reviewKey(code), JSON.stringify(record));
  await env.QUARANTINE.put(pendingKey(course, id), code);
  return code;
}
