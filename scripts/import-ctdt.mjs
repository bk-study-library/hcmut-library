#!/usr/bin/env node
// Nhập bộ dữ liệu CTĐT chính thức của trường (Sổ tay HCMUT, bảng CTĐT từ khóa 2019, kế hoạch giảng dạy)
// vào danh mục: ngành (catalog/majors.json), chương trình theo khóa và loại, môn.
//
//   node scripts/import-ctdt.mjs --data <thư mục> [--sdh <thư mục>] [--out .] [--date 2026-10-04]
//
// Thư mục cần majors.json, programs.json, courses.json; links.json nếu có thì lấy ngày truy cập nguồn.
// --sdh: nhập thêm CTĐT sau đại học (thạc sĩ, tiến sĩ) bằng scripts/import-sdh.mjs, sau phần đại học.
// Có thể chỉ chạy --sdh mà không có --data.
// Chỉ nhập dữ kiện (mã, tên, tín chỉ, khối, học kỳ đề xuất, link nguồn). Không chép PDF.
//
// Quy tắc:
// - Môn: mã mới thì tạo file, khoa theo tiền tố trong catalog/faculties.json. Môn đã có thì giữ mọi trường,
//   chỉ sửa tên khi nguồn tin được: tên theo Sổ tay thắng (khác chỉ ở chữ hoa thì giữ tên đang có); tên chỉ có
//   trong PDF (nameNeedsReview) chỉ thay khi tên đang có bị vỡ chữ, kèm ghi chú chờ người duyệt. nameEn chỉ
//   thay khi tên đang có bị vỡ và tên nguồn không đáng ngờ. Tín chỉ, handbookUrl chỉ điền khi còn trống.
// - Mã bị dùng lại đã có ID kèm năm (ví dụ GE4169-2024): chương trình từ năm đó trở đi trỏ tới ID kèm năm,
//   và tên trong nguồn sửa vào đúng ID đó.
// - Tiền tố dùng chung (quy tắc trỏ tới khoa sharedFaculty trong catalog/site.json) luôn về khoa đó;
//   môn đang ở khoa unknown thì gán theo tiền tố nếu có quy tắc.
// - Chương trình: giữ mã cũ khi đã nhập trước đó (cùng ngành, loại, khóa, chuyên ngành) hoặc khi khớp một
//   chương trình cũ chưa gắn ngành (cùng khoa, tên ngành, khóa, loại). Còn lại tạo mã mới dễ đọc
//   <KHOA>_<TÊN NGÀNH>_<KHÓA>[_<LOẠI>], trùng thì thêm mã ngành. Chương trình cũ không khớp giữ nguyên.
// - Học kỳ đề xuất ghi ở khối: semesters { ID môn: học kỳ }, courses giữ nguyên dạng mảng ID.
// - Chạy lại cho cùng kết quả: updated chỉ đổi khi nội dung đổi. Trường người duyệt ghi tay được giữ:
//   listed, ctdtUrl, planUrl, reviewNote của chương trình; aliases, related, replaces, ghi chú của môn;
//   tên, tên tiếng Anh, ghi chú của ngành.
// - Không nhập dữ liệu từ MyBK hay nguồn cá nhân.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT, officialPdfUrl } from './lib/repo.mjs';
import { BLOCK_KINDS, DEFAULT_LEVEL, isPostgradCourse } from './lib/labels.mjs';
import { PROGRAM_TYPES, TYPE_CODES, typeFromVariant } from './lib/program-types.mjs';
import { clean } from './import-research.mjs';
import { inferParts } from './import-seed.mjs';
// Vòng import với import-sdh.mjs an toàn: hai module chỉ dùng hàm của nhau khi chạy, không lúc nạp.
import { importSdh, readSdh } from './import-sdh.mjs';

const CODE_RE = /^[A-Z0-9_]{3,12}$/;
const MAJOR_RE = /^[0-9][0-9A-Za-z+]{3,31}$/;
const TYPES = TYPE_CODES;
const KINDS = Object.keys(BLOCK_KINDS);
const DEGREES = new Set(['cu-nhan', 'ky-su', 'ky-su-chuyen-sau', 'thac-si', 'tien-si']);
const KEPT_PROGRAM = ['listed', 'ctdtUrl', 'planUrl', 'reviewNote'];

// Bỏ dấu tiếng Việt.
export const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

export const slug = (s) =>
  fold(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Khóa so tên ngành: không dấu, chữ thường, bỏ "(thí điểm)", "(TT)", "(PFIEV)", "(SN)" và chữ "Cử nhân", "Kỹ sư" ở đầu.
export function nameKey(s) {
  return fold(clean(s))
    .toLowerCase()
    .replace(/\((thi diem|tt|pfiev|sn|nganh moi|song nganh)\)/g, ' ')
    .replace(/^\s*(cu nhan|ky su)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const VI_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const squash = (s) => clean(s).toLowerCase().replace(/\s+/g, '');
const startsLower = (s) => {
  const ch = s.charAt(0);
  return ch !== ch.toUpperCase() && ch === ch.toLowerCase();
};
function balanced(s) {
  let d = 0;
  for (const ch of s) {
    if (ch === '(') d++;
    else if (ch === ')' && --d < 0) return false;
  }
  return d === 0;
}
// a ngắn hơn b và là đầu hoặc đuôi của b (bỏ khoảng trắng): a bị cắt khi trích PDF.
const truncatedOf = (a, b) => {
  const x = squash(a);
  const y = squash(b);
  return x.length < y.length && (y.startsWith(x) || y.endsWith(x));
};

// Tên tiếng Việt đang có trông như bị vỡ khi trích PDF (so với tên nguồn mới).
export function viNameBroken(cur, fresh) {
  const a = clean(cur);
  const b = clean(fresh);
  if (!a) return true;
  if (startsLower(a)) return true;
  if (!balanced(a)) return true;
  if (VI_RE.test(b) && !VI_RE.test(a)) return true;
  if (/[^\x00-\x7F][a-z]*x(\s|$)/.test(a)) return true;
  if (a !== b && squash(a) === squash(b)) return true;
  return truncatedOf(a, b);
}

// Tên tiếng Anh đang có trông như bị vỡ (hậu tố " KT", chữ Việt, tách chữ, dính số, bị cắt).
export function enNameBroken(cur, fresh) {
  const a = clean(cur);
  if (!a) return true;
  if (/ KT$/.test(a) || VI_RE.test(a) || /^[a-z0-9]/.test(a) || !balanced(a)) return true;
  if (/[A-Za-z][0-9]|[0-9][A-Z]/.test(a)) return true;
  if (/^(\S+) \1\b/.test(a)) return true;
  if (fresh && a !== clean(fresh) && squash(a) === squash(fresh)) return true;
  return Boolean(fresh) && truncatedOf(a, fresh);
}

// Tên tiếng Anh của nguồn đáng ngờ (tách ô bằng luật suy đoán): không dùng để ghi đè.
export function enNameSuspicious(fresh, viName, rec = {}) {
  const b = clean(fresh);
  if (!b || b.length < 3 || rec.reviewReason) return true;
  if (VI_RE.test(b) || /^[a-z0-9]/.test(b) || !balanced(b)) return true;
  const words = b.split(' ');
  if (words.length > 1 && b === b.toUpperCase() && /[A-Z]{3}/.test(b)) return true;
  if (words.length === 1 && b === b.toUpperCase() && clean(viName).split(' ').length >= 3) return true;
  return false;
}

const sameText = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

export function addSentence(note, s) {
  const cur = clean(note || '');
  if (!s || cur.includes(s)) return cur || undefined;
  return cur ? `${cur} ${s}` : s;
}

export const json = (o) => JSON.stringify(o, null, 2) + '\n';

export function ordered(obj, order) {
  const o = {};
  for (const k of order) if (obj[k] !== undefined) o[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in o) && obj[k] !== undefined) o[k] = obj[k];
  return o;
}

export const COURSE_ORDER = ['$schema', 'id', 'code', 'name', 'nameEn', 'credits', 'faculty', 'levels', 'aliases', 'status', 'replacedBy', 'replaces', 'programs', 'parts', 'related', 'handbookUrl', 'note', 'updated'];
export const PROGRAM_ORDER = ['$schema', 'code', 'name', 'nameEn', 'faculty', 'year', 'major', 'type', 'track', 'level', 'orientation', 'degree', 'totalCredits', 'variant', 'listed', 'note', 'reviewNote', 'source', 'ctdtUrl', 'planUrl', 'handbookUrl', 'groups', 'blocks', 'updated'];
export const MAJOR_ORDER = ['code', 'name', 'nameEn', 'faculty', 'level', 'programTypes', 'aliases', 'handbookUrl', 'note'];
export const KEPT_PROGRAM_FIELDS = KEPT_PROGRAM;

// Ghi file JSON; updated chỉ đổi khi nội dung (trừ updated) đổi.
export function writeKeepDate(p, obj, date) {
  if (fs.existsSync(p)) {
    const cur = JSON.parse(fs.readFileSync(p, 'utf8'));
    obj.updated = JSON.stringify({ ...cur, updated: null }) === JSON.stringify({ ...obj, updated: null }) ? cur.updated : date;
  }
  fs.writeFileSync(p, json(obj));
}

export function readSite(root) {
  const own = path.join(root, 'catalog', 'site.json');
  const p = fs.existsSync(own) ? own : path.join(TOOL_ROOT, 'catalog', 'site.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Loại của chương trình cũ chưa gắn ngành: type có sẵn (ngành tuyển sinh), không thì suy từ variant, không có
// variant thì theo tên (song ngành) hay tiêu chuẩn.
function legacyType(p) {
  if (p.type) return p.type;
  if (p.variant) return typeFromVariant(p.variant);
  return nameKey(p.name).startsWith('song nganh') ? 'SN' : 'CQ';
}

export const vnDate = (d) => (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d || '') ? d.split('-').reverse().join('/') : d);

export function readCtdt(dir) {
  const r = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
  const links = fs.existsSync(path.join(dir, 'links.json')) ? r('links.json') : null;
  return { majors: r('majors.json'), programs: r('programs.json'), courses: r('courses.json'), links: links?.links || [], accessed: links?.accessed || null };
}

export function importCtdt(data, outRoot, { date, faculties, log = () => {} }) {
  const site = readSite(outRoot);
  const pdfHosts = site.programPdfHosts || [];
  const handbookHosts = site.handbookHosts || [];
  const shared = site.sharedFaculty || null;
  const accessed = vnDate(data.accessed || date);
  const facKeys = new Set(faculties.faculties.map((f) => f.key));
  const ruleFor = (code) => faculties.prefixes.find((h) => new RegExp(h.pattern).test(code)) || null;
  const pdfUrl = (u) => (u && officialPdfUrl(u, pdfHosts) ? u : null);
  const hbUrl = (u) => (u && officialPdfUrl(u, handbookHosts) ? u : null);

  const coursesDir = path.join(outRoot, 'catalog', 'courses');
  const programsDir = path.join(outRoot, 'catalog', 'programs');
  const majorsPath = path.join(outRoot, 'catalog', 'majors.json');
  fs.mkdirSync(coursesDir, { recursive: true });
  fs.mkdirSync(programsDir, { recursive: true });

  const report = {
    coursesCreated: 0,
    namesFixed: [],
    namesFromPdf: [],
    namesKept: [],
    nameEnFixed: 0,
    creditsFilled: [],
    facultyMoved: 0,
    programsKept: 0,
    programsLegacy: [],
    programsNew: 0,
    majors: 0,
    conflicts: [],
    skipped: [],
  };

  const readDir = (dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const out = new Map(readDir(coursesDir).map((c) => [c.id, c]));
  const existingPrograms = new Map(readDir(programsDir).map((p) => [p.code, p]));

  // Mã bị dùng lại: ID kèm năm khóa, áp cho chương trình từ năm đó trở đi.
  // Môn chỉ thuộc sau đại học (ID kèm năm do trùng mã với môn đại học) không áp cho chương trình đại học.
  const reused = new Map();
  for (const c of out.values()) {
    if (isPostgradCourse(c)) continue;
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

  const programYear = new Map(data.programs.map((p) => [p.key, Number(p.year)]));

  // ---------- Ngành ----------
  const oldMajors = fs.existsSync(majorsPath) ? JSON.parse(fs.readFileSync(majorsPath, 'utf8')) : { majors: [] };
  const majors = new Map(oldMajors.majors.map((m) => [m.code, m]));
  for (const m of data.majors) {
    if (!MAJOR_RE.test(m.code || '')) {
      report.skipped.push({ code: m.code, why: 'mã ngành không hợp lệ' });
      continue;
    }
    const cur = majors.get(m.code) || {};
    const faculty = facKeys.has(m.faculty) ? m.faculty : cur.faculty || 'unknown';
    const types = TYPES.filter((t) => (m.programTypes || []).includes(t));
    const rec = {
      code: m.code,
      name: cur.name || clean(m.name),
      nameEn: cur.nameEn || clean(m.nameEn) || undefined,
      faculty,
      level: cur.level || DEFAULT_LEVEL,
      programTypes: types,
      handbookUrl: cur.handbookUrl || hbUrl(m.handbookUrl) || undefined,
      note: cur.note,
    };
    majors.set(m.code, ordered(rec, MAJOR_ORDER));
  }
  report.majors = majors.size;

  // ---------- Môn ----------
  for (const [code, r] of Object.entries(data.courses).sort(([a], [b]) => a.localeCompare(b))) {
    if (!CODE_RE.test(code)) {
      report.skipped.push({ code, why: 'mã môn không hợp lệ' });
      continue;
    }
    const years = (r.seenIn || []).map((k) => programYear.get(k)).filter(Number.isInteger);
    const targets = new Set(years.length ? years.map((y) => idFor(code, y)) : [code]);
    if (targets.size > 1) {
      // Mã dùng lại mà nguồn có cả khóa cũ lẫn khóa mới: không biết tên thuộc nghĩa nào, không sửa.
      report.conflicts.push({ code, why: `mã dùng lại, nguồn có ở cả ${[...targets].join(' và ')}; không sửa tên` });
      continue;
    }
    const id = [...targets][0];
    const fresh = clean(r.name);
    const freshEn = clean(r.nameEn);
    const fromPdf = r.nameSource !== 'handbook';
    const handbookUrl = hbUrl(r.handbookUrl);
    const pdfNames = (r.pdfNames || []).map(clean).filter((x) => x && !sameText(x, fresh));
    const c = out.get(id);
    if (!c) {
      if (!fresh) {
        report.skipped.push({ code, why: 'nguồn không có tên môn' });
        continue;
      }
      const rule = ruleFor(code);
      const faculty = rule && facKeys.has(rule.faculty) ? rule.faculty : 'unknown';
      let note = fromPdf
        ? `Nhập từ Kế hoạch giảng dạy (PDF của trường, truy cập ${accessed}). Tên lấy từ PDF. Chờ người duyệt xác nhận.`
        : `Nhập từ CTĐT chính thức (Sổ tay HCMUT, truy cập ${accessed}).`;
      if (r.reviewReason) note = addSentence(note, clean(r.reviewReason));
      if (pdfNames.length) note = addSentence(note, `Tên trong Kế hoạch giảng dạy: ${pdfNames.join('; ')}.`);
      out.set(id, {
        $schema: '../../schema/course.schema.json',
        id,
        code,
        name: fresh,
        nameEn: freshEn && !enNameSuspicious(freshEn, fresh, r) ? freshEn : undefined,
        credits: Number.isInteger(r.credits) ? r.credits : undefined,
        faculty,
        aliases: [],
        status: 'active',
        programs: [],
        parts: r.credits === 0 ? [] : inferParts(fresh),
        related: [],
        handbookUrl: handbookUrl || undefined,
        note,
        updated: date,
      });
      report.coursesCreated++;
      continue;
    }
    // Môn đã có: chỉ sửa khi nguồn tin được.
    if (fresh && !sameText(c.name, fresh)) {
      if (!fromPdf) {
        report.namesFixed.push({ id, from: c.name, to: fresh });
        c.name = fresh;
      } else if (viNameBroken(c.name, fresh)) {
        report.namesFromPdf.push({ id, from: c.name, to: fresh });
        c.name = fresh;
        c.note = addSentence(c.note, 'Tên lấy từ Kế hoạch giảng dạy (PDF của trường). Chờ người duyệt xác nhận.');
      } else {
        report.namesKept.push({ id, kept: c.name, source: fresh });
      }
    }
    if (freshEn && !enNameSuspicious(freshEn, fresh, r) && (!c.nameEn || (!sameText(c.nameEn, freshEn) && enNameBroken(c.nameEn, freshEn)))) {
      c.nameEn = freshEn;
      report.nameEnFixed++;
    }
    if (c.credits == null && Number.isInteger(r.credits)) {
      c.credits = r.credits;
      report.creditsFilled.push(id);
    }
    if (!c.handbookUrl && handbookUrl) c.handbookUrl = handbookUrl;
    if (pdfNames.length) c.note = addSentence(c.note, `Tên trong Kế hoạch giảng dạy: ${pdfNames.join('; ')}.`);
  }

  // Khoa theo tiền tố: tiền tố dùng chung về khoa chung; môn chưa xác định khoa thì theo quy tắc.
  for (const c of out.values()) {
    const rule = ruleFor(c.code);
    if (!rule || !facKeys.has(rule.faculty) || rule.faculty === c.faculty) continue;
    if ((shared && rule.faculty === shared) || (c.faculty === 'unknown' && rule.faculty !== 'unknown')) {
      c.faculty = rule.faculty;
      report.facultyMoved++;
    }
  }

  // ---------- Chương trình ----------
  const identity = (major, type, year, track) => `${major}|${type}|${year}|${track || ''}`;
  const byIdentity = new Map();
  for (const p of existingPrograms.values()) if (p.major && p.type && p.year) byIdentity.set(identity(p.major, p.type, p.year, p.track), p.code);
  const legacy = [...existingPrograms.values()].filter((p) => !p.major && p.listed !== false && p.year);
  const usedLegacy = new Set();
  const taken = new Set(existingPrograms.keys());
  const written = new Map();

  const src = data.programs
    .filter((p) => majors.has(p.major) && TYPES.includes(p.type) && Number.isInteger(Number(p.year)))
    .sort((a, b) => a.key.localeCompare(b.key));
  for (const p of data.programs) if (!src.includes(p)) report.skipped.push({ code: p.key, why: 'chương trình thiếu ngành, loại hoặc khóa hợp lệ' });

  const plan = src.map((p) => {
    const major = majors.get(p.major);
    const year = String(p.year);
    const track = /_r[0-9]+$/.test(p.key) && p.tableName ? clean(p.tableName) : null;
    return { p, major, year, track, id: identity(p.major, p.type, year, track) };
  });
  // Lượt 1: đã nhập trước đó.
  for (const x of plan) {
    const code = byIdentity.get(x.id);
    if (code) {
      x.code = code;
      report.programsKept++;
    }
  }
  // Lượt 2: chương trình cũ chưa gắn ngành, cùng khoa, tên ngành, khóa, loại (hoặc cùng link nguồn).
  // Khoa tính cả khoa nguồn ghi theo loại (facultiesByType) và theo bảng CTĐT (links.json).
  // Không có ứng viên cùng khoa mà chỉ có đúng một ứng viên khác khoa thì vẫn dùng, ghi vào báo cáo để duyệt.
  const srcMajor = new Map(data.majors.map((m) => [m.code, m]));
  const courseCount = (o) => o.blocks.reduce((n, bl) => n + bl.courses.length, 0);
  for (const pass of ['same-faculty', 'other-faculty']) {
    for (const x of plan) {
      if (x.code || x.track) continue;
      const { p, major, year } = x;
      const sm = srcMajor.get(p.major) || {};
      const facs = new Set([p.faculty, major.faculty, ...(sm.facultiesByType?.[p.type] || []), ...(data.links || []).filter((l) => l.major === p.major && l.type === p.type).map((l) => l.faculty)]);
      const names = new Set([major.name, p.name, p.tableName, ...(sm.tableNames || [])].filter(Boolean).map(nameKey));
      const urls = new Set([p.ctdtUrl, p.planUrl].filter(Boolean));
      const cands = legacy
        .filter((o) => !usedLegacy.has(o.code) && o.year === year && names.has(nameKey(o.name)))
        .filter((o) => legacyType(o) === p.type || [o.source, o.ctdtUrl, o.planUrl].some((u) => u && urls.has(u)))
        .sort((a, b) => courseCount(b) - courseCount(a) || a.code.localeCompare(b.code));
      const same = cands.filter((o) => facs.has(o.faculty));
      const pick = pass === 'same-faculty' ? same[0] : cands.length === 1 ? cands[0] : null;
      if (!pick) continue;
      x.code = pick.code;
      usedLegacy.add(x.code);
      report.programsLegacy.push({ code: x.code, key: p.key, ...(pass === 'other-faculty' ? { otherFaculty: `${pick.faculty} khác ${p.faculty}` } : {}) });
    }
  }
  // Lượt 3: mã mới.
  for (const x of plan) {
    if (x.code) continue;
    const { p, major, year, track } = x;
    const fac = slug(p.faculty && facKeys.has(p.faculty) ? p.faculty : major.faculty);
    const nm = slug(clean(major.name).replace(/\(\s*thí điểm\s*\)/giu, ''));
    const tail = [year, p.type !== 'CQ' ? p.type : null, track ? slug(track) : null].filter(Boolean);
    let code = [fac, nm, ...tail].join('_');
    if (taken.has(code)) code = [fac, nm, slug(major.code), ...tail].join('_');
    for (let i = 2; taken.has(code); i++) code = `${[fac, nm, slug(major.code), ...tail].join('_')}_${i}`;
    x.code = code;
    taken.add(code);
    report.programsNew++;
  }

  for (const x of plan) {
    const { p, major, year, track, code } = x;
    if (written.has(code)) throw new Error(`hai chương trình cùng mã ${code}`);
    const prev = existingPrograms.get(code) || {};
    const kept = {};
    for (const k of KEPT_PROGRAM) if (prev[k] !== undefined) kept[k] = prev[k];
    const y = Number(year);
    const blocks = (p.blocks || []).map((b, i) => {
      const ids = [];
      const sem = {};
      for (const cc of b.courses || []) {
        const id = idFor(cc.code, y);
        if (!out.has(id)) {
          report.skipped.push({ code: cc.code, why: `môn trong ${p.key} không có trong courses.json` });
          continue;
        }
        if (!ids.includes(id)) ids.push(id);
        if (Number.isInteger(cc.semester) && cc.semester >= 1 && !(id in sem)) sem[id] = cc.semester;
      }
      const group = (b.path || []).map(clean).filter(Boolean).join(' > ');
      return {
        id: `K${String(i + 1).padStart(2, '0')}`,
        name: clean(b.name) || 'Khối',
        ...(group ? { group } : {}),
        kind: KINDS.includes(b.kind) ? b.kind : 'khac',
        required: b.required === true,
        ...(typeof b.required === 'boolean' ? {} : { requiredUnknown: true }),
        ...(Number.isInteger(b.creditsNeed) ? { creditsNeed: b.creditsNeed } : {}),
        ...(Number.isInteger(b.coursesNeed) ? { coursesNeed: b.coursesNeed } : {}),
        courses: ids,
        ...(Object.keys(sem).length ? { semesters: sem } : {}),
      };
    });
    const hasCourses = blocks.some((b) => b.courses.length);
    let note;
    if (p.note) note = addSentence(note, clean(p.note));
    for (const f of p.qualityFlags || []) note = addSentence(note, clean(f));
    const how = p.semesterSource?.how || '';
    if (how.startsWith('cq-plan-of-same-major')) note = addSentence(note, 'Học kỳ đề xuất mượn kế hoạch giảng dạy của chương trình tiêu chuẩn cùng ngành nên chỉ gần đúng.');
    if (hasCourses && !how) note = addSentence(note, 'Chưa gán được học kỳ đề xuất cho chương trình này.');
    if ((p.ctdtUrls || []).length > 1) note = addSentence(note, 'Trường công bố CTĐT riêng cho từng chuyên ngành, xem bảng CTĐT của trường.');
    const ctdtUrl = kept.ctdtUrl || pdfUrl(p.ctdtUrl);
    const planUrl = kept.planUrl || pdfUrl(p.planUrl);
    const handbookUrl = p.source === 'handbook' ? hbUrl(p.handbookUrl) : null;
    const name = track ? `${major.name}, chuyên ngành ${track}` : major.name;
    const nameEn = major.nameEn ? (track ? `${major.nameEn}, ${track}` : major.nameEn) : undefined;
    const faculty = p.faculty && facKeys.has(p.faculty) ? p.faculty : major.faculty;
    const rec = {
      $schema: '../../schema/program.schema.json',
      code,
      name,
      nameEn,
      faculty,
      year,
      major: major.code,
      type: p.type,
      track: track || undefined,
      level: DEFAULT_LEVEL,
      degree: DEGREES.has(p.degree) ? p.degree : undefined,
      totalCredits: Number.isInteger(p.totalCredits) && p.totalCredits > 0 ? p.totalCredits : undefined,
      variant: PROGRAM_TYPES[p.type].variant ?? undefined,
      listed: kept.listed,
      note,
      reviewNote: kept.reviewNote,
      source: handbookUrl || planUrl || ctdtUrl || undefined,
      ctdtUrl: ctdtUrl || undefined,
      planUrl: planUrl || undefined,
      handbookUrl: handbookUrl || undefined,
      blocks,
      updated: date,
    };
    written.set(code, ordered(rec, PROGRAM_ORDER));
  }

  // course.programs: bỏ mục của các chương trình vừa ghi, thêm lại theo khối.
  for (const c of out.values()) {
    const others = (c.programs || []).filter((x) => !written.has(x.program));
    const ours = [];
    for (const pr of written.values()) {
      for (const b of pr.blocks) if (b.courses.includes(c.id)) ours.push({ program: pr.code, block: b.id, required: b.required });
    }
    ours.sort((a, b) => a.program.localeCompare(b.program) || a.block.localeCompare(b.block));
    c.programs = [...others, ...ours];
  }

  // ---------- Ghi file; updated chỉ đổi khi nội dung đổi ----------
  for (const c of out.values()) {
    c.related = [...(c.related || [])].sort();
    if (c.replaces) c.replaces = [...c.replaces].sort();
    writeKeepDate(path.join(coursesDir, `${c.id}.json`), ordered(c, COURSE_ORDER), date);
  }
  for (const pr of written.values()) writeKeepDate(path.join(programsDir, `${pr.code}.json`), pr, date);
  const majorsOut = {
    $schema: '../schema/major.schema.json',
    updated: date,
    majors: [...majors.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
  writeKeepDate(majorsPath, majorsOut, date);

  report.courses = out.size;
  report.programs = written.size;
  log(
    `${report.courses} môn (tạo ${report.coursesCreated}, sửa tên ${report.namesFixed.length} theo Sổ tay, ${report.namesFromPdf.length} theo PDF, ` +
      `giữ ${report.namesKept.length} tên đang có, sửa ${report.nameEnFixed} tên tiếng Anh, điền tín chỉ ${report.creditsFilled.length}, đổi khoa ${report.facultyMoved}); ` +
      `${report.majors} ngành; ${report.programs} chương trình (giữ mã ${report.programsKept}, dùng lại mã cũ ${report.programsLegacy.length}, mã mới ${report.programsNew}).`,
  );
  for (const x of report.namesFromPdf) log(`Tên theo PDF, chờ duyệt: ${x.id} "${x.from}" thành "${x.to}"`);
  for (const x of report.namesKept) log(`Giữ tên đang có: ${x.id} "${x.kept}" (nguồn PDF ghi "${x.source}")`);
  for (const x of report.programsLegacy) if (x.otherFaculty) log(`Dùng lại mã ${x.code} cho ${x.key} dù khác khoa (${x.otherFaculty}), cần duyệt`);
  for (const x of report.conflicts) log(`Mâu thuẫn ${x.code}: ${x.why}`);
  for (const x of report.skipped) log(`Bỏ qua ${x.code}: ${x.why}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = { out: TOOL_ROOT, date: new Date().toISOString().slice(0, 10) };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data') a.data = argv[++i];
    else if (argv[i] === '--sdh') a.sdh = argv[++i];
    else if (argv[i] === '--out') a.out = path.resolve(argv[++i]);
    else if (argv[i] === '--date') a.date = argv[++i];
    else throw new Error(`tham số lạ: ${argv[i]}`);
  }
  if (!a.data && !a.sdh) {
    console.error('Cần --data <thư mục> hoặc --sdh <thư mục>.');
    process.exit(2);
  }
  const faculties = JSON.parse(fs.readFileSync(path.join(a.out, 'catalog', 'faculties.json'), 'utf8'));
  if (a.data) importCtdt(readCtdt(a.data), a.out, { date: a.date, faculties, log: (s) => console.log(s) });
  if (a.sdh) {
    importSdh(readSdh(a.sdh), a.out, { date: a.date, faculties, log: (s) => console.log(s) });
  }
}
