// Worker nhận bài gửi từ form web: kiểm, lưu file vào kho cách ly R2, nhờ bot GitHub App mở PR.
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
import { accessConfigured, verifyAccessJwt } from './access.mjs';
import { handlePreview } from './preview.mjs';
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
  reviewPage,
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
  oneCourse: 'Mỗi bài chỉ gửi cho một môn. Tải lại trang rồi chọn lại môn.',
};

// Ô chọn môn và ô môn mới: mỗi ô chỉ được gửi một lần.
const COURSE_FIELDS = ['course', 'newCourseCode', 'newCourseName'];

// Mục tài liệu trong nhánh của bài (cùng mẫu với scripts/upload/check.mjs).
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
// trong email thông báo). Chữ người gửi chỉ nằm trong file mục tài liệu và trang /xem-duyet/<mã>.
export const prTitle = (code, courseCode) => `Bài gửi ${code}: ${courseCode}`;

// newCourse: { code, handbookUrl } khi bài đề xuất môn chưa có. Mã đã qua mẫu mã môn nên được ghi;
// tên môn là chữ người gửi nên chỉ nằm trong file môn của PR, không ghi ở đây.
export function prBody({ code, courseCode, type, file, viewBase, newCourse = null }) {
  const rows = [
    ['Mã bài', code],
    ['Môn', courseCode],
    ['Loại', TYPES[type]?.vi ?? type],
  ];
  if (file) rows.push(['Kích thước', formatSize(file.size)], ['sha256', file.sha256]);
  const lines = [];
  if (newCourse) {
    lines.push(
      `**Môn mới: ${cell(newCourse.code)}**. Môn này chưa có trong danh mục; bài thêm file \`catalog/courses/${newCourse.code}.json\`.`,
      'Người duyệt kiểm mã, tên và khoa của môn với Sổ tay HCMUT trước khi gộp; sai thì sửa file môn trong PR, trùng môn đã có thì đóng PR.',
    );
    if (newCourse.handbookUrl) lines.push(`Trang môn trên Sổ tay: ${newCourse.handbookUrl}`);
    lines.push('');
  }
  lines.push('| Trường | Giá trị |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${cell(v)} |`), '');
  if (file) lines.push('File nằm trong kho cách ly. CI sẽ kiểm file và ghi kết quả vào PR này.', '');
  if (viewBase) {
    lines.push(`${file ? 'Xem file' : 'Xem bài'} (người duyệt): ${viewBase}/xem-duyet/${code}`, '');
    lines.push('Tiêu đề, mô tả và các ô khác người gửi nhập hiện ở trang trên và trong file mục tài liệu của PR, không ghi ở tiêu đề hay nội dung PR.');
  } else {
    lines.push('Tiêu đề, mô tả và các ô khác người gửi nhập nằm trong file mục tài liệu của PR, không ghi ở tiêu đề hay nội dung PR.');
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
  const maxBody = policy.maxFileBytes + MULTIPART_OVERHEAD;
  const tooLarge = () => reply(413, { ok: false, error: MESSAGES.tooLarge(formatSize(policy.maxFileBytes)) }, cors);

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

  // Môn, loại, file, các ô.
  const fields = {};
  for (const [k, v] of data.entries()) if (typeof v === 'string') fields[k] = v;
  const upload = data.get('file');
  const hasFile = upload && typeof upload === 'object' && (upload.size > 0 || upload.name);
  const bytes = hasFile ? new Uint8Array(await upload.arrayBuffer()) : null;
  const file = bytes ? { name: upload.name, size: bytes.length, head: bytes.subarray(0, HEAD_BYTES) } : null;
  // Mỗi bài đúng một môn: ô môn hay môn mới gửi lặp thì không đoán ô nào là đúng.
  if (COURSE_FIELDS.some((k) => data.getAll(k).length > 1)) return reply(400, { ok: false, errors: { course: MESSAGES.oneCourse } }, cors);
  const checked = validateSubmission(fields, file, { policy, courses: catalog.courses });
  if (!checked.ok) return reply(400, { ok: false, errors: checked.errors }, cors);
  const { form, ext } = checked;
  const { newCourse } = form;
  const course = newCourse ? { id: newCourse.code, code: newCourse.code, ids: new Set() } : catalog.courses.get(form.course);

  const code = makeCode(deps.random);
  const slug = slugify(form.title);
  const id = uniqueId(slug, course.ids);
  let stored = null;
  let shaKey = null;
  if (bytes) {
    // Trùng tài liệu đã có trong thư viện (so cả sha256 file gốc, vì bản đã làm sạch khác sha256).
    // Tài liệu đã gỡ vẫn chặn gửi lại, để file bị gỡ theo yêu cầu không quay lại qua form.
    const sha256 = await sha256Hex(bytes);
    if (catalog.blocked.has(sha256)) return reply(409, { ok: false, error: MESSAGES.removed }, cors);
    if (catalog.shas.has(sha256)) return reply(409, { ok: false, error: MESSAGES.exists }, cors);
    shaKey = `sha/${sha256}`;
    const name = fileName({ code: course.code, type: form.type, slug, term: form.term, ext });
    stored = { name, size: bytes.length, sha256, uploadSha256: sha256, mime: policy.extensions[ext].mime, quarantine: `pending/${code}/${name}` };
  }

  // Dựng sẵn mục và PR trước khi ghi R2, để lỗi ở đây không để lại file mồ côi.
  const today = new Date(deps.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
  const itemText = `${JSON.stringify({ $schema: ITEM_SCHEMA, ...buildItem(form, stored, today, id) }, null, 2)}\n`;
  const courseText = newCourse
    ? `${JSON.stringify(buildNewCourse({ ...newCourse, today, prefixes: faculties.prefixes, handbookTemplate: site.handbookSubjectUrl }), null, 2)}\n`
    : null;
  const base = reviewBase(env);
  const prText = prBody({
    code,
    courseCode: course.code,
    type: form.type,
    file: stored,
    viewBase: base,
    newCourse: newCourse ? { code: newCourse.code, handbookUrl: handbookUrlFor(newCourse.code, site.handbookSubjectUrl) } : null,
  });
  // Mã bí mật cho link xem bài của người gửi; R2 chỉ giữ sha256 của mã.
  const view = base ? await newToken(deps.random) : null;

  const keys = [];
  const cleanup = async () => {
    if (keys.length) await env.QUARANTINE.delete(keys).catch((e) => logFailure('cleanup', e));
  };
  try {
    // Trùng tài liệu đang chờ duyệt.
    if (stored && (await env.QUARANTINE.head(shaKey))) return reply(409, { ok: false, error: MESSAGES.pending }, cors);
    if (!(await countSubmission(env.QUARANTINE, cap, deps.now()))) return capReached();
    if (stored) {
      await env.QUARANTINE.put(stored.quarantine, bytes, { httpMetadata: { contentType: stored.mime } });
      keys.push(stored.quarantine);
      await env.QUARANTINE.put(shaKey, code);
      keys.push(shaKey);
    }
    if (view) {
      await env.QUARANTINE.put(tokenKey(code), view.hash, { customMetadata: { course: course.id } });
      keys.push(tokenKey(code));
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
    await gh.putFile(`courses/${course.id}/items/${id}.json`, itemText, branch, `feat(courses): thêm tài liệu gửi qua form ${code}`);
    step = 'pr';
    const pr = await gh.openPr({ head: branch, base: env.BRANCH, title: prTitle(code, course.code), body: prText });
    step = 'label';
    await gh.addLabels(pr.number, [LABEL]);
    const out = { ok: true, code };
    if (env.PUBLIC_PR_LINKS === 'true') out.pr = pr.html_url;
    if (view) out.viewUrl = `${base}/xem/${code}?k=${view.token}`;
    return reply(201, out, cors);
  } catch (err) {
    // Dọn hết để không còn file hay nhánh mồ côi; xóa nhánh cũng đóng PR nếu đã mở.
    await cleanup();
    if (branchMade) {
      const gh = await github();
      await gh.deleteBranch(branch).catch((e) => logFailure('cleanup', e));
    }
    return fail(step, err);
  }
}

const asObject = (text) => {
  const v = text === null ? null : JSON.parse(text);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
};

// Mục tài liệu trên nhánh upload/<mã> (đúng một file mục, đọc thô), và file môn mới của đúng môn đó
// nếu bài thêm môn chưa có (file thêm mới so với nhánh chính). Lỗi hay không rõ thì null.
async function branchItem(env, github, code) {
  const out = { item: null, newCourse: null };
  try {
    const gh = await github();
    const branch = `upload/${code}`;
    const files = (await gh.changedFiles(env.BRANCH, branch)) ?? [];
    const hits = files.filter((f) => ITEM_FILE.test(f.filename) && f.status !== 'removed');
    if (hits.length !== 1) return out;
    const coursePath = newCoursePath(hits[0].filename.split('/')[1]);
    const added = files.some((f) => f.filename === coursePath && f.status === 'added');
    const [itemText, courseText] = await Promise.all([gh.getRaw(hits[0].filename, branch), added ? gh.getRaw(coursePath, branch) : null]);
    out.item = asObject(itemText);
    if (added) out.newCourse = asObject(courseText);
  } catch (err) {
    logFailure('review_item', err);
  }
  return out;
}

// Người duyệt: JWT của Cloudflare Access phải hợp lệ; thiếu cấu hình thì đóng (503).
// /xem-duyet/<mã>: trang có chữ người gửi nhập (đã thoát HTML) và nút xem, tải file.
// /xem-duyet/<mã>/file: chính file, cùng luật với người gửi.
async function handleReview(req, env, deps, code, wantFile) {
  if (!accessConfigured(env)) return unconfiguredPage();
  const ok = await verifyAccessJwt(req.headers.get('Cf-Access-Jwt-Assertion'), {
    team: env.ACCESS_TEAM_DOMAIN,
    aud: env.ACCESS_AUD,
    fetch: deps.fetch,
    cache: deps.cache(),
    now: deps.now,
  });
  if (!ok) return forbiddenPage();
  // Kiểm quyền trước mã bài, để người ngoài không dò được mã qua 404.
  if (!CODE.test(code)) return notFoundPage();
  const url = new URL(req.url);
  const github = githubFactory(env, deps);
  if (wantFile) {
    const { policy } = await catalogFor(env, deps, github);
    return serveFile(env.QUARANTINE, code, {
      policy,
      download: url.searchParams.get('tai') === '1',
      downloadHref: `/xem-duyet/${code}/file?tai=1`,
    });
  }
  const [{ item, newCourse }, file] = await Promise.all([branchItem(env, github, code), locateFile(env.QUARANTINE, code)]);
  return reviewPage({ code, item, file, newCourse });
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

const REVIEW_PATH = /^\/xem-duyet\/([^/]+)(\/file)?$/;
const OWNER_PATH = /^\/xem\/([^/]+)(\/file)?$/;
const PREVIEW_PATH = '/xem-truoc';

async function handleView(req, env, deps, path) {
  if (req.method !== 'GET') return methodPage();
  const review = REVIEW_PATH.exec(path);
  const owner = review ? null : OWNER_PATH.exec(path);
  const code = (review ?? owner)?.[1] ?? '';
  try {
    if (review) return await handleReview(req, env, deps, code, Boolean(review[2]));
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
  };
}

export default createHandler();
