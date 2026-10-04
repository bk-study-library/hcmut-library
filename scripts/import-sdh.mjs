// Nhập CTĐT sau đại học chính thức của trường (bảng PDF thạc sĩ, tiến sĩ từ khóa 2025, Sổ tay HCMUT,
// danh sách CTĐT 2022) vào danh mục: ngành thạc sĩ, tiến sĩ (catalog/majors.json), chương trình theo khóa
// và loại, môn sau đại học. Chạy qua scripts/import-ctdt.mjs --sdh <thư mục>, sau phần đại học.
//
// Thư mục cần majors.json, programs.json, courses.json (bộ dữ liệu sau-dai-hoc-YYYY-MM-DD). Ngày truy cập
// nguồn lấy từ đuôi YYYY-MM-DD của tên thư mục nếu có, không thì theo --date.
//
// Quy tắc:
// - Ngành: level thac-si hoặc tien-si. Ngành trong catalog/majors.json có aliases thì chương trình nguồn ghi
//   mã phụ được gộp vào mã chính (người duyệt quyết định mã chính, ghi trong majors.json). Khoa của ngành
//   theo nguồn; chương trình luôn theo khoa của ngành, nguồn ghi khoa khác thì ghi chú để duyệt.
// - Loại chương trình (type): UD, NC, CSAU (nghiên cứu chuyên sâu), TAUD (ứng dụng, tiếng Anh), STEM,
//   PT1, PT2, TAPT1 (phương thức 1, tiếng Anh). CTĐT trước khóa 2025 chưa chia hướng ghi CQ. Hai bản
//   cùng ngành, loại, khóa (ví dụ bản Sổ tay có mã môn và bản PDF 2022 chỉ có link) gộp làm một.
// - Khối: K01, K02 theo thứ tự nguồn; tên kèm chữ cái khối của nguồn. Khối cha có tín chỉ riêng ghi ở groups
//   của chương trình, name trùng group của khối con. CTĐT không ghi mã môn (bản 2022) nhập với blocks rỗng
//   và link PDF; không đoán mã theo tên môn.
// - Môn: mã mới thì tạo, levels là bậc có môn trong CTĐT, khoa theo tiền tố. Mã đã có trong danh mục:
//   cùng môn (tên khớp, hoặc môn sau đại học đã nhập) thì chỉ thêm bậc, giữ tên đang có; khác môn thì tạo
//   ID kèm năm khóa (<mã>-<năm>) như quy tắc mã dùng lại, ghi vào báo cáo để duyệt.
// - Chạy lại cho cùng kết quả. Giữ trường người duyệt ghi tay như scripts/import-ctdt.mjs.
// - Không nhập dữ liệu từ MyBK hay nguồn cá nhân, không nhập tên giảng viên.

import fs from 'node:fs';
import path from 'node:path';
import { officialPdfUrl } from './lib/repo.mjs';
import { PROGRAM_TYPES, BLOCK_KINDS, POSTGRAD_LEVELS, DEFAULT_LEVEL, courseLevels } from './lib/labels.mjs';
import { clean } from './import-research.mjs';
import { inferParts } from './import-seed.mjs';
import { slug, addSentence, ordered, writeKeepDate, readSite, vnDate, COURSE_ORDER, PROGRAM_ORDER, MAJOR_ORDER, KEPT_PROGRAM_FIELDS } from './import-ctdt.mjs';

const CODE_RE = /^[A-Z0-9_]{3,12}$/;
const MAJOR_RE = /^[0-9][0-9A-Za-z+]{3,31}$/;
const LEVEL_SLUG = { 'thac-si': 'THAC_SI', 'tien-si': 'TIEN_SI' };

// Loại chương trình theo cặp định hướng và biến thể của bộ dữ liệu.
export function sdhType(p) {
  const v = p.variant || null;
  const o = p.orientation || null;
  if (p.level === 'thac-si') {
    if (v === 'chuyen-sau') return 'CSAU';
    if (v === 'tieng-anh') return 'TAUD';
    if (v === 'tai-nang-stem') return 'STEM';
    if (v === 'tieu-chuan' || (!v && !o)) return 'CQ';
    if (!v && o === 'ung-dung') return 'UD';
    if (!v && o === 'nghien-cuu') return 'NC';
  }
  if (p.level === 'tien-si') {
    if (v === 'phuong-thuc-1') return 'PT1';
    if (v === 'phuong-thuc-2') return 'PT2';
    if (v === 'tieng-anh-phuong-thuc-1') return 'TAPT1';
    if (!v && !o) return 'CQ';
  }
  return null;
}

const TYPE_ORIENTATION = { UD: 'ung-dung', TAUD: 'ung-dung', NC: 'nghien-cuu', CSAU: 'nghien-cuu' };

// Vai trò khối của bộ dữ liệu sang BLOCK_KINDS: co-so là co-so-nganh của đại học; bat-buoc, tu-chon (bản
// 2022 theo kiểu cũ) không phải vai trò nên ghi khac.
const KIND_MAP = { 'co-so': 'co-so-nganh' };
export function sdhKind(k) {
  const x = KIND_MAP[k] || k;
  return BLOCK_KINDS[x] ? x : 'khac';
}

// Tên tiếng Anh khi nguồn ghi nhiều cách: ưu tiên bản có số phần khớp tên tiếng Việt ("phần 1" và
// "part 1"), bỏ bản bị cắt cuối, bỏ bản viết hoa toàn bộ khi có bản thường.
export function pickNameEn(r) {
  const name = clean(r.name);
  const variants = [...new Set([r.nameEn, ...(r.nameEnVariants || [])].map(clean).filter(Boolean))];
  if (variants.length <= 1) return variants[0] || null;
  const nums = (s) => (s.match(/[0-9]+/g) || []).join(',');
  let pool = variants.filter((x) => nums(x) === nums(name));
  if (!pool.length) pool = variants;
  pool = pool.filter((x) => !pool.some((y) => y !== x && y.length > x.length && y.toLowerCase().startsWith(x.toLowerCase())));
  const lower = pool.filter((x) => x !== x.toUpperCase());
  if (lower.length) pool = lower;
  const first = clean(r.nameEn);
  return pool.includes(first) ? first : pool[0];
}

// Phần của môn sau đại học: luận văn, luận án, đề án là project; tiểu luận, chuyên đề tiến sĩ là
// assignment; 0 tín chỉ (điều kiện, ngoại ngữ không tính tín chỉ) không đoán.
export function sdhParts(name, credits) {
  if (credits === 0) return [];
  const n = clean(name).toLowerCase();
  if (/^(luận văn|luận án|đề án)/.test(n)) return ['project'];
  if (/^(tiểu luận|chuyên đề tiến sĩ)/.test(n)) return ['assignment'];
  return inferParts(clean(name));
}

const sameName = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

export function readSdh(dir) {
  const r = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
  const m = path.basename(path.resolve(dir)).match(/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
  return { majors: r('majors.json'), programs: r('programs.json'), courses: r('courses.json'), accessed: m ? m[1] : null };
}

export function importSdh(data, outRoot, { date, faculties, log = () => {} }) {
  const site = readSite(outRoot);
  const pdfHosts = site.programPdfHosts || [];
  const handbookHosts = site.handbookHosts || [];
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

  const report = { coursesCreated: 0, coursesShared: [], collisions: [], majors: 0, majorsMerged: [], programsKept: 0, programsNew: 0, programsMerged: [], facultyNotes: [], skipped: [] };

  const readDir = (dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const out = new Map(readDir(coursesDir).map((c) => [c.id, c]));
  const existingPrograms = new Map(readDir(programsDir).map((p) => [p.code, p]));

  // ---------- Ngành ----------
  const oldMajors = fs.existsSync(majorsPath) ? JSON.parse(fs.readFileSync(majorsPath, 'utf8')) : { majors: [] };
  const majors = new Map(oldMajors.majors.map((m) => [m.code, m]));
  // Mã phụ trỏ về mã chính, theo aliases người duyệt ghi trong majors.json.
  const primaryOf = new Map();
  for (const m of majors.values()) for (const a of m.aliases || []) primaryOf.set(a, m.code);
  const resolve = (code) => primaryOf.get(code) || code;

  const srcMajors = new Map();
  for (const m of data.majors) {
    if (!POSTGRAD_LEVELS.includes(m.level) || !MAJOR_RE.test(m.major || '')) {
      report.skipped.push({ code: m.major, why: 'ngành thiếu bậc sau đại học hoặc mã không hợp lệ' });
      continue;
    }
    const code = resolve(m.major);
    if (code !== m.major) report.majorsMerged.push({ from: m.major, to: code });
    if (!srcMajors.has(code)) srcMajors.set(code, []);
    srcMajors.get(code).push(m);
  }
  const touchedMajors = new Set();
  for (const [code, list] of srcMajors) {
    // Bản ghi đúng mã chính đứng đầu, rồi bản ghi mã phụ.
    const own = list.filter((m) => m.major === code);
    const src = [...own, ...list.filter((m) => m.major !== code)];
    const pick = (f) => src.map(f).find(Boolean);
    const cur = majors.get(code) || {};
    if (cur.level && cur.level !== src[0].level) {
      report.skipped.push({ code, why: `mã ngành đã có ở bậc ${cur.level}` });
      continue;
    }
    const faculty = pick((m) => (facKeys.has(m.faculty) ? m.faculty : null)) || cur.faculty || 'unknown';
    const notes = [...new Set(src.flatMap((m) => m.notes || []).map(clean))];
    majors.set(code, {
      code,
      name: cur.name || clean(pick((m) => m.majorName)),
      nameEn: cur.nameEn || clean(pick((m) => m.nameEn)) || undefined,
      faculty,
      level: src[0].level,
      programTypes: cur.programTypes || [],
      aliases: cur.aliases,
      handbookUrl: cur.handbookUrl || hbUrl(pick((m) => (m.major === code ? m.handbookUrl : null))) || undefined,
      note: cur.note || (notes.length ? notes.join(' ') : undefined),
    });
    touchedMajors.add(code);
  }
  report.majors = touchedMajors.size;

  // ---------- Môn ----------
  // Năm khóa sớm nhất có mã trong nguồn, cho ID kèm năm khi trùng mã với môn khác.
  const firstYear = new Map();
  for (const p of data.programs) {
    for (const b of p.blocks || []) for (const code of b.courses || []) {
      const y = Number(p.year);
      if (!firstYear.has(code) || y < firstYear.get(code)) firstYear.set(code, y);
    }
  }
  const idOf = new Map();
  for (const [code, r] of Object.entries(data.courses).sort(([a], [b]) => a.localeCompare(b))) {
    if (!CODE_RE.test(code)) {
      report.skipped.push({ code, why: 'mã môn không hợp lệ' });
      continue;
    }
    const fresh = clean(r.name);
    if (!fresh) {
      report.skipped.push({ code, why: 'nguồn không có tên môn' });
      continue;
    }
    const levels = POSTGRAD_LEVELS.filter((l) => (r.levels || [r.level]).includes(l));
    if (!levels.length) {
      report.skipped.push({ code, why: 'môn không có bậc thạc sĩ hay tiến sĩ' });
      continue;
    }
    let id = code;
    const cur = out.get(code);
    if (cur) {
      const ours = courseLevels(cur).some((l) => POSTGRAD_LEVELS.includes(l));
      if (!ours && !sameName(cur.name, fresh)) {
        // Cùng mã, khác môn: ID kèm năm khóa.
        id = `${code}-${firstYear.get(code) || String(date).slice(0, 4)}`;
        report.collisions.push({ code, id, existing: cur.name, source: fresh });
      } else if (!ours) report.coursesShared.push(code);
    }
    idOf.set(code, id);
    const c = out.get(id);
    if (c) {
      // Môn đã có: giữ tên và ghi chú, thêm bậc, điền tín chỉ còn trống.
      const lv = new Set([...courseLevels(c), ...levels]);
      c.levels = [DEFAULT_LEVEL, ...POSTGRAD_LEVELS].filter((l) => lv.has(l));
      if (c.levels.length === 1 && c.levels[0] === DEFAULT_LEVEL) delete c.levels;
      if (c.credits == null && Number.isInteger(r.credits)) c.credits = r.credits;
      continue;
    }
    const rule = ruleFor(code);
    const faculty = rule && facKeys.has(rule.faculty) ? rule.faculty : 'unknown';
    const fromHandbook = /\/study\/handbook\//.test(r.sourceUrl || '');
    let note = fromHandbook
      ? `Nhập từ CTĐT sau đại học chính thức (Sổ tay HCMUT, truy cập ${accessed}).`
      : `Nhập từ CTĐT sau đại học chính thức (PDF của trường, truy cập ${accessed}).`;
    const others = [...new Set((r.nameVariants || []).map(clean))].filter((x) => x && x !== fresh);
    if (others.length) note = addSentence(note, `Nguồn còn ghi tên: ${others.join('; ')}.`);
    if (id !== code) note = addSentence(note, `Mã ${code} đã dùng cho môn khác trong danh mục nên môn này có ID kèm năm khóa. Chờ người duyệt xác nhận.`);
    const nameEn = pickNameEn(r);
    out.set(id, {
      $schema: '../../schema/course.schema.json',
      id,
      code,
      name: fresh,
      nameEn: nameEn || undefined,
      credits: Number.isInteger(r.credits) ? r.credits : undefined,
      faculty,
      levels,
      aliases: [],
      status: 'active',
      programs: [],
      parts: sdhParts(fresh, r.credits),
      related: [],
      note,
      updated: date,
    });
    report.coursesCreated++;
  }

  // ---------- Chương trình ----------
  const identity = (major, type, year) => `${major}|${type}|${year}|`;
  const byIdentity = new Map();
  for (const p of existingPrograms.values()) if (p.major && p.type && p.year) byIdentity.set(`${p.major}|${p.type}|${p.year}|${p.track || ''}`, p.code);
  const taken = new Set(existingPrograms.keys());

  // Gom bản nguồn theo ngành (mã chính), loại, khóa.
  const groups = new Map();
  for (const p of [...data.programs].sort((a, b) => a.id.localeCompare(b.id))) {
    const major = majors.get(resolve(p.major));
    const type = sdhType(p);
    if (!POSTGRAD_LEVELS.includes(p.level) || !major || !touchedMajors.has(major.code) || !type || !/^[0-9]{4}$/.test(String(p.year))) {
      report.skipped.push({ code: p.id, why: 'chương trình thiếu ngành, loại hoặc khóa hợp lệ' });
      continue;
    }
    const id = identity(major.code, type, String(p.year));
    if (!groups.has(id)) groups.set(id, { major, type, year: String(p.year), src: [] });
    groups.get(id).src.push(p);
  }
  const courseCount = (p) => (p.blocks || []).reduce((n, b) => n + (b.courses || []).length, 0);

  const written = new Map();
  for (const [id, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const src = g.src.slice().sort((a, b) => courseCount(b) - courseCount(a) || a.id.localeCompare(b.id));
    const p = src[0];
    if (src.length > 1) report.programsMerged.push({ into: p.id, from: src.slice(1).map((x) => x.id) });
    const { major, type, year } = g;
    let code = byIdentity.get(id);
    if (code) report.programsKept++;
    else {
      const base = [slug(major.faculty), LEVEL_SLUG[major.level], slug(major.name)];
      const tail = [year, type !== 'CQ' ? type : null].filter(Boolean);
      code = [...base, ...tail].join('_');
      if (taken.has(code)) code = [...base, slug(major.code), ...tail].join('_');
      for (let i = 2; taken.has(code); i++) code = `${[...base, slug(major.code), ...tail].join('_')}_${i}`;
      taken.add(code);
      report.programsNew++;
    }
    const prev = existingPrograms.get(code) || {};
    const kept = {};
    for (const k of KEPT_PROGRAM_FIELDS) if (prev[k] !== undefined) kept[k] = prev[k];

    const groupName = (gid) => {
      const gg = (p.groups || []).find((x) => x.id === gid);
      return gg ? `${gid}. ${clean(gg.name)}` : null;
    };
    const blocks = (p.blocks || []).map((b, i) => {
      const ids = [];
      for (const cc of b.courses || []) {
        const cid = idOf.get(cc);
        if (!cid || !out.has(cid)) {
          report.skipped.push({ code: cc, why: `môn trong ${p.id} không có trong courses.json` });
          continue;
        }
        if (!ids.includes(cid)) ids.push(cid);
      }
      const nm = clean(b.name) || 'Khối';
      const sid = clean(b.id);
      const name = !sid || nm.startsWith(sid) ? nm : `${sid}. ${nm}`;
      const group = b.group ? groupName(b.group) : null;
      return {
        id: `K${String(i + 1).padStart(2, '0')}`,
        name,
        ...(group ? { group } : {}),
        kind: sdhKind(b.kind),
        required: b.required === true,
        ...(typeof b.required === 'boolean' ? {} : { requiredUnknown: true }),
        ...(Number.isInteger(b.creditsNeed) ? { creditsNeed: b.creditsNeed } : {}),
        courses: ids,
      };
    });
    const used = new Set(blocks.map((b) => b.group).filter(Boolean));
    const pgroups = (p.groups || [])
      .map((x) => ({ name: groupName(x.id), ...(Number.isInteger(x.creditsNeed) ? { creditsNeed: x.creditsNeed } : {}) }))
      .filter((x) => used.has(x.name));

    let note;
    // Bản gộp có môn thì bỏ ghi chú "không ghi mã môn" của bản chỉ có link.
    for (const x of src) if (x.note && (courseCount(x) || !courseCount(p))) note = addSentence(note, clean(x.note));
    const srcFac = [...new Set(src.map((x) => x.faculty).filter((f) => f && f !== major.faculty))];
    if (srcFac.length) {
      note = addSentence(note, `Nguồn ghi khoa ${srcFac.join(', ')} cho chương trình này; thư viện xếp theo khoa của ngành (${major.faculty}). Chờ người duyệt xác nhận.`);
      report.facultyNotes.push({ code, from: srcFac, to: major.faculty });
    }
    if (src.length > 1) note = addSentence(note, 'Gộp hai bản nguồn của cùng ngành, loại, khóa: danh sách môn theo bản có mã môn, link PDF theo bản còn lại.');
    const srcCodes = [...new Set(src.map((x) => x.major).filter((x) => x !== major.code))];
    if (srcCodes.length) note = addSentence(note, `Nguồn ghi mã ngành ${srcCodes.join(', ')}; thư viện dùng mã ${major.code}. Chờ xác nhận.`);
    const pick = (f) => src.map(f).find(Boolean) || null;
    const ctdtUrl = kept.ctdtUrl || pdfUrl(pick((x) => pdfUrl(x.ctdtUrl)));
    const planUrl = kept.planUrl || pdfUrl(pick((x) => pdfUrl(x.planUrl)));
    const handbookUrl = hbUrl(pick((x) => hbUrl(x.handbookUrl)));
    // Bản gộp đã có PDF từ bản kia: bỏ câu "không có PDF CTĐT" của bản Sổ tay.
    if (ctdtUrl && note) note = note.replace(/[^.]*không có PDF CTĐT[^.]*\.\s*/g, '').trim() || undefined;
    const orientation = p.orientation || TYPE_ORIENTATION[type];
    const rec = {
      $schema: '../../schema/program.schema.json',
      code,
      name: major.name,
      nameEn: major.nameEn,
      faculty: major.faculty,
      year,
      major: major.code,
      type,
      level: major.level,
      orientation: orientation === 'ung-dung' || orientation === 'nghien-cuu' ? orientation : undefined,
      degree: major.level,
      totalCredits: Number.isInteger(p.totalCredits) && p.totalCredits > 0 ? p.totalCredits : undefined,
      variant: type !== 'CQ' ? PROGRAM_TYPES[type].vi : undefined,
      listed: kept.listed,
      note,
      reviewNote: kept.reviewNote,
      // Nguồn chính: Sổ tay cho bản chỉ có trên Sổ tay, PDF CTĐT cho bản lấy từ PDF.
      source: (p.source === 'so-tay' ? handbookUrl : null) || ctdtUrl || planUrl || handbookUrl || hbUrl(p.sourceUrl) || undefined,
      ctdtUrl: ctdtUrl || undefined,
      planUrl: planUrl || undefined,
      handbookUrl: handbookUrl || undefined,
      groups: pgroups.length ? pgroups : undefined,
      blocks,
      updated: date,
    };
    written.set(code, ordered(rec, PROGRAM_ORDER));
  }

  // Loại chương trình của ngành theo chương trình vừa ghi (và chương trình cũ còn lại của ngành).
  const typeOrder = Object.keys(PROGRAM_TYPES);
  for (const code of touchedMajors) {
    const m = majors.get(code);
    const types = new Set(m.programTypes || []);
    for (const p of [...written.values(), ...existingPrograms.values()]) if (p.major === code && p.type) types.add(p.type);
    m.programTypes = typeOrder.filter((t) => types.has(t));
    majors.set(code, ordered(m, MAJOR_ORDER));
  }

  // course.programs: bỏ mục của các chương trình vừa ghi, thêm lại theo khối.
  const inBlocks = new Map();
  for (const pr of written.values()) {
    for (const b of pr.blocks) for (const cid of b.courses) {
      if (!inBlocks.has(cid)) inBlocks.set(cid, []);
      inBlocks.get(cid).push({ program: pr.code, block: b.id, required: b.required });
    }
  }
  for (const c of out.values()) {
    const others = (c.programs || []).filter((x) => !written.has(x.program));
    const ours = (inBlocks.get(c.id) || []).sort((a, b) => a.program.localeCompare(b.program) || a.block.localeCompare(b.block));
    if (!ours.length && others.length === (c.programs || []).length) continue;
    // Mục sau đại học đứng trước: scripts/import-ctdt.mjs giữ mục của script khác ở đầu và thêm mục đại học
    // ở cuối, nên chạy lại script nào cũng cho cùng thứ tự.
    c.programs = [...ours, ...others];
  }

  // ---------- Ghi file ----------
  for (const c of out.values()) writeKeepDate(path.join(coursesDir, `${c.id}.json`), ordered(c, COURSE_ORDER), date);
  for (const pr of written.values()) writeKeepDate(path.join(programsDir, `${pr.code}.json`), pr, date);
  writeKeepDate(
    majorsPath,
    { $schema: '../schema/major.schema.json', updated: date, majors: [...majors.values()].sort((a, b) => a.code.localeCompare(b.code)) },
    date,
  );

  report.courses = idOf.size;
  report.programs = written.size;
  log(
    `Sau đại học: ${report.courses} môn (tạo ${report.coursesCreated}, dùng chung với môn đã có ${report.coursesShared.length}, trùng mã khác môn ${report.collisions.length}); ` +
      `${report.majors} ngành (gộp mã ${report.majorsMerged.length}); ${report.programs} chương trình (giữ mã ${report.programsKept}, mã mới ${report.programsNew}, gộp ${report.programsMerged.length}).`,
  );
  for (const x of report.majorsMerged) log(`Gộp mã ngành ${x.from} vào ${x.to}`);
  for (const x of report.collisions) log(`Trùng mã ${x.code}: danh mục có "${x.existing}", nguồn ghi "${x.source}"; tạo ${x.id}`);
  for (const x of report.programsMerged) log(`Gộp ${x.from.join(', ')} vào ${x.into}`);
  for (const x of report.facultyNotes) log(`Chương trình ${x.code}: nguồn ghi khoa ${x.from.join(', ')}, xếp theo khoa ngành ${x.to}`);
  for (const x of report.skipped) log(`Bỏ qua ${x.code}: ${x.why}`);
  return report;
}
