// Trang chương trình: thông tin, nút tới nguồn chính thức, lộ trình theo học kỳ, khối kiến thức.
import { DEGREES, LEVELS, DEFAULT_LEVEL, majorKey, isPostgrad } from '../../lib/labels.mjs';
import { esc, btn, relPrefix } from '../html.mjs';
import { layout } from '../layout.mjs';
import { isListed } from '../data.mjs';
import { facultyName } from '../courses.mjs';
import { programCourseCount, programName, addProgramUrl, programTypeTag, noCoursesShort, majorTitle, officialProgramLinks, cohortLabel, hasSemesters, blocksAreSemesters, majorPickers, roadmapHtml, blocksHtml } from '../programs.mjs';

export function writeProgramPages(ctx, { lang, t, P }) {
  const { siteCfg, index, write, listPage, allCourses, facByKey, listedPrograms, typeOrder, majorByCode, progsOfMajor } = ctx;

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
    );
    if (isListed(p)) listPage(here, p.updated);
  }
}
