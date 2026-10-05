// Chương trình, ngành, loại chương trình: nhãn, chip, bộ chọn khóa và loại, lộ trình theo học kỳ, khối kiến thức,
// danh sách ngành và ghi chú viết tắt. Tên và mã loại lấy từ scripts/lib/program-types.mjs.
import { PROGRAM_TYPES, TYPE_CODES, programTypeInfo } from '../lib/program-types.mjs';
import { issueUrl, BLOCK_KINDS, LEVELS, DEFAULT_LEVEL, POSTGRAD_LEVELS, majorKey, isPostgrad } from '../lib/labels.mjs';
import { esc, btn } from './html.mjs';
import { courseTable } from './courses.mjs';

// Neo tới một khối trên trang chương trình, dùng cho link từ trang môn.
export function blockAnchor(id) {
  return `khoi-${String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

// Số môn khác nhau trong mọi khối của chương trình.
export function programCourseCount(p) {
  return new Set(p.blocks.flatMap((b) => b.courses)).size;
}

export function programName(t, p) {
  return t.lang === 'en' && p.nameEn ? p.nameEn : p.name;
}

// Link tới form issue Thêm chương trình, điền sẵn khoa (tên tiếng Việt, khớp lựa chọn trong form).
export function addProgramUrl(f, p) {
  const fields = {};
  if (f) fields.khoa = f.name.vi;
  if (p) {
    fields.nganh = p.name;
    if (p.year) fields['khoa-hoc'] = p.year;
  }
  return issueUrl('them-chuong-trinh.yml', fields);
}

// Nhãn loại chương trình là link mở ô tìm trang chủ với ?q=<mã loại> (hoặc nhãn variant khi chương trình
// chưa có type), để xem mọi chương trình cùng loại. root: gốc site tính từ trang hiện tại.
// Tên chính thức của loại chương trình (Sổ tay HCMUT) hiện khi trỏ chuột vào mã viết tắt.
// level: bậc của ngành hay chương trình (CQ ở sau đại học có tên khác, xem programTypeInfo).
// Tên chính thức theo mã loại cho ô tìm (?q=CTTA): { CQ: [{ abbr, name }], ... }, mỗi bậc một dòng nếu mã khác
// (CQ đại học và THCQ thạc sĩ); bậc chưa có tên chính thức thì bỏ.
export function typeNotes(lang) {
  return Object.fromEntries(
    TYPE_CODES.map((type) => {
      const seen = new Map();
      for (const level of [DEFAULT_LEVEL, ...POSTGRAD_LEVELS]) {
        const info = programTypeInfo(type, level);
        if (info.official[lang] && !seen.has(info.abbr)) seen.set(info.abbr, info.official[lang]);
      }
      return [type, [...seen].map(([abbr, name]) => ({ abbr, name }))];
    }),
  );
}

export const typeTitle = (t, type, level) => {
  const name = programTypeInfo(type, level)?.official[t.lang];
  return name ? ` title="${esc(name)}"` : '';
};

// Nhãn của ngành, chương trình sau đại học mở ô tìm ở đúng bậc (&bac=), vì ô tìm mặc định chỉ hiện đại học.
export function typeTagLink(t, root, q, label, level) {
  const bac = level && level !== DEFAULT_LEVEL ? `&amp;bac=${encodeURIComponent(level)}` : '';
  return `<a class="tag" href="${root}${t.lang === 'en' ? 'en/' : ''}?q=${encodeURIComponent(q)}${bac}"${typeTitle(t, q, level)}>${esc(label)}</a>`;
}

// Nhãn loại của một chương trình: theo type (trừ CQ), không có type thì theo variant.
export function programTypeTag(t, p, root) {
  if (p.type && p.type !== 'CQ' && PROGRAM_TYPES[p.type]) return typeTagLink(t, root, p.type, typeLabel(t, p.type, p.level), p.level);
  if (!p.type && p.variant) return typeTagLink(t, root, p.variant, p.variant);
  return '';
}

// Chương trình chưa có môn: sau đại học là CTĐT không ghi mã môn (có PDF), đại học là chưa ai gửi CTĐT.
export const noCoursesShort = (t, p) => (isPostgrad(p) ? t.programNoCodesShort : t.programNoCoursesShort);

// Tên ngành kèm bậc cho ngành sau đại học ("Thạc sĩ Kỹ thuật cơ khí"), để không lẫn với ngành đại học cùng tên.
export function majorTitle(t, m) {
  const name = majorDisplayName(t, m);
  return isPostgrad(m) && LEVELS[m.level] ? t.levelName(LEVELS[m.level][t.lang], name) : name;
}

// Một dòng chương trình: tên, loại, số môn (hoặc chưa có danh sách môn).
export function programLi(t, p, href, { withYear = false, root = './' } = {}) {
  const n = programCourseCount(p);
  const label = withYear && p.year ? `${programName(t, p)} (${p.year})` : programName(t, p);
  const tag = programTypeTag(t, p, root);
  return `<li><a href="${href}">${esc(label)}</a>${tag ? ` ${tag}` : ''} <span class="muted small">${esc(n ? t.coursesCount(n) : noCoursesShort(t, p))}</span></li>`;
}

// Chương trình xếp theo khóa, mới nhất trước; chương trình không ghi khóa ở cuối.
export function byYearDesc(a, b) {
  return (b.year || '0000').localeCompare(a.year || '0000') || a.name.localeCompare(b.name, 'vi') || a.code.localeCompare(b.code);
}

export function programsByYear(t, progs, hrefOf, root) {
  const groups = new Map();
  for (const p of progs.slice().sort(byYearDesc)) {
    const k = p.year || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  return [...groups]
    .map(([y, list]) => `<h3>${esc(y ? t.cohort(y) : t.cohortUnknown)}</h3><ul class="list">${list.map((p) => programLi(t, p, hrefOf(p), { root })).join('')}</ul>`)
    .join('');
}

// Nút tới nguồn chính thức của chương trình. ctdtUrl, planUrl đã được kiểm host khi đọc repo
// (programPdfHosts trong site.json). pdf: có ít nhất một file PDF của trường.
export function officialProgramLinks(t, p, site) {
  const pdfBtn = (href, label) => `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  const buttons = [];
  if (p.ctdtUrl) buttons.push(pdfBtn(p.ctdtUrl, t.programCtdtPdf));
  if (p.planUrl) buttons.push(pdfBtn(p.planUrl, t.programPlanPdf));
  const pdf = buttons.length > 0;
  if (!pdf) {
    if (/^https?:\/\//.test(p.source || '')) buttons.push(`<a class="btn" href="${esc(p.source)}" rel="noopener">${esc(t.programSource)}</a>`);
    if (site.officialProgramsPage) buttons.push(`<a class="btn subtle" href="${esc(site.officialProgramsPage)}" rel="noopener">${esc(t.programTable)}</a>`);
  }
  return { buttons, pdf };
}

// ---------- Ngành, bộ chọn khóa và loại, lộ trình theo học kỳ ----------

export const typeLabel = (t, type, level) => programTypeInfo(type, level)?.abbr ?? type;

export const majorDisplayName = (t, m) => (t.lang === 'en' && m.nameEn ? m.nameEn : m.name);

export const typeRank = (order, type) => {
  const i = order.indexOf(type);
  return i < 0 ? order.length : i;
};

// Nhãn ngắn của chương trình trong một ngành: "Khóa 2026, Tiêu chuẩn" (thêm chuyên ngành nếu có).
export function cohortLabel(t, p) {
  return [p.year ? t.cohort(p.year) : t.cohortUnknown, p.type ? typeLabel(t, p.type, p.level) : null, p.track || null].filter(Boolean).join(', ');
}

export const hasSemesters = (p) => p.blocks.some((b) => b.semesters && Object.keys(b.semesters).length);

// Khối của chương trình đã là từng học kỳ (chỉ có kế hoạch giảng dạy): mỗi khối có môn đều cùng một học kỳ
// cho mọi môn. Khi đó trang chương trình không cần thêm phần lộ trình, vì khối đã là lộ trình.
export function blocksAreSemesters(p) {
  const filled = p.blocks.filter((b) => b.courses.length);
  return (
    filled.length > 0 &&
    filled.every((b) => {
      const s = b.semesters || {};
      const vals = new Set(b.courses.map((id) => s[id]));
      return vals.size === 1 && !vals.has(undefined);
    })
  );
}

// Môn theo học kỳ đề xuất (học kỳ sớm nhất nếu có ở nhiều khối), rồi môn chưa có học kỳ theo vai trò khối.
export function semesterPlan(p) {
  const seen = new Set();
  const sem = new Map();
  for (const b of p.blocks) {
    for (const id of b.courses) {
      const n = b.semesters?.[id];
      if (!n || seen.has(id)) continue;
      seen.add(id);
      if (!sem.has(n)) sem.set(n, []);
      sem.get(n).push(id);
    }
  }
  const rest = new Map();
  for (const b of p.blocks) {
    for (const id of b.courses) {
      if (seen.has(id)) continue;
      seen.add(id);
      const k = BLOCK_KINDS[b.kind] ? b.kind : 'khac';
      if (!rest.has(k)) rest.set(k, []);
      rest.get(k).push(id);
    }
  }
  const kinds = Object.keys(BLOCK_KINDS);
  return {
    semesters: [...sem].sort((a, b) => a[0] - b[0]),
    rest: [...rest].sort((a, b) => kinds.indexOf(a[0]) - kinds.indexOf(b[0])),
  };
}

// Chương trình chính của một nhóm: ưu tiên có danh sách môn, có học kỳ đề xuất, loại xếp đầu, khóa mới nhất.
export function mainProgram(list, order) {
  const filled = list.filter((p) => programCourseCount(p));
  const withSem = filled.filter(hasSemesters);
  const pool = withSem.length ? withSem : filled.length ? filled : list;
  return pool.slice().sort((a, b) => typeRank(order, a.type) - typeRank(order, b.type) || (b.year || '').localeCompare(a.year || '') || a.code.localeCompare(b.code))[0] || null;
}

// Bộ chọn loại chương trình và khóa (link tới trang chương trình). current: chương trình đang xem.
export function majorPickers(t, list, current, hrefOf, order, currentAttr) {
  const chip = (p, label, on, title = '') => `<a class="chip" href="${hrefOf(p)}"${title}${on ? ` aria-current="${currentAttr}"` : ''}>${esc(label)}</a>`;
  const types = [...new Set(list.map((p) => p.type).filter(Boolean))].sort((a, b) => typeRank(order, a) - typeRank(order, b));
  const typeChips = types.map((type) => chip(mainProgram(list.filter((p) => p.type === type), order), typeLabel(t, type, current.level), type === current.type, typeTitle(t, type, current.level)));
  const cohorts = list
    .filter((p) => p.type === current.type)
    .sort((a, b) => (b.year || '').localeCompare(a.year || '') || (a.track || '').localeCompare(b.track || '', 'vi'));
  const cohortChips = cohorts.map((p) => chip(p, [p.year || t.cohortUnknown, p.track].filter(Boolean).join(', '), p.code === current.code));
  const row = (label, chips) => `<div class="pick-row"><span class="pick-label">${esc(label)}</span><span class="chips">${chips.join('')}</span></div>`;
  return `<nav class="pickers" aria-label="${esc(t.pickersLabel)}">${types.length > 1 ? row(t.pickType, typeChips) : ''}${row(t.pickCohort, cohortChips)}</nav>`;
}

// Lộ trình theo học kỳ: mỗi học kỳ một bảng môn; môn chưa có học kỳ gập theo vai trò khối.
export function roadmapHtml(t, p, allCourses, root) {
  const plan = semesterPlan(p);
  const list = (ids) => ids.map((id) => allCourses.get(id)).filter(Boolean);
  const sems = plan.semesters
    .map(([n, ids]) => `<section class="sem" id="hoc-ky-${n}"><h3>${esc(t.semester(n))} <span class="muted small">${esc(t.coursesCount(list(ids).length))}</span></h3>${courseTable(t, list(ids), root, t.semester(n))}</section>`)
    .join('');
  const rest = plan.rest.length
    ? `<section class="sem"><h3>${esc(t.noSemester)}</h3>${plan.rest
        .map(([kind, ids]) => `<details class="sem-rest"><summary>${esc(BLOCK_KINDS[kind][t.lang])} <span class="muted small">${esc(t.coursesCount(list(ids).length))}</span></summary>${courseTable(t, list(ids), root, BLOCK_KINDS[kind][t.lang])}</details>`)
        .join('')}</section>`
    : '';
  return sems + rest;
}

// Một dòng ngành: tên (link trang ngành), nhãn loại, các khóa có danh sách môn (mới trước).
export function majorRow(t, m, progs, root, P, order) {
  const href = `${root}${P(`major/${majorKey(m.code)}/`)}`;
  const types = [...new Set(progs.map((p) => p.type).filter(Boolean))].sort((a, b) => typeRank(order, a) - typeRank(order, b));
  const filled = progs.filter((p) => programCourseCount(p));
  const years = [...new Set(filled.map((p) => p.year).filter(Boolean))].sort().reverse();
  const links = years.map((y) => {
    const p = mainProgram(filled.filter((x) => x.year === y), order);
    return `<a href="${root}${P(`program/${p.code}/`)}">${esc(y)}</a>`;
  });
  const tags = types.map((x) => typeTagLink(t, root, x, typeLabel(t, x, m.level), m.level)).join('');
  const none = isPostgrad(m) ? t.programNoCodesShort : t.majorNoCourses;
  return `<li class="major-row"><span class="major-head"><a class="major-name" href="${href}">${esc(majorDisplayName(t, m))}</a>${tags}</span><span class="muted small">${links.length ? `${esc(t.cohortsLabel)}: ${links.join(', ')}` : esc(none)}</span></li>`;
}

// Khối kiến thức của một chương trình: mỗi khối có môn một bảng; khối có khối cha (group) ghi tên khối cha,
// kèm số tín chỉ khối cha cần nếu chương trình ghi ở groups.
export function blocksHtml(t, p, allCourses, root, heading = 'h3') {
  const groupCredits = new Map((p.groups || []).filter((g) => g.creditsNeed != null).map((g) => [g.name, g.creditsNeed]));
  return p.blocks
    .filter((b) => b.courses.length)
    .map((b) => {
      const list = b.courses.map((id) => allCourses.get(id)).filter(Boolean);
      const meta = [b.requiredUnknown ? null : b.required ? t.required : t.elective, b.creditsNeed ? t.blockCredits(b.creditsNeed) : null, b.coursesNeed ? t.coursesNeed(b.coursesNeed) : null].filter(Boolean).join(', ');
      const group = b.group ? [b.group, groupCredits.get(b.group) ? t.blockCredits(groupCredits.get(b.group)) : null].filter(Boolean).join(', ') : '';
      return `<section class="block" id="${blockAnchor(b.id)}"><${heading}>${esc(b.name)}${meta ? ` <span class="muted small">${esc(meta)}</span>` : ''}</${heading}>${group ? `<p class="muted small">${esc(group)}</p>` : ''}${courseTable(t, list, root, b.name)}</section>`;
    })
    .join('');
}

// Danh sách ngành của một khoa, xếp theo tên.
export function majorList(t, majors, progsOfMajor, root, P, order) {
  const rows = majors
    .slice()
    .sort((a, b) => majorDisplayName(t, a).localeCompare(majorDisplayName(t, b), t.lang) || a.code.localeCompare(b.code))
    .map((m) => majorRow(t, m, progsOfMajor(m.code), root, P, order));
  if (!rows.length) return '';
  // Mỗi cặp loại và bậc một dòng ghi chú (CQ ở thạc sĩ là THCQ); trùng mã viết tắt thì giữ một.
  const pairs = majors.flatMap((m) => progsOfMajor(m.code).map((p) => [p.type, m.level])).filter(([x]) => PROGRAM_TYPES[x]);
  pairs.sort((a, b) => typeRank(order, a[0]) - typeRank(order, b[0]));
  return `<ul class="majors">${rows.join('')}</ul>${abbrNote(t, pairs)}`;
}

// Ghi chú viết tắt: mã loại chương trình (theo Sổ tay HCMUT) và tên chính thức, gập lại.
export function abbrNote(t, pairs) {
  const seen = new Map();
  for (const [type, level] of pairs) {
    const info = programTypeInfo(type, level);
    if (info.official[t.lang] && !seen.has(info.abbr)) seen.set(info.abbr, info.official[t.lang]);
  }
  if (!seen.size) return '';
  const rows = [...seen].map(([abbr, name]) => `<dt>${esc(abbr)}</dt><dd>${esc(name)}</dd>`).join('');
  return `<details class="abbr-note"><summary>${esc(t.abbrTitle)}</summary><dl>${rows}</dl><p class="muted small">${esc(t.abbrSource)}</p></details>`;
}
