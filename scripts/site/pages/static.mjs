// Trang tĩnh: đóng góp, duyệt bài, gỡ tài liệu (nội dung ở site-src/pages/).
import fs from 'node:fs';
import path from 'node:path';
import { REPO_URL, issueUrl } from '../../lib/labels.mjs';
import { SRC } from '../state.mjs';
import { esc, relPrefix } from '../html.mjs';
import { layout } from '../layout.mjs';

export function writeStaticPages(ctx, { lang, t, P }) {
  const { repo, index, write, listPage } = ctx;

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
    write(here, layout({ t, path: here, title: t.nav[titleKey], body, crumbs: [['', t.nav.home], ['', t.nav[titleKey]]], alt: `${slug}/index.html` }));
    listPage(here, '');
  }
}
