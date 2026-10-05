// Khung trang: head (canonical, hreflang, Open Graph), CSP, trang chuyển hướng, sitemap.
import { REPO_URL, SITE_URL } from '../lib/labels.mjs';
import { state } from './state.mjs';
import { esc, absUrl, pagePath, relPrefix } from './html.mjs';

// Cỡ ảnh PNG đọc từ khối IHDR, để ghi og:image:width, og:image:height. Không phải PNG thì null.
export function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG' || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// sitemap.xml: địa chỉ tuyệt đối, xếp theo chữ; lastmod là ngày dữ liệu của trang nếu có.
export function sitemapXml(pages) {
  const rows = pages
    .slice()
    .sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0))
    .map((p) => `  <url><loc>${esc(p.loc)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

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

export const cspMeta = (opts) => `<meta http-equiv="Content-Security-Policy" content="${esc(cspFor(opts))}">`;

// Trang chuyển hướng ngắn (mã môn cũ, mã thuộc môn nhiều mã, khóa khoa cũ): chuyển ngay, có link cho trình
// duyệt tắt chuyển hướng. assets/redirect.js chuyển sớm hơn và giữ phần #id của link cũ (thẻ meta bỏ phần này).
export function redirectPage(write, here, target, canonical, lang, t, label, title = label) {
  write(
    here,
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">${cspMeta()}<meta http-equiv="refresh" content="0; url=${target}"><link rel="canonical" href="${esc(canonical)}"><title>${esc(title)}</title><script src="${relPrefix(here)}assets/redirect.js"></script></head><body><p>${esc(t.redirecting)} <a href="${target}">${esc(label)}</a>.</p></body></html>\n`,
  );
}

// Thẻ cho máy tìm kiếm và khi chia sẻ link: canonical, hreflang (khi trang có đủ hai bản vi và en),
// Open Graph, Twitter card. Mọi địa chỉ tuyệt đối theo SITE_URL. 404 không có canonical.
export function headMeta({ t, here, title, description, alt, pair, social, notFound }) {
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

export function layout({ t, path: here, title, description, body, crumbs = [], alt, base, upload = '', noindex = false, pair = true }) {
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
${headMeta({ t, here, title, description: desc, alt, pair, social: state.social, notFound })}
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
    <p class="muted">${esc(t.footerUpdated(state.generated || '-'))}</p>
  </div>
</footer>
</body>
</html>
`;
}
