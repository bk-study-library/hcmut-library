#!/usr/bin/env node
// Sinh trang web tĩnh (GitHub Pages) từ catalog/ và courses/ vào site/.
//
//   node scripts/build-site.mjs [--root DIR] [--out site] [--base /hcmut-library/]
//
// Mọi link trong trang là link tương đối, nên trang chạy được ở bất kỳ đường dẫn nào.
// Riêng 404.html dùng --base vì GitHub Pages trả trang này cho mọi đường dẫn sai.
// Không dùng thư viện ngoài, không CDN, không font tải từ mạng, không theo dõi.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepo, buildIndex, serializeIndex, TOOL_ROOT } from './lib/repo.mjs';
import { EXAM_KINDS, TYPES, TYPE_ORDER, PARTS, STATUS, REPO, REPO_URL, SITE_URL, issueUrl, formatSize, formatBook } from './lib/labels.mjs';
import { previewTarget } from './lib/preview.mjs';
import { S } from './lib/strings.mjs';
import { buildV1, serializeV1 } from './lib/v1.mjs';
import { loadPolicy } from './lib/policy.mjs';
import { extensionsFor, restrictedExtensions } from './lib/extensions.mjs';

const SRC = path.join(TOOL_ROOT, 'site-src');
let GENERATED = null;

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Cấu hình của repo cần dựng: dùng file trong root nếu có, không thì dùng của công cụ (repo mẫu trong test không có).
function readSiteConfig(root) {
  const own = path.join(root, 'catalog', 'site.json');
  const p = fs.existsSync(own) ? own : path.join(TOOL_ROOT, 'catalog', 'site.json');
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    uploadEndpoint: String(cfg.uploadEndpoint || ''),
    turnstileSiteKey: String(cfg.turnstileSiteKey || ''),
    // Gốc Worker: nút Xem trước trỏ tới <reviewBase>/xem-truoc. Để trống thì không có nút này.
    reviewBase: /^https:\/\//.test(cfg.reviewBase || '') ? String(cfg.reviewBase).replace(/\/+$/, '') : '',
    bookSources: Array.isArray(cfg.bookSources) ? cfg.bookSources : [],
    // Số mục hiện sẵn mỗi nhóm tài liệu; phần còn lại gập trong "Xem thêm" để trang môn nhẹ khi có nhiều bài.
    itemsPerGroup: Number.isInteger(cfg.itemsPerGroup) && cfg.itemsPerGroup > 0 ? cfg.itemsPerGroup : Infinity,
    // Bảng CTĐT chính thức của trường: trang chương trình chưa có link PDF riêng thì trỏ về đây.
    officialProgramsPage: /^https:\/\//.test(cfg.officialProgramsPage || '') ? String(cfg.officialProgramsPage) : '',
    // Ô tìm trang chủ: số tài liệu hiện tối đa, độ dài mô tả giữ trong assets/items.json.
    docResultsMax: Number.isInteger(cfg.docResultsMax) && cfg.docResultsMax > 0 ? cfg.docResultsMax : 10,
    docDescriptionMax: Number.isInteger(cfg.docDescriptionMax) && cfg.docDescriptionMax > 0 ? cfg.docDescriptionMax : 200,
    // Ảnh xem trước khi chia sẻ link (og:image), đường dẫn tính từ gốc site, nằm trong site-src/assets/.
    socialImage: /^assets\/[A-Za-z0-9._-]+\.png$/.test(cfg.socialImage || '') ? String(cfg.socialImage) : '',
  };
}

// Địa chỉ tuyệt đối của một trang, theo SITE_URL; bỏ index.html ở cuối.
export const absUrl = (p) => SITE_URL + String(p).replace(/(^|\/)index\.html$/, '$1');

// Cỡ ảnh PNG đọc từ khối IHDR, để ghi og:image:width, og:image:height. Không phải PNG thì null.
export function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG' || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Cắt chữ dài ở ranh giới từ, thêm "..." (ba dấu chấm thường).
export function truncate(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 3);
  const at = cut.lastIndexOf(' ');
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,.;:]+$/, '')}...`;
}

// Danh sách tài liệu cho ô tìm trang chủ (chỉ web dùng, không thuộc hợp đồng v1): mục chưa gỡ,
// mới thêm trước. url là link tới mục trên trang môn, tính từ gốc site (bản tiếng Anh thêm en/).
export function docIndex(items, courses, { descriptionMax = 200 } = {}) {
  const rows = [];
  for (const it of items) {
    if (it.removed) continue;
    const c = courses.get(it.course);
    if (!c) continue;
    const row = { id: it.id, course: c.id, code: c.code, courseName: c.name };
    if (c.nameEn) row.courseNameEn = c.nameEn;
    row.faculty = c.faculty;
    row.title = it.title;
    if (it.description) row.description = truncate(it.description, descriptionMax);
    row.type = it.type;
    for (const k of ['term', 'examKind', 'chapter', 'teacher']) if (it[k]) row[k] = it[k];
    row.lang = it.lang;
    row.added = it.added;
    row.url = `course/${c.id}/#${it.id}`;
    rows.push(row);
  }
  return rows.sort((a, b) => b.added.localeCompare(a.added) || a.course.localeCompare(b.course) || a.id.localeCompare(b.id));
}

// sitemap.xml: địa chỉ tuyệt đối, xếp theo chữ; lastmod là ngày dữ liệu của trang nếu có.
export function sitemapXml(pages) {
  const rows = pages
    .slice()
    .sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0))
    .map((p) => `  <url><loc>${esc(p.loc)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

// Giá trị cho ô lọc tài liệu, chỉ gồm giá trị có trong danh sách: loại theo TYPE_ORDER,
// học kỳ mới nhất trước, kỳ thi theo thứ tự của EXAM_KINDS.
export function docFilterValues(docs) {
  const has = (k) => new Set(docs.map((d) => d[k]).filter(Boolean));
  const types = has('type');
  const kinds = has('examKind');
  return {
    types: TYPE_ORDER.filter((x) => types.has(x)),
    terms: [...has('term')].sort().reverse(),
    examKinds: Object.keys(EXAM_KINDS).filter((x) => kinds.has(x)),
  };
}

// Khóa khoa của nhóm Môn chung toàn trường (catalog/faculties.json): trang khoa này có ghi chú riêng.
const SHARED_FACULTY = 'chung';

// Chương trình có listed: false (bản nháp nguồn) vẫn có trang riêng nhưng không vào danh sách.
export const isListed = (p) => p.listed !== false;

// Link tìm sách ở nguồn hợp pháp, theo catalog/site.json (bookSources). Có ISBN và nguồn có mẫu {isbn} thì
// tra theo ISBN; không thì tìm theo tên sách và tác giả đầu tiên ({q}); không có mẫu nào thì dùng url.
export function bookLinks(book, sources, lang) {
  const q = encodeURIComponent([book.title, (book.authors || [])[0]].filter(Boolean).join(' '));
  return sources.map((s) => {
    let href = s.url || '';
    if (book.isbn && s.isbn) href = s.isbn.replace('{isbn}', encodeURIComponent(book.isbn));
    else if (s.search) href = s.search.replace('{q}', q);
    return { label: (lang === 'en' && s.labelEn) || s.label, href };
  }).filter((l) => l.label && /^https:\/\//.test(l.href));
}

const jsonInScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

// Trang Gửi tài liệu (chỉ tiếng Việt): đổ số liệu từ policy.json và site.json vào mẫu.
function uploadPage({ policy, site, root, raw, t }) {
  const opt = (value, label) => `    <option value="${esc(value)}">${esc(label)}</option>`;
  const exts = Object.keys(policy.extensions);
  const open = Boolean(site.uploadEndpoint);
  const msg = t.uploadMsg;
  const formTypes = policy.openTypes.filter((x) => x !== 'link');
  const config = {
    maxBytes: policy.maxFileBytes,
    extensions: exts,
    // Đuôi nhận theo từng loại (extensions[].types, quizExtensions): form lọc ô chọn file theo loại.
    byType: Object.fromEntries(formTypes.map((x) => [x, extensionsFor(policy, x)])),
    msg: { ...msg, fileExt: msg.fileExt(exts.join(', ')), fileSize: msg.fileSize(formatSize(policy.maxFileBytes)) },
  };
  // api.js của Cloudflare Turnstile là script ngoài duy nhất của site: chống bot gửi tự động vào form,
  // nên chỉ nạp ở trang này và chỉ khi form đã mở.
  const scripts = [
    `<script type="application/json" id="upload-config">${jsonInScript(config)}</script>`,
    `<script src="${root}assets/search-core.js" defer></script>`,
    `<script src="${root}assets/upload.js" defer></script>`,
    open ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : '',
  ]
    .filter(Boolean)
    .join('\n');
  const parts = {
    closed: open ? '' : `<p class="note warn" role="note">${esc(t.uploadClosed)}</p>`,
    disabled: open ? '' : ' disabled',
    endpoint: esc(site.uploadEndpoint),
    sitekey: esc(site.turnstileSiteKey),
    // Loại "link" đi theo form Issue "Thêm link", không qua form này.
    types: formTypes.map((x) => opt(x, TYPES[x].vi)).join('\n'),
    examKinds: policy.fields.examKinds.map((x) => opt(x, EXAM_KINDS[x] || x)).join('\n'),
    ...Object.fromEntries(['titleMax', 'descriptionMax', 'chapterMax', 'teacherMax', 'displayNameMax', 'bookTitleMax', 'bookPublisherMax'].map((k) => [k, String(policy.fields[k])])),
    licenses: policy.selfMadeLicenses.map((x) => opt(x, x)).join('\n'),
    accept: esc(exts.join(',')),
    exts: esc(exts.join(', ')),
    extNote: Object.entries(restrictedExtensions(policy))
      .map(([ext, types]) => ` ${esc(t.uploadExtOnly(ext, types.map((x) => TYPES[x]?.vi ?? x).join(', ')))}`)
      .join(''),
    maxSize: esc(formatSize(policy.maxFileBytes)),
    scripts,
  };
  return raw
    .replace(/\{\{upload:([a-zA-Z]+)\}\}/g, (_, k) => {
      if (!(k in parts)) throw new Error(`gui-tai-lieu.html: không có chỗ điền upload:${k}`);
      return parts[k];
    })
    .replace(/\{\{root\}\}/g, root);
}

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

// Content-Security-Policy của trang (thẻ meta, vì GitHub Pages không cho đặt header). Mọi trang chỉ
// chạy script, CSS, ảnh của site. Riêng trang Gửi tài liệu khi form mở (upload: địa chỉ Worker từ
// site.json): thêm script và khung Turnstile, và cho gửi tới gốc địa chỉ Worker.
// Script JSON (type="application/json") không chạy nên CSP không chặn.
export function cspFor({ upload = '' } = {}) {
  const origin = upload && URL.canParse(upload) ? new URL(upload).origin : '';
  const extra = (s) => (origin ? `${s} ${origin}` : s);
  return [
    "default-src 'self'",
    `script-src 'self'${origin ? ` ${TURNSTILE_ORIGIN}` : ''}`,
    "style-src 'self'",
    "img-src 'self' data:",
    extra("connect-src 'self'"),
    ...(origin ? [`frame-src ${TURNSTILE_ORIGIN}`] : []),
    "object-src 'none'",
    "base-uri 'none'",
    extra("form-action 'self'"),
  ].join('; ');
}

const cspMeta = (opts) => `<meta http-equiv="Content-Security-Policy" content="${esc(cspFor(opts))}">`;

// Đường dẫn trang, tính từ gốc site, không có "/" đầu. Bản tiếng Anh nằm dưới en/.
const pagePath = (lang, p) => (lang === 'en' ? `en/${p}` : p);

function relPrefix(fromPath) {
  const depth = fromPath.split('/').length - 1;
  return depth ? '../'.repeat(depth) : './';
}

// Thẻ cho máy tìm kiếm và khi chia sẻ link: canonical, hreflang (khi trang có đủ hai bản vi và en),
// Open Graph, Twitter card. Mọi địa chỉ tuyệt đối theo SITE_URL. 404 không có canonical.
function headMeta({ t, here, title, description, alt, pair, social, notFound }) {
  const lines = [];
  const url = absUrl(here);
  if (!notFound) lines.push(`<link rel="canonical" href="${esc(url)}">`);
  if (!notFound && alt && pair) {
    const urls = { [t.lang]: url, [t.other]: absUrl(pagePath(t.other, alt)) };
    for (const l of ['vi', 'en']) lines.push(`<link rel="alternate" hreflang="${l}" href="${esc(urls[l])}">`);
    lines.push(`<link rel="alternate" hreflang="x-default" href="${esc(urls.vi)}">`);
  }
  const og = {
    'og:type': 'website',
    'og:site_name': t.siteName,
    'og:title': title || t.siteName,
    'og:description': description,
    ...(notFound ? {} : { 'og:url': url }),
    'og:locale': t.lang === 'en' ? 'en_US' : 'vi_VN',
    ...(!notFound && alt && pair ? { 'og:locale:alternate': t.lang === 'en' ? 'vi_VN' : 'en_US' } : {}),
  };
  if (social) {
    og['og:image'] = SITE_URL + social.path;
    og['og:image:width'] = String(social.width);
    og['og:image:height'] = String(social.height);
    og['og:image:alt'] = t.socialImageAlt;
  }
  for (const [k, v] of Object.entries(og)) lines.push(`<meta property="${k}" content="${esc(v)}">`);
  const tw = { 'twitter:card': social ? 'summary_large_image' : 'summary', 'twitter:title': og['og:title'], 'twitter:description': description };
  if (social) {
    tw['twitter:image'] = og['og:image'];
    tw['twitter:image:alt'] = t.socialImageAlt;
  }
  for (const [k, v] of Object.entries(tw)) lines.push(`<meta name="${k}" content="${esc(v)}">`);
  return lines.join('\n');
}

let SOCIAL = null;

function layout({ t, path: here, title, description, body, crumbs = [], alt, base, upload = '', noindex = false, pair = true }) {
  // base: dùng cho 404.html (đường dẫn tuyệt đối); còn lại dùng đường dẫn tương đối.
  const root = base || relPrefix(here);
  const desc = description || t.siteTag;
  const notFound = Boolean(base);
  const href = (lang, p) => root + pagePath(lang, p).replace(/index\.html$/, '');
  const L = (p) => href(t.lang, p);
  const altHref = alt ? href(t.other, alt) : href(t.other, '');
  // Gửi tài liệu chỉ có bản tiếng Việt: trang tiếng Anh cũng trỏ về form này.
  const current = here.replace(/^en\//, '').replace(/index\.html$/, '');
  const nav = [
    [L(''), '', t.nav.home],
    [root + 'gui-tai-lieu/', 'gui-tai-lieu/', t.nav.send],
    [L('review/'), 'review/', t.nav.review],
    [L('takedown/'), 'takedown/', t.nav.takedown],
  ];
  const crumbHtml = crumbs.length
    ? `<nav class="crumbs" aria-label="${esc(t.breadcrumb)}"><ol>${crumbs
        .map(([p, label], i) => (i === crumbs.length - 1 ? `<li aria-current="page">${esc(label)}</li>` : `<li><a href="${L(p)}">${esc(label)}</a></li>`))
        .join('')}</ol></nav>`
    : '';
  return `<!doctype html>
<html lang="${t.lang}" data-root="${esc(root)}" data-lang-prefix="${t.lang === 'en' ? 'en/' : ''}">
<head>
<meta charset="utf-8">
${cspMeta({ upload })}
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="strict-origin-when-cross-origin">
${noindex || notFound ? '<meta name="robots" content="noindex">\n' : ''}<title>${esc(title ? `${title} | ${t.siteName}` : t.siteName)}</title>
<meta name="description" content="${esc(desc)}">
${headMeta({ t, here, title, description: desc, alt, pair, social: SOCIAL, notFound })}
<link rel="stylesheet" href="${root}assets/site.css">
</head>
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="${L('')}"><span class="brand-mark" aria-hidden="true">BK</span><span class="brand-text"><strong>${esc(t.siteName)}</strong><span>${esc(t.siteTag)}</span></span></a>
    <nav class="nav" aria-label="${esc(t.nav.home)}">
      <ul>${nav.map(([link, p, label]) => `<li><a href="${link}"${p === current ? ' aria-current="page"' : ''}>${esc(label)}</a></li>`).join('')}
      <li><a href="${REPO_URL}" rel="noopener">${esc(t.nav.github)}</a></li>
      <li><a class="lang" href="${altHref}" hreflang="${t.other}" lang="${t.other}">${esc(t.otherName)}</a></li></ul>
    </nav>
  </div>
</header>
<main id="main" class="wrap" tabindex="-1">
${crumbHtml}
${body}
</main>
<footer class="foot">
  <div class="wrap">
    <p>${esc(t.unofficial)}</p>
    <p>${esc(t.footerLicense)} ${esc(t.footerPrivacy)}</p>
    <p class="muted">${esc(t.footerUpdated(GENERATED || '-'))}</p>
  </div>
</footer>
</body>
</html>
`;
}

function itemsCountOf(course) {
  return course.items.filter((i) => !i.removed).length;
}

function courseRow(t, c, root) {
  const href = `${root}${pagePath(t.lang, `course/${c.id}/`)}`;
  const n = itemsCountOf(c);
  return `<tr${c.status === 'retired' ? ' class="retired"' : ''}><th scope="row"><a href="${href}">${esc(c.code)}</a></th><td><a href="${href}">${esc(t.lang === 'en' && c.nameEn ? c.nameEn : c.name)}</a>${c.status === 'retired' ? ` <span class="tag">${esc(STATUS.retired[t.lang])}</span>` : ''}</td><td class="num">${c.credits ?? ''}</td><td class="num">${n || `<span class="muted">${esc(t.noMaterial)}</span>`}</td></tr>`;
}

function courseTable(t, courses, root, caption) {
  if (!courses.length) return `<p class="muted">${esc(t.noCourses)}</p>`;
  return `<div class="table-wrap"><table><caption class="sr">${esc(caption)}</caption><thead><tr><th scope="col">${esc(t.code)}</th><th scope="col">${esc(t.name)}</th><th scope="col" class="num">${esc(t.credits)}</th><th scope="col" class="num">${esc(t.materials)}</th></tr></thead><tbody>${courses
    .map((c) => courseRow(t, c, root))
    .join('')}</tbody></table></div>`;
}

// Neo tới một khối trên trang chương trình, dùng cho link từ trang môn.
function blockAnchor(id) {
  return `khoi-${String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function facultyName(t, f) {
  return f ? f.name[t.lang] || f.name.vi : '';
}

// Số môn khác nhau trong mọi khối của chương trình.
function programCourseCount(p) {
  return new Set(p.blocks.flatMap((b) => b.courses)).size;
}

function programName(t, p) {
  return t.lang === 'en' && p.nameEn ? p.nameEn : p.name;
}

// Link tới form issue Thêm chương trình, điền sẵn khoa (tên tiếng Việt, khớp lựa chọn trong form).
function addProgramUrl(f, p) {
  const fields = {};
  if (f) fields.khoa = f.name.vi;
  if (p) {
    fields.nganh = p.name;
    if (p.year) fields['khoa-hoc'] = p.year;
  }
  return issueUrl('them-chuong-trinh.yml', fields);
}

// Một dòng chương trình: tên, loại, số môn (hoặc chưa có danh sách môn).
function programLi(t, p, href, { withYear = false } = {}) {
  const n = programCourseCount(p);
  const label = withYear && p.year ? `${programName(t, p)} (${p.year})` : programName(t, p);
  return `<li><a href="${href}">${esc(label)}</a>${p.variant ? ` <span class="tag">${esc(p.variant)}</span>` : ''} <span class="muted small">${esc(n ? t.coursesCount(n) : t.programNoCoursesShort)}</span></li>`;
}

// Chương trình xếp theo khóa, mới nhất trước; chương trình không ghi khóa ở cuối.
function byYearDesc(a, b) {
  return (b.year || '0000').localeCompare(a.year || '0000') || a.name.localeCompare(b.name, 'vi') || a.code.localeCompare(b.code);
}

function programsByYear(t, progs, hrefOf) {
  const groups = new Map();
  for (const p of progs.slice().sort(byYearDesc)) {
    const k = p.year || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  return [...groups]
    .map(([y, list]) => `<h3>${esc(y ? t.cohort(y) : t.cohortUnknown)}</h3><ul class="list">${list.map((p) => programLi(t, p, hrefOf(p))).join('')}</ul>`)
    .join('');
}

// Nút tới nguồn chính thức của chương trình. ctdtUrl, planUrl đã được kiểm host khi đọc repo
// (programPdfHosts trong site.json). pdf: có ít nhất một file PDF của trường.
export function officialProgramLinks(t, p, site) {
  const pdfBtn = (href, label) => `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  const buttons = [];
  if (p.ctdtUrl) buttons.push(pdfBtn(p.ctdtUrl, t.programCtdtPdf));
  if (p.planUrl) buttons.push(pdfBtn(p.planUrl, t.programPlanPdf));
  const pdf = buttons.length > 0;
  if (!pdf) {
    if (/^https?:\/\//.test(p.source || '')) buttons.push(`<a class="btn" href="${esc(p.source)}" rel="noopener">${esc(t.programSource)}</a>`);
    if (site.officialProgramsPage) buttons.push(`<a class="btn subtle" href="${esc(site.officialProgramsPage)}" rel="noopener">${esc(t.programTable)}</a>`);
  }
  return { buttons, pdf };
}

// Link xem trước qua Worker, chỉ cho file nằm trong danh sách được phép (scripts/lib/preview.mjs).
function previewHref(url, site) {
  if (!site.reviewBase || !url || !previewTarget(url, { repo: REPO, site: SITE_URL })) return null;
  return `${site.reviewBase}/xem-truoc?u=${encodeURIComponent(url)}`;
}

// Form Yêu cầu gỡ điền sẵn link tới đúng mục trên trang môn (ô "item") và id mục trong tiêu đề.
function takedownUrl(t, it) {
  const page = `${SITE_URL}${pagePath(t.lang, `course/${it.course}/`)}#${it.id}`;
  return issueUrl('yeu-cau-go.yml', { title: `[Gỡ] ${it.course} ${it.id}`, item: page });
}

const btn = (cls, href, label, extra = '') => `<a class="${cls}" href="${esc(href)}"${extra}>${esc(label)}</a>`;

// Thông tin trước, hành động sau: Xem trước, Tải xuống, Yêu cầu gỡ (mẫu trong skill bk-library-ui).
function renderItem(t, it, site, root) {
  const meta = [];
  if (it.term) meta.push(`${t.term} ${it.term}`);
  if (it.lab != null) meta.push(t.labNo(it.lab));
  // Tên giảng viên mở ô tìm ở trang chủ để ra các môn khác có tài liệu của cùng người.
  if (it.teacher) meta.push({ html: `${esc(t.teacher)}: <a href="${root}${pagePath(t.lang, '')}?q=${encodeURIComponent(it.teacher)}">${esc(it.teacher)}</a>` });
  meta.push(it.lang === 'vi' ? 'Tiếng Việt' : it.lang === 'en' ? 'English' : it.lang);
  meta.push(`${t.license}: ${it.license}`);
  if (it.source) meta.push(`${t.source}: ${it.source}`);
  const authors = it.authors && it.authors.length ? it.authors.join(', ') : t.anonymous;
  const badges = [it.example ? `<span class="tag accent">${esc(t.example)}</span>` : '', it.removed ? `<span class="tag warn">${esc(t.removed)}</span>` : ''].join('');
  const takedown = btn('btn subtle', takedownUrl(t, it), t.requestTakedown, ' rel="noopener"');
  const row = (buttons) => `<p class="actions">${[...buttons, takedown].join('')}</p>`;
  let extra = '';
  let actions = '';
  if (it.removed) extra = `<p class="muted">${esc(it.removedReason || '')}</p>`;
  else if (it.type === 'book-ref') {
    extra = `<p>${esc(formatBook(it.book))}</p>`;
    actions = row(bookLinks(it.book, site.bookSources, t.lang).map((l) => btn('btn', l.href, l.label, ' rel="noopener"')));
  } else if (it.type === 'link') actions = row([btn('btn', it.url, t.openLink, ' rel="noopener"')]);
  else {
    const files = it.files || [];
    const many = files.length > 1;
    const buttons = [];
    const waiting = [];
    for (const f of files) {
      const size = formatSize(f.size);
      // File .md trong git: web phục vụ ở files/<ID>/<tên> (cùng link với v1).
      const name = f.path ? f.path.split('/').pop() : null;
      const download = f.url || (name ? `${root}files/${encodeURIComponent(it.course)}/${encodeURIComponent(name)}` : null);
      const published = f.url || (name ? `${SITE_URL}files/${encodeURIComponent(it.course)}/${encodeURIComponent(name)}` : null);
      if (!download) {
        waiting.push(`<p class="meta">${esc(t.pendingFile(f.name))}</p>`);
        continue;
      }
      const preview = previewHref(published, site);
      if (preview) buttons.push(btn('btn', preview, many ? t.previewNamed(f.name) : t.preview, ' target="_blank" rel="noopener"'));
      buttons.push(btn('btn', download, many ? t.downloadNamed(f.name, size) : t.download(size), f.url ? ' rel="noopener"' : ` download="${esc(f.name)}"`));
    }
    extra = waiting.join('');
    actions = row(buttons);
  }
  const note = it.type === 'prelab-reference' ? `<p class="note">${esc(t.prelabRefNote)}</p>` : '';
  return `<li class="item${it.removed ? ' is-removed' : ''}" id="${esc(it.id)}"><h4>${esc(it.title)} ${badges}</h4>${it.description ? `<p>${esc(it.description)}</p>` : ''}<p class="meta">${meta.map((m) => (typeof m === 'string' ? esc(m) : m.html)).join(', ')}. ${esc(authors)}</p>${note}${extra}${actions}</li>`;
}

export function buildSite({ root = TOOL_ROOT, out = path.join(TOOL_ROOT, 'site'), base = '/hcmut-library/' } = {}) {
  const siteCfg = readSiteConfig(root);
  const repo = loadRepo(root);
  if (repo.errors.length) {
    throw new Error(`Danh mục còn ${repo.errors.length} lỗi; chạy "npm run validate" trước.`);
  }
  const index = buildIndex(repo);
  const { full, min } = serializeIndex(index);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const written = [];
  const write = (p, content) => {
    const abs = path.join(out, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written.push(p);
  };
  // Trang vào sitemap.xml: không gồm 404, trang chuyển hướng, trang noindex.
  const sitemap = [];
  const listPage = (p, lastmod) => sitemap.push({ loc: absUrl(p), lastmod });
  const latest = (dates) => dates.filter(Boolean).sort().pop() || '';
  {
    const img = siteCfg.socialImage ? path.join(SRC, siteCfg.socialImage) : '';
    const size = img && fs.existsSync(img) ? pngSize(fs.readFileSync(img)) : null;
    SOCIAL = size ? { path: siteCfg.socialImage, ...size } : null;
  }

  // Tài nguyên tĩnh
  for (const f of fs.readdirSync(path.join(SRC, 'assets'))) {
    write(`assets/${f}`, fs.readFileSync(path.join(SRC, 'assets', f)));
  }
  write('index.json', full);
  write('index.min.json', min);
  write('.nojekyll', '');
  // Dữ liệu cho app và ô tìm kiếm: cùng nội dung với v1/ trong repo.
  for (const [p, content] of serializeV1(buildV1(repo))) write(`v1/${p}`, content);
  // File .md nhỏ nằm trong git: phục vụ ở files/<ID>/<tên>, khớp urls trong v1.
  for (const it of repo.items) {
    if (it.removed) continue;
    for (const f of it.files || []) {
      if (!f.path) continue;
      write(`files/${it.course}/${f.path.split('/').pop()}`, fs.readFileSync(path.join(root, 'courses', it.course, f.path)));
    }
  }

  const allCourses = new Map();
  for (const f of index.faculties) for (const c of f.courses) allCourses.set(c.id, { ...c, faculty: c.faculty });
  const facByKey = new Map(index.faculties.map((f) => [f.key, f]));
  const progByCode = new Map(index.programs.map((p) => [p.code, p]));
  const listedPrograms = index.programs.filter(isListed);
  const totalItems = index.counts.items;
  // Danh sách chương trình cho ô tìm ở trang chủ (chỉ web dùng, không thuộc hợp đồng v1).
  write(
    'assets/programs.json',
    JSON.stringify(
      listedPrograms.map((p) => {
        const row = { code: p.code, name: p.name };
        if (p.nameEn) row.nameEn = p.nameEn;
        if (p.year) row.year = p.year;
        if (p.variant) row.variant = p.variant;
        row.faculty = p.faculty;
        row.courses = programCourseCount(p);
        return row;
      }),
    ) + '\n',
  );
  // Tài liệu cho ô tìm ở trang chủ (chỉ web dùng, không thuộc hợp đồng v1).
  const docs = docIndex(repo.items, allCourses, { descriptionMax: siteCfg.docDescriptionMax });
  write('assets/items.json', JSON.stringify(docs) + '\n');
  const docValues = docFilterValues(docs);
  GENERATED = index.generated;
  const finish = (html) => html;

  for (const lang of ['vi', 'en']) {
    const t = S[lang];
    const P = (p) => pagePath(lang, p);

    // Trang chủ
    {
      const here = P('index.html');
      const root = relPrefix(here);
      const progsOf = (key) => listedPrograms.filter((p) => p.faculty === key);
      const facList = index.faculties
        .map((f) => {
          const np = progsOf(f.key).length;
          const stats =
            f.courses.length || np
              ? [t.coursesCount(f.courses.length), t.itemsCount(f.courses.reduce((n, c) => n + itemsCountOf(c), 0)), np ? t.programsCount(np) : null].filter(Boolean).join(', ')
              : t.noData;
          return `<li><a class="card" href="${root}${P(`faculty/${f.key}/`)}"><strong>${esc(facultyName(t, f))}</strong><span class="muted">${esc(stats)}</span></a></li>`;
        })
        .join('');
      // Gộp theo khoa, mỗi khoa một khối đóng mở, để vài trăm chương trình vẫn dễ đọc.
      const progList = `<div class="prog-groups">${index.faculties
        .map((f) => {
          const list = progsOf(f.key).sort(byYearDesc);
          const inner = list.length
            ? `<ul class="list">${list.map((p) => programLi(t, p, `${root}${P(`program/${p.code}/`)}`, { withYear: true })).join('')}</ul>`
            : `<p class="muted">${esc(t.facultyNoPrograms)}</p>`;
          return `<details class="prog-fac"><summary><span class="prog-fac-name">${esc(facultyName(t, f))}</span> <span class="muted small">${esc(t.programsCount(list.length))}</span></summary>${inner}<p><a class="btn subtle" href="${esc(addProgramUrl(f))}" rel="noopener">${esc(t.addProgram)}</a></p></details>`;
        })
        .join('')}</div>`;
      // Ô lọc tài liệu: chỉ có khi có giá trị để chọn. Nhãn hiện rõ trên mỗi ô.
      const filterSelect = (id, label, all, values, labelOf) =>
        values.length
          ? `<div class="filter"><label for="${id}">${esc(label)}</label><select id="${id}"><option value="">${esc(all)}</option>${values.map((v) => `<option value="${esc(v)}">${esc(labelOf(v))}</option>`).join('')}</select></div>`
          : '';
      const filterHtml = [
        filterSelect('q-type', t.docType, t.docTypeAll, docValues.types, (v) => TYPES[v][lang]),
        filterSelect('q-term', t.docTerm, t.docTermAll, docValues.terms, (v) => v),
        filterSelect('q-kind', t.docKind, t.docKindAll, docValues.examKinds, (v) => t.examKinds[v] || v),
      ].join('');
      const docFilters = docs.length && filterHtml ? `<div class="search-filters">${filterHtml}</div>` : '';
      const other = S[t.other];
      const docStrings = {
        max: siteCfg.docResultsMax,
        count: t.docCount,
        more: t.docMore,
        chapter: t.chapter,
        // Nhãn theo ngôn ngữ trang trước (để hiện), nhãn ngôn ngữ kia sau (chỉ để tìm).
        types: Object.fromEntries(docValues.types.map((x) => [x, [TYPES[x][lang], TYPES[x][t.other]]])),
        examKinds: Object.fromEntries(docValues.examKinds.map((x) => [x, [t.examKinds[x], other.examKinds[x]]])),
      };
      const body = `
<section class="hero">
  <h1>${esc(t.homeTitle)}</h1>
  <p class="lead">${esc(t.homeIntro)}</p>
  <p>${esc(t.homeRules)}</p>
  <p class="muted">${esc(t.stats(index.counts.courses, totalItems))}</p>
</section>
<section class="search" role="search" aria-labelledby="search-label">
  <label id="search-label" for="q">${esc(t.searchLabel)}</label>
  <div class="search-row">
    <input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(t.searchPlaceholder)}" aria-describedby="q-hint">
    <select id="q-fac" aria-label="${esc(t.facultyFilter)}"><option value="">${esc(t.allFaculties)}</option>${index.faculties.filter((f) => f.courses.length).map((f) => `<option value="${esc(f.key)}">${esc(facultyName(t, f))}</option>`).join('')}</select>
  </div>
  ${docFilters}
  <p id="q-hint" class="muted">${esc(t.searchHint)}</p>
  <noscript><p class="note">${esc(t.searchNoJs)}</p></noscript>
  <div id="q-prog" hidden>
    <h2 class="results-head">${esc(t.programsTitle)}</h2>
    <ul id="q-prog-list" class="results"></ul>
  </div>
  ${docs.length ? `<div id="q-docs" hidden>
    <h2 class="results-head">${esc(t.docsTitle)}</h2>
    <p id="q-docs-status" class="muted small" aria-live="polite"></p>
    <ul id="q-docs-list" class="results"></ul>
  </div>` : ''}
  <p id="q-status" class="muted" aria-live="polite"></p>
  <ul id="q-results" class="results"></ul>
</section>
<section aria-labelledby="h-fac">
  <h2 id="h-fac">${esc(t.browseFaculty)}</h2>
  <ul class="grid">${facList}</ul>
</section>
<section aria-labelledby="h-prog">
  <h2 id="h-prog">${esc(t.programsTitle)}</h2>
  <p class="muted">${esc(t.programsCount(listedPrograms.length))}</p>
  ${progList}
  <p class="actions"><a class="btn" href="${esc(addProgramUrl(null))}" rel="noopener">${esc(t.addProgram)}</a></p>
</section>
<section class="cta-row">
  <div class="panel"><p>${esc(t.contributeCta)}</p><p class="actions"><a class="btn primary" href="${root}gui-tai-lieu/">${esc(t.contributeBtn)}</a><a class="btn subtle" href="${root}${P('contribute/')}">${esc(t.contributeGuide)}</a></p></div>
  <div class="panel"><p>${esc(t.reviewCta)}</p><p><a class="btn" href="${root}${P('review/')}">${esc(t.reviewBtn)}</a></p></div>
</section>
<script type="application/json" id="search-strings">${jsonInScript({ results: [t.results(0), t.results(1), t.results(2)], teacher: t.teacher, lang, docs: docStrings })}</script>
<script src="${root}assets/search-core.js" defer></script>
<script src="${root}assets/search-docs.js" defer></script>
<script src="${root}assets/search.js" defer></script>`;
      write(here, finish(layout({ t, path: here, title: '', body, alt: 'index.html' }), t));
      listPage(here, index.generated);
    }

    // Trang khoa
    for (const f of index.faculties) {
      const here = P(`faculty/${f.key}/index.html`);
      const root = relPrefix(here);
      const progs = listedPrograms.filter((p) => p.faculty === f.key);
      const body = `
<h1>${esc(facultyName(t, f))}</h1>
${f.key === 'unknown' ? `<p class="note">${esc(lang === 'vi' ? 'Môn có tiền tố mã chưa xác minh. Khi biết đúng khoa, mở form Sửa danh mục môn.' : 'Courses whose code prefix is not verified yet. If you know the right faculty, open the Fix course details form.')}</p>` : ''}
${f.key === SHARED_FACULTY ? `<p class="note">${esc(t.facultySharedNote)}</p>` : ''}
${!progs.length && !f.courses.length ? `<div class="note" role="note"><p>${esc(t.facultyEmpty)}</p></div>` : ''}
<h2>${esc(t.facultyPrograms)}</h2>
<p class="muted">${esc(t.programsCount(progs.length))}</p>
${progs.length ? programsByYear(t, progs, (p) => `${root}${P(`program/${p.code}/`)}`) : `<p class="muted">${esc(t.facultyNoPrograms)}</p>`}
<p class="actions"><a class="btn" href="${esc(addProgramUrl(f))}" rel="noopener">${esc(t.addProgram)}</a></p>
<h2>${esc(t.facultyCourses)}</h2>
<p class="muted">${esc(t.coursesCount(f.courses.length))}</p>
${courseTable(t, f.courses, root, t.facultyCourses)}`;
      write(
        here,
        finish(
          layout({
            t,
            path: here,
            title: facultyName(t, f),
            description: t.facultyDescription(facultyName(t, f), f.courses.length, progs.length),
            body,
            crumbs: [['', t.nav.home], ['', facultyName(t, f)]],
            alt: `faculty/${f.key}/index.html`,
          }),
          t,
        ),
      );
      listPage(here, latest([...f.courses.map((c) => c.updated), ...progs.map((p) => p.updated)]));
    }

    // Trang chương trình
    for (const p of index.programs) {
      const here = P(`program/${p.code}/index.html`);
      const root = relPrefix(here);
      const fac = facByKey.get(p.faculty);
      const blocks = p.blocks
        .filter((b) => b.courses.length)
        .map((b) => {
          const list = b.courses.map((id) => allCourses.get(id)).filter(Boolean);
          const meta = [b.required ? t.required : t.elective, b.creditsNeed ? t.blockCredits(b.creditsNeed) : null].filter(Boolean).join(', ');
          return `<section class="block" id="${blockAnchor(b.id)}"><h2>${esc(b.name)} <span class="muted small">${esc(meta)}</span></h2>${b.group ? `<p class="muted small">${esc(b.group)}</p>` : ''}${courseTable(t, list, root, b.name)}</section>`;
        })
        .join('');
      const pname = programName(t, p);
      // Link chính thức: PDF CTĐT và kế hoạch giảng dạy của trường nếu có; không có thì link nguồn
      // (nếu có) và bảng CTĐT của trường. Chưa có danh sách môn: ghi chú, nút gửi CTĐT đứng đầu hàng.
      const official = officialProgramLinks(t, p, siteCfg);
      const hosted = official.pdf ? `<p class="muted small">${esc(t.programPdfHosted)}</p>` : '';
      const actions = blocks
        ? official.buttons.length
          ? `<p class="actions">${official.buttons.join('')}</p>${hosted}`
          : ''
        : `<div class="note" role="note"><p>${esc(t.programNoCourses)}</p></div><p class="actions"><a class="btn primary" href="${esc(addProgramUrl(fac, p))}" rel="noopener">${esc(t.addProgram)}</a>${official.buttons.join('')}</p>${hosted}`;
      // Bản nháp nguồn: ghi rõ, trỏ về bản chính cùng ngành, cùng khóa nếu có.
      const mains = isListed(p) ? [] : listedPrograms.filter((x) => x.faculty === p.faculty && x.year === p.year && x.name === p.name);
      const draft = isListed(p)
        ? ''
        : `<div class="note" role="note"><p>${esc(t.programDraft)}${mains.length ? ` ${esc(t.programDraftSee)}: ${mains.map((x) => `<a href="${root}${P(`program/${x.code}/`)}">${esc(x.year ? `${programName(t, x)} (${x.year})` : programName(t, x))}</a>`).join(', ')}.` : ''}</p></div>`;
      const n = programCourseCount(p);
      const meta = [esc(t.programCode(p.code)), fac ? `<a href="${root}${P(`faculty/${fac.key}/`)}">${esc(facultyName(t, fac))}</a>` : null, p.variant ? esc(p.variant) : null, esc(n ? t.coursesCount(n) : t.programNoCoursesShort)]
        .filter(Boolean)
        .join(', ');
      const body = `<h1>${esc(pname)}${p.year ? ` (${esc(p.year)})` : ''}</h1><p class="muted">${meta}</p>${draft}${p.note ? `<p class="small" lang="vi">${esc(p.note)}</p>` : ''}${actions}${blocks}`;
      write(
        here,
        finish(
          layout({
            t,
            path: here,
            title: p.year ? `${pname} (${p.year})` : pname,
            description: t.programDescription(p.year ? `${pname} (${p.year})` : pname, n),
            body,
            crumbs: [['', t.nav.home], ...(fac ? [[`faculty/${fac.key}/`, facultyName(t, fac)]] : []), ['', pname]],
            alt: `program/${p.code}/index.html`,
            noindex: !isListed(p),
          }),
          t,
        ),
      );
      if (isListed(p)) listPage(here, p.updated);
    }

    // Trang môn
    for (const c of allCourses.values()) {
      const here = P(`course/${c.id}/index.html`);
      const root = relPrefix(here);
      const fac = facByKey.get(c.faculty);
      const cLink = (id) => {
        const x = allCourses.get(id);
        return `<a href="${root}${P(`course/${id}/`)}">${esc(x ? `${x.code} ${t.lang === 'en' && x.nameEn ? x.nameEn : x.name}` : id)}</a>`;
      };
      const rows = [
        [t.code, esc(c.code) + (c.code !== c.id ? ` <span class="muted">(ID ${esc(c.id)})</span>` : '')],
        [t.credits, c.credits != null ? String(c.credits) : `<span class="muted">${esc(t.partsNone)}</span>`],
        [t.faculty, fac ? `<a href="${root}${P(`faculty/${fac.key}/`)}">${esc(facultyName(t, fac))}</a>` : esc(c.faculty)],
        [t.parts, c.parts.length ? esc(c.parts.map((x) => PARTS[x][lang]).join(', ')) : `<span class="muted">${esc(t.partsNone)}</span>`],
        [t.status, esc(STATUS[c.status][lang])],
      ];
      if (c.aliases.length) rows.push([t.aliases, c.aliases.map((a) => `${esc(a.code)} ${esc(a.name)}${a.from || a.to ? ` <span class="muted">(${esc(t.aliasRange(a))})</span>` : ''}`).join('<br>')]);
      if (c.replacedBy) rows.push([t.replacedBy, cLink(c.replacedBy)]);
      if (c.replaces && c.replaces.length) rows.push([t.replaces, c.replaces.map(cLink).join(', ')]);
      if (c.related.length) rows.push([t.related, c.related.map(cLink).join('<br>')]);
      const teachers = [...new Set(c.items.filter((i) => !i.removed && i.teacher).map((i) => i.teacher))].sort((a, b) => a.localeCompare(b, 'vi'));
      if (teachers.length) rows.push([t.teachersOfCourse, esc(teachers.join(', '))]);
      if (c.programs.length) {
        const lines = c.programs.map((pg) => {
          const pr = progByCode.get(pg.program);
          const b = pr && pr.blocks.find((x) => x.id === pg.block);
          const label = pr ? (pr.year ? `${programName(t, pr)} (${pr.year})` : programName(t, pr)) : pg.program;
          const draft = pr && !isListed(pr) ? ` <span class="tag">${esc(t.programDraftTag)}</span>` : '';
          const href = `${root}${P(`program/${pg.program}/`)}`;
          const where = `${b ? `${b.name}, ` : ''}${pg.required ? t.required : t.elective}`;
          return `<a href="${href}">${esc(label)}</a>${draft}, ${b ? `<a href="${href}#${blockAnchor(b.id)}">${esc(where)}</a>` : esc(where)}`;
        });
        // Môn chung (Giải tích, Vật lý...) thuộc vài chục chương trình: gói lại cho gọn.
        const progCount = new Set(c.programs.map((x) => x.program)).size;
        rows.push([t.programsOfCourse, progCount > 5 ? `<details><summary>${esc(t.programsCount(progCount))}</summary>${lines.join('<br>')}</details>` : lines.join('<br>')]);
      }
      const groups = TYPE_ORDER.map((type) => {
        const list = c.items.filter((i) => i.type === type).sort((a, b) => Number(!!a.removed) - Number(!!b.removed) || a.title.localeCompare(b.title));
        if (!list.length) return '';
        const n = siteCfg.itemsPerGroup;
        const shown = list.slice(0, n).map((i) => renderItem(t, i, siteCfg, root)).join('');
        const rest = list.slice(n);
        const more = rest.length
          ? `<details class="more-items"><summary>${esc(t.moreItems(rest.length))}</summary><ul class="items">${rest.map((i) => renderItem(t, i, siteCfg, root)).join('')}</ul></details>`
          : '';
        return `<section class="group" id="loai-${type}"><h3>${esc(TYPES[type][lang])} <span class="muted small">(${list.length})</span></h3><ul class="items">${shown}</ul>${more}</section>`;
      }).join('');
      const name = t.lang === 'en' && c.nameEn ? c.nameEn : c.name;
      const retired =
        c.status === 'retired'
          ? `<div class="note warn" role="note"><p>${esc(t.retiredNotice)}${c.replacedBy ? ` ${esc(t.retiredSee)}: ${cLink(c.replacedBy)}.` : ''}</p></div>`
          : '';
      const body = `
<h1><span class="code">${esc(c.code)}</span> ${esc(name)}</h1>
${retired}
<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
<h2>${esc(t.materials)}</h2>
${groups || `<p class="muted">${esc(t.noItems)}</p>`}
<section class="panel contribute" aria-labelledby="h-contrib">
  <h2 id="h-contrib">${esc(t.contributeHere)}</h2>
  <p class="actions">
    <a class="btn primary" href="${root}gui-tai-lieu/?course=${encodeURIComponent(c.id)}">${esc(t.addDoc)}</a>
    <a class="btn" href="${esc(issueUrl('them-link.yml', { course: c.id }))}" rel="noopener">${esc(t.addLink)}</a>
    <a class="btn" href="${esc(issueUrl('sua-danh-muc.yml', { course: c.id }))}" rel="noopener">${esc(t.fixCatalog)}</a>
    <a class="btn subtle" href="${REPO_URL}/tree/main/courses/${esc(c.id)}" rel="noopener">${esc(t.viewOnGithub)}</a>
  </p>
</section>`;
      const crumbs = [['', t.nav.home], ...(fac ? [[`faculty/${fac.key}/`, facultyName(t, fac)]] : []), ['', c.code]];
      write(
        here,
        finish(layout({ t, path: here, title: `${c.code} ${name}`, description: t.courseDescription(c.code, name, itemsCountOf(c)), body, crumbs, alt: `course/${c.id}/index.html` }), t),
      );
      listPage(here, latest([c.updated, ...c.items.flatMap((i) => [i.added, i.updated])]));
    }

    // Mã hiện tại và mã cũ chuyển hướng tới ID cố định (nếu không trùng ID của môn khác).
    for (const c of allCourses.values()) {
      for (const code of new Set([c.code, ...c.aliases.map((a) => a.code)])) {
        if (code === c.id || allCourses.has(code)) continue;
        const here = P(`course/${code}/index.html`);
        const target = `../${c.id}/`;
        write(
          here,
          `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">${cspMeta()}<meta http-equiv="refresh" content="0; url=${target}"><link rel="canonical" href="${esc(absUrl(P(`course/${c.id}/`)))}"><title>${esc(c.code)}</title></head><body><p>${esc(t.redirecting)} <a href="${target}">${esc(c.code)} ${esc(c.name)}</a>.</p></body></html>\n`,
        );
      }
    }

    // Trang tĩnh: đóng góp, duyệt bài, gỡ tài liệu
    for (const [slug, titleKey] of [
      ['contribute', 'contribute'],
      ['review', 'review'],
      ['takedown', 'takedown'],
    ]) {
      const here = P(`${slug}/index.html`);
      const root = relPrefix(here);
      const raw = fs.readFileSync(path.join(SRC, 'pages', lang, `${slug}.html`), 'utf8');
      const body = raw
        .replace(/\{\{issue:([a-z0-9-]+\.yml)\}\}/g, (_, tpl) => esc(issueUrl(tpl)))
        .replace(/\{\{repo\}\}/g, REPO_URL)
        .replace(/\{\{viroot\}\}/g, root)
        .replace(/\{\{root\}\}/g, root + (lang === 'en' ? 'en/' : ''));
      write(here, finish(layout({ t, path: here, title: t.nav[titleKey], body, crumbs: [['', t.nav.home], ['', t.nav[titleKey]]], alt: `${slug}/index.html` }), t));
      listPage(here, '');
    }
  }

  // Trang Gửi tài liệu: chỉ có bản tiếng Việt, bản tiếng Anh trỏ sang đây.
  {
    const t = S.vi;
    const here = 'gui-tai-lieu/index.html';
    const policyRoot = fs.existsSync(path.join(root, 'catalog', 'policy.json')) ? root : TOOL_ROOT;
    const raw = fs.readFileSync(path.join(SRC, 'pages', 'vi', 'gui-tai-lieu.html'), 'utf8');
    const site = readSiteConfig(root);
    const body = uploadPage({ policy: loadPolicy(policyRoot), site, root: relPrefix(here), raw, t });
    // Trang này không có bản tiếng Anh tương ứng: không ghi hreflang.
    write(here, layout({ t, path: here, title: t.uploadTitle, body, crumbs: [['', t.nav.home], ['', t.uploadTitle]], alt: 'contribute/index.html', upload: site.uploadEndpoint, pair: false }));
    listPage(here, '');
  }

  // 404: một trang hai thứ tiếng, link tuyệt đối theo --base.
  {
    const t = S.vi;
    const e = S.en;
    const body = `<h1>${esc(t.notFoundTitle)}</h1><p>${esc(t.notFoundText)}</p><p><a class="btn primary" href="${base}">${esc(t.backHome)}</a></p>
<div lang="en"><h2>${esc(e.notFoundTitle)}</h2><p>${esc(e.notFoundText)}</p><p><a class="btn" href="${base}en/">${esc(e.backHome)}</a></p></div>`;
    write('404.html', finish(layout({ t, path: '404.html', title: t.notFoundTitle, body, base }), t));
  }

  // Cho máy tìm kiếm: robots.txt cho phép mọi trang và trỏ tới sitemap.xml. Lưu ý: robots.txt chỉ có
  // hiệu lực ở gốc tên miền; khi site nằm ở đường dẫn con, khai sitemap.xml trực tiếp với máy tìm kiếm.
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  write('sitemap.xml', sitemapXml(sitemap));

  return { out, pages: written.filter((p) => p.endsWith('.html')).length, files: written.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') a.root = path.resolve(argv[++i]);
    else if (argv[i] === '--out') a.out = path.resolve(argv[++i]);
    else if (argv[i] === '--base') a.base = argv[++i];
    else throw new Error(`tham số lạ: ${argv[i]}`);
  }
  const r = buildSite(a);
  console.log(`Đã sinh ${r.pages} trang (${r.files} file) vào ${r.out}`);
}
