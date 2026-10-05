#!/usr/bin/env node
// Nhập dữ liệu thu thập từ nguồn công khai (thư mục research) vào danh mục.
//
//   node scripts/import-research.mjs --research <thư mục> [--out .] [--date 2026-10-04]
//
// Thư mục research cần courses.json và programs.json (bản thu thập 2026-10-03).
// Chỉ nhập dữ kiện: mã, tên, tín chỉ, khoa, cấu trúc khối, link nguồn. Không chép PDF.
//
// Quy tắc:
// - Mỗi mã môn có một file catalog/courses/<ID>.json. Môn đã có thì giữ mọi trường,
//   chỉ tính lại mục programs (của các chương trình nhập từ research) và thêm quan hệ còn thiếu.
// - Mã bị dùng lại cho môn khác đã có ID kèm năm (ví dụ GE4169-2024): chương trình từ năm đó
//   trở đi trỏ tới ID kèm năm.
// - Khoa lấy từ faculty_owner nếu là khóa trong catalog/faculties.json, không thì theo tiền tố, cuối cùng là unknown.
// - Mã cũ chỉ lấy từ bảng tương đương, thay thế chính thức. Gợi ý "trùng tên" (candidate) bỏ qua.
//   Mã cũ đã ngừng (status_hints ghi retired) thì vào aliases của môn mới, kèm replacedBy và replaces.
//   Hai môn đều còn dạy thì chỉ ghi related hai chiều.
// - status retired chỉ khi status_hints ghi rõ retired; "possibly retired" vẫn để active.
// - Mỗi bản ghi chương trình thành một file catalog/programs/<mã>.json, kể cả khi chưa có danh sách môn.
// - Chạy lại cho cùng kết quả: updated chỉ đổi khi nội dung đổi. Trường ghi tay listed, ctdtUrl,
//   planUrl của chương trình được giữ. Bản chép từ MyBK (dữ liệu riêng của sinh viên) không nhập.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT } from './lib/repo.mjs';
import { inferParts, keptProgramFields } from './import-seed.mjs';
import { researchType } from './lib/program-types.mjs';

const CODE_RE = /^[A-Z0-9_]{3,12}$/;

const up = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Mã chương trình từ id research: hcmut:<khoa>:<ngành>:<khóa>[:<biến thể>].
// Ngành tuyển sinh: hcmut:admissions-<năm>:<mã tuyển sinh>:<loại>.
export function programCode(p) {
  const parts = p.id.split(':').slice(1);
  const adm = parts[0].match(/^admissions-([0-9]{4})$/);
  if (adm) {
    const v = researchType(p.type);
    return [up(p.faculty || 'unknown'), 'TS', parts[1], adm[1], v ? v.idSuffix : null].filter(Boolean).join('_');
  }
  const [fac, slug, ...rest] = parts;
  const year = /^[0-9]{4}$/.test(rest[0] || '') ? rest.shift() : null;
  // Slug có đuôi -<năm> trùng khóa thì bỏ đuôi cho gọn.
  const s = year ? slug.replace(new RegExp(`-${year}$`), '') : slug;
  return [up(fac), up(s), year, ...rest.map(up)].filter(Boolean).join('_');
}

// Chuẩn hóa chữ từ PDF: gạch dài thành gạch ngang, ngoặc kép cong thành thẳng, gộp khoảng trắng.
export const clean = (s) =>
  String(s || '')
    .normalize('NFC')
    .replace(/[\u2012-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00B7/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

// Tên khối dạng "A. Toán [BB] 30 > A1. Toán [BB] 15": tách nhóm, tên, bắt buộc, số tín chỉ cần.
export function parseBlockName(raw) {
  const segs = String(raw).split(' > ').map(clean).filter(Boolean);
  let leaf = segs.pop() || 'Khối';
  let required = null;
  let creditsNeed = null;
  const m = leaf.match(/\[(BB|TC)\]\s*([0-9]+)?/);
  if (m) {
    required = m[1] === 'BB';
    if (m[2]) creditsNeed = Number(m[2]);
    leaf = clean(leaf.replace(m[0], ''));
  }
  const strip = (s) => clean(s.replace(/\[(BB|TC)\]\s*[0-9]*/g, ''));
  return { name: leaf || 'Khối', group: segs.length ? segs.map(strip).join(' > ') : null, required, creditsNeed };
}

const retiredHint = (c) => (c.status_hints || []).some((h) => /: retired$/.test(h));

function sortedJson(o) {
  return JSON.stringify(o, null, 2) + '\n';
}

const PRIVATE_SOURCES = new Set(['seed-mybk-kdi-2019']);

export function importResearch(research, outRoot, { date, faculties, log = () => {} }) {
  const facKeys = new Set(faculties.faculties.map((f) => f.key));
  // Khóa khoa cũ (movedTo trong faculties.json) đổi sang khoa đang dùng.
  const moved = new Map(faculties.faculties.filter((f) => f.movedTo).map((f) => [f.key, f.movedTo]));
  const current = (key) => moved.get(key) || key;
  const facByPrefix = (code) => {
    for (const h of faculties.prefixes) if (new RegExp(h.pattern).test(code)) return h.faculty;
    return 'unknown';
  };
  const coursesDir = path.join(outRoot, 'catalog', 'courses');
  const programsDir = path.join(outRoot, 'catalog', 'programs');
  fs.mkdirSync(coursesDir, { recursive: true });
  fs.mkdirSync(programsDir, { recursive: true });

  const report = { coursesCreated: 0, coursesKept: 0, programs: 0, programsEmpty: 0, retired: 0, aliases: 0, related: 0, skipped: [] };

  // Môn đã có trong danh mục
  const existing = new Map();
  for (const f of fs.readdirSync(coursesDir).filter((x) => x.endsWith('.json')).sort()) {
    const c = JSON.parse(fs.readFileSync(path.join(coursesDir, f), 'utf8'));
    existing.set(c.id, c);
  }
  // Mã bị dùng lại: ID kèm năm khóa, áp cho chương trình từ năm đó trở đi.
  const reused = new Map();
  for (const c of existing.values()) {
    const m = c.id.match(/^(.+)-([0-9]{4})$/);
    if (m && m[1] === c.code) {
      if (!reused.has(c.code)) reused.set(c.code, []);
      reused.get(c.code).push({ id: c.id, from: Number(m[2]) });
    }
  }
  const idFor = (code, year) => {
    const r = (reused.get(code) || []).filter((x) => year != null && year >= x.from).sort((a, b) => b.from - a.from)[0];
    return r ? r.id : code;
  };

  // Bản chép từ MyBK là dữ liệu học tập riêng của một sinh viên (môn đã chọn, mã khối nội bộ):
  // không bao giờ nhập. Môn chỉ có nguồn này cũng bỏ.
  const isPrivate = (x) => (x.sources || []).length > 0 && x.sources.every((s) => PRIVATE_SOURCES.has(s));
  const rc = research.courses.courses.filter((c) => !isPrivate(c));
  const rp = research.programs.programs.filter((p) => !(p.sources || []).some((s) => PRIVATE_SOURCES.has(s)));
  const registry = research.programs.meta?.sources || {};
  const byCode = new Map(rc.map((c) => [c.code, c]));

  // Bản ghi môn
  const out = new Map();
  for (const c of existing.values()) out.set(c.id, structuredClone(c));
  for (const r of rc) {
    if (!CODE_RE.test(r.code)) {
      report.skipped.push({ code: r.code, why: 'mã không hợp lệ' });
      continue;
    }
    if (out.has(r.code)) {
      report.coursesKept++;
      continue;
    }
    const name = clean(r.name_vi || r.name_en);
    const nameEn = r.name_vi && r.name_en && clean(r.name_en).length >= 3 ? clean(r.name_en) : null;
    const owner = r.faculty_owner?.faculty;
    const faculty = current(owner && facKeys.has(owner) ? owner : facByPrefix(r.code));
    const notes = ['Nhập từ nguồn công khai (truy cập 03/10/2026).'];
    if (!r.name_vi) notes.push('Nguồn chỉ có tên tiếng Anh.');
    if (r.credits == null) notes.push('Nguồn chưa ghi số tín chỉ.');
    if (r.credits_variants) {
      notes.push(`Tín chỉ khác nhau giữa các khóa: ${r.credits_variants.map((v) => `${v.credits} (${v.years.join(', ')})`).join('; ')}.`);
    }
    const nameAlt = (r.aliases || []).filter((a) => a.type === 'name' && a.lang === 'vi').map((a) => `${clean(a.name)} (${(a.years || []).join(', ')})`);
    if (nameAlt.length) notes.push(`Tên khác trong CTĐT: ${nameAlt.join('; ')}. Chờ người duyệt xác nhận.`);
    const c = {
      $schema: '../../schema/course.schema.json',
      id: r.code,
      code: r.code,
      name,
      ...(nameEn ? { nameEn } : {}),
      ...(r.credits != null ? { credits: r.credits } : {}),
      faculty,
      aliases: [],
      status: retiredHint(r) ? 'retired' : 'active',
      programs: [],
      parts: owner === 'gdtc-qp' ? [] : inferParts(name),
      related: [],
      note: notes.join(' '),
      updated: date,
    };
    out.set(c.id, c);
    report.coursesCreated++;
  }

  // Quan hệ mã cũ, mã mới từ bảng tương đương và thay thế chính thức.
  const edges = new Map();
  for (const r of rc) {
    for (const a of r.aliases || []) {
      if (a.type !== 'code' || /candidate/.test(a.relation || '') || !(a.sources || []).length) continue;
      const newer = a.direction === 'this-is-newer';
      const older = newer ? a.code : r.code;
      const nw = newer ? r.code : a.code;
      const olderCohorts = newer ? a.other_cohorts : a.this_cohorts;
      edges.set(`${older}>${nw}`, { older, newer: nw, olderCohorts: olderCohorts || [] });
    }
  }
  const addUnique = (list, v) => {
    if (!list.includes(v)) list.push(v);
  };
  const newerOf = new Map();
  for (const e of edges.values()) {
    const o = out.get(e.older);
    const n = out.get(e.newer);
    if (!o || !n) continue;
    if (o.status === 'retired') {
      if (!newerOf.has(o.id)) newerOf.set(o.id, []);
      newerOf.get(o.id).push({ n, e });
    } else {
      addUnique(o.related, n.id);
      addUnique(n.related, o.id);
    }
  }
  for (const [oid, list] of newerOf) {
    const o = out.get(oid);
    for (const { n } of list) {
      n.replaces = n.replaces || [];
      addUnique(n.replaces, o.id);
    }
    if (list.length === 1) {
      // Một môn thay thế: mã cũ vào aliases của môn mới.
      const { n, e } = list[0];
      if (!o.replacedBy) o.replacedBy = n.id;
      if (!n.aliases.some((a) => a.code === o.code)) {
        n.aliases.push({ code: o.code, name: o.name, ...(e.olderCohorts.includes('<=2018') ? { to: '2018-12-31' } : {}) });
      }
    } else {
      // Nhiều môn thay thế: không chọn một, chỉ liên kết hai chiều.
      for (const { n } of list) {
        addUnique(o.related, n.id);
        addUnique(n.related, o.id);
      }
      report.skipped.push({ code: o.code, why: `mã cũ ứng với nhiều môn mới (${list.map((x) => x.n.id).join(', ')}): không đặt replacedBy, không thêm vào aliases` });
    }
  }

  // Chương trình
  const programCodes = new Set();
  const programs = [];
  const sourceUrl = (p) => {
    if (p.source_url) return p.source_url;
    for (const s of p.sources || []) if (registry[s]?.url) return registry[s].url;
    return null;
  };
  for (const p of rp) {
    const code = programCode(p);
    if (programCodes.has(code)) throw new Error(`trùng mã chương trình ${code} (${p.id})`);
    programCodes.add(code);
    const year = p.cohort_year != null ? Number(p.cohort_year) : null;
    const v = researchType(p.type);
    const blocks = [];
    (p.blocks || []).forEach((b, i) => {
      const parsed = parseBlockName(b.name);
      const ids = [];
      const req = new Map();
      for (const x of b.courses || []) {
        const id = idFor(x.code, year);
        if (!out.has(id)) {
          report.skipped.push({ code: x.code, why: `môn trong ${code} không có trong courses.json` });
          continue;
        }
        if (!ids.includes(id)) ids.push(id);
        if (typeof x.required === 'boolean') req.set(id, x.required);
      }
      const required = parsed.required ?? (ids.length > 0 && ids.every((id) => req.get(id) === true));
      blocks.push({
        id: `K${String(i + 1).padStart(2, '0')}`,
        name: parsed.name,
        ...(parsed.group ? { group: parsed.group } : {}),
        required,
        ...(parsed.creditsNeed != null ? { creditsNeed: parsed.creditsNeed } : {}),
        courses: ids,
        _req: req,
      });
    });
    const hasCourses = blocks.some((b) => b.courses.length);
    let note = null;
    if (p.id.startsWith('hcmut:admissions')) note = `Ngành tuyển sinh ${year}, mã tuyển sinh ${p.admission_code_2026}. Chưa có danh sách môn công khai.`;
    else if (!p.source_url && (p.sources || []).includes('hcmut-ctdt-index')) note = 'Có trong danh mục CTĐT của trường nhưng chưa có file CTĐT.';
    else if (!hasCourses) note = 'Có file CTĐT nhưng chưa tách được danh sách môn.';
    if (!hasCourses) report.programsEmpty++;
    const faculty = p.faculty && facKeys.has(p.faculty) ? current(p.faculty) : 'unknown';
    const src = sourceUrl(p);
    // Trường người duyệt ghi tay (listed, ctdtUrl, planUrl) giữ nguyên khi nhập lại.
    const kept = keptProgramFields(path.join(programsDir, `${code}.json`));
    // Bản chép từ MyBK là nguồn nháp: có trang riêng nhưng không hiện trong danh sách chương trình.
    const listed = 'listed' in kept ? kept.listed : undefined;
    // type: ngành tuyển sinh luôn có (mã tuyển sinh: 1xx tiêu chuẩn, 2xx tiếng Anh, tiên tiến, Nhật Bản, 3xx chuyển
    // tiếp quốc tế, 4xx liên kết); CTĐT khác chỉ khi nguồn ghi rõ loại đặc biệt (có đuôi id), vì "standard" của
    // file khoa chưa chắc là chương trình tiêu chuẩn. Liên kết không có trên Sổ tay nên không có type.
    const admission = p.id.startsWith('hcmut:admissions');
    const admType = v && (admission || v.idSuffix) ? v.type : null;
    programs.push({
      $schema: '../../schema/program.schema.json',
      code,
      name: clean(p.name_vi || p.name_en),
      ...(p.name_en && p.name_vi ? { nameEn: clean(p.name_en) } : {}),
      faculty,
      ...(year != null ? { year: String(year) } : {}),
      ...(admType ? { type: admType } : {}),
      ...(v && v.label ? { variant: v.label } : {}),
      ...(listed !== undefined ? { listed } : {}),
      ...(src ? { source: src } : {}),
      ...(kept.ctdtUrl ? { ctdtUrl: kept.ctdtUrl } : {}),
      ...(kept.planUrl ? { planUrl: kept.planUrl } : {}),
      ...(note ? { note } : {}),
      blocks,
      updated: date,
    });
  }
  report.programs = programs.length;

  // course.programs: bỏ mục cũ của các chương trình research, giữ mục của chương trình khác.
  for (const c of out.values()) c.programs = (c.programs || []).filter((x) => !programCodes.has(x.program));
  for (const pr of programs) {
    for (const b of pr.blocks) {
      for (const id of b.courses) {
        const c = out.get(id);
        if (!c.programs.some((x) => x.program === pr.code && x.block === b.id)) {
          c.programs.push({ program: pr.code, block: b.id, required: b._req.has(id) ? b._req.get(id) : b.required });
        }
      }
      delete b._req;
    }
  }

  // Ghi file; updated chỉ đổi khi nội dung đổi.
  const writeKeepDate = (p, obj) => {
    if (fs.existsSync(p)) {
      const cur = JSON.parse(fs.readFileSync(p, 'utf8'));
      const a = { ...cur, updated: null };
      const b = { ...obj, updated: null };
      if (JSON.stringify(a) === JSON.stringify(b)) obj.updated = cur.updated;
      else obj.updated = date;
    }
    fs.writeFileSync(p, sortedJson(obj));
  };
  const ORDER = ['$schema', 'id', 'code', 'name', 'nameEn', 'credits', 'faculty', 'aliases', 'status', 'replacedBy', 'replaces', 'programs', 'parts', 'related', 'note', 'updated'];
  for (const c of out.values()) {
    c.related.sort();
    if (c.replaces) c.replaces.sort();
    const o = {};
    for (const k of ORDER) if (c[k] !== undefined) o[k] = c[k];
    for (const k of Object.keys(c)) if (!(k in o)) o[k] = c[k];
    writeKeepDate(path.join(coursesDir, `${c.id}.json`), o);
  }
  for (const pr of programs) writeKeepDate(path.join(programsDir, `${pr.code}.json`), pr);

  report.retired = [...out.values()].filter((c) => c.status === 'retired').length;
  report.aliases = [...out.values()].reduce((n, c) => n + c.aliases.length, 0);
  report.related = [...out.values()].reduce((n, c) => n + c.related.length, 0) / 2;
  report.courses = out.size;
  log(
    `${report.courses} môn (tạo ${report.coursesCreated}, giữ ${report.coursesKept}), ${report.programs} chương trình (${report.programsEmpty} chưa có danh sách môn), ` +
      `${report.retired} môn ngừng dạy, ${report.aliases} mã cũ, ${report.related} cặp liên quan.`,
  );
  for (const s of report.skipped) log(`Bỏ qua ${s.code}: ${s.why}`);
  return report;
}

export function readResearch(dir) {
  const r = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
  return { courses: r('courses.json'), programs: r('programs.json') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = { out: TOOL_ROOT, date: new Date().toISOString().slice(0, 10) };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--research') a.research = argv[++i];
    else if (argv[i] === '--out') a.out = path.resolve(argv[++i]);
    else if (argv[i] === '--date') a.date = argv[++i];
    else throw new Error(`tham số lạ: ${argv[i]}`);
  }
  if (!a.research) {
    console.error('Cần --research <thư mục>.');
    process.exit(2);
  }
  const faculties = JSON.parse(fs.readFileSync(path.join(a.out, 'catalog', 'faculties.json'), 'utf8'));
  importResearch(readResearch(a.research), a.out, { date: a.date, faculties, log: (s) => console.log(s) });
}
