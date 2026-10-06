// Tài liệu: thẻ tài liệu (thông tin, file, xem trước, yêu cầu gỡ), định dạng, tài liệu mới, link tìm sách.
import { TYPES, REPO, SITE_URL, issueUrl, formatSize, formatBook, fileFormat, DOC_LANGS } from '../lib/labels.mjs';
import { previewTarget } from '../lib/preview.mjs';
import { state } from './state.mjs';
import { esc, btn, formatDate, pagePath } from './html.mjs';

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

// Link xem trước qua Worker, chỉ cho file nằm trong danh sách được phép (scripts/lib/preview.mjs).
export function previewHref(url, site) {
  if (!site.reviewBase || !url || !previewTarget(url, { repo: REPO, site: SITE_URL })) return null;
  return `${site.reviewBase}/xem-truoc?u=${encodeURIComponent(url)}`;
}

// Form Yêu cầu gỡ điền sẵn link tới đúng mục trên trang môn (ô "item") và id mục trong tiêu đề.
export function takedownUrl(t, it) {
  const page = `${SITE_URL}${pagePath(t.lang, state.page.path(it.course))}#${state.page.anchor(it)}`;
  return issueUrl('yeu-cau-go.yml', { title: `[Gỡ] ${it.course} ${it.id}`, item: page });
}

// Một file của tài liệu: link tải, link xem trước (nếu được), định dạng và cỡ.
export function fileLinks(it, f, site, root) {
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
export function renderItem(t, it, site, root) {
  const L = t.item;
  const files = it.removed || it.type === 'link' || it.type === 'book-ref' ? [] : it.files || [];
  const many = files.length > 1;
  const links = files.map((f) => ({ f, ...fileLinks(it, f, site, root) }));
  const facts = [];
  const add = (label, value, html = false) => {
    if (value) facts.push([label, html ? value : esc(value)]);
  };
  // Mã môn tài liệu được gửi cho, kèm nhãn chương trình của mã đó.
  const codeOf = state.page.code ? state.page.code(it.course) : it.course;
  const plabel = state.page.label(t, it.course);
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
  const codeTag = state.page.subject(it.course) ? `<span class="tag">${esc([codeOf, plabel].filter(Boolean).join(', '))}</span>` : '';
  const badges = [codeTag, it.example ? `<span class="tag accent">${esc(t.example)}</span>` : '', it.removed ? `<span class="tag warn">${esc(t.removed)}</span>` : '', it.unclassified && !it.removed ? `<span class="tag warn" title="${esc(t.unclassifiedHint)}">${esc(t.unclassifiedTag)}</span>` : ''].join('');
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
  return `<li class="item${it.removed ? ' is-removed' : ''}" id="${esc(state.page.anchor(it))}" data-course="${esc(it.course)}" data-type="${esc(it.type)}"><h4>${esc(it.title)}${badges ? ` ${badges}` : ''}</h4>${it.description ? `<p>${esc(it.description)}</p>` : ''}${details}${note}${extra}${actions}</li>`;
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
export function recentSection(t, rows, courses, root, P) {
  if (!rows.length) return '';
  const li = rows
    .map(({ it, date }) => {
      const c = courses.get(it.course);
      const cname = c ? state.page.name(t, c) : '';
      const size = (it.files || []).reduce((n, f) => n + (f.size || 0), 0);
      const kind = it.type === 'link' || it.type === 'book-ref' ? '' : [itemFormat(t, it), size ? formatSize(size) : ''].filter(Boolean).join(', ');
      const href = `${root}${P(state.page.path(it.course))}#${encodeURIComponent(state.page.anchor(it))}`;
      const meta = [TYPES[it.type] ? TYPES[it.type][t.lang] : it.type, kind].filter(Boolean).join(', ');
      return `<li><a href="${href}"><span class="recent-title">${esc(it.title)}</span><span class="recent-course"><span class="code">${esc(c ? c.code : it.course)}</span> ${esc(cname)}</span><span class="muted recent-meta">${esc(meta)}</span><time class="muted recent-date" datetime="${esc(date)}">${esc(formatDate(t, date))}</time></a></li>`;
    })
    .join('');
  return `<section class="recent" aria-labelledby="h-recent"><h2 id="h-recent">${esc(t.recentTitle)}</h2><ul class="recent-list">${li}</ul></section>`;
}
