// Trang chủ: giới thiệu, ô tìm (môn, chương trình, tài liệu), tài liệu mới, khoa, chương trình đào tạo.
import { TYPES, LEVELS, DEFAULT_LEVEL, POSTGRAD_LEVELS, courseLevels } from '../../lib/labels.mjs';
import { S } from '../../lib/strings.mjs';
import { esc, jsonInScript, btn, relPrefix } from '../html.mjs';
import { layout } from '../layout.mjs';
import { recentItems, recentSection } from '../items.mjs';
import { itemsCountOf, facultyName } from '../courses.mjs';
import { addProgramUrl, typeNotes, programLi, majorList } from '../programs.mjs';

export function writeHomePage(ctx, { lang, t, P }) {
  const { siteCfg, repo, index, write, listPage, allCourses, totalItems, typeOrder, progsOfMajor, ugPrograms, pgPrograms, majorsOfFaculty, pgMajorCount, ugMajorCount, loosePrograms, faculties, docs, docValues } = ctx;

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
  <p id="q-prog-type" class="note" role="note" hidden></p>
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
<script type="application/json" id="search-strings">${jsonInScript({ results: [t.results(0), t.results(1), t.results(2)], teacher: t.teacher, lang, groupMin: siteCfg.sameNameGroupMin, chipsMax: siteCfg.sameNameChipsMax, docs: docStrings, levels: Object.fromEntries(POSTGRAD_LEVELS.map((l) => [l, [LEVELS[l][lang], LEVELS[l][t.other]]])), types: typeNotes(lang), typeNote: t.typeNote })}</script>
<script src="${root}assets/search-core.js" defer></script>
<script src="${root}assets/subject-core.js" defer></script>
<script src="${root}assets/search-docs.js" defer></script>
<script src="${root}assets/search.js" defer></script>`;
    write(here, layout({ t, path: here, title: '', body, alt: 'index.html' }));
    listPage(here, index.generated);
  }
}
