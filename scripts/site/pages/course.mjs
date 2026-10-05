// Trang môn: môn theo tên (mọi mã cùng tên trên một trang), trang của từng mã, chuyển hướng mã hiện tại và mã cũ.
// Tài liệu trên trang nhóm theo loại; khối đóng góp mở form gửi với môn chọn sẵn.
import { TYPES, TYPE_ORDER, issueUrl, LEVELS, DEFAULT_LEVEL, majorKey, isPostgrad, courseLevels } from '../../lib/labels.mjs';
import { state } from '../state.mjs';
import { esc, jsonInScript, btn, absUrl, relPrefix } from '../html.mjs';
import { redirectPage, layout } from '../layout.mjs';
import { isListed } from '../data.mjs';
import { renderItem } from '../items.mjs';
import { itemsCountOf, facultyName } from '../courses.mjs';
import { blockAnchor, programName, majorTitle, typeLabel, typeRank } from '../programs.mjs';

export function writeCoursePages(ctx, { lang, t, P }) {
  const { siteCfg, index, write, listPage, latest, allCourses, facByKey, progByCode, typeOrder, majorByCode, subjects, subjectOf } = ctx;

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
    const chip = (c) => `<span class="code-chip"><span class="code">${esc(c.code)}</span>${state.page.label(t, c.id) ? ` ${esc(state.page.label(t, c.id))}` : ''}</span>`;
    // Lọc tài liệu theo mã và theo loại: chỉ khi có từ 2 lựa chọn. assets/subject-filter.js, ghi lên ?ma=, ?loai=.
    const live = items.filter((i) => !i.removed);
    const docCourses = list.filter((c) => live.some((i) => i.course === c.id));
    const docTypes = TYPE_ORDER.filter((x) => live.some((i) => i.type === x));
    const sel = (id, label, all, opts) => `<div class="filter"><label for="${id}">${esc(label)}</label><select id="${id}"><option value="">${esc(all)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>`;
    const filters =
      docCourses.length > 1 || docTypes.length > 1
        ? `<div class="doc-filters" id="doc-filters" hidden>${docCourses.length > 1 ? sel('f-course', t.codesLabel, t.allCodes, docCourses.map((c) => [c.id, [c.code, state.page.label(t, c.id)].filter(Boolean).join(', ')])) : ''}${docTypes.length > 1 ? sel('f-type', t.docType, t.docTypeAll, docTypes.map((x) => [x, TYPES[x][lang]])) : ''}<p id="f-status" class="muted small" aria-live="polite"></p></div>`
        : '';
    const body = `
<h1>${esc(name)}</h1>
<p class="codes"><span class="sr">${esc(t.codesLabel)}: </span>${[...byCode.values()].map(chip).join(' ')}</p>
${filters}
${materials(items, root, s.main)}${filters ? `\n<script type="application/json" id="filter-strings">${jsonInScript({ count: t.filterCount })}</script>\n<script src="${root}assets/subject-filter.js" defer></script>` : ''}`;
    const n = items.filter((i) => !i.removed).length;
    write(here, layout({ t, path: here, title: name, description: t.subjectDescription(name, n), body, crumbs: [['', t.nav.home], ['', name]], alt: `mon/${s.slug}/index.html` }));
    listPage(here, latest(list.flatMap((c) => [c.updated, ...c.items.flatMap((i) => [i.added, i.updated])])));
  }

  // Trang môn của từng mã. Mã thuộc môn nhiều mã: trang chuyển hướng tới trang môn theo tên (link cũ, v1 url).
  for (const c of allCourses.values()) {
    const here = P(`course/${c.id}/index.html`);
    const root = relPrefix(here);
    const name = state.page.name(t, c);
    if (subjectOf.has(c.id)) {
      const to = P(state.page.path(c.id));
      redirectPage(write, here, root + to, absUrl(to), lang, t, name, `${c.code} ${name}`);
      continue;
    }
    const fac = facByKey.get(c.faculty);
    const cLink = (id) => {
      const x = allCourses.get(id);
      return `<a href="${root}${P(state.page.path(id))}">${esc(x ? `${x.code} ${state.page.name(t, x)}` : id)}</a>`;
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
              const label = [pr.year, pr.type && pr.type !== 'CQ' ? typeLabel(t, pr.type, pr.level) : null, pr.track].filter(Boolean).join(' ');
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
    write(here, layout({ t, path: here, title: `${c.code} ${name}`, description: t.courseDescription(c.code, name, itemsCountOf(c)), body, crumbs, alt: `course/${c.id}/index.html` }));
    listPage(here, latest([c.updated, ...c.items.flatMap((i) => [i.added, i.updated])]));
  }

  // Mã hiện tại và mã cũ chuyển hướng tới trang của môn (nếu không trùng ID của môn khác).
  for (const c of allCourses.values()) {
    for (const code of new Set([c.code, ...c.aliases.map((a) => a.code)])) {
      if (code === c.id || allCourses.has(code)) continue;
      const here = P(`course/${code}/index.html`);
      const to = P(state.page.path(c.id));
      redirectPage(write, here, relPrefix(here) + to, absUrl(to), lang, t, `${c.code} ${state.page.name(t, c)}`, c.code);
    }
  }
}
