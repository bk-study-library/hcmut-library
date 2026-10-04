// Xem file chờ duyệt: người duyệt (/xem-duyet/<mã>, sau Cloudflare Access) và người gửi
// (/xem/<mã>?k=<mã bí mật>). File trong kho cách ly không bao giờ công khai: mọi đường đều kiểm
// quyền trước khi đọc R2. Không ghi log mã bí mật, IP hay tên file.
import { SITE_URL, TYPES, EXAM_KINDS, formatSize } from '../../scripts/lib/labels.mjs';

export const CODE = /^[A-Za-z0-9]{10}$/;
// 32 byte base64url không đệm: 43 ký tự.
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_BYTES = 32;
const STATUS_TTL_SECONDS = 60;
// Chỉ các loại này mở thẳng trong trình duyệt; loại khác luôn tải về.
const INLINE_EXT = new Set(['.pdf', '.png', '.jpg']);

export const VIEW_MESSAGES = {
  notFoundTitle: 'Không tìm thấy',
  notFound: 'Không tìm thấy trang này. Kiểm tra lại link bạn nhận được.',
  forbiddenTitle: 'Không có quyền',
  forbidden: 'Bạn không có quyền xem trang này. Đăng nhập bằng tài khoản GitHub thuộc nhóm duyệt bài rồi thử lại.',
  unconfiguredTitle: 'Chưa cài đặt',
  unconfigured: 'Trang xem file cho người duyệt chưa được cài đặt. Thử lại sau.',
  failedTitle: 'Có lỗi',
  failed: 'Chưa đọc được dữ liệu. Thử lại sau ít phút.',
  method: 'Không hỗ trợ cách gọi này.',
  pendingTitle: 'File chưa quét virus xong',
  pending: 'Máy chưa quét virus xong cho file này. Chỉ tải về khi cần xem ngay, và mở bằng máy có phần mềm diệt virus.',
  pendingButton: 'Tải file chưa quét',
  statusTitle: (code) => `Bài gửi ${code}`,
  open: 'Đang chờ duyệt.',
  merged: 'Đã đăng.',
  mergedLink: 'Xem trang môn',
  closed: 'Không được nhận. Bài đã đóng mà không đăng.',
  unknown: 'Chưa đọc được trạng thái bài. Thử lại sau ít phút.',
  fileButton: 'Xem file',
  noFile: 'File không còn trong kho chờ duyệt.',
  secret: 'Link này là bí mật, chỉ bạn có. Đừng chia sẻ cho người khác. Link hết hạn khi file chờ duyệt bị xóa.',
  reviewTitle: (code) => `Duyệt bài ${code}`,
  fieldsTitle: 'Nội dung người gửi nhập',
  fieldsNote: 'Chữ dưới đây do người gửi nhập, chưa ai duyệt. Đọc kỹ trước khi gộp; có chữ xúc phạm, quảng cáo hay link lạ thì đóng PR.',
  noItem: 'Không đọc được mục tài liệu từ nhánh của bài. Nhánh có thể đã bị xóa.',
  fileTitle: 'File',
  viewFile: 'Xem file',
  downloadFile: 'Tải file',
  noFileBook: 'Bài này là sách tham khảo, không có file.',
  newCourseTitle: (code) => `Môn mới: ${code}`,
  newCourseNote: 'Bài này thêm một môn chưa có trong danh mục. Mở trang môn trên Sổ tay HCMUT, kiểm mã, tên và khoa trước khi gộp. Sai thì sửa file môn trong PR; trùng môn đã có thì đóng PR và nhờ người gửi chọn môn đó.',
  newCourseCode: 'Mã môn',
  newCourseName: 'Tên môn',
  newCourseFaculty: 'Khoa',
  newCourseHandbook: 'Mở trang môn trên Sổ tay',
  batchFile: (i, n) => `File ${i} trên ${n}`,
  decideTitle: 'Quyết định',
  keep: 'Duyệt',
  drop: 'Không duyệt',
  reasonLabel: 'Lý do không duyệt (gửi cho người gửi qua email nếu họ để lại)',
  submit: 'Hoàn tất duyệt',
  submitNote: 'Bấm Hoàn tất: file không duyệt bị bỏ khỏi bài, phần còn lại được gộp vào thư viện. Không duyệt hết thì bài bị đóng.',
  checksWait: 'Bước kiểm file trên GitHub chưa xong. Xem nội dung trước, rồi tải lại trang khi bước kiểm xong để duyệt.',
  closedNote: 'Bài này đã đóng hoặc đã gộp, không duyệt được nữa.',
  resultTitle: 'Kết quả duyệt',
  backToReview: 'Quay lại trang duyệt',
};

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Bảng màu giống site (site-src/assets), sáng tối theo hệ thống.
const CSS = [
  ':root{color-scheme:light dark;--bg:#fafafa;--surface:#fff;--text:#242424;--muted:#616161;--border:#e0e0e0;',
  '--accent:#0f6cbd;--accent-text:#fff;--warn:#8a3707;--warn-soft:#fdf6f3}',
  '@media (prefers-color-scheme:dark){:root{--bg:#1f1f1f;--surface:#292929;--text:#fff;--muted:#c7c7c7;--border:#3d3d3d;',
  '--accent:#479ef5;--accent-text:#0a0a0a;--warn:#f4bfab;--warn-soft:#3b1f14}}',
  'body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",system-ui,-apple-system,Roboto,"Noto Sans",Arial,sans-serif;line-height:1.5}',
  'main{max-width:40rem;margin:2rem auto;padding:1.5rem 16px;background:var(--surface);border:1px solid var(--border);border-radius:6px}',
  'h1{font-size:1.4rem;margin:0 0 1rem}a{color:var(--accent)}.muted{color:var(--muted)}',
  '.warn{color:var(--warn);background:var(--warn-soft);padding:.75rem;border-radius:6px}',
  '.btn{display:inline-block;padding:.5rem 1rem;border-radius:6px;background:var(--accent);color:var(--accent-text);text-decoration:none}',
  'h2{font-size:1.1rem;margin:1.5rem 0 .5rem}.actions{display:flex;flex-wrap:wrap;gap:8px}',
  'dl.fields{margin:0 0 1rem}dl.fields dt{font-weight:600;margin-top:.75rem}dl.fields dd{margin:.25rem 0 0;white-space:pre-wrap;overflow-wrap:anywhere}',
  'section.doc{border:1px solid var(--border);border-radius:8px;padding:1rem;margin:1rem 0}fieldset{border:0;margin:.75rem 0 0;padding:0}',
  'fieldset label{display:inline-flex;align-items:center;gap:.4rem;margin-right:1rem;min-height:2rem}',
  'textarea{width:100%;box-sizing:border-box;min-height:4rem;font:inherit;padding:.5rem;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)}',
  'button.btn{border:0;font:inherit;cursor:pointer}',
].join('');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
};

// formSelf: trang có form gửi về chính Worker (trang duyệt); trang khác không gửi form đi đâu.
export function htmlPage(status, title, body, extra = {}, { formSelf = false } = {}) {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><main><h1>${esc(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action ${formSelf ? "'self'" : "'none'"}; frame-ancestors 'none'`,
      'X-Robots-Tag': 'noindex',
      ...SECURITY_HEADERS,
      ...extra,
    },
  });
}

const para = (text, cls) => `<p${cls ? ` class="${cls}"` : ''}>${esc(text)}</p>`;
export const notFoundPage = () => htmlPage(404, VIEW_MESSAGES.notFoundTitle, para(VIEW_MESSAGES.notFound));
export const forbiddenPage = () => htmlPage(403, VIEW_MESSAGES.forbiddenTitle, para(VIEW_MESSAGES.forbidden));
export const unconfiguredPage = () => htmlPage(503, VIEW_MESSAGES.unconfiguredTitle, para(VIEW_MESSAGES.unconfigured));
export const failedPage = () => htmlPage(502, VIEW_MESSAGES.failedTitle, para(VIEW_MESSAGES.failed));
export const methodPage = () => htmlPage(405, VIEW_MESSAGES.failedTitle, para(VIEW_MESSAGES.method), { Allow: 'GET' });

// ---------- Mã bí mật của người gửi ----------

function base64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

// So hai chuỗi cùng độ dài trong thời gian không phụ thuộc vị trí ký tự khác.
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const tokenKey = (code) => `token/${code}`;

// Tạo mã bí mật mới: trả mã (chỉ gửi cho người gửi) và sha256 của mã (lưu vào R2).
export async function newToken(random) {
  const token = base64Url(random(TOKEN_BYTES));
  return { token, hash: await sha256Hex(token) };
}

// Đọc token/<mã>: trả siêu dữ liệu (môn) khi mã bí mật đúng, null khi sai, thiếu hay không có bài.
export async function checkToken(r2, code, k) {
  if (!CODE.test(code) || typeof k !== 'string' || !TOKEN.test(k)) return null;
  const obj = await r2.get(tokenKey(code));
  if (!obj) return null;
  const stored = (await obj.text()).trim();
  const ok = sameText(await sha256Hex(k), stored);
  return ok ? { course: obj.customMetadata?.course ?? '' } : null;
}

// ---------- File trong kho cách ly ----------

// Ưu tiên bản đã làm sạch; chưa có thì bản gốc chưa quét. Trả { key, name, clean } hoặc null.
// name: tên file trong đợt gửi nhiều file (đã qua mẫu tên an toàn); không có thì file đầu tiên.
export async function locateFile(r2, code, name = null) {
  for (const [prefix, clean] of [[`clean/${code}/`, true], [`pending/${code}/`, false]]) {
    if (name) {
      const obj = await r2.head(`${prefix}${name}`);
      if (obj) return { key: `${prefix}${name}`, name, clean, size: obj.size };
      continue;
    }
    const list = await r2.list({ prefix, limit: 1 });
    const obj = list.objects?.[0];
    if (obj) return { key: obj.key, name: obj.key.slice(prefix.length), clean, size: obj.size };
  }
  return null;
}

const extOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
};

// Header trả file: chặn chạy nội dung (sandbox), không đoán loại, không lưu cache, không lộ link qua Referer.
export function fileHeaders(name, policy, { forceDownload = false } = {}) {
  const ext = extOf(name);
  const mime = policy?.extensions?.[ext]?.mime ?? 'application/octet-stream';
  const inline = !forceDownload && INLINE_EXT.has(ext);
  return {
    'Content-Type': mime,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Content-Security-Policy': 'sandbox',
    ...SECURITY_HEADERS,
  };
}

// Trả file của bài. Bản chưa quét: trang cảnh báo kèm nút tải (download=true thì tải, luôn dạng attachment).
export async function serveFile(r2, code, { policy, download, downloadHref, name = null }) {
  const found = await locateFile(r2, code, name);
  if (!found) return notFoundPage();
  if (!found.clean && !download) {
    const body = `${para(VIEW_MESSAGES.pending, 'warn')}<p><a class="btn" href="${esc(downloadHref)}">${esc(VIEW_MESSAGES.pendingButton)}</a></p>`;
    return htmlPage(200, VIEW_MESSAGES.pendingTitle, body);
  }
  const obj = await r2.get(found.key);
  if (!obj) return notFoundPage();
  const headers = fileHeaders(found.name, policy, { forceDownload: !found.clean });
  headers['Content-Length'] = String(obj.size);
  return new Response(obj.body, { status: 200, headers });
}

// ---------- Trạng thái bài ----------

export function statusOf(pr) {
  if (!pr) return 'unknown';
  if (pr.merged) return 'merged';
  return pr.state === 'open' ? 'open' : 'closed';
}

// Trạng thái từ PR có nhánh upload/<mã>, giữ trong Cache API 60 giây. Lỗi GitHub thì 'unknown', không lưu.
export async function loadStatus({ repo, code, cache, github }) {
  const key = `https://status.internal/${encodeURIComponent(repo)}/${code}`;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()).status;
  }
  let status;
  try {
    status = statusOf(await (await github()).findPr(`upload/${code}`));
  } catch {
    return 'unknown';
  }
  if (cache && status !== 'unknown') {
    await cache.put(
      key,
      new Response(JSON.stringify({ status }), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${STATUS_TTL_SECONDS}` },
      }),
    );
  }
  return status;
}

export function statusPage({ code, status, course, fileHref }) {
  const m = VIEW_MESSAGES;
  const parts = [];
  if (status === 'merged') {
    const href = course ? `${SITE_URL}course/${encodeURIComponent(course)}/` : SITE_URL;
    parts.push(`<p>${esc(m.merged)} <a href="${esc(href)}">${esc(m.mergedLink)}</a></p>`);
  } else {
    parts.push(para(m[status] ?? m.unknown));
  }
  parts.push(fileHref ? `<p><a class="btn" href="${esc(fileHref)}">${esc(m.fileButton)}</a></p>` : para(m.noFile, 'muted'));
  parts.push(para(m.secret, 'muted'));
  return htmlPage(200, m.statusTitle(code), parts.join(''));
}

// ---------- Trang duyệt bài ----------

// Các ô của mục tài liệu hiện cho người duyệt, theo thứ tự. Giá trị luôn được thoát HTML.
const ITEM_FIELDS = [
  ['title', 'Tiêu đề'],
  ['description', 'Mô tả'],
  ['course', 'Môn'],
  ['type', 'Loại', (v) => TYPES[v]?.vi ?? v],
  ['lang', 'Ngôn ngữ'],
  ['license', 'Giấy phép'],
  ['chapter', 'Chương'],
  ['term', 'Học kỳ'],
  ['examKind', 'Loại kiểm tra', (v) => EXAM_KINDS[v] ?? v],
  ['teacher', 'Giảng viên'],
  ['authors', 'Tên hiển thị'],
];
const BOOK_FIELDS = [
  ['title', 'Tên sách'],
  ['authors', 'Tác giả'],
  ['year', 'Năm'],
  ['publisher', 'Nhà xuất bản'],
  ['isbn', 'ISBN'],
];

// Chỉ nhận chuỗi, số và mảng chuỗi; giá trị dạng khác bỏ qua.
function fieldText(v) {
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) return v.join(', ');
  return '';
}

export function itemFieldRows(item) {
  const rows = [];
  if (!item || typeof item !== 'object') return rows;
  for (const [key, label, show] of ITEM_FIELDS) {
    const text = fieldText(item[key]);
    if (text) rows.push([label, show ? show(text) : text]);
  }
  if (item.book && typeof item.book === 'object') {
    for (const [key, label] of BOOK_FIELDS) {
      const text = fieldText(item.book[key]);
      if (text) rows.push([label, text]);
    }
  }
  return rows;
}

// item: mục tài liệu trên nhánh của bài (null khi không đọc được). file: kết quả locateFile.
// Môn mới người gửi đề xuất (file catalog/courses/<mã>.json thêm trong nhánh): tên là chữ người gửi,
// đã thoát HTML; link Sổ tay chỉ thành link khi là https.
function newCourseSection(c) {
  const m = VIEW_MESSAGES;
  const rows = [
    [m.newCourseCode, c.code],
    [m.newCourseName, c.name],
    [m.newCourseFaculty, c.faculty],
  ].filter(([, v]) => typeof v === 'string' && v);
  const out = [
    `<h2>${esc(m.newCourseTitle(String(c.code ?? '')))}</h2>`,
    para(m.newCourseNote, 'warn'),
    `<dl class="fields">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`,
  ];
  if (typeof c.handbookUrl === 'string' && /^https:\/\/[^\s"'<>]+$/.test(c.handbookUrl)) {
    out.push(`<p class="actions"><a class="btn" href="${esc(c.handbookUrl)}" rel="noopener noreferrer">${esc(m.newCourseHandbook)}</a></p>`);
  }
  return out.join('');
}

// Trang duyệt đợt gửi: mỗi file một khối (chữ người gửi, nút xem, tải, chọn Duyệt hay Không duyệt và lý do),
// cuối trang nút Hoàn tất gửi form về /xem-duyet/<mã>/duyet. docs: [{ id, item, file }] (file: locateFile
// theo tên). canDecide: PR còn mở và bước kiểm đã qua; open: PR còn mở.
export function reviewBatchPage({ code, docs, newCourse = null, open = true, canDecide = false, error = '' }) {
  const m = VIEW_MESSAGES;
  const parts = [];
  if (error) parts.push(para(error, 'warn'));
  if (newCourse) parts.push(newCourseSection(newCourse));
  if (!docs.length) parts.push(para(m.noItem, 'warn'));
  else parts.push(para(m.fieldsNote, 'muted'));
  if (!open) parts.push(para(m.closedNote, 'warn'));
  else if (!canDecide) parts.push(para(m.checksWait, 'warn'));
  const blocks = docs.map((d, i) => {
    const rows = itemFieldRows(d.item);
    const out = [`<section class="doc"><h2>${esc(m.batchFile(i + 1, docs.length))}</h2>`];
    out.push(rows.length ? `<dl class="fields">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : para(m.noItem, 'warn'));
    // Bài một file giữ link /file như trước; đợt gửi nhiều file thì link theo tên file.
    const href = !d.file ? '' : docs.length === 1 ? `/xem-duyet/${code}/file` : `/xem-duyet/${code}/file/${encodeURIComponent(d.file.name)}`;
    if (d.file) out.push(para(`${m.fileTitle}: ${d.file.name}${Number.isFinite(d.file.size) ? `, ${formatSize(d.file.size)}` : ''}`, 'muted'));
    if (d.file?.clean) out.push(`<p class="actions"><a class="btn" href="${esc(href)}">${esc(m.viewFile)}</a><a class="btn" href="${esc(`${href}?tai=1`)}">${esc(m.downloadFile)}</a></p>`);
    else if (d.file) out.push(para(m.pending, 'warn'), `<p class="actions"><a class="btn" href="${esc(`${href}?tai=1`)}">${esc(m.pendingButton)}</a></p>`);
    else out.push(para(d.item?.type === 'book-ref' ? m.noFileBook : m.noFile, 'muted'));
    if (open && canDecide) {
      out.push(
        `<fieldset><legend>${esc(m.decideTitle)}</legend>`,
        `<label><input type="radio" name="d-${esc(d.id)}" value="keep" required> ${esc(m.keep)}</label>`,
        `<label><input type="radio" name="d-${esc(d.id)}" value="drop"> ${esc(m.drop)}</label>`,
        `<p><label for="r-${esc(d.id)}">${esc(m.reasonLabel)}</label></p><textarea id="r-${esc(d.id)}" name="r-${esc(d.id)}" maxlength="500"></textarea>`,
        '</fieldset>',
      );
    }
    out.push('</section>');
    return out.join('');
  });
  if (open && canDecide && docs.length) {
    parts.push(`<form method="post" action="/xem-duyet/${esc(code)}/duyet">${blocks.join('')}${para(m.submitNote, 'muted')}<p class="actions"><button class="btn" type="submit">${esc(m.submit)}</button></p></form>`);
  } else parts.push(blocks.join(''));
  return htmlPage(200, m.reviewTitle(code), parts.join(''), {}, { formSelf: open && canDecide });
}

export function resultPage(code, message, ok = true) {
  const m = VIEW_MESSAGES;
  return htmlPage(ok ? 200 : 409, m.resultTitle, `${para(message, ok ? '' : 'warn')}<p class="actions"><a class="btn" href="/xem-duyet/${esc(code)}">${esc(m.backToReview)}</a></p>`);
}

export function reviewPage({ code, item, file, newCourse = null }) {
  const m = VIEW_MESSAGES;
  const parts = [];
  if (newCourse) parts.push(newCourseSection(newCourse));
  parts.push(`<h2>${esc(m.fieldsTitle)}</h2>`);
  const rows = itemFieldRows(item);
  if (rows.length) {
    parts.push(para(m.fieldsNote, 'muted'));
    parts.push(`<dl class="fields">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
  } else {
    parts.push(para(m.noItem, 'warn'));
  }
  parts.push(`<h2>${esc(m.fileTitle)}</h2>`);
  const href = `/xem-duyet/${code}/file`;
  if (file?.clean) {
    parts.push(`<p class="actions"><a class="btn" href="${esc(href)}">${esc(m.viewFile)}</a><a class="btn" href="${esc(`${href}?tai=1`)}">${esc(m.downloadFile)}</a></p>`);
  } else if (file) {
    parts.push(para(m.pending, 'warn'), `<p class="actions"><a class="btn" href="${esc(`${href}?tai=1`)}">${esc(m.pendingButton)}</a></p>`);
  } else {
    parts.push(para(item?.type === 'book-ref' ? m.noFileBook : m.noFile, 'muted'));
  }
  return htmlPage(200, m.reviewTitle(code), parts.join(''));
}
