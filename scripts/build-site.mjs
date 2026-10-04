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
import { EXAM_KINDS, TYPES, TYPE_ORDER, PARTS, STATUS, REPO, REPO_URL, SITE_URL, issueUrl, formatSize, formatBook, PROGRAM_TYPES, BLOCK_KINDS, DEGREES, LEVELS, DEFAULT_LEVEL, POSTGRAD_LEVELS, majorKey, isPostgrad, isPostgradCourse, courseLevels, fileFormat, DOC_LANGS } from './lib/labels.mjs';
import { previewTarget } from './lib/preview.mjs';
import { S } from './lib/strings.mjs';
import { buildV1, serializeV1 } from './lib/v1.mjs';
import { loadPolicy } from './lib/policy.mjs';
import { extensionsFor, restrictedExtensions } from './lib/extensions.mjs';
import { subjectIndex } from './lib/subject.mjs';
import { programLabel, courseTypes } from './lib/program-label.mjs';

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
    // Số tài liệu mới hiện ngay dưới ô tìm ở trang chủ. 0 thì không hiện mục này.
    recentItemsMax: Number.isInteger(cfg.recentItemsMax) && cfg.recentItemsMax >= 0 ? cfg.recentItemsMax : 8,
    docDescriptionMax: Number.isInteger(cfg.docDescriptionMax) && cfg.docDescriptionMax > 0 ? cfg.docDescriptionMax : 200,
    // Ảnh xem trước khi chia sẻ link (og:image), đường dẫn tính từ gốc site, nằm trong site-src/assets/.
    socialImage: /^assets\/[A-Za-z0-9._-]+\.png$/.test(cfg.socialImage || '') ? String(cfg.socialImage) : '',
    // Khóa khoa của nhóm Môn chung toàn trường (catalog/faculties.json): trang khoa này có ghi chú riêng,
    // trang khoa khác tách "Môn chung khoa dùng" khỏi "Môn của khoa".
    sharedFaculty: typeof cfg.sharedFaculty === 'string' ? cfg.sharedFaculty : '',
    // Thứ tự loại chương trình trên badge, bộ chọn loại; loại đầu là loại chính của ngành.
    programTypeOrder: Array.isArray(cfg.programTypeOrder) ? cfg.programTypeOrder.map(String) : Object.keys(PROGRAM_TYPES),
    // Từ bấy nhiêu mã cùng tên thì gộp thành một môn có trang chung mon/<slug>/ (site-src/assets/subject-core.js).
    sameNameGroupMin: Number.isInteger(cfg.sameNameGroupMin) && cfg.sameNameGroupMin >= 2 ? cfg.sameNameGroupMin : 2,
    // Dòng môn nhiều mã (ô tìm, form Gửi tài liệu): hiện tối đa bấy nhiêu mã, phần còn lại ghi +N.
    sameNameChipsMax: Number.isInteger(cfg.sameNameChipsMax) && cfg.sameNameChipsMax > 0 ? cfg.sameNameChipsMax : 4,
    // Bảng môn từ bấy nhiêu môn trở lên: môn chưa có tài liệu gập lại. 0 là không gập.
    noDocsCollapseMin: Number.isInteger(cfg.noDocsCollapseMin) && cfg.noDocsCollapseMin > 0 ? cfg.noDocsCollapseMin : Infinity,
    // Form Gửi tài liệu: gợi ý môn có mã lệch tối đa bấy nhiêu số trước khi cho thêm môn mới. 0 là không gợi ý.
    nearCodeSpan: Number.isInteger(cfg.nearCodeSpan) && cfg.nearCodeSpan > 0 ? cfg.nearCodeSpan : 0,
  };
}

// Mẫu mã môn hiện tại (code, không có hậu tố năm) trong schema môn: form kiểm mã môn mới theo đúng mẫu này.
function courseCodePattern() {
  return JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'schema', 'course.schema.json'), 'utf8')).properties.code.pattern;
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
// mới thêm trước. url là link tới mục trên trang môn (trang môn theo tên nếu mã thuộc môn nhiều mã), tính
// từ gốc site (bản tiếng Anh thêm en/). courseName là tên môn theo tên khi có.
//   pageOf(id) -> { path, name, nameEn, anchor(it) }; không truyền thì là trang course/<ID>/ của mã đó.
export function docIndex(items, courses, { descriptionMax = 200, pageOf = null } = {}) {
  const rows = [];
  for (const it of items) {
    if (it.removed) continue;
    const c = courses.get(it.course);
    if (!c) continue;
    const page = pageOf ? pageOf(c.id) : { path: `course/${c.id}/`, name: c.name, nameEn: c.nameEn, anchor: (x) => x.id };
    const row = { id: it.id, course: c.id, code: c.code, courseName: page.name };
    if (page.nameEn) row.courseNameEn = page.nameEn;
    row.faculty = c.faculty;
    row.title = it.title;
    if (it.description) row.description = truncate(it.description, descriptionMax);
    row.type = it.type;
    for (const k of ['term', 'examKind', 'chapter', 'teacher']) if (it[k]) row[k] = it[k];
    // Bậc của môn, chỉ ghi khi khác mặc định (đại học), cho ô lọc Bậc.
    if (Array.isArray(c.levels) && c.levels.length && !(c.levels.length === 1 && c.levels[0] === DEFAULT_LEVEL)) row.levels = c.levels;
    row.added = it.added;
    row.url = `${page.path}#${page.anchor(it)}`;
    rows.push(row);
  }
  return rows.sort((a, b) => b.added.localeCompare(a.added) || a.course.localeCompare(b.course) || a.id.localeCompare(b.id));
}

// Danh sách môn cho ô tìm trang chủ và form Gửi tài liệu (chỉ web dùng, không thuộc hợp đồng v1): cùng dạng
// với v1/index.json (search-core.js đọc được như nhau) nhưng bỏ trường ô tìm không dùng (url, detail, credits,
// replacedBy), bỏ giá trị mặc định (aliases, oldNames rỗng; status active), để tải nhẹ hơn. progs: số chương
// trình có mã này, để form chọn mã mặc định của môn nhiều mã (subject-core.js pickCode). Môn theo tên không
// ghi ở đây: trình duyệt tự gộp bằng subject-core.js, cùng quy tắc với build.
// extra: Map id -> { prog, progEn, types }: nhãn chương trình của mã (scripts/lib/program-label.mjs) và loại
// chương trình có mã này, cho ô lọc Hệ.
export function searchCourses(v1Index, progs = new Map(), extra = new Map()) {
  return {
    faculties: v1Index.faculties,
    courses: v1Index.courses.map((c) => {
      const row = { id: c.id, code: c.code, name: c.name };
      if (c.nameEn) row.nameEn = c.nameEn;
      row.faculty = c.faculty;
      if (c.levels) row.levels = c.levels;
      if (c.aliases && c.aliases.length) row.aliases = c.aliases;
      if (c.oldNames && c.oldNames.length) row.oldNames = c.oldNames;
      if (c.status !== 'active') row.status = c.status;
      if (c.items) row.items = c.items;
      if (c.teachers) row.teachers = c.teachers;
      if (progs.get(c.id)) row.progs = progs.get(c.id);
      const x = extra.get(c.id);
      if (x && x.prog) row.prog = x.prog;
      if (x && x.progEn && x.progEn !== x.prog) row.progEn = x.progEn;
      if (x && x.types && x.types.length) row.types = x.types;
      return row;
    }),
  };
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
  // Đợt gửi nhiều file: thiếu số trong policy thì một file một lần như cũ.
  const batchFiles = Number.isInteger(policy.batchMaxFiles) && policy.batchMaxFiles > 0 ? policy.batchMaxFiles : 1;
  const batchBytes = batchFiles > 1 && Number.isInteger(policy.batchMaxBytes) ? policy.batchMaxBytes : policy.maxFileBytes;
  const config = {
    maxBytes: policy.maxFileBytes,
    batchFiles,
    batchBytes,
    batchSize: formatSize(batchBytes),
    extensions: exts,
    // Đuôi nhận theo từng loại (extensions[].types, quizExtensions): form lọc ô chọn file theo loại.
    byType: Object.fromEntries(formTypes.map((x) => [x, extensionsFor(policy, x)])),
    msg: {
      ...msg,
      fileExt: msg.fileExt(exts.join(', ')),
      fileSize: msg.fileSize(formatSize(policy.maxFileBytes)),
      batchCount: msg.batchCount(batchFiles),
      batchSize: msg.batchSize(formatSize(batchBytes)),
      batchLimit: msg.batchLimit(batchFiles, formatSize(batchBytes)),
      newNameLong: msg.newNameLong(policy.fields.courseNameMax),
    },
    // Môn mới gửi kèm bài: mẫu mã từ schema, giới hạn tên từ policy, khoảng gợi ý mã gần từ site.json.
    newCourse: { codePattern: courseCodePattern(), nameMax: policy.fields.courseNameMax, nearSpan: site.nearCodeSpan },
    // Môn cùng tên gộp thành một dòng, cùng ngưỡng với ô tìm trang chủ.
    sameName: { groupMin: site.sameNameGroupMin, chipsMax: site.sameNameChipsMax },
  };
  // api.js của Cloudflare Turnstile là script ngoài duy nhất của site: chống bot gửi tự động vào form,
  // nên chỉ nạp ở trang này và chỉ khi form đã mở.
  const scripts = [
    `<script type="application/json" id="upload-config">${jsonInScript(config)}</script>`,
    `<script src="${root}assets/search-core.js" defer></script>`,
    `<script src="${root}assets/subject-core.js" defer></script>`,
    `<script src="${root}assets/upload-core.js" defer></script>`,
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
    ...Object.fromEntries(['titleMax', 'descriptionMax', 'chapterMax', 'teacherMax', 'displayNameMax', 'bookTitleMax', 'bookPublisherMax', 'courseNameMax'].map((k) => [k, String(policy.fields[k])])),
    licenses: policy.selfMadeLicenses.map((x) => opt(x, x)).join('\n'),
    accept: esc(exts.join(',')),
    exts: esc(exts.join(', ')),
    extNote: Object.entries(restrictedExtensions(policy))
      .map(([ext, types]) => ` ${esc(t.uploadExtOnly(ext, types.map((x) => TYPES[x]?.vi ?? x).join(', ')))}`)
      .join(''),
    maxSize: esc(formatSize(policy.maxFileBytes)),
    multiple: batchFiles > 1 ? ' multiple' : '',
    batchNote: batchFiles > 1 ? ` ${esc(msg.batchLimit(batchFiles, formatSize(batchBytes)))} ${esc(msg.batchHint)}` : '',
    teacherPlaceholder: esc(t.uploadTeacherPlaceholder),
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

// Trang chuyển hướng ngắn (mã môn cũ, mã thuộc môn nhiều mã, khóa khoa cũ): chuyển ngay, có link cho trình
// duyệt tắt chuyển hướng. assets/redirect.js chuyển sớm hơn và giữ phần #id của link cũ (thẻ meta bỏ phần này).
function redirectPage(write, here, target, canonical, lang, t, label, title = label) {
  write(
    here,
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">${cspMeta()}<meta http-equiv="refresh" content="0; url=${target}"><link rel="canonical" href="${esc(canonical)}"><title>${esc(title)}</title><script src="${relPrefix(here)}assets/redirect.js"></script></head><body><p>${esc(t.redirecting)} <a href="${target}">${esc(label)}</a>.</p></body></html>\n`,
  );
}

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
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${root}assets/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${root}assets/apple-touch-icon.png">
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

// Trang của từng mã: mã thuộc môn nhiều mã thì là trang môn theo tên mon/<slug>/, còn lại course/<ID>/.
// buildSite đặt lại khi biết danh mục (như GENERATED, SOCIAL).
let PAGE = {
  collapseMin: Infinity,
  label: () => '',
  subject: () => false,
  path: (id) => `course/${id}/`,
  anchor: (it) => it.id,
  name: (t, c) => (t.lang === 'en' && c.nameEn ? c.nameEn : c.name),
};

function itemsCountOf(course) {
  return course.items.filter((i) => !i.removed).length;
}

// Một dòng môn: link tới trang môn theo tên khi mã thuộc môn nhiều mã.
function courseRow(t, c, root) {
  const href = `${root}${pagePath(t.lang, PAGE.path(c.id))}`;
  const n = itemsCountOf(c);
  return `<tr${c.status === 'retired' ? ' class="retired"' : ''}><th scope="row"><a href="${href}">${esc(c.code)}</a></th><td><a href="${href}">${esc(t.lang === 'en' && c.nameEn ? c.nameEn : c.name)}</a>${c.status === 'retired' ? ` <span class="tag">${esc(STATUS.retired[t.lang])}</span>` : ''}</td><td class="num">${c.credits ?? ''}</td><td class="num">${n || `<span class="muted">${esc(t.noMaterial)}</span>`}</td></tr>`;
}

// Bảng dài (vài trăm môn ở trang khoa): trình duyệt bỏ qua phần ngoài màn hình khi vẽ (CSS .table-wrap.long).
const LONG_TABLE = 60;

// Môn có tài liệu lên trước, môn chưa có xuống sau, giữ thứ tự cũ trong mỗi phần (chỉ đổi thứ tự).
export function docsFirst(courses) {
  return [...courses.filter((c) => itemsCountOf(c) > 0), ...courses.filter((c) => !itemsCountOf(c))];
}

function courseTableHtml(t, courses, root, caption) {
  return `<div class="table-wrap${courses.length > LONG_TABLE ? ' long' : ''}"><table><caption class="sr">${esc(caption)}</caption><thead><tr><th scope="col">${esc(t.code)}</th><th scope="col">${esc(t.name)}</th><th scope="col" class="num">${esc(t.credits)}</th><th scope="col" class="num">${esc(t.materials)}</th></tr></thead><tbody>${courses
    .map((c) => courseRow(t, c, root))
    .join('')}</tbody></table></div>`;
}

// Bảng môn: môn có tài liệu trước. Bảng dài (từ PAGE.collapseMin môn, noDocsCollapseMin trong site.json): môn
// chưa có tài liệu gập trong "Môn chưa có tài liệu (N)".
function courseTable(t, courses, root, caption) {
  if (!courses.length) return `<p class="muted">${esc(t.noCourses)}</p>`;
  const list = docsFirst(courses);
  const empty = list.filter((c) => !itemsCountOf(c));
  if (courses.length < PAGE.collapseMin || !empty.length) return courseTableHtml(t, list, root, caption);
  const withDocs = list.filter((c) => itemsCountOf(c) > 0);
  return `${withDocs.length ? courseTableHtml(t, withDocs, root, caption) : ''}<details class="no-docs"><summary>${esc(t.noDocsCourses(empty.length))}</summary>${courseTableHtml(t, empty, root, caption)}</details>`;
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

// Nhãn loại chương trình là link mở ô tìm trang chủ với ?q=<mã loại> (hoặc nhãn variant khi chương trình
// chưa có type), để xem mọi chương trình cùng loại. root: gốc site tính từ trang hiện tại.
export function typeTagLink(t, root, q, label) {
  return `<a class="tag" href="${root}${t.lang === 'en' ? 'en/' : ''}?q=${encodeURIComponent(q)}">${esc(label)}</a>`;
}

// Nhãn loại của một chương trình: theo type (trừ CQ), không có type thì theo variant.
function programTypeTag(t, p, root) {
  if (p.type && p.type !== 'CQ' && PROGRAM_TYPES[p.type]) return typeTagLink(t, root, p.type, PROGRAM_TYPES[p.type][t.lang]);
  if (!p.type && p.variant) return typeTagLink(t, root, p.variant, p.variant);
  return '';
}

// Chương trình chưa có môn: sau đại học là CTĐT không ghi mã môn (có PDF), đại học là chưa ai gửi CTĐT.
const noCoursesShort = (t, p) => (isPostgrad(p) ? t.programNoCodesShort : t.programNoCoursesShort);

// Tên ngành kèm bậc cho ngành sau đại học ("Thạc sĩ Kỹ thuật cơ khí"), để không lẫn với ngành đại học cùng tên.
function majorTitle(t, m) {
  const name = majorDisplayName(t, m);
  return isPostgrad(m) && LEVELS[m.level] ? t.levelName(LEVELS[m.level][t.lang], name) : name;
}

// Một dòng chương trình: tên, loại, số môn (hoặc chưa có danh sách môn).
function programLi(t, p, href, { withYear = false, root = './' } = {}) {
  const n = programCourseCount(p);
  const label = withYear && p.year ? `${programName(t, p)} (${p.year})` : programName(t, p);
  const tag = programTypeTag(t, p, root);
  return `<li><a href="${href}">${esc(label)}</a>${tag ? ` ${tag}` : ''} <span class="muted small">${esc(n ? t.coursesCount(n) : noCoursesShort(t, p))}</span></li>`;
}

// Chương trình xếp theo khóa, mới nhất trước; chương trình không ghi khóa ở cuối.
function byYearDesc(a, b) {
  return (b.year || '0000').localeCompare(a.year || '0000') || a.name.localeCompare(b.name, 'vi') || a.code.localeCompare(b.code);
}

function programsByYear(t, progs, hrefOf, root) {
  const groups = new Map();
  for (const p of progs.slice().sort(byYearDesc)) {
    const k = p.year || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  return [...groups]
    .map(([y, list]) => `<h3>${esc(y ? t.cohort(y) : t.cohortUnknown)}</h3><ul class="list">${list.map((p) => programLi(t, p, hrefOf(p), { root })).join('')}</ul>`)
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

// ---------- Ngành, bộ chọn khóa và loại, lộ trình theo học kỳ ----------

const typeLabel = (t, type, full = false) => (PROGRAM_TYPES[type] ? (full ? PROGRAM_TYPES[type][t.lang] : PROGRAM_TYPES[type].short[t.lang]) : type);
const majorDisplayName = (t, m) => (t.lang === 'en' && m.nameEn ? m.nameEn : m.name);
const typeRank = (order, type) => {
  const i = order.indexOf(type);
  return i < 0 ? order.length : i;
};

// Nhãn ngắn của chương trình trong một ngành: "Khóa 2026, Chính quy" (thêm chuyên ngành nếu có).
export function cohortLabel(t, p) {
  return [p.year ? t.cohort(p.year) : t.cohortUnknown, p.type ? typeLabel(t, p.type) : null, p.track || null].filter(Boolean).join(', ');
}

export const hasSemesters = (p) => p.blocks.some((b) => b.semesters && Object.keys(b.semesters).length);

// Khối của chương trình đã là từng học kỳ (chỉ có kế hoạch giảng dạy): mỗi khối có môn đều cùng một học kỳ
// cho mọi môn. Khi đó trang chương trình không cần thêm phần lộ trình, vì khối đã là lộ trình.
export function blocksAreSemesters(p) {
  const filled = p.blocks.filter((b) => b.courses.length);
  return (
    filled.length > 0 &&
    filled.every((b) => {
      const s = b.semesters || {};
      const vals = new Set(b.courses.map((id) => s[id]));
      return vals.size === 1 && !vals.has(undefined);
    })
  );
}

// Môn theo học kỳ đề xuất (học kỳ sớm nhất nếu có ở nhiều khối), rồi môn chưa có học kỳ theo vai trò khối.
export function semesterPlan(p) {
  const seen = new Set();
  const sem = new Map();
  for (const b of p.blocks) {
    for (const id of b.courses) {
      const n = b.semesters?.[id];
      if (!n || seen.has(id)) continue;
      seen.add(id);
      if (!sem.has(n)) sem.set(n, []);
      sem.get(n).push(id);
    }
  }
  const rest = new Map();
  for (const b of p.blocks) {
    for (const id of b.courses) {
      if (seen.has(id)) continue;
      seen.add(id);
      const k = BLOCK_KINDS[b.kind] ? b.kind : 'khac';
      if (!rest.has(k)) rest.set(k, []);
      rest.get(k).push(id);
    }
  }
  const kinds = Object.keys(BLOCK_KINDS);
  return {
    semesters: [...sem].sort((a, b) => a[0] - b[0]),
    rest: [...rest].sort((a, b) => kinds.indexOf(a[0]) - kinds.indexOf(b[0])),
  };
}

// Chương trình chính của một nhóm: ưu tiên có danh sách môn, có học kỳ đề xuất, loại xếp đầu, khóa mới nhất.
export function mainProgram(list, order) {
  const filled = list.filter((p) => programCourseCount(p));
  const withSem = filled.filter(hasSemesters);
  const pool = withSem.length ? withSem : filled.length ? filled : list;
  return pool.slice().sort((a, b) => typeRank(order, a.type) - typeRank(order, b.type) || (b.year || '').localeCompare(a.year || '') || a.code.localeCompare(b.code))[0] || null;
}

// Bộ chọn loại chương trình và khóa (link tới trang chương trình). current: chương trình đang xem.
function majorPickers(t, list, current, hrefOf, order, currentAttr) {
  const chip = (p, label, on) => `<a class="chip" href="${hrefOf(p)}"${on ? ` aria-current="${currentAttr}"` : ''}>${esc(label)}</a>`;
  const types = [...new Set(list.map((p) => p.type).filter(Boolean))].sort((a, b) => typeRank(order, a) - typeRank(order, b));
  const typeChips = types.map((type) => chip(mainProgram(list.filter((p) => p.type === type), order), typeLabel(t, type), type === current.type));
  const cohorts = list
    .filter((p) => p.type === current.type)
    .sort((a, b) => (b.year || '').localeCompare(a.year || '') || (a.track || '').localeCompare(b.track || '', 'vi'));
  const cohortChips = cohorts.map((p) => chip(p, [p.year || t.cohortUnknown, p.track].filter(Boolean).join(', '), p.code === current.code));
  const row = (label, chips) => `<div class="pick-row"><span class="pick-label">${esc(label)}</span><span class="chips">${chips.join('')}</span></div>`;
  return `<nav class="pickers" aria-label="${esc(t.pickersLabel)}">${types.length > 1 ? row(t.pickType, typeChips) : ''}${row(t.pickCohort, cohortChips)}</nav>`;
}

// Lộ trình theo học kỳ: mỗi học kỳ một bảng môn; môn chưa có học kỳ gập theo vai trò khối.
function roadmapHtml(t, p, allCourses, root) {
  const plan = semesterPlan(p);
  const list = (ids) => ids.map((id) => allCourses.get(id)).filter(Boolean);
  const sems = plan.semesters
    .map(([n, ids]) => `<section class="sem" id="hoc-ky-${n}"><h3>${esc(t.semester(n))} <span class="muted small">${esc(t.coursesCount(list(ids).length))}</span></h3>${courseTable(t, list(ids), root, t.semester(n))}</section>`)
    .join('');
  const rest = plan.rest.length
    ? `<section class="sem"><h3>${esc(t.noSemester)}</h3>${plan.rest
        .map(([kind, ids]) => `<details class="sem-rest"><summary>${esc(BLOCK_KINDS[kind][t.lang])} <span class="muted small">${esc(t.coursesCount(list(ids).length))}</span></summary>${courseTable(t, list(ids), root, BLOCK_KINDS[kind][t.lang])}</details>`)
        .join('')}</section>`
    : '';
  return sems + rest;
}

// Một dòng ngành: tên (link trang ngành), nhãn loại, các khóa có danh sách môn (mới trước).
function majorRow(t, m, progs, root, P, order) {
  const href = `${root}${P(`major/${majorKey(m.code)}/`)}`;
  const types = [...new Set(progs.map((p) => p.type).filter(Boolean))].sort((a, b) => typeRank(order, a) - typeRank(order, b));
  const filled = progs.filter((p) => programCourseCount(p));
  const years = [...new Set(filled.map((p) => p.year).filter(Boolean))].sort().reverse();
  const links = years.map((y) => {
    const p = mainProgram(filled.filter((x) => x.year === y), order);
    return `<a href="${root}${P(`program/${p.code}/`)}">${esc(y)}</a>`;
  });
  const tags = types.map((x) => typeTagLink(t, root, x, typeLabel(t, x))).join('');
  const none = isPostgrad(m) ? t.programNoCodesShort : t.majorNoCourses;
  return `<li class="major-row"><span class="major-head"><a class="major-name" href="${href}">${esc(majorDisplayName(t, m))}</a>${tags}</span><span class="muted small">${links.length ? `${esc(t.cohortsLabel)}: ${links.join(', ')}` : esc(none)}</span></li>`;
}

// Khối kiến thức của một chương trình: mỗi khối có môn một bảng; khối có khối cha (group) ghi tên khối cha,
// kèm số tín chỉ khối cha cần nếu chương trình ghi ở groups.
function blocksHtml(t, p, allCourses, root, heading = 'h3') {
  const groupCredits = new Map((p.groups || []).filter((g) => g.creditsNeed != null).map((g) => [g.name, g.creditsNeed]));
  return p.blocks
    .filter((b) => b.courses.length)
    .map((b) => {
      const list = b.courses.map((id) => allCourses.get(id)).filter(Boolean);
      const meta = [b.requiredUnknown ? null : b.required ? t.required : t.elective, b.creditsNeed ? t.blockCredits(b.creditsNeed) : null, b.coursesNeed ? t.coursesNeed(b.coursesNeed) : null].filter(Boolean).join(', ');
      const group = b.group ? [b.group, groupCredits.get(b.group) ? t.blockCredits(groupCredits.get(b.group)) : null].filter(Boolean).join(', ') : '';
      return `<section class="block" id="${blockAnchor(b.id)}"><${heading}>${esc(b.name)}${meta ? ` <span class="muted small">${esc(meta)}</span>` : ''}</${heading}>${group ? `<p class="muted small">${esc(group)}</p>` : ''}${courseTable(t, list, root, b.name)}</section>`;
    })
    .join('');
}

// Danh sách ngành của một khoa, xếp theo tên.
function majorList(t, majors, progsOfMajor, root, P, order) {
  const rows = majors
    .slice()
    .sort((a, b) => majorDisplayName(t, a).localeCompare(majorDisplayName(t, b), t.lang) || a.code.localeCompare(b.code))
    .map((m) => majorRow(t, m, progsOfMajor(m.code), root, P, order));
  return rows.length ? `<ul class="majors">${rows.join('')}</ul>` : '';
}

// Link xem trước qua Worker, chỉ cho file nằm trong danh sách được phép (scripts/lib/preview.mjs).
function previewHref(url, site) {
  if (!site.reviewBase || !url || !previewTarget(url, { repo: REPO, site: SITE_URL })) return null;
  return `${site.reviewBase}/xem-truoc?u=${encodeURIComponent(url)}`;
}

// Form Yêu cầu gỡ điền sẵn link tới đúng mục trên trang môn (ô "item") và id mục trong tiêu đề.
function takedownUrl(t, it) {
  const page = `${SITE_URL}${pagePath(t.lang, PAGE.path(it.course))}#${PAGE.anchor(it)}`;
  return issueUrl('yeu-cau-go.yml', { title: `[Gỡ] ${it.course} ${it.id}`, item: page });
}

const btn = (cls, href, label, extra = '') => `<a class="${cls}" href="${esc(href)}"${extra}>${esc(label)}</a>`;

// Một file của tài liệu: link tải, link xem trước (nếu được), định dạng và cỡ.
function fileLinks(it, f, site, root) {
  // File .md trong git: web phục vụ ở files/<ID>/<tên> (cùng link với v1).
  const name = f.path ? f.path.split('/').pop() : null;
  const download = f.url || (name ? `${root}files/${encodeURIComponent(it.course)}/${encodeURIComponent(name)}` : null);
  const published = f.url || (name ? `${SITE_URL}files/${encodeURIComponent(it.course)}/${encodeURIComponent(name)}` : null);
  return { download, preview: download ? previewHref(published, site) : null, format: fileFormat(f.name), size: formatSize(f.size) };
}

// Định dạng của cả tài liệu: link, sách, hoặc các định dạng file (không trùng).
export function itemFormat(t, it) {
  if (it.type === 'link') return t.item.formatLink;
  if (it.type === 'book-ref') return t.item.formatBook;
  return [...new Set((it.files || []).map((f) => fileFormat(f.name)).filter(Boolean))].join(', ');
}

// Thông tin trước, hành động sau: Xem trước, Tải xuống, Yêu cầu gỡ (mẫu trong skill bk-library-ui).
// Khối chi tiết (dl hai cột nhãn, giá trị) ghi đủ: định dạng, cỡ, ngày tải lên, ngày cập nhật (nếu khác),
// loại, học kỳ, kỳ thi, chương, bài, giảng viên, người gửi, ngôn ngữ, giấy phép, nguồn. Nhiều file: mỗi file
// một dòng có định dạng, cỡ và nút riêng.
function renderItem(t, it, site, root) {
  const L = t.item;
  const files = it.removed || it.type === 'link' || it.type === 'book-ref' ? [] : it.files || [];
  const many = files.length > 1;
  const links = files.map((f) => ({ f, ...fileLinks(it, f, site, root) }));
  const facts = [];
  const add = (label, value, html = false) => {
    if (value) facts.push([label, html ? value : esc(value)]);
  };
  // Mã môn tài liệu được gửi cho, kèm nhãn chương trình của mã đó.
  const codeOf = PAGE.code ? PAGE.code(it.course) : it.course;
  const plabel = PAGE.label(t, it.course);
  add(L.code, `<span class="code">${esc(codeOf)}</span>${plabel ? ` ${esc(plabel)}` : ''}`, true);
  add(L.format, itemFormat(t, it));
  if (files.length === 1) add(L.size, links[0].size);
  else if (many) add(L.size, formatSize(files.reduce((n, f) => n + (f.size || 0), 0)));
  if (it.added) add(L.added, `<time datetime="${esc(it.added)}">${esc(formatDate(t, it.added))}</time>`, true);
  if (it.updated && it.updated !== it.added) add(L.updated, `<time datetime="${esc(it.updated)}">${esc(formatDate(t, it.updated))}</time>`, true);
  add(L.type, TYPES[it.type] ? TYPES[it.type][t.lang] : it.type);
  add(L.term, it.term);
  if (it.examKind) add(L.examKind, t.examKinds[it.examKind] || it.examKind);
  add(L.chapter, it.chapter);
  if (it.lab != null) add(L.lab, String(it.lab));
  // Tên giảng viên mở ô tìm ở trang chủ để ra các môn khác có tài liệu của cùng người.
  if (it.teacher) add(L.teacher, `<a href="${root}${pagePath(t.lang, '')}?q=${encodeURIComponent(it.teacher)}">${esc(it.teacher)}</a>`, true);
  add(L.authors, it.authors && it.authors.length ? it.authors.join(', ') : L.anonymous);
  add(L.lang, DOC_LANGS[it.lang] ? DOC_LANGS[it.lang][t.lang] : it.lang);
  add(L.license, it.license);
  add(L.source, it.source);
  const details = facts.length ? `<dl class="item-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '';
  // Trang môn nhiều mã: nhãn mã và chương trình ngay cạnh tiêu đề để thấy tài liệu này của mã nào.
  const codeTag = PAGE.subject(it.course) ? `<span class="tag">${esc([codeOf, plabel].filter(Boolean).join(', '))}</span>` : '';
  const badges = [codeTag, it.example ? `<span class="tag accent">${esc(t.example)}</span>` : '', it.removed ? `<span class="tag warn">${esc(t.removed)}</span>` : ''].join('');
  const takedown = btn('btn subtle', takedownUrl(t, it), t.requestTakedown, ' rel="noopener"');
  const row = (buttons) => `<p class="actions">${[...buttons, takedown].join('')}</p>`;
  const fileButtons = (x, named) => {
    const out = [];
    if (x.preview) out.push(btn('btn', x.preview, named ? t.previewNamed(x.f.name) : t.preview, ' target="_blank" rel="noopener"'));
    out.push(btn('btn', x.download, named ? t.downloadNamed(x.f.name, x.size) : t.download(x.size), x.f.url ? ' rel="noopener"' : ` download="${esc(x.f.name)}"`));
    return out;
  };
  let extra = '';
  let actions = '';
  if (it.removed) extra = `<p class="muted">${esc(it.removedReason || '')}</p>`;
  else if (it.type === 'book-ref') {
    extra = `<p>${esc(formatBook(it.book))}</p>`;
    actions = row(bookLinks(it.book, site.bookSources, t.lang).map((l) => btn('btn', l.href, l.label, ' rel="noopener"')));
  } else if (it.type === 'link') actions = row([btn('btn', it.url, t.openLink, ' rel="noopener"')]);
  else if (many) {
    // Nhiều file: danh sách file, mỗi file định dạng, cỡ và nút riêng; hàng nút cuối chỉ còn Yêu cầu gỡ.
    extra = `<ul class="files">${links
      .map((x) => `<li><span class="file-name">${esc(x.f.name)}</span> <span class="muted">${esc([x.format, x.size].filter(Boolean).join(', '))}</span>${x.download ? `<p class="actions">${fileButtons(x, true).join('')}</p>` : `<p class="muted">${esc(t.pendingFile(x.f.name))}</p>`}</li>`)
      .join('')}</ul>`;
    actions = row([]);
  } else {
    const x = links[0];
    if (x && !x.download) extra = `<p class="muted">${esc(t.pendingFile(x.f.name))}</p>`;
    actions = row(x && x.download ? fileButtons(x, false) : []);
  }
  const note = it.type === 'prelab-reference' ? `<p class="note">${esc(t.prelabRefNote)}</p>` : '';
  return `<li class="item${it.removed ? ' is-removed' : ''}" id="${esc(PAGE.anchor(it))}" data-course="${esc(it.course)}" data-type="${esc(it.type)}"><h4>${esc(it.title)}${badges ? ` ${badges}` : ''}</h4>${it.description ? `<p>${esc(it.description)}</p>` : ''}${details}${note}${extra}${actions}</li>`;
}

// Ngày dạng YYYY-MM-DD thành 04/10/2026 (tiếng Việt) hoặc 4 Oct 2026 (tiếng Anh).
function formatDate(t, d) {
  const [y, m, day] = d.split('-').map(Number);
  if (t.lang === 'en') return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
  return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

// Tài liệu mới nhất (chưa gỡ), xếp theo ngày cập nhật rồi ngày thêm.
export function recentItems(items, max) {
  return items
    .filter((it) => !it.removed)
    .map((it) => ({ it, date: it.updated || it.added }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.it.course.localeCompare(b.it.course) || a.it.id.localeCompare(b.it.id))
    .slice(0, max);
}

// Mục "Tài liệu mới" ở trang chủ: tên, môn, loại, dung lượng (hoặc Link, Sách), ngày cập nhật.
function recentSection(t, rows, courses, root, P) {
  if (!rows.length) return '';
  const li = rows
    .map(({ it, date }) => {
      const c = courses.get(it.course);
      const cname = c ? PAGE.name(t, c) : '';
      const size = (it.files || []).reduce((n, f) => n + (f.size || 0), 0);
      const kind = it.type === 'link' || it.type === 'book-ref' ? '' : [itemFormat(t, it), size ? formatSize(size) : ''].filter(Boolean).join(', ');
      const href = `${root}${P(PAGE.path(it.course))}#${encodeURIComponent(PAGE.anchor(it))}`;
      const meta = [TYPES[it.type] ? TYPES[it.type][t.lang] : it.type, kind].filter(Boolean).join(', ');
      return `<li><a href="${href}"><span class="recent-title">${esc(it.title)}</span><span class="recent-course"><span class="code">${esc(c ? c.code : it.course)}</span> ${esc(cname)}</span><span class="muted recent-meta">${esc(meta)}</span><time class="muted recent-date" datetime="${esc(date)}">${esc(formatDate(t, date))}</time></a></li>`;
    })
    .join('');
  return `<section class="recent" aria-labelledby="h-recent"><h2 id="h-recent">${esc(t.recentTitle)}</h2><ul class="recent-list">${li}</ul></section>`;
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
  const v1 = buildV1(repo);
  for (const [p, content] of serializeV1(v1)) write(`v1/${p}`, content);
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
  // Ngành và chương trình của từng ngành (chỉ chương trình được liệt kê).
  const typeOrder = siteCfg.programTypeOrder;
  const majors = index.majors || [];
  const majorByCode = new Map(majors.map((m) => [m.code, m]));
  const majorProgs = new Map();
  for (const p of listedPrograms) {
    if (!p.major || !majorByCode.has(p.major)) continue;
    if (!majorProgs.has(p.major)) majorProgs.set(p.major, []);
    majorProgs.get(p.major).push(p);
  }
  const progsOfMajor = (code) => majorProgs.get(code) || [];
  // Bậc đại học là mặc định: danh sách ngành, chương trình, môn của khoa chỉ gồm đại học; sau đại học
  // (thạc sĩ, tiến sĩ) nằm ở phần riêng bên dưới.
  const ugPrograms = listedPrograms.filter((p) => !isPostgrad(p));
  const pgPrograms = listedPrograms.filter(isPostgrad);
  // Ngành của khoa: ngành do khoa quản lý, hoặc có chương trình ghi khoa này (ví dụ PFIEV do khoa khác dạy).
  // level: bậc của ngành (mặc định đại học).
  const majorsOfFaculty = (key, level = DEFAULT_LEVEL) =>
    majors.filter((m) => (m.level || DEFAULT_LEVEL) === level && progsOfMajor(m.code).length && (m.faculty === key || progsOfMajor(m.code).some((p) => p.faculty === key)));
  const pgMajorCount = (level) => majors.filter((m) => m.level === level && progsOfMajor(m.code).length).length;
  const ugMajorCount = majors.filter((m) => !isPostgrad(m) && progsOfMajor(m.code).length).length;
  // Chương trình chưa gắn ngành của khoa: có danh sách môn, và chưa có (để gập lại).
  const loosePrograms = (key) => {
    const list = ugPrograms.filter((p) => p.faculty === key && !(p.major && majorByCode.has(p.major))).sort(byYearDesc);
    return { filled: list.filter((p) => programCourseCount(p)), empty: list.filter((p) => !programCourseCount(p)) };
  };
  const shared = siteCfg.sharedFaculty;
  // Khóa khoa cũ chỉ giữ cho link (movedTo trong faculties.json): không vào danh sách nào, trang khoa chuyển hướng.
  const movedTo = new Map(repo.faculties.faculties.filter((f) => f.movedTo).map((f) => [f.key, f.movedTo]));
  const faculties = index.faculties.filter((f) => !movedTo.has(f.key));
  // Môn theo tên: các mã cùng tên (từ sameNameGroupMin mã) có chung một trang mon/<slug>/ gom mọi tài liệu;
  // trang course/<ID>/ của các mã đó chuyển hướng tới đây. Quy tắc ở site-src/assets/subject-core.js.
  const { subjects, subjectOf } = subjectIndex(allCourses, { min: siteCfg.sameNameGroupMin });
  // Id tài liệu chỉ riêng trong một mã: trên trang môn theo tên, id trùng giữa các mã thì thêm mã phía trước.
  const anchorClash = new Set();
  for (const s of subjects.values()) {
    const seen = new Map();
    for (const id of s.ids) for (const it of allCourses.get(id).items) seen.set(it.id, (seen.get(it.id) || 0) + 1);
    for (const id of s.ids) for (const it of allCourses.get(id).items) if (seen.get(it.id) > 1) anchorClash.add(`${it.course}/${it.id}`);
  }
  PAGE = {
    collapseMin: siteCfg.noDocsCollapseMin,
    label: () => '',
    code: (id) => (allCourses.get(id) ? allCourses.get(id).code : id),
    subject: (id) => subjectOf.has(id),
    path: (id) => (subjectOf.has(id) ? `mon/${subjectOf.get(id)}/` : `course/${id}/`),
    anchor: (it) => (anchorClash.has(`${it.course}/${it.id}`) ? `${it.course.toLowerCase()}-${it.id}` : it.id),
    name: (t, c) => {
      const s = subjects.get(subjectOf.get(c.id));
      if (s) return (t.lang === 'en' && s.nameEn) || s.name;
      return t.lang === 'en' && c.nameEn ? c.nameEn : c.name;
    },
  };
  const progCount = new Map([...allCourses.values()].map((c) => [c.id, new Set(c.programs.map((p) => p.program)).size]));
  // Nhãn chương trình của từng mã ("Chính quy", "Tiên tiến") theo hai thứ tiếng, và loại chương trình của mã.
  const labelOpts = { programs: progByCode, faculties: facByKey, listed: isListed, order: siteCfg.programTypeOrder };
  const progLabel = { vi: new Map(), en: new Map() };
  const extra = new Map();
  for (const c of allCourses.values()) {
    for (const lang of ['vi', 'en']) progLabel[lang].set(c.id, programLabel(c, { ...labelOpts, lang }));
    extra.set(c.id, { prog: progLabel.vi.get(c.id), progEn: progLabel.en.get(c.id), types: courseTypes(c, labelOpts) });
  }
  PAGE.label = (t, id) => progLabel[t.lang].get(id) || '';
  write('assets/courses.json', JSON.stringify(searchCourses(v1.index, progCount, extra)) + '\n');
  // Danh sách chương trình cho ô tìm ở trang chủ (chỉ web dùng, không thuộc hợp đồng v1).
  // Ngành là dòng kind: "major" (link tới trang ngành, key là đoạn đường dẫn); chương trình gắn ngành ghi
  // major và majorName để tìm tên ngành hay mã ngành ra cả chương trình.
  write(
    'assets/programs.json',
    JSON.stringify([
      ...majors
        .filter((m) => progsOfMajor(m.code).length)
        .map((m) => {
          const row = { kind: 'major', code: m.code, key: majorKey(m.code), name: m.name };
          if (m.nameEn) row.nameEn = m.nameEn;
          row.faculty = m.faculty;
          if (isPostgrad(m)) row.level = m.level;
          row.types = [...new Set(progsOfMajor(m.code).map((p) => p.type).filter(Boolean))].sort((a, b) => typeRank(typeOrder, a) - typeRank(typeOrder, b));
          row.programs = progsOfMajor(m.code).length;
          return row;
        }),
      ...listedPrograms.map((p) => {
        const row = { code: p.code, name: p.name };
        if (p.nameEn) row.nameEn = p.nameEn;
        if (p.year) row.year = p.year;
        if (p.variant) row.variant = p.variant;
        if (p.type) row.type = p.type;
        if (p.major && majorByCode.has(p.major)) {
          row.major = p.major;
          if (majorByCode.get(p.major).name !== p.name) row.majorName = majorByCode.get(p.major).name;
        }
        row.faculty = p.faculty;
        if (isPostgrad(p)) row.level = p.level;
        row.courses = programCourseCount(p);
        return row;
      }),
    ]) + '\n',
  );
  // Tài liệu cho ô tìm ở trang chủ (chỉ web dùng, không thuộc hợp đồng v1).
  const docs = docIndex(repo.items, allCourses, {
    descriptionMax: siteCfg.docDescriptionMax,
    pageOf: (id) => {
      const c = allCourses.get(id);
      const vi = PAGE.name(S.vi, c);
      const en = PAGE.name(S.en, c);
      return { path: PAGE.path(id), name: vi, nameEn: en !== vi ? en : '', anchor: PAGE.anchor };
    },
  });
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
      const progsOf = (key) => ugPrograms.filter((p) => p.faculty === key);
      const facList = faculties
        .map((f) => {
          const np = progsOf(f.key).length;
          const ni = f.courses.reduce((n, c) => n + itemsCountOf(c), 0);
          const stats =
            f.courses.length || np
              ? [t.coursesCount(f.courses.length), ni ? t.itemsCount(ni) : null, np ? t.programsCount(np) : null].filter(Boolean).join(', ')
              : t.noData;
          return `<li><a class="card" href="${root}${P(`faculty/${f.key}/`)}"><strong>${esc(facultyName(t, f))}</strong><span class="muted">${esc(stats)}</span></a></li>`;
        })
        .join('');
      // Gộp theo khoa, mỗi khoa một khối đóng mở; trong khoa là từng ngành (một dòng, kèm các khóa),
      // rồi chương trình chưa gắn ngành, cuối cùng là chương trình chưa có danh sách môn (gập lại).
      // Khoa chưa có ngành, chương trình nào (Môn chung toàn trường, Chưa xác định) không có dòng ở đây.
      const progList = `<div class="prog-groups">${faculties
        .map((f) => {
          const ms = majorsOfFaculty(f.key);
          const { filled, empty } = loosePrograms(f.key);
          if (!ms.length && !filled.length && !empty.length) return '';
          const li = (p) => programLi(t, p, `${root}${P(`program/${p.code}/`)}`, { withYear: true, root });
          const parts = [];
          if (ms.length) parts.push(majorList(t, ms, progsOfMajor, root, P, typeOrder));
          if (filled.length) parts.push(`${ms.length ? `<h3>${esc(t.otherPrograms)}</h3>` : ''}<ul class="list">${filled.map(li).join('')}</ul>`);
          if (empty.length) parts.push(`<details class="prog-empty"><summary>${esc(t.emptyPrograms(empty.length))}</summary><ul class="list">${empty.map(li).join('')}</ul></details>`);
          const inner = parts.join('');
          const stats = [ms.length ? t.majorsCount(ms.length) : null, t.programsCount(progsOf(f.key).length)].filter(Boolean).join(', ');
          return `<details class="prog-fac"><summary><span class="prog-fac-name">${esc(facultyName(t, f))}</span> <span class="muted small">${esc(stats)}</span></summary>${inner}<p><a class="btn subtle" href="${esc(addProgramUrl(f))}" rel="noopener">${esc(t.addProgram)}</a></p></details>`;
        })
        .join('')}</div>`;
      // Sau đại học: mỗi bậc một khối đóng mở, trong bậc là ngành theo khoa.
      const pgList = POSTGRAD_LEVELS.map((level) => {
        const byFac = faculties.map((f) => [f, majorsOfFaculty(f.key, level)]).filter(([, ms]) => ms.length);
        if (!byFac.length) return '';
        const n = pgPrograms.filter((p) => p.level === level).length;
        const inner = byFac.map(([f, ms]) => `<h3>${esc(facultyName(t, f))}</h3>${majorList(t, ms, progsOfMajor, root, P, typeOrder)}`).join('');
        return `<details class="prog-fac"><summary><span class="prog-fac-name">${esc(LEVELS[level][lang])}</span> <span class="muted small">${esc([t.majorsCount(pgMajorCount(level)), t.programsCount(n)].join(', '))}</span></summary>${inner}</details>`;
      }).join('');
      const pgSection = pgPrograms.length
        ? `<section aria-labelledby="h-sdh">
  <h2 id="h-sdh">${esc(t.postgradTitle)}</h2>
  <p>${esc(t.postgradIntro)}</p>
  <p class="muted">${esc(t.postgradStats(pgMajorCount('thac-si'), pgMajorCount('tien-si'), pgPrograms.length))}</p>
  <div class="prog-groups">${pgList}</div>
</section>`
        : '';
      // Ô lọc tài liệu: chỉ có khi có giá trị để chọn. Nhãn hiện rõ trên mỗi ô.
      const filterSelect = (id, label, all, values, labelOf) =>
        values.length
          ? `<div class="filter"><label for="${id}">${esc(label)}</label><select id="${id}"><option value="">${esc(all)}</option>${values.map((v) => `<option value="${esc(v)}">${esc(labelOf(v))}</option>`).join('')}</select></div>`
          : '';
      // Bậc: mặc định Đại học, có Thạc sĩ, Tiến sĩ, Tất cả. Chỉ có khi danh mục có môn hay chương trình sau đại học.
      const hasPostgrad = pgPrograms.length > 0 || [...allCourses.values()].some((c) => courseLevels(c).some((l) => l !== DEFAULT_LEVEL));
      const levelSelect = hasPostgrad
        ? `<div class="filter"><label for="q-level">${esc(t.levelFilter)}</label><select id="q-level">${[...Object.keys(LEVELS), 'tat-ca']
            .map((v) => `<option value="${v}"${v === DEFAULT_LEVEL ? ' selected' : ''}>${esc(v === 'tat-ca' ? t.levelAll : LEVELS[v][lang])}</option>`)
            .join('')}</select></div>`
        : '';
      const filterHtml = [
        levelSelect,
        filterSelect('q-type', t.docType, t.docTypeAll, docValues.types, (v) => TYPES[v][lang]),
        filterSelect('q-term', t.docTerm, t.docTermAll, docValues.terms, (v) => v),
        filterSelect('q-kind', t.docKind, t.docKindAll, docValues.examKinds, (v) => t.examKinds[v] || v),
      ].join('');
      const docFilters = filterHtml ? `<div class="search-filters">${filterHtml}</div>` : '';
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
  <p class="muted">${esc(t.stats(index.counts.courses, totalItems))}</p>
</section>
<section class="search" role="search" aria-labelledby="search-label">
  <label id="search-label" for="q">${esc(t.searchLabel)}</label>
  <div class="search-row">
    <input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(t.searchPlaceholder)}" aria-describedby="q-hint">
    <select id="q-fac" aria-label="${esc(t.facultyFilter)}"><option value="">${esc(t.allFaculties)}</option>${faculties.filter((f) => f.courses.length).map((f) => `<option value="${esc(f.key)}">${esc(facultyName(t, f))}</option>`).join('')}</select>
  </div>
  ${docFilters}
  <p id="q-hint" class="muted">${esc(t.searchHint)}</p>
  <noscript><p class="note">${esc(t.searchNoJs)}</p></noscript>
  <div id="q-out">
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
  </div>
</section>
${recentSection(t, recentItems(repo.items, siteCfg.recentItemsMax), allCourses, root, P)}
<section aria-labelledby="h-fac">
  <h2 id="h-fac">${esc(t.browseFaculty)}</h2>
  <ul class="grid">${facList}</ul>
</section>
<section aria-labelledby="h-prog">
  <h2 id="h-prog">${esc(t.programsTitle)}</h2>
  <p class="muted">${esc([ugMajorCount ? t.majorsCount(ugMajorCount) : null, t.programsCount(ugPrograms.length)].filter(Boolean).join(', '))}</p>
  ${progList}
  <p class="actions"><a class="btn" href="${esc(addProgramUrl(null))}" rel="noopener">${esc(t.addProgram)}</a></p>
</section>
${pgSection}
<section class="cta-row">
  <div class="panel"><p>${esc(t.contributeCta)}</p><p class="muted small">${esc(t.homeRules)}</p><p class="actions"><a class="btn primary" href="${root}gui-tai-lieu/">${esc(t.contributeBtn)}</a><a class="btn subtle" href="${root}${P('contribute/')}">${esc(t.contributeGuide)}</a></p></div>
  <div class="panel"><p>${esc(t.reviewCta)}</p><p><a class="btn" href="${root}${P('review/')}">${esc(t.reviewBtn)}</a></p></div>
</section>
<script type="application/json" id="search-strings">${jsonInScript({ results: [t.results(0), t.results(1), t.results(2)], teacher: t.teacher, lang, groupMin: siteCfg.sameNameGroupMin, chipsMax: siteCfg.sameNameChipsMax, docs: docStrings, levels: Object.fromEntries(POSTGRAD_LEVELS.map((l) => [l, [LEVELS[l][lang], LEVELS[l][t.other]]])) })}</script>
<script src="${root}assets/search-core.js" defer></script>
<script src="${root}assets/subject-core.js" defer></script>
<script src="${root}assets/search-docs.js" defer></script>
<script src="${root}assets/search.js" defer></script>`;
      write(here, finish(layout({ t, path: here, title: '', body, alt: 'index.html' }), t));
      listPage(here, index.generated);
    }

    // Khóa khoa cũ: trang chuyển hướng ngắn tới khoa mới, không vào sitemap.
    for (const [key, to] of movedTo) {
      const target = facByKey.get(to);
      redirectPage(write, P(`faculty/${key}/index.html`), `../${to}/`, absUrl(P(`faculty/${to}/`)), lang, t, facultyName(t, target));
    }

    // Trang khoa
    for (const f of faculties) {
      const here = P(`faculty/${f.key}/index.html`);
      const root = relPrefix(here);
      const progs = ugPrograms.filter((p) => p.faculty === f.key);
      const ms = majorsOfFaculty(f.key);
      // Bậc đại học là mặc định: bảng môn của khoa không gồm môn chỉ có ở sau đại học.
      const ugCourses = f.courses.filter((c) => !isPostgradCourse(c));
      const pgCourses = f.courses.filter(isPostgradCourse);
      const pgMajors = POSTGRAD_LEVELS.map((level) => [level, majorsOfFaculty(f.key, level)]).filter(([, list]) => list.length);
      const pgProgs = pgPrograms.filter((p) => p.faculty === f.key);
      const pgBlock =
        pgMajors.length || pgCourses.length
          ? `<section aria-labelledby="h-sdh">
<h2 id="h-sdh">${esc(t.postgradTitle)}</h2>
${pgMajors.map(([level, list]) => `<h3>${esc(LEVELS[level][lang])}</h3>\n<p class="muted">${esc([t.majorsCount(list.length), t.programsCount(pgProgs.filter((p) => p.level === level).length)].join(', '))}</p>\n${majorList(t, list, progsOfMajor, root, P, typeOrder)}`).join('\n')}
${pgCourses.length ? `<details class="prog-empty"><summary>${esc(t.postgradCourses)} (${esc(t.coursesCount(pgCourses.length))})</summary><p class="muted small">${esc(t.postgradCoursesNote)}</p>${courseTable(t, pgCourses, root, t.postgradCourses)}</details>` : ''}
</section>`
          : '';
      const loose = loosePrograms(f.key);
      const looseCount = loose.filled.length + loose.empty.length;
      const hrefOf = (p) => `${root}${P(`program/${p.code}/`)}`;
      const sharedFac = shared && f.key !== shared ? facByKey.get(shared) : null;
      const sharedLink = sharedFac ? `<a href="${root}${P(`faculty/${sharedFac.key}/`)}">${esc(facultyName(t, sharedFac))}</a>` : '';
      // Môn chung toàn trường có trong chương trình của khoa: tách khỏi bảng môn của khoa.
      const sharedUsed = sharedFac
        ? [...new Set(progs.flatMap((p) => p.blocks.flatMap((b) => b.courses)))]
            .map((id) => allCourses.get(id))
            .filter((c) => c && c.faculty === shared)
            .sort((a, b) => a.id.localeCompare(b.id))
        : [];
      const emptyFac = !progs.length && !f.courses.length && !ms.length && !pgBlock;
      // Môn chung toàn trường và nhóm Chưa xác định không quản lý chương trình nào: không có phần chương trình.
      const ownsPrograms = f.key !== shared && f.key !== 'unknown';
      const addBtn = (cls) => `<p class="actions"><a class="${cls}" href="${esc(addProgramUrl(f))}" rel="noopener">${esc(t.addProgram)}</a></p>`;
      let programBlock = '';
      if (looseCount) {
        // Chỉ có chương trình chưa có danh sách môn: dòng gập đã ghi số, không ghi lại.
        programBlock = `<h2>${esc(ms.length ? t.otherPrograms : t.facultyPrograms)}</h2>
${loose.filled.length ? `<p class="muted">${esc(t.programsCount(looseCount))}</p>` : ''}
${loose.filled.length ? programsByYear(t, loose.filled, hrefOf, root) : ''}${loose.empty.length ? `<details class="prog-empty"><summary>${esc(t.emptyPrograms(loose.empty.length))}</summary>${programsByYear(t, loose.empty, hrefOf, root)}</details>` : ''}
${addBtn('btn')}`;
      } else if (ms.length) programBlock = addBtn('btn');
      else if (ownsPrograms && !emptyFac) programBlock = `<h2>${esc(t.facultyPrograms)}</h2>\n<div class="note" role="note"><p>${esc(t.facultyNoPrograms)}</p></div>\n${addBtn('btn primary')}`;
      const body = `
<h1>${esc(facultyName(t, f))}</h1>
${f.key === 'unknown' ? `<div class="note" role="note"><p>${esc(t.facultyUnknownNote)}</p></div>` : ''}
${shared && f.key === shared ? `<div class="note" role="note"><p>${esc(t.facultySharedNote)}</p></div>` : ''}
${emptyFac ? `<div class="note" role="note"><p>${esc(t.facultyEmpty)}${sharedLink ? ` ${esc(t.facultyEmptyShared)} ${sharedLink}.` : ''}</p></div>${ownsPrograms ? addBtn('btn primary') : ''}` : ''}
${ms.length ? `<h2>${esc(t.facultyMajors)}</h2>\n<p class="muted">${esc(t.majorsCount(ms.length))}</p>\n${majorList(t, ms, progsOfMajor, root, P, typeOrder)}` : ''}
${programBlock}
${ugCourses.length ? `<h2>${esc(shared && f.key === shared ? t.sharedCourses : t.facultyCourses)}</h2>\n<p class="muted">${esc(t.coursesCount(ugCourses.length))}</p>\n${courseTable(t, ugCourses, root, t.facultyCourses)}` : ''}
${sharedUsed.length ? `<h2>${esc(t.facultySharedCourses)}</h2>\n<p class="muted">${esc(t.coursesCount(sharedUsed.length))}. ${esc(t.facultySharedCoursesNote)} ${sharedLink}.</p>\n${courseTable(t, sharedUsed, root, t.facultySharedCourses)}` : ''}
${pgBlock}`;
      write(
        here,
        finish(
          layout({
            t,
            path: here,
            title: facultyName(t, f),
            description: t.facultyDescription(facultyName(t, f), f.courses.length, progs.length + pgProgs.length),
            body,
            crumbs: [['', t.nav.home], ['', facultyName(t, f)]],
            alt: `faculty/${f.key}/index.html`,
          }),
          t,
        ),
      );
      listPage(here, latest([...f.courses.map((c) => c.updated), ...progs.map((p) => p.updated), ...pgProgs.map((p) => p.updated)]));
    }

    // Trang chương trình
    for (const p of index.programs) {
      const here = P(`program/${p.code}/index.html`);
      const root = relPrefix(here);
      const fac = facByKey.get(p.faculty);
      const blockList = blocksHtml(t, p, allCourses, root);
      // Khối đã là từng học kỳ (chỉ có kế hoạch giảng dạy) thì tiêu đề là lộ trình, không thêm phần lộ trình riêng.
      const semBlocks = blocksAreSemesters(p);
      const blocks = blockList ? `<h2 id="h-blocks">${esc(semBlocks ? t.roadmapTitle : t.blocksTitle)}</h2>${blockList}` : '';
      const road = hasSemesters(p) && !semBlocks ? `<section aria-labelledby="h-road"><h2 id="h-road">${esc(t.roadmapTitle)}</h2>${roadmapHtml(t, p, allCourses, root)}</section>` : '';
      const pMajor = p.major ? majorByCode.get(p.major) : null;
      const siblings = pMajor && isListed(p) ? progsOfMajor(pMajor.code) : [];
      const pick = siblings.length > 1 ? majorPickers(t, siblings, p, (x) => `${root}${P(`program/${x.code}/`)}`, typeOrder, 'page') : '';
      const pname = isPostgrad(p) && LEVELS[p.level] ? t.levelName(LEVELS[p.level][lang], programName(t, p)) : programName(t, p);
      // Link chính thức: PDF CTĐT và kế hoạch giảng dạy của trường nếu có; không có thì link nguồn
      // (nếu có) và bảng CTĐT của trường. Chưa có danh sách môn: ghi chú, nút gửi CTĐT đứng đầu hàng.
      const official = officialProgramLinks(t, p, siteCfg);
      const hosted = official.pdf ? `<p class="muted small">${esc(t.programPdfHosted)}</p>` : '';
      if (p.handbookUrl) official.buttons.push(`<a class="btn subtle" href="${esc(p.handbookUrl)}" rel="noopener">${esc(t.handbookMajor)}</a>`);
      const actions = blocks
        ? official.buttons.length
          ? `<p class="actions">${official.buttons.join('')}</p>${hosted}`
          : ''
        : isPostgrad(p) && official.pdf
          ? // Sau đại học, CTĐT không ghi mã môn: nút chính là PDF của trường.
            `<div class="note" role="note"><p>${esc(t.programNoCodes)}</p></div><p class="actions">${official.buttons.map((b, i) => (i ? b : b.replace('class="btn"', 'class="btn primary"'))).join('')}<a class="btn subtle" href="${esc(addProgramUrl(fac, p))}" rel="noopener">${esc(t.addProgram)}</a></p>${hosted}`
          : `<div class="note" role="note"><p>${esc(t.programNoCourses)}</p></div><p class="actions"><a class="btn primary" href="${esc(addProgramUrl(fac, p))}" rel="noopener">${esc(t.addProgram)}</a>${official.buttons.join('')}</p>${hosted}`;
      // Bản nháp nguồn: ghi rõ, trỏ về bản chính cùng ngành, cùng khóa nếu có.
      const mains = isListed(p) ? [] : listedPrograms.filter((x) => x.faculty === p.faculty && x.year === p.year && x.name === p.name);
      const draft = isListed(p)
        ? ''
        : `<div class="note" role="note"><p>${esc(t.programDraft)}${mains.length ? ` ${esc(t.programDraftSee)}: ${mains.map((x) => `<a href="${root}${P(`program/${x.code}/`)}">${esc(x.year ? `${programName(t, x)} (${x.year})` : programName(t, x))}</a>`).join(', ')}.` : ''}</p></div>`;
      const n = programCourseCount(p);
      const meta = [
        esc(t.programCode(p.code)),
        fac ? `<a href="${root}${P(`faculty/${fac.key}/`)}">${esc(facultyName(t, fac))}</a>` : null,
        pMajor ? `${esc(t.majorLink)} <a href="${root}${P(`major/${majorKey(pMajor.code)}/`)}">${esc(majorTitle(t, pMajor))}</a>` : null,
        programTypeTag(t, p, root) || null,
        p.level && p.level !== DEFAULT_LEVEL && LEVELS[p.level] ? esc(LEVELS[p.level][lang]) : null,
        p.degree && DEGREES[p.degree] && p.degree !== p.level ? esc(DEGREES[p.degree][lang]) : null,
        p.totalCredits ? esc(t.totalCredits(p.totalCredits)) : null,
        esc(n ? t.coursesCount(n) : noCoursesShort(t, p)),
      ]
        .filter(Boolean)
        .join(', ');
      const notes = [p.note ? `<p class="small" lang="vi">${esc(p.note)}</p>` : '', p.reviewNote ? `<p class="small" lang="vi">${esc(p.reviewNote)}</p>` : ''].join('');
      const body = `<h1>${esc(pname)}${p.year ? ` (${esc(p.year)})` : ''}</h1><p class="muted">${meta}</p>${draft}${notes}${actions}${pick}${road}${blocks}`;
      write(
        here,
        finish(
          layout({
            t,
            path: here,
            title: p.year ? `${pname} (${p.year})` : pname,
            description: t.programDescription(p.year ? `${pname} (${p.year})` : pname, n),
            body,
            crumbs: [
              ['', t.nav.home],
              ...(fac ? [[`faculty/${fac.key}/`, facultyName(t, fac)]] : []),
              ...(pMajor ? [[`major/${majorKey(pMajor.code)}/`, majorTitle(t, pMajor)]] : []),
              ['', p.year && pMajor ? cohortLabel(t, p) : pname],
            ],
            alt: `program/${p.code}/index.html`,
            noindex: !isListed(p),
          }),
          t,
        ),
      );
      if (isListed(p)) listPage(here, p.updated);
    }

    // Trang ngành: bộ chọn loại và khóa, lộ trình theo học kỳ của chương trình chính (khóa mới nhất có danh
    // sách môn, loại xếp đầu theo programTypeOrder), nút tới PDF CTĐT, kế hoạch giảng dạy và Sổ tay.
    for (const m of majors) {
      const key = majorKey(m.code);
      const here = P(`major/${key}/index.html`);
      const root = relPrefix(here);
      const list = progsOfMajor(m.code);
      const main = mainProgram(list, typeOrder);
      const fac = facByKey.get(m.faculty);
      const name = majorTitle(t, m);
      const pg = isPostgrad(m);
      const progHref = (x) => `${root}${P(`program/${x.code}/`)}`;
      const types = [...new Set(list.map((p) => p.type).filter(Boolean))].sort((a, b) => typeRank(typeOrder, a) - typeRank(typeOrder, b));
      const meta = [
        esc(t.majorCode(m.code)),
        fac ? `<a href="${root}${P(`faculty/${fac.key}/`)}">${esc(facultyName(t, fac))}</a>` : null,
        m.level && m.level !== DEFAULT_LEVEL && LEVELS[m.level] ? esc(LEVELS[m.level][lang]) : null,
        list.length ? esc(t.programsCount(list.length)) : null,
      ]
        .filter(Boolean)
        .join(', ');
      const tags = types.map((x) => typeTagLink(t, root, x, typeLabel(t, x, true))).join('');
      const buttons = [];
      let hosted = '';
      if (main) {
        const official = officialProgramLinks(t, main, siteCfg);
        if (official.pdf) {
          buttons.push(...official.buttons);
          hosted = `<p class="muted small">${esc(t.programPdfHosted)}</p>`;
        }
      }
      if (m.handbookUrl) buttons.push(`<a class="btn subtle" href="${esc(m.handbookUrl)}" rel="noopener">${esc(t.handbookMajor)}</a>`);
      const n = main ? programCourseCount(main) : 0;
      let road;
      // Tiêu đề phần dưới bộ chọn: lộ trình theo học kỳ khi có học kỳ đề xuất; sau đại học chưa có học kỳ
      // thì hiện khối kiến thức của chương trình chính.
      let roadTitle = t.roadmapTitle;
      if (main && n && hasSemesters(main)) {
        road = `<p class="muted">${esc(t.roadmapOf(cohortLabel(t, main)))}</p>${roadmapHtml(t, main, allCourses, root)}<p class="actions"><a class="btn" href="${progHref(main)}">${esc(t.roadmapOpen)}</a></p>`;
      } else if (main && n && pg) {
        roadTitle = t.blocksTitle;
        road = `<p class="muted">${esc(t.blocksOf(cohortLabel(t, main)))}</p>${blocksHtml(t, main, allCourses, root)}<p class="actions"><a class="btn" href="${progHref(main)}">${esc(t.roadmapOpen)}</a></p>`;
      } else if (main && n) {
        road = `<p class="muted">${esc(t.roadmapNone)}</p><p class="actions"><a class="btn" href="${progHref(main)}">${esc(t.roadmapOpen)}</a></p>`;
      } else if (pg) {
        // Sau đại học chỉ có CTĐT không ghi mã môn: link PDF nằm ở hàng nút phía trên.
        roadTitle = t.blocksTitle;
        road = `<div class="note" role="note"><p>${esc(t.programNoCodes)}</p></div>`;
      } else {
        road = `<div class="note" role="note"><p>${esc(t.programNoCourses)}</p></div><p class="actions"><a class="btn primary" href="${esc(addProgramUrl(fac, { name: m.name }))}" rel="noopener">${esc(t.addProgram)}</a></p>`;
      }
      const body = `<h1>${esc(name)}</h1><p class="muted">${meta}</p>${tags ? `<p class="tags">${tags}</p>` : ''}${buttons.length ? `<p class="actions">${buttons.join('')}</p>${hosted}` : ''}
${main ? `<section aria-labelledby="h-progs"><h2 id="h-progs">${esc(t.programsOfMajor)}</h2>${majorPickers(t, list, main, progHref, typeOrder, 'true')}</section>` : ''}
<section aria-labelledby="h-road"><h2 id="h-road">${esc(roadTitle)}</h2>${road}</section>`;
      write(
        here,
        finish(
          layout({
            t,
            path: here,
            title: name,
            description: pg ? t.majorDescriptionPg(name) : t.majorDescription(name),
            body,
            crumbs: [['', t.nav.home], ...(fac ? [[`faculty/${fac.key}/`, facultyName(t, fac)]] : []), ['', name]],
            alt: `major/${key}/index.html`,
          }),
          t,
        ),
      );
      listPage(here, latest(list.map((p) => p.updated)));
    }

    // Tài liệu của một trang môn: nhóm theo loại, trong nhóm tài liệu mới trước, tài liệu đã gỡ cuối.
    const itemGroups = (items, root) =>
      TYPE_ORDER.map((type) => {
        const list = items
          .filter((i) => i.type === type)
          .sort((a, b) => Number(!!a.removed) - Number(!!b.removed) || (b.updated || b.added || '').localeCompare(a.updated || a.added || '') || a.title.localeCompare(b.title, 'vi'));
        if (!list.length) return '';
        const n = siteCfg.itemsPerGroup;
        const shown = list.slice(0, n).map((i) => renderItem(t, i, siteCfg, root)).join('');
        const rest = list.slice(n);
        const more = rest.length
          ? `<details class="more-items"><summary>${esc(t.moreItems(rest.length))}</summary><ul class="items">${rest.map((i) => renderItem(t, i, siteCfg, root)).join('')}</ul></details>`
          : '';
        return `<section class="group" id="loai-${type}"><h3>${esc(TYPES[type][lang])} <span class="muted small">(${list.length})</span></h3><ul class="items">${shown}</ul>${more}</section>`;
      }).join('');
    // Phần tài liệu và nút đóng góp. Chưa có tài liệu: một câu và một nút chính mở form gửi với môn chọn sẵn.
    // course: mã điền sẵn cho form (môn nhiều mã thì là mã thuộc nhiều chương trình nhất).
    const materials = (items, root, course, extra = []) => {
      const send = `<a class="btn primary" href="${root}gui-tai-lieu/?course=${encodeURIComponent(course)}">${esc(t.addDocHere)}</a>`;
      if (!items.length) return `<h2>${esc(t.materials)}</h2>\n<div class="note" role="note"><p>${esc(t.noItems)}</p></div>\n<p class="actions">${send}</p>`;
      const link = `<a class="btn" href="${esc(issueUrl('them-link.yml', { course }))}" rel="noopener">${esc(t.addLink)}</a>`;
      return `<h2>${esc(t.materials)}</h2>\n${itemGroups(items, root)}
<section class="panel contribute" aria-labelledby="h-contrib">
  <h2 id="h-contrib">${esc(t.contributeHere)}</h2>
  <p class="actions">${[send, link, ...extra].join('')}</p>
</section>`;
    };

    // Trang môn theo tên: mọi tài liệu của mọi mã cùng tên trên một trang.
    for (const s of subjects.values()) {
      const here = P(`mon/${s.slug}/index.html`);
      const root = relPrefix(here);
      const list = s.ids.map((id) => allCourses.get(id));
      const name = (lang === 'en' && s.nameEn) || s.name;
      const items = list.flatMap((c) => c.items);
      // Mỗi mã một nhãn: mã và chương trình ("MT1019 Tiên tiến"). Mã trùng (ID kèm năm) chỉ ghi một lần.
      const byCode = new Map();
      for (const c of list.slice().sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id))) if (!byCode.has(c.code)) byCode.set(c.code, c);
      const chip = (c) => `<span class="code-chip"><span class="code">${esc(c.code)}</span>${PAGE.label(t, c.id) ? ` ${esc(PAGE.label(t, c.id))}` : ''}</span>`;
      // Lọc tài liệu theo mã và theo loại: chỉ khi có từ 2 lựa chọn. assets/subject-filter.js, ghi lên ?ma=, ?loai=.
      const live = items.filter((i) => !i.removed);
      const docCourses = list.filter((c) => live.some((i) => i.course === c.id));
      const docTypes = TYPE_ORDER.filter((x) => live.some((i) => i.type === x));
      const sel = (id, label, all, opts) => `<div class="filter"><label for="${id}">${esc(label)}</label><select id="${id}"><option value="">${esc(all)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>`;
      const filters =
        docCourses.length > 1 || docTypes.length > 1
          ? `<div class="doc-filters" id="doc-filters" hidden>${docCourses.length > 1 ? sel('f-course', t.codesLabel, t.allCodes, docCourses.map((c) => [c.id, [c.code, PAGE.label(t, c.id)].filter(Boolean).join(', ')])) : ''}${docTypes.length > 1 ? sel('f-type', t.docType, t.docTypeAll, docTypes.map((x) => [x, TYPES[x][lang]])) : ''}<p id="f-status" class="muted small" aria-live="polite"></p></div>`
          : '';
      const body = `
<h1>${esc(name)}</h1>
<p class="codes"><span class="sr">${esc(t.codesLabel)}: </span>${[...byCode.values()].map(chip).join(' ')}</p>
${filters}
${materials(items, root, s.main)}${filters ? `\n<script type="application/json" id="filter-strings">${jsonInScript({ count: t.filterCount })}</script>\n<script src="${root}assets/subject-filter.js" defer></script>` : ''}`;
      const n = items.filter((i) => !i.removed).length;
      write(here, finish(layout({ t, path: here, title: name, description: t.subjectDescription(name, n), body, crumbs: [['', t.nav.home], ['', name]], alt: `mon/${s.slug}/index.html` }), t));
      listPage(here, latest(list.flatMap((c) => [c.updated, ...c.items.flatMap((i) => [i.added, i.updated])])));
    }

    // Trang môn của từng mã. Mã thuộc môn nhiều mã: trang chuyển hướng tới trang môn theo tên (link cũ, v1 url).
    for (const c of allCourses.values()) {
      const here = P(`course/${c.id}/index.html`);
      const root = relPrefix(here);
      const name = PAGE.name(t, c);
      if (subjectOf.has(c.id)) {
        const to = P(PAGE.path(c.id));
        redirectPage(write, here, root + to, absUrl(to), lang, t, name, `${c.code} ${name}`);
        continue;
      }
      const fac = facByKey.get(c.faculty);
      const cLink = (id) => {
        const x = allCourses.get(id);
        return `<a href="${root}${P(PAGE.path(id))}">${esc(x ? `${x.code} ${PAGE.name(t, x)}` : id)}</a>`;
      };
      // Vài thông tin có ích khi chọn môn; chương trình có môn này gập trong một dòng.
      const rows = [];
      if (c.credits != null) rows.push([t.credits, String(c.credits)]);
      if (fac) rows.push([t.faculty, `<a href="${root}${P(`faculty/${fac.key}/`)}">${esc(facultyName(t, fac))}</a>`]);
      // Bậc chỉ ghi khi môn có ở sau đại học (môn chỉ có ở đại học thì không cần dòng này).
      if (courseLevels(c).some((l) => l !== DEFAULT_LEVEL)) rows.push([t.levelLabel, esc(courseLevels(c).map((l) => LEVELS[l][lang]).join(', '))]);
      const oldCodes = [...new Set(c.aliases.map((a) => a.code))].filter((x) => x !== c.code);
      if (oldCodes.length) rows.push([t.oldCodes, esc(oldCodes.join(', '))]);
      if (c.handbookUrl) rows.push([t.handbook, `<a href="${esc(c.handbookUrl)}" rel="noopener">${esc(t.handbookCourse)}</a>`]);
      const retired =
        c.status === 'retired'
          ? `<div class="note warn" role="note"><p>${esc(t.retiredNotice)}${c.replacedBy ? ` ${esc(t.retiredSee)}: ${cLink(c.replacedBy)}.` : ''}</p></div>`
          : '';
      // Chương trình có môn này: gập trong một dòng, mở ra là từng ngành (các khóa, link tới khối có môn).
      let progsHtml = '';
      if (c.programs.length) {
        const byMajor = new Map();
        const loose = [];
        for (const pg of c.programs) {
          const pr = progByCode.get(pg.program);
          if (pr && pr.major && majorByCode.has(pr.major) && isListed(pr)) {
            if (!byMajor.has(pr.major)) byMajor.set(pr.major, new Map());
            const seen = byMajor.get(pr.major);
            if (!seen.has(pr.code)) seen.set(pr.code, { pr, pg });
          } else loose.push(pg);
        }
        const majorLines = [...byMajor]
          .map(([code, seen]) => [majorByCode.get(code), [...seen.values()]])
          .sort((a, b) => Number(isPostgrad(a[0])) - Number(isPostgrad(b[0])) || majorTitle(t, a[0]).localeCompare(majorTitle(t, b[0]), lang))
          .map(([m, list]) => {
            const links = list
              .sort((a, b) => (b.pr.year || '').localeCompare(a.pr.year || '') || typeRank(typeOrder, a.pr.type) - typeRank(typeOrder, b.pr.type) || a.pr.code.localeCompare(b.pr.code))
              .map(({ pr, pg }) => {
                const label = [pr.year, pr.type && pr.type !== 'CQ' ? typeLabel(t, pr.type) : null, pr.track].filter(Boolean).join(' ');
                return `<a href="${root}${P(`program/${pr.code}/`)}#${blockAnchor(pg.block)}">${esc(label || pr.code)}</a>`;
              });
            return `<a href="${root}${P(`major/${majorKey(m.code)}/`)}">${esc(majorTitle(t, m))}</a>: ${links.join(', ')}`;
          });
        const looseLines = loose.map((pg) => {
          const pr = progByCode.get(pg.program);
          const b = pr && pr.blocks.find((x) => x.id === pg.block);
          const label = pr ? (pr.year ? `${programName(t, pr)} (${pr.year})` : programName(t, pr)) : pg.program;
          const draft = pr && !isListed(pr) ? ` <span class="tag">${esc(t.programDraftTag)}</span>` : '';
          const href = `${root}${P(`program/${pg.program}/`)}`;
          const where = `${b ? `${b.name}, ` : ''}${b && b.requiredUnknown ? '' : pg.required ? t.required : t.elective}`.replace(/, $/, '');
          return `<a href="${href}">${esc(label)}</a>${draft}, ${b ? `<a href="${href}#${blockAnchor(b.id)}">${esc(where)}</a>` : esc(where)}`;
        });
        const n = new Set(c.programs.map((x) => x.program)).size;
        progsHtml = `<details class="course-progs"><summary>${esc(t.programsOfCourse(n))}</summary><ul>${[...majorLines, ...looseLines].map((l) => `<li>${l}</li>`).join('')}</ul></details>`;
      }
      const fix = `<a class="btn subtle" href="${esc(issueUrl('sua-danh-muc.yml', { course: c.id }))}" rel="noopener">${esc(t.fixCatalog)}</a>`;
      const body = `
<h1><span class="code">${esc(c.code)}</span> ${esc(name)}</h1>
${retired}
${rows.length ? `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
${progsHtml}
${materials(c.items, root, c.id, [fix])}`;
      const crumbs = [['', t.nav.home], ...(fac ? [[`faculty/${fac.key}/`, facultyName(t, fac)]] : []), ['', c.code]];
      write(here, finish(layout({ t, path: here, title: `${c.code} ${name}`, description: t.courseDescription(c.code, name, itemsCountOf(c)), body, crumbs, alt: `course/${c.id}/index.html` }), t));
      listPage(here, latest([c.updated, ...c.items.flatMap((i) => [i.added, i.updated])]));
    }

    // Mã hiện tại và mã cũ chuyển hướng tới trang của môn (nếu không trùng ID của môn khác).
    for (const c of allCourses.values()) {
      for (const code of new Set([c.code, ...c.aliases.map((a) => a.code)])) {
        if (code === c.id || allCourses.has(code)) continue;
        const here = P(`course/${code}/index.html`);
        const to = P(PAGE.path(c.id));
        redirectPage(write, here, relPrefix(here) + to, absUrl(to), lang, t, `${c.code} ${PAGE.name(t, c)}`, c.code);
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
