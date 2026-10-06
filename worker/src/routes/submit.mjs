// POST /submit: nhận bài từ form web. Kiểm Turnstile, giới hạn, phiếu và file; lưu file vào bucket quarantine trên R2;
// bot GitHub App tạo branch upload/<mã bài>, ghi item (và môn mới nếu có), mở PR có label tai-lieu-moi.
import { validateSubmission } from '../validate.mjs';
import { GitHubError } from '../github.mjs';
import { slugify, fileName, uniqueId } from '../../../scripts/upload/naming.mjs';
import { buildItem } from '../../../scripts/upload/item.mjs';
import { buildNewCourse, handbookUrlFor, newCoursePath } from '../../../scripts/upload/course.mjs';
// Tiền tố khoa và mẫu link Sổ tay đóng gói lúc deploy (như policy.json ở preview.mjs): đổi thì deploy lại.
import faculties from '../../../catalog/faculties.json';
import site from '../../../catalog/site.json';
import { formatSize, TYPES } from '../../../scripts/lib/labels.mjs';
import { rateKey, dailyCap, dailyCapReached, countSubmission } from '../limits.mjs';
import { notifyKey } from '../notify.mjs';
import { newToken, tokenKey } from '../view.mjs';
import { allowedOrigins, reply, logFailure, MESSAGES } from '../http.mjs';
import { githubFactory, catalogFor, reviewBase } from '../deps.mjs';
import { startUpload } from './upload.mjs';

export const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Phần thêm của multipart ngoài file: ranh giới, tên ô, các ô chữ.
export const MULTIPART_OVERHEAD = 64 * 1024;

export const HEAD_BYTES = 16;

export const CODE_LENGTH = 10;

export const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Byte ngẫu nhiên từ 248 trở lên bị bỏ để mỗi ký tự có xác suất như nhau (248 = 4 x 62).
export const CODE_BYTE_LIMIT = 248;

export const LABEL = 'tai-lieu-moi';

export const ITEM_SCHEMA = '../../../schema/item.schema.json';

// Ngày thêm tính theo giờ Việt Nam (UTC+7).
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// Ô chọn môn và ô môn mới: mỗi ô chỉ được gửi một lần.
export const COURSE_FIELDS = ['course', 'newCourseCode', 'newCourseName'];

// Đọc form, đếm byte khi đọc; vượt max thì dừng đọc, kể cả khi Content-Length nói sai.
export async function readForm(req, max) {
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

// File của bài tải theo phần: ô file-count và file-name-<i>, file-size-<i>, file-sha256-<i>, file-head-<i> (16 byte
// đầu, base64, để kiểm dạng file như bài thường). Sai dạng thì null.
export function chunkedFiles(fields) {
  const n = Number(fields['file-count']);
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const name = String(fields[`file-name-${i}`] ?? '');
    const size = Number(fields[`file-size-${i}`]);
    const sha256 = String(fields[`file-sha256-${i}`] ?? '');
    let head;
    try {
      head = Uint8Array.from(atob(String(fields[`file-head-${i}`] ?? '')), (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
    if (!name || !Number.isSafeInteger(size) || size < 1 || !/^[0-9a-f]{64}$/.test(sha256) || head.length > HEAD_BYTES) return null;
    out.push({ name, size, sha256, head });
  }
  return out;
}

// Qua Turnstile và widget nằm trên trang của mình (hostname thuộc ALLOWED_ORIGINS).
export async function verifyTurnstile(token, secret, hosts, fetch) {
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

export function makeCode(random) {
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const b of random(CODE_LENGTH * 2)) {
      if (b < CODE_BYTE_LIMIT && code.length < CODE_LENGTH) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return code;
}

export async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Ô trong bảng của PR: không vỡ bảng, không thành thẻ HTML, không nhắc tên ai bằng @, không thành
// tham chiếu issue (#) hay liên kết ([ ], địa chỉ trần dạng https://... hoặc www....). Bảng hiện chỉ
// có giá trị lấy từ danh mục và policy, nhưng vẫn thoát phòng khi sau này thêm ô.
export const CELL_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '@': '&#64;', '#': '&#35;', '[': '&#91;', ']': '&#93;', '|': '\\|' };

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

// trusted: gọi từ POST /xem-duyet/nap (routes/intake.mjs) sau khi Access đã xác nhận người duyệt: bỏ giới hạn theo IP và
// Turnstile; mọi phần kiểm khác như bài gửi qua form.
export async function handleSubmit(req, env, deps, cors, { trusted = false } = {}) {
  const github = githubFactory(env, deps);
  const fail = (step, err) => {
    logFailure(step, err);
    return reply(err instanceof GitHubError ? 502 : 500, { ok: false, error: MESSAGES.failed }, cors);
  };

  // Số lần gửi theo dải địa chỉ (IPv4 /32, IPv6 /64), trước mọi lời gọi GitHub và trước khi đọc body.
  // IP chỉ dùng làm khóa, không lưu.
  const limit = trusted ? { success: true } : await env.SUBMIT_LIMIT.limit({ key: rateKey(req.headers.get('CF-Connecting-IP')) });
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
  // Gửi thẳng trong một request: Worker nhận thân request tối đa 100 MB, nên file lớn hơn directMaxBytes đi đường tải
  // theo phần (routes/upload.mjs); request đó chỉ có các ô chữ.
  const maxBody = Math.min(maxTotal, Number.isInteger(policy.directMaxBytes) ? policy.directMaxBytes : maxTotal) + MULTIPART_OVERHEAD;
  const tooLarge = () => reply(413, { ok: false, error: maxFiles > 1 ? MESSAGES.batchTooLarge(formatSize(maxTotal)) : MESSAGES.tooLarge(formatSize(policy.maxFileBytes)) }, cors);

  const declared = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBody) return tooLarge();

  const read = await readForm(req, maxBody);
  if (read.error === 'large') return tooLarge();
  if (read.error) return reply(400, { ok: false, errors: { form: MESSAGES.badForm } }, cors);
  const data = read.data;

  // Turnstile.
  const hosts = allowedOrigins(env).map((o) => (URL.canParse(o) ? new URL(o).hostname : '')).filter(Boolean);
  if (!trusted && !(await verifyTurnstile(data.get('cf-turnstile-response'), env.TURNSTILE_SECRET, hosts, deps.fetch))) {
    return reply(403, { ok: false, error: MESSAGES.turnstile }, cors);
  }

  // Môn, loại, file, các ô. Đợt gửi nhiều file: mỗi file i có tiêu đề title-<i> và loại type-<i> riêng
  // (không có thì dùng ô chung title, type); các ô khác dùng chung cho cả đợt.
  const fields = {};
  for (const [k, v] of data.entries()) if (typeof v === 'string') fields[k] = v;
  // Tải theo phần (file lớn, xem routes/upload.mjs): form chỉ gửi tên, cỡ, sha256, 16 byte đầu của từng file.
  const chunked = fields.upload === 'chunked';
  const uploads = chunked ? chunkedFiles(fields) : data.getAll('file').filter((u) => u && typeof u === 'object' && (u.size > 0 || u.name));
  if (uploads === null) return reply(400, { ok: false, errors: { form: MESSAGES.badForm } }, cors);
  if (uploads.length > maxFiles) return reply(400, { ok: false, errors: { file: MESSAGES.batchCount(maxFiles) } }, cors);
  // Mỗi bài đúng một môn: ô môn hay môn mới gửi lặp thì không đoán ô nào là đúng.
  if (COURSE_FIELDS.some((k) => data.getAll(k).length > 1)) return reply(400, { ok: false, errors: { course: MESSAGES.oneCourse } }, cors);
  const batch = uploads.length > 1;
  if (batch && String(fields.replaces ?? '').trim()) return reply(400, { ok: false, errors: { replaces: MESSAGES.batchReplaces } }, cors);
  const entries = [];
  for (let i = 0; i < Math.max(uploads.length, 1); i += 1) {
    const upload = uploads[i];
    const bytes = upload && !chunked ? new Uint8Array(await upload.arrayBuffer()) : null;
    const file = !upload ? null : chunked ? { name: upload.name, size: upload.size, head: upload.head } : { name: upload.name, size: bytes.length, head: bytes.subarray(0, HEAD_BYTES) };
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
    entries.push({ form: checked.form, ext: checked.ext, bytes, file, clientSha: upload?.sha256 ?? null });
  }
  const totalBytes = entries.reduce((n, e) => n + (e.file ? e.file.size : 0), 0);
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
    if (!e.file) continue;
    // Trùng tài liệu đã có trong thư viện (so cả sha256 file gốc, vì bản đã sanitize khác sha256).
    // Tài liệu đã gỡ vẫn chặn gửi lại, để file bị gỡ theo yêu cầu không quay lại qua form.
    // Tải theo phần: sha256 do trình duyệt tính; kiem-file tính lại trên file thật, sai thì bài không qua.
    const sha256 = e.bytes ? await sha256Hex(e.bytes) : e.clientSha;
    if (catalog.blocked.has(sha256)) return reply(409, { ok: false, error: MESSAGES.removed }, cors);
    if (catalog.shas.has(sha256)) return reply(409, { ok: false, error: MESSAGES.exists }, cors);
    if (seenSha.has(sha256)) return reply(400, { ok: false, errors: { file: MESSAGES.batchSame } }, cors);
    seenSha.add(sha256);
    const name = fileName({ code: course.code, type: e.form.type, slug: e.slug, term: e.form.term, ext: e.ext });
    e.stored = { name, size: e.file.size, sha256, uploadSha256: sha256, mime: policy.extensions[e.ext].mime, quarantine: `pending/${code}/${name}` };
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
  const draft = {
    code,
    courseId: course.id,
    courseCode: course.code,
    entries: entries.map((e) => ({ id: e.id, stored: e.stored, itemText: e.itemText })),
    courseText,
    prText,
    notifyEmail: form.notifyEmail || null,
  };
  if (await pendingSha(env, draft)) return reply(409, { ok: false, error: MESSAGES.pending }, cors);
  if (!(await countSubmission(env.QUARANTINE, cap, deps.now()))) return capReached();
  // File lớn: tạo phiên tải theo phần, trình duyệt gửi từng phần rồi gọi /submit/<mã>/xong (routes/upload.mjs).
  if (chunked) return startUpload(env, deps, draft, policy, cors);

  // Tải thẳng: ghi file vào R2 rồi mở PR.
  const keys = [];
  try {
    for (const e of entries) {
      if (!e.stored) continue;
      await env.QUARANTINE.put(e.stored.quarantine, e.bytes, { httpMetadata: { contentType: e.stored.mime } });
      keys.push(e.stored.quarantine);
    }
  } catch (err) {
    await deleteKeys(env, keys);
    return fail('store', err);
  }
  return openSubmission(env, deps, draft, keys, cors);
}

// Bài đang chờ duyệt có cùng file (sha/<sha256> trong R2).
async function pendingSha(env, draft) {
  for (const e of draft.entries) if (e.stored && (await env.QUARANTINE.head(`sha/${e.stored.sha256}`))) return true;
  return false;
}

async function deleteKeys(env, keys) {
  if (keys.length) await env.QUARANTINE.delete(keys).catch((e) => logFailure('cleanup', e));
}

// File đã nằm trong R2 (keys): ghi khóa phụ của bài (sha256 file, mã xem bài, email), tạo branch, item (và môn mới),
// mở PR có label. Lỗi thì xóa mọi khóa đã ghi và branch, để không còn file hay branch mồ côi.
export async function openSubmission(env, deps, draft, keys, cors) {
  const github = githubFactory(env, deps);
  const fail = (step, err) => {
    logFailure(step, err);
    return reply(err instanceof GitHubError ? 502 : 500, { ok: false, error: MESSAGES.failed }, cors);
  };
  const { code } = draft;
  const base = reviewBase(env);
  // Mã bí mật cho link xem bài của người gửi; R2 chỉ giữ sha256 của mã.
  const view = base ? await newToken(deps.random) : null;
  try {
    for (const e of draft.entries) {
      if (!e.stored) continue;
      await env.QUARANTINE.put(`sha/${e.stored.sha256}`, code);
      keys.push(`sha/${e.stored.sha256}`);
    }
    if (view) {
      await env.QUARANTINE.put(tokenKey(code), view.hash, { customMetadata: { course: draft.courseId } });
      keys.push(tokenKey(code));
    }
    // Email báo kết quả: chỉ nằm trong bucket quarantine, xóa khi đã gửi hay khi dọn kho.
    if (draft.notifyEmail) {
      await env.QUARANTINE.put(notifyKey(code), JSON.stringify({ email: draft.notifyEmail, course: draft.courseId }));
      keys.push(notifyKey(code));
    }
  } catch (err) {
    await deleteKeys(env, keys);
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
    if (draft.courseText) {
      step = 'course';
      await gh.putFile(newCoursePath(draft.courseCode), draft.courseText, branch, `feat(catalog): thêm môn mới ${draft.courseCode} gửi qua form ${code}`);
    }
    step = 'item';
    for (const e of draft.entries) {
      await gh.putFile(`courses/${draft.courseId}/items/${e.id}.json`, e.itemText, branch, `feat(courses): thêm tài liệu gửi qua form ${code}`);
    }
    step = 'pr';
    const pr = await gh.openPr({ head: branch, base: env.BRANCH, title: prTitle(code, draft.courseCode), body: draft.prText });
    step = 'label';
    await gh.addLabels(pr.number, [LABEL]);
    const out = { ok: true, code };
    if (env.PUBLIC_PR_LINKS === 'true') out.pr = pr.html_url;
    if (view) out.viewUrl = `${base}/xem/${code}?k=${view.token}`;
    return reply(201, out, cors);
  } catch (err) {
    // Dọn hết để không còn file hay branch mồ côi; xóa branch cũng đóng PR nếu đã mở.
    await deleteKeys(env, keys);
    if (branchMade) {
      const gh = await github();
      await gh.deleteBranch(branch).catch((e) => logFailure('cleanup', e));
    }
    return fail(step, err);
  }
}
