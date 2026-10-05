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
import { TYPE_CODES } from './lib/program-types.mjs';
import { TYPES, TYPE_ORDER, REPO_URL, SITE_URL, issueUrl, DEGREES, LEVELS, DEFAULT_LEVEL, POSTGRAD_LEVELS, majorKey, isPostgrad, isPostgradCourse, courseLevels } from './lib/labels.mjs';
import { S } from './lib/strings.mjs';
import { buildV1, serializeV1 } from './lib/v1.mjs';
import { loadPolicy } from './lib/policy.mjs';
import { subjectIndex } from './lib/subject.mjs';
import { programLabel, courseTypes } from './lib/program-label.mjs';
import { SRC, state } from './site/state.mjs';
import { esc, jsonInScript, btn, absUrl, pagePath, relPrefix } from './site/html.mjs';
import { uploadPage } from './site/upload-page.mjs';
import { pngSize, sitemapXml, redirectPage, layout } from './site/layout.mjs';
import { docIndex, searchCourses, docFilterValues, isListed } from './site/data.mjs';
import { renderItem, recentItems, recentSection } from './site/items.mjs';
import { itemsCountOf, courseTable, facultyName } from './site/courses.mjs';
import { blockAnchor, programCourseCount, programName, addProgramUrl, typeNotes, typeTagLink, programTypeTag, noCoursesShort, majorTitle, programLi, byYearDesc, programsByYear, officialProgramLinks, typeLabel, typeRank, cohortLabel, hasSemesters, blocksAreSemesters, mainProgram, majorPickers, roadmapHtml, blocksHtml, majorList } from './site/programs.mjs';

// Cấu hình của repo cần dựng: dùng file trong root nếu có, không thì dùng của công cụ (repo mẫu trong test không có).
export function readSiteConfig(root) {
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
    programTypeOrder: Array.isArray(cfg.programTypeOrder) ? cfg.programTypeOrder.map(String) : TYPE_CODES,
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
    state.social = size ? { path: siteCfg.socialImage, ...size } : null;
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
  state.page = {
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
  state.page.label = (t, id) => progLabel[t.lang].get(id) || '';
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
      const vi = state.page.name(S.vi, c);
      const en = state.page.name(S.en, c);
      return { path: state.page.path(id), name: vi, nameEn: en !== vi ? en : '', anchor: state.page.anchor };
    },
  });
  write('assets/items.json', JSON.stringify(docs) + '\n');
  const docValues = docFilterValues(docs);
  state.generated = index.generated;
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
      const tags = types.map((x) => typeTagLink(t, root, x, typeLabel(t, x, m.level), m.level)).join('');
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
      write(here, finish(layout({ t, path: here, title: name, description: t.subjectDescription(name, n), body, crumbs: [['', t.nav.home], ['', name]], alt: `mon/${s.slug}/index.html` }), t));
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
      write(here, finish(layout({ t, path: here, title: `${c.code} ${name}`, description: t.courseDescription(c.code, name, itemsCountOf(c)), body, crumbs, alt: `course/${c.id}/index.html` }), t));
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
