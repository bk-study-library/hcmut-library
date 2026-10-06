// Trang chua-phan-loai/: tài liệu đăng tự động nhưng chưa chắc (trường unclassified, scripts/upload/triage.mjs), kèm lý
// do, link tới tài liệu và link sửa item trên GitHub để người duyệt xử lý. Không vào sitemap (noindex).
import { REPO_URL } from '../../lib/labels.mjs';
import { state } from '../state.mjs';
import { esc, relPrefix } from '../html.mjs';
import { layout } from '../layout.mjs';

export function writeUnclassifiedPage(ctx, { t, P }) {
  const { repo, allCourses, write } = ctx;
  const here = P('chua-phan-loai/index.html');
  const root = relPrefix(here);
  const list = repo.items.filter((it) => it.unclassified && !it.removed).sort((a, b) => (b.added || '').localeCompare(a.added || ''));
  const rows = list.map((it) => {
    const c = allCourses.get(it.course);
    const href = `${root}${P(state.page.path(it.course))}#${encodeURIComponent(state.page.anchor(it))}`;
    const edit = `${REPO_URL}/edit/main/courses/${encodeURIComponent(it.course)}/items/${encodeURIComponent(it.id)}.json`;
    const reasons = it.unclassified.map((r) => t.unclassifiedReasons[r] || r).join(', ');
    return `<li><a href="${href}">${esc(it.title)}</a> <span class="muted small">${esc(c ? c.code : it.course)}, ${esc(it.added || '')}</span><br><span class="small">${esc(reasons)}</span> <a class="small" href="${esc(edit)}" rel="noopener">${esc(t.unclassifiedEdit)}</a></li>`;
  });
  const body = `<h1>${esc(t.unclassifiedTitle)}</h1>\n<p>${esc(t.unclassifiedIntro)}</p>\n${rows.length ? `<ul class="results">${rows.join('')}</ul>` : `<div class="note" role="note"><p>${esc(t.unclassifiedEmpty)}</p></div>`}`;
  write(here, layout({ t, path: here, title: t.unclassifiedTitle, body, crumbs: [['', t.nav.home], ['', t.unclassifiedTitle]], alt: 'chua-phan-loai/index.html', noindex: true }));
}
