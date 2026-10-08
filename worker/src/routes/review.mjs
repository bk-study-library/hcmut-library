// Trang duyệt cho người duyệt (sau Cloudflare Access): GET /xem-duyet/<mã> (mọi file của bài), POST /xem-duyet/<mã>/duyet
// (Hoàn tất duyệt: merge, đóng, hay bỏ file không duyệt), POST /duyet-tiep (merge bài duyệt một phần khi đủ điều kiện).
import { fileName } from '../../../scripts/upload/naming.mjs';
import { newCoursePath } from '../../../scripts/upload/course.mjs';
import { accessConfigured, accessEmail, verifyAccessJwt } from '../access.mjs';
import { checksGreen, decisionComment, EDIT_KINDS, ITEM_ID, parseDecisions, REVIEW_MESSAGES, reviewKey } from '../review.mjs';
import { CODE, forbiddenPage, locateFile, notFoundPage, resultPage, reviewBatchPage, serveFile, unconfiguredPage } from '../view.mjs';
import { reply, logFailure, MESSAGES } from '../http.mjs';
import { githubFactory, catalogFor } from '../deps.mjs';

// Item trong branch của bài (cùng mẫu với scripts/upload/check.mjs).
export const ITEM_FILE = /^courses\/[A-Za-z0-9_-]+\/items\/[A-Za-z0-9_-]+\.json$/;

// JSON hỏng hay không phải object thì null (trang duyệt vẫn hiện file của mục).
export const asObject = (text) => {
  let v = null;
  try {
    v = text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
};

// Mọi item trên branch upload/<mã> (đợt gửi có nhiều mục) kèm file của từng mục trong kho,
// và file môn mới nếu có. [{ id, path, item, file }]. Lỗi đọc thì danh sách rỗng.
export async function branchDocs(env, github, code) {
  const out = { docs: [], newCourse: null };
  try {
    const gh = await github();
    const branch = `upload/${code}`;
    const files = (await gh.changedFiles(env.BRANCH, branch)) ?? [];
    const hits = files.filter((f) => ITEM_FILE.test(f.filename) && f.status !== 'removed').map((f) => f.filename).sort();
    if (!hits.length) return out;
    const coursePath = newCoursePath(hits[0].split('/')[1]);
    const added = files.some((f) => f.filename === coursePath && f.status === 'added');
    const texts = await Promise.all(hits.map((p) => gh.getRaw(p, branch)));
    out.docs = await Promise.all(
      hits.map(async (p, i) => {
        const item = asObject(texts[i]);
        const name = item?.files?.[0]?.name;
        const safe = typeof name === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.[A-Za-z0-9]+$/.test(name);
        // Bài một file mà mục không ghi tên file (bài cũ): lấy file đầu tiên của bài như trước.
        const file = safe ? await locateFile(env.QUARANTINE, code, name) : hits.length === 1 ? await locateFile(env.QUARANTINE, code) : null;
        return { id: p.split('/').pop().replace(/\.json$/, ''), path: p, item, file };
      }),
    );
    if (added) out.newCourse = asObject(await gh.getRaw(coursePath, branch));
  } catch (err) {
    logFailure('review_item', err);
  }
  return out;
}

// Người duyệt: JWT của Cloudflare Access hợp lệ thì trả { email }, không thì null.
export async function reviewer(req, env, deps) {
  const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
  const ok = await verifyAccessJwt(jwt, { team: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, fetch: deps.fetch, cache: deps.cache(), now: deps.now });
  return ok ? { email: accessEmail(jwt) } : null;
}

// Trạng thái PR của branch (upload/<mã>, hay phan-loai/<mã> của form phân loại): PR mở và mọi check của đầu branch đã qua.
export async function prState(gh, branch) {
  const found = await gh.findPr(branch);
  if (!found || found.state !== 'open') return { open: false };
  const pr = await gh.getPr(found.number);
  return { open: true, number: pr.number, sha: pr.head.sha, green: checksGreen(await gh.checkRuns(pr.head.sha)) };
}

// Người duyệt: JWT của Cloudflare Access phải hợp lệ; thiếu cấu hình thì đóng (503).
// GET /xem-duyet/<mã>: trang duyệt mọi file của bài (chữ người gửi đã thoát HTML, nút xem, tải, quyết định).
// GET /xem-duyet/<mã>/file[/<tên>]: chính file, cùng luật với người gửi.
// POST /xem-duyet/<mã>/duyet: quyết định của người duyệt (xem handleDecision).
export async function handleReview(req, env, deps, code, wantFile, fileName = null, decide = false) {
  if (!accessConfigured(env)) return unconfiguredPage();
  const who = await reviewer(req, env, deps);
  if (!who) return forbiddenPage();
  // Kiểm quyền trước mã bài, để người ngoài không dò được mã qua 404.
  if (!CODE.test(code)) return notFoundPage();
  const url = new URL(req.url);
  const github = githubFactory(env, deps);
  if (decide) return handleDecision(req, env, deps, code, who, github);
  if (wantFile) {
    const { policy } = await catalogFor(env, deps, github);
    return serveFile(env.QUARANTINE, code, {
      policy,
      name: fileName,
      download: url.searchParams.get('tai') === '1',
      downloadHref: `/xem-duyet/${code}/file${fileName ? `/${encodeURIComponent(fileName)}` : ''}?tai=1`,
    });
  }
  const [{ docs, newCourse }, state] = await Promise.all([branchDocs(env, github, code), prState(await github(), `upload/${code}`).catch(() => ({ open: false }))]);
  return reviewBatchPage({ code, docs, newCourse, open: state.open, canDecide: state.open && state.green });
}

// Form gửi từ chính Worker. Trang của Worker đặt Referrer-Policy: no-referrer nên trình duyệt gửi Origin "null"; khi đó
// dựa vào Sec-Fetch-Site (trình duyệt tự đặt, trang khác không giả được). Chống trang khác gửi form kèm cookie Access.
export function sameOriginForm(req) {
  const origin = req.headers.get('Origin');
  return origin === new URL(req.url).origin || (origin === 'null' && req.headers.get('Sec-Fetch-Site') === 'same-origin');
}

// Gộp hay đóng PR thay người duyệt và ghi kết quả. Lỗi GitHub thì trả trang lỗi, không đổi gì thêm.
export async function handleDecision(req, env, deps, code, who, github) {
  if (!sameOriginForm(req)) return forbiddenPage();
  const form = await req.formData().catch(() => null);
  if (!form) return resultPage(code, REVIEW_MESSAGES.missing, false);
  const fields = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v;
  const gh = await github();
  const state = await prState(gh, `upload/${code}`);
  if (!state.open) return resultPage(code, REVIEW_MESSAGES.closed, false);
  if (!state.green) return resultPage(code, REVIEW_MESSAGES.checks, false);
  const { docs } = await branchDocs(env, github, code);
  const ids = docs.map((d) => d.id).filter((id) => ITEM_ID.test(id));
  if (!ids.length || ids.length !== docs.length) return resultPage(code, REVIEW_MESSAGES.stale, false);
  const parsed = parseDecisions(fields, ids);
  if (!parsed.ok) return resultPage(code, parsed.error, false);
  const { keep, drop } = parsed;
  // Ghi quyết định (kèm email người duyệt, chỉ trong kho) để email báo người gửi và bước merge sau dựng lại.
  const titles = Object.fromEntries(docs.map((d) => [d.id, String(d.item?.title ?? d.id)]));
  const record = { reviewer: who.email, at: new Date(deps.now()).toISOString(), keep, drop, titles, waiting: keep.length > 0 && drop.length > 0 };
  await env.QUARANTINE.put(reviewKey(code), JSON.stringify(record));
  if (!drop.length) {
    await gh.comment(state.number, decisionComment({ keep, drop }));
    await gh.mergePr(state.number, state.sha, prTitleMerge(code));
    return resultPage(code, REVIEW_MESSAGES.done);
  }
  if (!keep.length) {
    await gh.comment(state.number, decisionComment({ keep, drop }));
    await gh.closePr(state.number);
    return resultPage(code, REVIEW_MESSAGES.rejected);
  }
  // Bỏ file không duyệt khỏi branch và khỏi kho; workflow kiem-file dựng lại dữ liệu, rồi tu-gop gọi /duyet-tiep.
  const branch = `upload/${code}`;
  const dropped = drop.map((d) => docs.find((x) => x.id === d.id));
  await gh.deleteFiles(dropped.map((doc) => doc.path), branch, `review: bỏ ${drop.length} file khỏi bài ${code}`, state.sha);
  for (const doc of dropped) {
    const f = doc.item?.files?.[0];
    const keys = [];
    if (f?.name) keys.push(`pending/${code}/${f.name}`, `clean/${code}/${f.name}`);
    for (const sha of [f?.uploadSha256, f?.sha256]) if (typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha)) keys.push(`sha/${sha}`);
    if (keys.length) await env.QUARANTINE.delete(keys).catch((e) => logFailure('review_drop', e));
  }
  await gh.comment(state.number, decisionComment({ keep, drop, pending: true }));
  return resultPage(code, REVIEW_MESSAGES.waiting(drop.length));
}

export const prTitleMerge = (code, auto = false) => `Gộp bài gửi ${code} (${auto ? 'tự động, đã qua kiểm file' : 'đã duyệt trên trang duyệt'})`;
const mergeTitle = (code, record) => EDIT_KINDS[record.kind]?.merge(code) ?? prTitleMerge(code, record.auto);
// Branch của quyết định: bài gửi là upload/<mã>; form của người duyệt (EDIT_KINDS) ghi branch <loại>/<mã> trong bản ghi.
export function recordBranch(code, record) {
  const [kind, tail] = String(record.branch ?? '').split('/');
  return EDIT_KINDS[record.kind] && kind === record.kind && CODE.test(tail ?? '') ? record.branch : `upload/${code}`;
}

// POST /duyet-tiep { code }: workflow tu-gop gọi sau khi bước kiểm qua trên commit dựng lại.
// Không cần khóa: chỉ merge khi đã có quyết định của người duyệt (review/<mã>.json, waiting), PR còn mở,
// mục trên branch đúng bằng danh sách được duyệt, và mọi check của đầu branch đã qua.
export async function handleContinue(req, env, deps) {
  if (req.method !== 'POST') return reply(405, { ok: false, error: MESSAGES.method }, {}, { Allow: 'POST' });
  let code = '';
  try {
    code = String((await req.json()).code ?? '');
  } catch {
    return reply(400, { ok: false }, {});
  }
  if (!CODE.test(code)) return reply(400, { ok: false }, {});
  try {
    return reply(200, { ok: true, merged: await continueMerge(env, deps, code) }, {});
  } catch (err) {
    logFailure('review_continue', err);
    return reply(502, { ok: false }, {});
  }
}

// Merge bài đã duyệt một phần khi đủ điều kiện (xem handleContinue). Trả true khi đã merge.
export async function continueMerge(env, deps, code) {
  const obj = await env.QUARANTINE.get(reviewKey(code));
  if (!obj) return false;
  const record = JSON.parse(await obj.text());
  if (!record.waiting) return false;
  const gh = await githubFactory(env, deps)();
  const head = recordBranch(code, record);
  const state = await prState(gh, head);
  if (!state.open || !state.green) return false;
  if (!(await gh.commitMessage(state.sha)).startsWith('kiem-file:')) return false;
  const branch = await gh.branchItems(env.BRANCH, head, ITEM_FILE);
  // Nhánh chưa gồm main mới nhất thì chờ workflow cap-nhat-pr gộp main và dựng lại generated file; merge lúc này thì
  // git ghép generated file theo dòng và có thể sai.
  if (!branch || branch.behindBy > 0) return false;
  const ids = branch.items.map((p) => p.split('/').pop().replace(/\.json$/, ''));
  if (ids.length !== record.keep.length || ids.some((id) => !record.keep.includes(id))) return false;
  await gh.mergePr(state.number, state.sha, mergeTitle(code, record));
  await env.QUARANTINE.put(reviewKey(code), JSON.stringify({ ...record, waiting: false }));
  // Branch của form người duyệt không có workflow don-kho dọn (chỉ dọn upload/*): xóa ngay sau khi merge.
  if (EDIT_KINDS[record.kind]) await gh.deleteBranch(head).catch((e) => logFailure('classify_branch', e));
  return true;
}
