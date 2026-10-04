// Worker nhận bài gửi từ form web: kiểm, lưu file vào bucket quarantine trên R2, nhờ bot GitHub App mở PR.
import { validateSubmission } from './validate.mjs';
import { GitHub, GitHubError, installationToken } from './github.mjs';
import { loadCatalog } from './catalog.mjs';
import { slugify, fileName, uniqueId } from '../../scripts/upload/naming.mjs';
import { buildItem } from '../../scripts/upload/item.mjs';
import { buildNewCourse, handbookUrlFor, newCoursePath } from '../../scripts/upload/course.mjs';
// Tiền tố khoa và mẫu link Sổ tay đóng gói lúc deploy (như policy.json ở preview.mjs): đổi thì deploy lại.
import faculties from '../../catalog/faculties.json';
import site from '../../catalog/site.json';
import { formatSize, TYPES } from '../../scripts/lib/labels.mjs';
import { rateKey, dailyCap, dailyCapReached, countSubmission } from './limits.mjs';
import { accessConfigured, accessEmail, verifyAccessJwt } from './access.mjs';
import { checksGreen, decisionComment, ITEM_ID, parseDecisions, REVIEW_MESSAGES, reviewKey } from './review.mjs';
import { handlePreview } from './preview.mjs';
import { notifyKey, notifyMessage, plainReason, reviewFiles, sendEmail } from './notify.mjs';
import {
  CODE,
  checkToken,
  failedPage,
  forbiddenPage,
  loadStatus,
  locateFile,
  methodPage,
  newToken,
  notFoundPage,
  resultPage,
  reviewBatchPage,
  serveFile,
  statusPage,
  tokenKey,
  unconfiguredPage,
} from './view.mjs';

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Phần thêm của multipart ngoài file: ranh giới, tên ô, các ô chữ.
const MULTIPART_OVERHEAD = 64 * 1024;
const HEAD_BYTES = 16;
const CODE_LENGTH = 10;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// Byte ngẫu nhiên từ 248 trở lên bị bỏ để mỗi ký tự có xác suất như nhau (248 = 4 x 62).
const CODE_BYTE_LIMIT = 248;
const LABEL = 'tai-lieu-moi';
const ITEM_SCHEMA = '../../../schema/item.schema.json';
// Ngày thêm tính theo giờ Việt Nam (UTC+7).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const MESSAGES = {
  notFound: 'Không tìm thấy địa chỉ này.',
  method: 'Không hỗ trợ cách gửi này. Gửi bằng POST.',
  badForm: 'Không đọc được dữ liệu gửi lên. Tải lại trang rồi gửi lại.',
  tooLarge: (max) => `File quá lớn. Chọn file nhỏ hơn ${max}.`,
  turnstile: 'Không xác minh được bạn. Tải lại trang rồi gửi lại.',
  rateLimit: 'Bạn gửi quá nhiều lần. Đợi một lát rồi gửi lại.',
  exists: 'Tài liệu này đã có trong thư viện.',
  pending: 'Tài liệu này đang chờ duyệt.',
  removed: 'Tài liệu này đã bị gỡ khỏi thư viện nên không nhận lại.',
  dailyCap: 'Hôm nay thư viện đã nhận đủ số bài. Gửi lại vào ngày mai.',
  failed: 'Chưa gửi được. Thử lại sau ít phút.',
  batchTooLarge: (max) => `Tổng các file quá lớn. Gửi tối đa ${max} mỗi lần, chia thành nhiều lần gửi.`,
  batchCount: (max) => `Mỗi lần gửi tối đa ${max} file. Chia thành nhiều lần gửi.`,
  batchSame: 'Có hai file giống hệt nhau trong lần gửi này. Bỏ bớt một file.',
  batchReplaces: 'Bản cập nhật chỉ gửi được từng file một. Gửi riêng file này.',
  oneCourse: 'Mỗi bài chỉ gửi cho một môn. Tải lại trang rồi chọn lại môn.',
};

// Ô chọn môn và ô môn mới: mỗi ô chỉ được gửi một lần.
const COURSE_FIELDS = ['course', 'newCourseCode', 'newCourseName'];

// Item trong branch của bài (cùng mẫu với scripts/upload/check.mjs).
const ITEM_FILE = /^courses\/[A-Za-z0-9_-]+\/items\/[A-Za-z0-9_-]+\.json$/;

const allowedOrigins = (env) => String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function reply(status, body, cors, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
  });
}

// Đọc form, đếm byte khi đọc; vượt max thì dừng đọc, kể cả khi Content-Length nói sai.
async function readForm(req, max) {
  if (!req.body) return { error: 'bad' };
  let seen = 0;
  let over = false;
  const counted = req.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) {
          over = true;
          controller.error(new Error('Body vượt giới hạn'));
        } else {
          controller.enqueue(chunk);
        }
      },
    }),
  );
  try {
    const data = await new Response(counted, { headers: { 'Content-Type': req.headers.get('Content-Type') ?? '' } }).formData();
    return { data };
  } catch {
    return { error: over ? 'large' : 'bad' };
  }
}

// Qua Turnstile và widget nằm trên trang của mình (hostname thuộc ALLOWED_ORIGINS).
async function verifyTurnstile(token, secret, hosts, fetch) {
  if (!token) return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  try {
    const res = await fetch(TURNSTILE_URL, { method: 'POST', body });
    const out = await res.json();
    return out.success === true && hosts.includes(out.hostname);
  } catch {
    return false;
  }
}

function makeCode(random) {
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const b of random(CODE_LENGTH * 2)) {
      if (b < CODE_BYTE_LIMIT && code.length < CODE_LENGTH) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return code;
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Ô trong bảng của PR: không vỡ bảng, không thành thẻ HTML, không nhắc tên ai bằng @, không thành
// tham chiếu issue (#) hay liên kết ([ ], địa chỉ trần dạng https://... hoặc www....). Bảng hiện chỉ
// có giá trị lấy từ danh mục và policy, nhưng vẫn thoát phòng khi sau này thêm ô.
const CELL_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '@': '&#64;', '#': '&#35;', '[': '&#91;', ']': '&#93;', '|': '\\|' };
export function cell(value) {
  // Một lượt thay cho mọi ký tự, để mã đã thay (&#64;) không bị thay lần nữa.
  return String(value)
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/[&<>@#[\]|]/g, (c) => CELL_ESCAPES[c])
    .replace(/:\/\//g, '&#58;//')
    .replace(/\b(www)\./gi, '$1&#46;');
}

// Tiêu đề PR trung tính, không có chữ người gửi: tiêu đề và nội dung PR hiện công khai ngay (cả
// trong email thông báo). Chữ người gửi chỉ nằm trong file item và trang /xem-duyet/<mã>.
export const prTitle = (code, courseCode) => `Bài gửi ${code}: ${courseCode}`;

// newCourse: { code, handbookUrl } khi bài đề xuất môn chưa có. Mã đã qua mẫu mã môn nên được ghi;
// tên môn là chữ người gửi nên chỉ nằm trong file môn của PR, không ghi ở đây.
// replaces: <ID môn>/<id> của tài liệu được thay (đã qua mẫu nên ghi được); siteBase: gốc web để dẫn tới bản đang có.
// files: đợt gửi nhiều file, [{ type, file }]; có thì bảng liệt kê từng file thay cho một dòng loại, cỡ.
export function prBody({ code, courseCode, type, file, files = null, viewBase, newCourse = null, replaces = null, siteBase = '' }) {
  const rows = [
    ['Mã bài', code],
    ['Môn', courseCode],
  ];
  if (files) rows.push(['Số file', String(files.length)]);
  else {
    rows.push(['Loại', TYPES[type]?.vi ?? type]);
    if (file) rows.push(['Kích thước', formatSize(file.size)], ['sha256', file.sha256]);
  }
  const lines = [];
  if (newCourse) {
    lines.push(
      `**Môn mới: ${cell(newCourse.code)}**. Môn này chưa có trong danh mục; bài thêm file \`catalog/courses/${newCourse.code}.json\`.`,
      'Người duyệt kiểm mã, tên và khoa của môn với Sổ tay HCMUT trước khi merge; sai thì sửa file môn trong PR, trùng môn đã có thì đóng PR.',
    );
    if (newCourse.handbookUrl) lines.push(`Trang môn trên Sổ tay: ${newCourse.handbookUrl}`);
    lines.push('');
  }
  if (replaces) {
    const [rc, rid] = replaces.split('/');
    lines.push(`**Bản cập nhật** cho tài liệu \`${replaces}\`. Duyệt bài này thì bản cũ được ẩn như đã gỡ.`);
    if (siteBase) lines.push(`So sánh: bản đang có trong thư viện ${siteBase}course/${rc}/#${rid}${viewBase ? `, bản mới ${viewBase}/xem-duyet/${code}` : ''}`);
    lines.push('');
  }
  lines.push('| Trường | Giá trị |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${cell(v)} |`), '');
  if (files) {
    // Tên file đã qua slugify và mẫu tên an toàn nên ghi được; tiêu đề người gửi không ghi ở đây.
    lines.push('| # | Loại | File | Kích thước |', '|---|---|---|---|');
    files.forEach((x, i) => lines.push(`| ${i + 1} | ${cell(TYPES[x.type]?.vi ?? x.type)} | ${x.file ? cell(x.file.name) : ''} | ${x.file ? formatSize(x.file.size) : ''} |`));
    lines.push('');
  }
  if (file) lines.push(files ? 'Các file nằm trong bucket quarantine. CI sẽ kiểm từng file và ghi kết quả vào PR này.' : 'File nằm trong bucket quarantine. CI sẽ kiểm file và ghi kết quả vào PR này.', '');
  if (viewBase) {
    lines.push(`${file ? 'Xem file' : 'Xem bài'} (người duyệt): ${viewBase}/xem-duyet/${code}`, '');
    lines.push('Tiêu đề, mô tả và các ô khác người gửi nhập hiện ở trang trên và trong file item của PR, không ghi ở tiêu đề hay nội dung PR.');
  } else {
    lines.push('Tiêu đề, mô tả và các ô khác người gửi nhập nằm trong file item của PR, không ghi ở tiêu đề hay nội dung PR.');
  }
  return `${lines.join('\n')}\n`;
}

// Chỉ ghi bước và mã lỗi, không ghi IP, tên, tên file hay tiêu đề.
function logFailure(step, err) {
  console.error(JSON.stringify({ event: 'submit_failed', step, status: err instanceof GitHubError ? err.status : null, error: err?.name ?? 'Error' }));
}

// Client GitHub tạo khi cần lần đầu, dùng lại trong cùng request.
function githubFactory(env, deps) {
  let ghPromise;
  return () => {
    ghPromise ??= installationToken({
      appId: env.GH_APP_ID,
      pkcs8Pem: env.GH_APP_PRIVATE_KEY,
      installationId: env.GH_INSTALLATION_ID,
      fetch: deps.fetch,
    }).then((token) => new GitHub({ repo: env.REPO, token, fetch: deps.fetch }));
    return ghPromise;
  };
}

const catalogFor = (env, deps, github) =>
  loadCatalog({
    repo: env.REPO,
    branch: env.BRANCH,
    ttl: Number(env.CATALOG_TTL_SECONDS) || 0,
    cache: deps.cache(),
    github,
  });

// Gốc địa chỉ xem file (không có / cuối), rỗng thì không tạo link xem.
const reviewBase = (env) => String(env.REVIEW_BASE ?? '').replace(/\/+$/, '');

async function handleSubmit(req, env, deps, cors) {
  const github = githubFactory(env, deps);
  const fail = (step, err) => {
    logFailure(step, err);
    return reply(err instanceof GitHubError ? 502 : 500, { ok: false, error: MESSAGES.failed }, cors);
  };

  // Số lần gửi theo dải địa chỉ (IPv4 /32, IPv6 /64), trước mọi lời gọi GitHub và trước khi đọc body.
  // IP chỉ dùng làm khóa, không lưu.
  const limit = await env.SUBMIT_LIMIT.limit({ key: rateKey(req.headers.get('CF-Connecting-IP')) });
  if (!limit.success) return reply(429, { ok: false, error: MESSAGES.rateLimit }, cors);
  // Trần chung mỗi ngày (UTC) cho mọi người gửi. Ở đây chỉ đọc; bài chỉ được đếm khi đã qua kiểm.
  const cap = dailyCap(env);
  const capReached = () => reply(429, { ok: false, error: MESSAGES.dailyCap }, cors);
  if (await dailyCapReached(env.QUARANTINE, cap, deps.now())) return capReached();

  // Danh mục cần trước khi đọc body: giới hạn kích thước lấy từ policy.json.
  let catalog;
  try {
    catalog = await catalogFor(env, deps, github);
  } catch (err) {
    logFailure('catalog', err);
    return reply(502, { ok: false, error: MESSAGES.failed }, cors);
  }
  const { policy } = catalog;
  // Đợt gửi: tối đa batchMaxFiles file, tổng batchMaxBytes (policy.json); thiếu thì một file như cũ.
  const maxFiles = Number.isInteger(policy.batchMaxFiles) && policy.batchMaxFiles > 0 ? policy.batchMaxFiles : 1;
  const maxTotal = maxFiles > 1 && Number.isInteger(policy.batchMaxBytes) && policy.batchMaxBytes > 0 ? policy.batchMaxBytes : policy.maxFileBytes;
  const maxBody = maxTotal + MULTIPART_OVERHEAD;
  const tooLarge = () => reply(413, { ok: false, error: maxFiles > 1 ? MESSAGES.batchTooLarge(formatSize(maxTotal)) : MESSAGES.tooLarge(formatSize(policy.maxFileBytes)) }, cors);

  const declared = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBody) return tooLarge();

  const read = await readForm(req, maxBody);
  if (read.error === 'large') return tooLarge();
  if (read.error) return reply(400, { ok: false, errors: { form: MESSAGES.badForm } }, cors);
  const data = read.data;

  // Turnstile.
  const hosts = allowedOrigins(env).map((o) => (URL.canParse(o) ? new URL(o).hostname : '')).filter(Boolean);
  if (!(await verifyTurnstile(data.get('cf-turnstile-response'), env.TURNSTILE_SECRET, hosts, deps.fetch))) {
    return reply(403, { ok: false, error: MESSAGES.turnstile }, cors);
  }

  // Môn, loại, file, các ô. Đợt gửi nhiều file: mỗi file i có tiêu đề title-<i> và loại type-<i> riêng
  // (không có thì dùng ô chung title, type); các ô khác dùng chung cho cả đợt.
  const fields = {};
  for (const [k, v] of data.entries()) if (typeof v === 'string') fields[k] = v;
  const uploads = data.getAll('file').filter((u) => u && typeof u === 'object' && (u.size > 0 || u.name));
  if (uploads.length > maxFiles) return reply(400, { ok: false, errors: { file: MESSAGES.batchCount(maxFiles) } }, cors);
  // Mỗi bài đúng một môn: ô môn hay môn mới gửi lặp thì không đoán ô nào là đúng.
  if (COURSE_FIELDS.some((k) => data.getAll(k).length > 1)) return reply(400, { ok: false, errors: { course: MESSAGES.oneCourse } }, cors);
  const batch = uploads.length > 1;
  if (batch && String(fields.replaces ?? '').trim()) return reply(400, { ok: false, errors: { replaces: MESSAGES.batchReplaces } }, cors);
  const entries = [];
  for (let i = 0; i < Math.max(uploads.length, 1); i += 1) {
    const upload = uploads[i];
    const bytes = upload ? new Uint8Array(await upload.arrayBuffer()) : null;
    const file = bytes ? { name: upload.name, size: bytes.length, head: bytes.subarray(0, HEAD_BYTES) } : null;
    const own = { ...fields };
    if (fields[`title-${i}`] !== undefined) own.title = fields[`title-${i}`];
    if (fields[`type-${i}`] !== undefined) own.type = fields[`type-${i}`];
    const checked = validateSubmission(own, file, { policy, courses: catalog.courses });
    if (!checked.ok) {
      // Lỗi riêng của một file trong đợt gửi ghi kèm số thứ tự để form đặt đúng chỗ.
      const errors = {};
      for (const [k, v] of Object.entries(checked.errors)) errors[batch && ['title', 'type', 'file'].includes(k) ? `${k}-${i}` : k] = v;
      return reply(400, { ok: false, errors }, cors);
    }
    entries.push({ form: checked.form, ext: checked.ext, bytes });
  }
  const totalBytes = entries.reduce((n, e) => n + (e.bytes ? e.bytes.length : 0), 0);
  if (totalBytes > maxTotal) return tooLarge();
  const form = entries[0].form;
  const { newCourse } = form;
  const course = newCourse ? { id: newCourse.code, code: newCourse.code, ids: new Set() } : catalog.courses.get(form.course);

  const code = makeCode(deps.random);
  const used = new Set(course.ids);
  const seenSha = new Set();
  for (const e of entries) {
    e.slug = slugify(e.form.title);
    e.id = uniqueId(e.slug, used);
    used.add(e.id);
    e.stored = null;
    if (!e.bytes) continue;
    // Trùng tài liệu đã có trong thư viện (so cả sha256 file gốc, vì bản đã sanitize khác sha256).
    // Tài liệu đã gỡ vẫn chặn gửi lại, để file bị gỡ theo yêu cầu không quay lại qua form.
    const sha256 = await sha256Hex(e.bytes);
    if (catalog.blocked.has(sha256)) return reply(409, { ok: false, error: MESSAGES.removed }, cors);
    if (catalog.shas.has(sha256)) return reply(409, { ok: false, error: MESSAGES.exists }, cors);
    if (seenSha.has(sha256)) return reply(400, { ok: false, errors: { file: MESSAGES.batchSame } }, cors);
    seenSha.add(sha256);
    const name = fileName({ code: course.code, type: e.form.type, slug: e.slug, term: e.form.term, ext: e.ext });
    e.stored = { name, size: e.bytes.length, sha256, uploadSha256: sha256, mime: policy.extensions[e.ext].mime, quarantine: `pending/${code}/${name}` };
  }
  const stored = entries[0].stored;

  // Dựng sẵn mục và PR trước khi ghi R2, để lỗi ở đây không để lại file mồ côi.
  const today = new Date(deps.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
  for (const e of entries) e.itemText = `${JSON.stringify({ $schema: ITEM_SCHEMA, ...buildItem(e.form, e.stored, today, e.id) }, null, 2)}\n`;
  const courseText = newCourse
    ? `${JSON.stringify(buildNewCourse({ ...newCourse, today, prefixes: faculties.prefixes, handbookTemplate: site.handbookSubjectUrl }), null, 2)}\n`
    : null;
  const base = reviewBase(env);
  const prText = prBody({
    code,
    courseCode: course.code,
    type: form.type,
    file: stored,
    files: batch ? entries.map((e) => ({ type: e.form.type, file: e.stored })) : null,
    viewBase: base,
    newCourse: newCourse ? { code: newCourse.code, handbookUrl: handbookUrlFor(newCourse.code, site.handbookSubjectUrl) } : null,
    replaces: form.replaces ?? null,
    siteBase: String(env.SITE_BASE ?? ''),
  });
  // Mã bí mật cho link xem bài của người gửi; R2 chỉ giữ sha256 của mã.
  const view = base ? await newToken(deps.random) : null;

  const keys = [];
  const cleanup = async () => {
    if (keys.length) await env.QUARANTINE.delete(keys).catch((e) => logFailure('cleanup', e));
  };
  try {
    // Trùng tài liệu đang chờ duyệt.
    for (const e of entries) {
      if (e.stored && (await env.QUARANTINE.head(`sha/${e.stored.sha256}`))) return reply(409, { ok: false, error: MESSAGES.pending }, cors);
    }
    if (!(await countSubmission(env.QUARANTINE, cap, deps.now()))) return capReached();
    for (const e of entries) {
      if (!e.stored) continue;
      await env.QUARANTINE.put(e.stored.quarantine, e.bytes, { httpMetadata: { contentType: e.stored.mime } });
      keys.push(e.stored.quarantine);
      await env.QUARANTINE.put(`sha/${e.stored.sha256}`, code);
      keys.push(`sha/${e.stored.sha256}`);
    }
    if (view) {
      await env.QUARANTINE.put(tokenKey(code), view.hash, { customMetadata: { course: course.id } });
      keys.push(tokenKey(code));
    }
    // Email báo kết quả: chỉ nằm trong bucket quarantine, xóa khi đã gửi (POST /bao-ket-qua) hay khi dọn kho.
    if (form.notifyEmail) {
      await env.QUARANTINE.put(notifyKey(code), JSON.stringify({ email: form.notifyEmail, course: course.id }));
      keys.push(notifyKey(code));
    }
  } catch (err) {
    await cleanup();
    return fail('store', err);
  }

  const branch = `upload/${code}`;
  let branchMade = false;
  let step = 'token';
  try {
    const gh = await github();
    step = 'branch';
    await gh.createBranch(branch, await gh.branchSha(env.BRANCH));
    branchMade = true;
    if (courseText) {
      step = 'course';
      await gh.putFile(newCoursePath(course.code), courseText, branch, `feat(catalog): thêm môn mới ${course.code} gửi qua form ${code}`);
    }
    step = 'item';
    for (const e of entries) {
      await gh.putFile(`courses/${course.id}/items/${e.id}.json`, e.itemText, branch, `feat(courses): thêm tài liệu gửi qua form ${code}`);
    }
    step = 'pr';
    const pr = await gh.openPr({ head: branch, base: env.BRANCH, title: prTitle(code, course.code), body: prText });
    step = 'label';
    await gh.addLabels(pr.number, [LABEL]);
    const out = { ok: true, code };
    if (env.PUBLIC_PR_LINKS === 'true') out.pr = pr.html_url;
    if (view) out.viewUrl = `${base}/xem/${code}?k=${view.token}`;
    return reply(201, out, cors);
  } catch (err) {
    // Dọn hết để không còn file hay branch mồ côi; xóa branch cũng đóng PR nếu đã mở.
    await cleanup();
    if (branchMade) {
      const gh = await github();
      await gh.deleteBranch(branch).catch((e) => logFailure('cleanup', e));
    }
    return fail(step, err);
  }
}

// JSON hỏng hay không phải object thì null (trang duyệt vẫn hiện file của mục).
const asObject = (text) => {
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
async function branchDocs(env, github, code) {
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
async function reviewer(req, env, deps) {
  const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
  const ok = await verifyAccessJwt(jwt, { team: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, fetch: deps.fetch, cache: deps.cache(), now: deps.now });
  return ok ? { email: accessEmail(jwt) } : null;
}

// Trạng thái PR của bài để quyết: PR mở và mọi check của đầu branch đã qua.
async function prState(gh, code) {
  const found = await gh.findPr(`upload/${code}`);
  if (!found || found.state !== 'open') return { open: false };
  const pr = await gh.getPr(found.number);
  return { open: true, number: pr.number, sha: pr.head.sha, green: checksGreen(await gh.checkRuns(pr.head.sha)) };
}

// Người duyệt: JWT của Cloudflare Access phải hợp lệ; thiếu cấu hình thì đóng (503).
// GET /xem-duyet/<mã>: trang duyệt mọi file của bài (chữ người gửi đã thoát HTML, nút xem, tải, quyết định).
// GET /xem-duyet/<mã>/file[/<tên>]: chính file, cùng luật với người gửi.
// POST /xem-duyet/<mã>/duyet: quyết định của người duyệt (xem handleDecision).
async function handleReview(req, env, deps, code, wantFile, fileName = null, decide = false) {
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
  const [{ docs, newCourse }, state] = await Promise.all([branchDocs(env, github, code), prState(await github(), code).catch(() => ({ open: false }))]);
  return reviewBatchPage({ code, docs, newCourse, open: state.open, canDecide: state.open && state.green });
}

// Gộp hay đóng PR thay người duyệt và ghi kết quả. Lỗi GitHub thì trả trang lỗi, không đổi gì thêm.
async function handleDecision(req, env, deps, code, who, github) {
  // Chống gửi form từ trang khác (cookie Access đi kèm): chỉ nhận khi Origin là chính Worker.
  const origin = req.headers.get('Origin');
  if (!origin || origin !== new URL(req.url).origin) return forbiddenPage();
  const form = await req.formData().catch(() => null);
  if (!form) return resultPage(code, REVIEW_MESSAGES.missing, false);
  const fields = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v;
  const gh = await github();
  const state = await prState(gh, code);
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
  for (const d of drop) {
    const doc = docs.find((x) => x.id === d.id);
    await gh.deleteFile(doc.path, branch, `review: bỏ ${d.id} khỏi bài ${code}`);
    const f = doc.item?.files?.[0];
    const keys = [];
    if (f?.name) keys.push(`pending/${code}/${f.name}`, `clean/${code}/${f.name}`);
    for (const sha of [f?.uploadSha256, f?.sha256]) if (typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha)) keys.push(`sha/${sha}`);
    if (keys.length) await env.QUARANTINE.delete(keys).catch((e) => logFailure('review_drop', e));
  }
  await gh.comment(state.number, decisionComment({ keep, drop, pending: true }));
  return resultPage(code, REVIEW_MESSAGES.waiting(drop.length));
}

const prTitleMerge = (code) => `Gộp bài gửi ${code} (đã duyệt trên trang duyệt)`;

// POST /duyet-tiep { code }: workflow tu-gop gọi sau khi bước kiểm qua trên commit dựng lại.
// Không cần khóa: chỉ merge khi đã có quyết định của người duyệt (review/<mã>.json, waiting), PR còn mở,
// mục trên branch đúng bằng danh sách được duyệt, và mọi check của đầu branch đã qua.
async function handleContinue(req, env, deps) {
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
async function continueMerge(env, deps, code) {
  const obj = await env.QUARANTINE.get(reviewKey(code));
  if (!obj) return false;
  const record = JSON.parse(await obj.text());
  if (!record.waiting) return false;
  const gh = await githubFactory(env, deps)();
  const state = await prState(gh, code);
  if (!state.open || !state.green) return false;
  if (!(await gh.commitMessage(state.sha)).startsWith('kiem-file:')) return false;
  const ids = ((await gh.branchItems(env.BRANCH, `upload/${code}`, ITEM_FILE)) ?? []).map((p) => p.split('/').pop().replace(/\.json$/, ''));
  if (ids.length !== record.keep.length || ids.some((id) => !record.keep.includes(id))) return false;
  await gh.mergePr(state.number, state.sha, prTitleMerge(code));
  await env.QUARANTINE.put(reviewKey(code), JSON.stringify({ ...record, waiting: false }));
  return true;
}

// Người gửi: mã bí mật sai hay thiếu thì 404 như không có bài.
async function handleOwner(req, env, deps, code, wantFile) {
  const url = new URL(req.url);
  const k = url.searchParams.get('k');
  const owner = await checkToken(env.QUARANTINE, code, k);
  if (!owner) return notFoundPage();
  const kq = `k=${encodeURIComponent(k)}`;
  const github = githubFactory(env, deps);
  if (wantFile) {
    const { policy } = await catalogFor(env, deps, github);
    return serveFile(env.QUARANTINE, code, {
      policy,
      download: url.searchParams.get('tai') === '1',
      downloadHref: `/xem/${code}/file?${kq}&tai=1`,
    });
  }
  const [status, file] = await Promise.all([
    loadStatus({ repo: env.REPO, code, cache: deps.cache(), github }),
    locateFile(env.QUARANTINE, code),
  ]);
  return statusPage({ code, status, course: owner.course, fileHref: file ? `/xem/${code}/file?${kq}` : null });
}

// POST /bao-ket-qua { code }: gửi email kết quả nếu người gửi có để lại email và PR đã đóng.
// Không cần khóa: Worker tự hỏi GitHub trạng thái PR; gọi thừa không gửi gì, gọi lại sau khi gửi cũng vậy.
async function handleNotify(req, env, deps) {
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
async function notifyCode(env, deps, code) {
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

// Cron (wrangler.jsonc triggers.crons): GitHub Actions không gọi được Worker (Cloudflare chặn IP của
// runner), nên Worker tự đi một vòng: merge bài duyệt một phần đã đủ điều kiện, gửi email của bài đã
// đóng, xóa quyết định duyệt của bài đã đóng mà không có email. Lỗi một bài không chặn bài khác.
const CRON_MAX = 50;
export async function sweep(env, deps) {
  const list = async (prefix) => ((await env.QUARANTINE.list({ prefix, limit: CRON_MAX })).objects ?? []).map((o) => o.key.slice(prefix.length));
  const codeOf = (name) => name.replace(/\.json$/, '');
  for (const code of (await list('review/')).map(codeOf).filter((c) => CODE.test(c))) {
    try {
      if (await continueMerge(env, deps, code)) continue;
      if (await env.QUARANTINE.head(notifyKey(code))) continue;
      const pr = await (await githubFactory(env, deps)()).findPr(`upload/${code}`);
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

// /xem-duyet/<mã>, /xem-duyet/<mã>/file, /xem-duyet/<mã>/file/<tên>, /xem-duyet/<mã>/duyet (POST).
const REVIEW_PATH = /^\/xem-duyet\/([^/]+)(?:(\/file)(?:\/([A-Za-z0-9_-][A-Za-z0-9._-]*))?|(\/duyet))?$/;
const OWNER_PATH = /^\/xem\/([^/]+)(\/file)?$/;
const PREVIEW_PATH = '/xem-truoc';

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
      if (REVIEW_PATH.test(url.pathname) || OWNER_PATH.test(url.pathname)) return handleView(req, env, d, url.pathname);
      if (url.pathname !== '/submit') return reply(404, { ok: false, error: MESSAGES.notFound }, cors);
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            ...cors,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      if (req.method !== 'POST') return reply(405, { ok: false, error: MESSAGES.method }, cors, { Allow: 'POST, OPTIONS' });
      // Lỗi không lường trước vẫn trả JSON kèm CORS để form hiện được thông báo.
      try {
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
