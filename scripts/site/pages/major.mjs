// Trang ngành: bộ chọn loại và khóa, lộ trình theo học kỳ của chương trình chính, nút tới PDF CTĐT và Sổ tay.
import { LEVELS, DEFAULT_LEVEL, majorKey, isPostgrad } from '../../lib/labels.mjs';
import { esc, btn, relPrefix } from '../html.mjs';
import { layout } from '../layout.mjs';
import { facultyName } from '../courses.mjs';
import { programCourseCount, addProgramUrl, typeTagLink, majorTitle, officialProgramLinks, typeLabel, typeRank, cohortLabel, hasSemesters, mainProgram, majorPickers, roadmapHtml, blocksHtml } from '../programs.mjs';

export function writeMajorPages(ctx, { lang, t, P }) {
  const { siteCfg, index, write, listPage, latest, allCourses, facByKey, typeOrder, majors, progsOfMajor } = ctx;

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
      
        layout({
          t,
          path: here,
          title: name,
          description: pg ? t.majorDescriptionPg(name) : t.majorDescription(name),
          body,
          crumbs: [['', t.nav.home], ...(fac ? [[`faculty/${fac.key}/`, facultyName(t, fac)]] : []), ['', name]],
          alt: `major/${key}/index.html`,
        }),
    );
    listPage(here, latest(list.map((p) => p.updated)));
  }
}
