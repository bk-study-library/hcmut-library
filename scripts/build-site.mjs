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
import { SITE_URL, DEFAULT_LEVEL, majorKey, isPostgrad } from './lib/labels.mjs';
import { S } from './lib/strings.mjs';
import { buildV1, serializeV1 } from './lib/v1.mjs';
import { loadPolicy } from './lib/policy.mjs';
import { subjectIndex } from './lib/subject.mjs';
import { programLabel, courseTypes } from './lib/program-label.mjs';
import { SRC, state } from './site/state.mjs';
import { esc, btn, absUrl, pagePath, relPrefix } from './site/html.mjs';
import { uploadPage } from './site/upload-page.mjs';
import { pngSize, sitemapXml, layout } from './site/layout.mjs';
import { docIndex, searchCourses, docFilterValues, isListed } from './site/data.mjs';
import { programCourseCount, byYearDesc, typeRank } from './site/programs.mjs';
import { writeHomePage } from './site/pages/home.mjs';
import { writeFacultyPages } from './site/pages/faculty.mjs';
import { writeProgramPages } from './site/pages/program.mjs';
import { writeMajorPages } from './site/pages/major.mjs';
import { writeCoursePages } from './site/pages/course.mjs';
import { writeStaticPages } from './site/pages/static.mjs';
import { writeUnclassifiedPage } from './site/pages/unclassified.mjs';

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

  // Dữ liệu chung cho các trang (scripts/site/pages/*.mjs).
  const ctx = { siteCfg, repo, index, write, listPage, latest, allCourses, facByKey, progByCode, listedPrograms, totalItems, typeOrder, majors, majorByCode, progsOfMajor, ugPrograms, pgPrograms, majorsOfFaculty, pgMajorCount, ugMajorCount, loosePrograms, shared, movedTo, faculties, subjects, subjectOf, docs, docValues };

  for (const lang of ['vi', 'en']) {
    const L = { lang, t: S[lang], P: (p) => pagePath(lang, p) };
    writeHomePage(ctx, L);
    writeFacultyPages(ctx, L);
    writeProgramPages(ctx, L);
    writeMajorPages(ctx, L);
    writeCoursePages(ctx, L);
    writeStaticPages(ctx, L);
    writeUnclassifiedPage(ctx, L);
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
    write('404.html', layout({ t, path: '404.html', title: t.notFoundTitle, body, base }));
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
