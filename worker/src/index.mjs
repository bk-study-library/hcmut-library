// Worker nhận bài gửi từ form web: kiểm, lưu file vào kho cách ly R2, nhờ bot GitHub App mở PR.
import { validateSubmission } from './validate.mjs';
import { GitHub, GitHubError, installationToken } from './github.mjs';
import { loadCatalog } from './catalog.mjs';
import { slugify, fileName, uniqueId } from '../../scripts/upload/naming.mjs';
import { buildItem } from '../../scripts/upload/item.mjs';
import { formatSize } from '../../scripts/lib/labels.mjs';

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
  failed: 'Chưa gửi được. Thử lại sau ít phút.',
};

// Nhãn các ô trong bảng của PR, theo thứ tự hiện.
const PR_FIELDS = [
  ['course', 'Môn'],
  ['type', 'Loại'],
  ['title', 'Tiêu đề'],
  ['description', 'Mô tả'],
  ['lang', 'Ngôn ngữ'],
  ['license', 'Giấy phép'],
  ['chapter', 'Chương'],
  ['term', 'Học kỳ'],
  ['examKind', 'Loại kiểm tra'],
  ['teacher', 'Giảng viên'],
  ['displayName', 'Tên hiển thị'],
];
const PR_BOOK_FIELDS = [
  ['title', 'Tên sách'],
  ['authors', 'Tác giả'],
  ['year', 'Năm'],
  ['publisher', 'Nhà xuất bản'],
  ['isbn', 'ISBN'],
];

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
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

async function verifyTurnstile(token, secret, fetch) {
  if (!token) return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  try {
    const res = await fetch(TURNSTILE_URL, { method: 'POST', body });
    const out = await res.json();
    return out.success === true;
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

// Ô bảng Markdown: không vỡ bảng, không thành thẻ HTML, không nhắc tên ai bằng @.
function cell(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@/g, '&#64;')
    .replace(/\|/g, '\\|')
    .replace(/\s*\r?\n\s*/g, ' ');
}

function prBody(form, code, file) {
  const rows = [];
  for (const [key, label] of PR_FIELDS) if (form[key]) rows.push([label, form[key]]);
  if (form.book) {
    for (const [key, label] of PR_BOOK_FIELDS) {
      const v = form.book[key];
      if (v !== undefined && v !== '') rows.push([label, Array.isArray(v) ? v.join(', ') : v]);
    }
  }
  const lines = ['| Trường | Giá trị |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${cell(v)} |`), '', `Mã bài: \`${code}\``];
  if (file) {
    lines.push(
      `sha256: \`${file.sha256}\``,
      `Kích thước: ${formatSize(file.size)}`,
      '',
      `File nằm trong kho cách ly tại \`${file.quarantine}\`. CI sẽ kiểm file và ghi kết quả vào PR này.`,
    );
  }
  return `${lines.join('\n')}\n`;
}

// Chỉ ghi bước và mã lỗi, không ghi IP, tên, tên file hay tiêu đề.
function logFailure(step, err) {
  console.error(JSON.stringify({ event: 'submit_failed', step, status: err instanceof GitHubError ? err.status : null, error: err?.name ?? 'Error' }));
}

async function handleSubmit(req, env, deps, cors) {
  let ghPromise;
  const github = () => {
    ghPromise ??= installationToken({
      appId: env.GH_APP_ID,
      pkcs8Pem: env.GH_APP_PRIVATE_KEY,
      installationId: env.GH_INSTALLATION_ID,
      fetch: deps.fetch,
    }).then((token) => new GitHub({ repo: env.REPO, token, fetch: deps.fetch }));
    return ghPromise;
  };
  const fail = (step, err) => {
    logFailure(step, err);
    return reply(err instanceof GitHubError ? 502 : 500, { ok: false, error: MESSAGES.failed }, cors);
  };

  let catalog;
  try {
    catalog = await loadCatalog({
      repo: env.REPO,
      branch: env.BRANCH,
      ttl: Number(env.CATALOG_TTL_SECONDS) || 0,
      cache: deps.cache(),
      github,
    });
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

  // 1. Turnstile.
  if (!(await verifyTurnstile(data.get('cf-turnstile-response'), env.TURNSTILE_SECRET, deps.fetch))) {
    return reply(403, { ok: false, error: MESSAGES.turnstile }, cors);
  }

  // 2. Số lần gửi theo IP; IP chỉ dùng làm khóa, không lưu.
  const limit = await env.SUBMIT_LIMIT.limit({ key: req.headers.get('CF-Connecting-IP') ?? 'unknown' });
  if (!limit.success) return reply(429, { ok: false, error: MESSAGES.rateLimit }, cors);

  // 3 đến 5. Môn, loại, file, các ô.
  const fields = {};
  for (const [k, v] of data.entries()) if (typeof v === 'string') fields[k] = v;
  const upload = data.get('file');
  const hasFile = upload && typeof upload === 'object' && (upload.size > 0 || upload.name);
  const bytes = hasFile ? new Uint8Array(await upload.arrayBuffer()) : null;
  const file = bytes ? { name: upload.name, size: bytes.length, head: bytes.subarray(0, HEAD_BYTES) } : null;
  const checked = validateSubmission(fields, file, { policy, courses: catalog.courses });
  if (!checked.ok) return reply(400, { ok: false, errors: checked.errors }, cors);
  const { form, ext } = checked;
  const course = catalog.courses.get(form.course);

  const code = makeCode(deps.random);
  const slug = slugify(form.title);
  const id = uniqueId(slug, course.ids);
  let stored = null;
  const keys = [];

  if (bytes) {
    // Trùng tài liệu đã có hoặc đang chờ duyệt.
    const sha256 = await sha256Hex(bytes);
    if (catalog.shas.has(sha256)) return reply(409, { ok: false, error: MESSAGES.exists }, cors);
    const shaKey = `sha/${sha256}`;
    const name = fileName({ code: course.code, type: form.type, slug, term: form.term, ext });
    const quarantine = `pending/${code}/${name}`;
    try {
      if (await env.QUARANTINE.head(shaKey)) return reply(409, { ok: false, error: MESSAGES.pending }, cors);
      await env.QUARANTINE.put(quarantine, bytes, { httpMetadata: { contentType: policy.extensions[ext].mime } });
      keys.push(quarantine);
      await env.QUARANTINE.put(shaKey, code);
      keys.push(shaKey);
    } catch (err) {
      if (keys.length) await env.QUARANTINE.delete(keys).catch(() => {});
      return fail('store', err);
    }
    stored = { name, size: bytes.length, sha256, mime: policy.extensions[ext].mime, quarantine };
  }

  const today = new Date(deps.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
  const item = { $schema: ITEM_SCHEMA, ...buildItem(form, stored, today, id) };
  const branch = `upload/${code}`;
  let branchMade = false;
  let step = 'token';
  try {
    const gh = await github();
    step = 'branch';
    await gh.createBranch(branch, await gh.branchSha(env.BRANCH));
    branchMade = true;
    step = 'item';
    await gh.putFile(`courses/${course.id}/items/${id}.json`, `${JSON.stringify(item, null, 2)}\n`, branch, `feat(courses): thêm tài liệu gửi qua form ${code}`);
    step = 'pr';
    const pr = await gh.openPr({
      head: branch,
      base: env.BRANCH,
      title: `Tài liệu mới: ${course.code} ${form.title}`,
      body: prBody(form, code, stored),
    });
    step = 'label';
    await gh.addLabels(pr.number, [LABEL]);
    const out = { ok: true, code };
    if (env.PUBLIC_PR_LINKS === 'true') out.pr = pr.html_url;
    return reply(201, out, cors);
  } catch (err) {
    // Dọn hết để không còn file hay nhánh mồ côi; xóa nhánh cũng đóng PR nếu đã mở.
    if (keys.length) await env.QUARANTINE.delete(keys).catch(() => {});
    if (branchMade) {
      const gh = await github();
      await gh.deleteBranch(branch).catch((e) => logFailure('cleanup', e));
    }
    return fail(step, err);
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
      return handleSubmit(req, env, d, cors);
    },
  };
}

export default createHandler();
