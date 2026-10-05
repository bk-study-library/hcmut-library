// Trang khoa: ngành, môn của khoa, môn chung; khóa khoa cũ chuyển hướng tới khoa mới.
import { LEVELS, POSTGRAD_LEVELS, isPostgradCourse } from '../../lib/labels.mjs';
import { esc, btn, absUrl, relPrefix } from '../html.mjs';
import { redirectPage, layout } from '../layout.mjs';
import { courseTable, facultyName } from '../courses.mjs';
import { addProgramUrl, programsByYear, majorList } from '../programs.mjs';

export function writeFacultyPages(ctx, { lang, t, P }) {
  const { index, write, listPage, latest, allCourses, facByKey, typeOrder, progsOfMajor, ugPrograms, pgPrograms, majorsOfFaculty, loosePrograms, shared, movedTo, faculties } = ctx;

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
      
        layout({
          t,
          path: here,
          title: facultyName(t, f),
          description: t.facultyDescription(facultyName(t, f), f.courses.length, progs.length + pgProgs.length),
          body,
          crumbs: [['', t.nav.home], ['', facultyName(t, f)]],
          alt: `faculty/${f.key}/index.html`,
        }),
    );
    listPage(here, latest([...f.courses.map((c) => c.updated), ...progs.map((p) => p.updated), ...pgProgs.map((p) => p.updated)]));
  }
}
