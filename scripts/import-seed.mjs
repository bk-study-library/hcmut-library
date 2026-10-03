#!/usr/bin/env node
// Nhập một chương trình đào tạo (seed JSON) vào danh mục.
//
//   node scripts/import-seed.mjs --seed seed.json --out . [--date 2026-10-03]
//
// Seed có dạng:
//   { source, program: {code, name, faculty, year},
//     blocks: [{id, name, group, required, creditsNeed}],
//     courses: [{code, name, credits, block}],
//     extraCourses: [{code, name, credits, note}]   (môn ngoài CTĐT, không bắt buộc)
//     equiv: [{code, note}] }                         ("Tương đương X", "Trùng môn học X")
//
// Quy tắc (xem docs/catalog.md):
// - ID = mã môn lúc tạo. Môn đã có (khớp id, mã hiện tại hoặc mã cũ) thì giữ ID,
//   chỉ cập nhật mục programs; tên khác thì in ra để người duyệt quyết định đổi tên,
//   không tự đổi.
// - Khoa lấy theo tiền tố đã xác minh trong catalog/faculties.json; không khớp thì "unknown".
// - Seed không được có điểm: gặp trường score, letter, gpa... là dừng.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT } from './lib/repo.mjs';

const FORBIDDEN = ['score', 'letter', 'gpa', 'gpa4', 'gpa10', 'grade', 'grades', 'creditsDone', 'passed', 'passedCount', 'result'];

function findForbidden(v, trail = '') {
  if (Array.isArray(v)) {
    for (const [i, x] of v.entries()) {
      const r = findForbidden(x, `${trail}[${i}]`);
      if (r) return r;
    }
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN.includes(k)) return `${trail}.${k}`;
      const r = findForbidden(x, `${trail}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

export function inferParts(name) {
  const n = name.toLowerCase();
  if (n.includes('ngoài trường')) return [];
  if (n.includes('thí nghiệm') || n.startsWith('thực tập')) return ['lab'];
  if (n.startsWith('đồ án')) return ['project'];
  return ['theory'];
}

const NO_PARTS_BLOCKS = new Set(['CC_GDTC', 'CC_GDQP', 'DIEUKIEN_TOTNGHIEP']);

function norm(s) {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function importSeed(seed, outRoot, { date, faculties, log = () => {} }) {
  const bad = findForbidden(seed);
  if (bad) throw new Error(`seed có dữ liệu điểm (${bad}); xóa trước khi nhập`);

  const facKeyFor = (code) => {
    for (const h of faculties.prefixes) if (h.verified && new RegExp(h.pattern).test(code)) return h.faculty;
    return 'unknown';
  };
  const coursesDir = path.join(outRoot, 'catalog', 'courses');
  const programsDir = path.join(outRoot, 'catalog', 'programs');
  fs.mkdirSync(coursesDir, { recursive: true });
  fs.mkdirSync(programsDir, { recursive: true });

  // Môn đã có
  const existing = new Map();
  for (const f of fs.readdirSync(coursesDir).filter((x) => x.endsWith('.json'))) {
    const c = JSON.parse(fs.readFileSync(path.join(coursesDir, f), 'utf8'));
    existing.set(c.id, c);
  }
  const byCode = (code) => {
    for (const c of existing.values()) {
      if (c.id === code || c.code === code || (c.aliases || []).some((a) => a.code === code)) return c;
    }
    return null;
  };

  const prog = seed.program;
  const progFaculty = faculties.faculties.find((f) => norm(f.name.vi) === norm(prog.faculty || ''))?.key || 'unknown';
  const blocksById = new Map((seed.blocks || []).map((b) => [b.id, b]));
  const touched = new Map();
  const report = { created: [], updated: [], nameDiffers: [] };

  const upsert = (sc, blockId) => {
    const block = blockId != null ? blocksById.get(blockId) : null;
    let c = byCode(sc.code) || touched.get(sc.code);
    if (!c) {
      c = {
        $schema: '../../schema/course.schema.json',
        id: sc.code,
        code: sc.code,
        name: sc.name,
        credits: sc.credits,
        faculty: facKeyFor(sc.code),
        aliases: [],
        status: 'active',
        programs: [],
        parts: (block && NO_PARTS_BLOCKS.has(block.group)) || facKeyFor(sc.code) === 'PE' ? [] : inferParts(sc.name),
        related: [],
        updated: date,
      };
      if (sc.note) c.note = sc.note;
      report.created.push(c.id);
    } else {
      if (norm(c.name) !== norm(sc.name)) report.nameDiffers.push({ id: c.id, catalog: c.name, seed: sc.name });
      if (!report.created.includes(c.id)) report.updated.push(c.id);
    }
    if (block) {
      c.programs = (c.programs || []).filter((p) => p.program !== prog.code);
      c.programs.push({ program: prog.code, block: block.id, required: !!block.required });
    }
    c.updated = date;
    touched.set(c.id, c);
    existing.set(c.id, c);
    return c;
  };

  for (const sc of seed.courses) upsert(sc, sc.block);
  for (const sc of seed.extraCourses || []) upsert(sc, null);

  // Liên kết môn: tương đương / trùng môn theo MyBK, và cặp lý thuyết - thí nghiệm theo tên.
  const link = (a, b) => {
    if (!a || !b || a.id === b.id) return;
    if (!a.related.includes(b.id)) a.related.push(b.id);
    if (!b.related.includes(a.id)) b.related.push(a.id);
    touched.set(a.id, a);
    touched.set(b.id, b);
  };
  for (const e of seed.equiv || []) {
    const m = e.note.match(/(?:Tương đương|Trùng môn học)\s+([A-Z0-9_]{3,12})/u);
    if (m) link(byCode(e.code), byCode(m[1]));
  }
  const all = [...existing.values()];
  const byName = new Map(all.map((c) => [norm(c.name), c]));
  for (const c of all) {
    const n = norm(c.name);
    let base = null;
    if (n.startsWith('thí nghiệm ')) base = n.slice('thí nghiệm '.length);
    else if (n.endsWith(' (thí nghiệm)')) base = n.slice(0, -' (thí nghiệm)'.length);
    if (base && byName.has(base)) link(byName.get(base), c);
  }

  for (const c of touched.values()) {
    c.related.sort();
    fs.writeFileSync(path.join(coursesDir, `${c.id}.json`), JSON.stringify(c, null, 2) + '\n');
  }

  // File chương trình
  const blockCourses = new Map();
  for (const sc of seed.courses) {
    const c = byCode(sc.code);
    if (!blockCourses.has(sc.block)) blockCourses.set(sc.block, []);
    if (!blockCourses.get(sc.block).includes(c.id)) blockCourses.get(sc.block).push(c.id);
  }
  const blocks = (seed.blocks || [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((b) => {
      const out = { id: b.id, name: b.name };
      if (b.group) out.group = b.group;
      out.required = !!b.required;
      if (b.creditsNeed != null) out.creditsNeed = b.creditsNeed;
      out.courses = (blockCourses.get(b.id) || []).slice().sort();
      return out;
    });
  for (const id of blockCourses.keys()) {
    if (!blocksById.has(id)) throw new Error(`seed thiếu thông tin khối ${id}`);
  }
  const program = {
    $schema: '../../schema/program.schema.json',
    code: prog.code,
    name: prog.name,
    faculty: progFaculty,
    year: String(prog.year),
    ...(seed.source ? { source: seed.source } : {}),
    blocks,
    updated: date,
  };
  fs.writeFileSync(path.join(programsDir, `${prog.code}.json`), JSON.stringify(program, null, 2) + '\n');

  log(`Tạo ${report.created.length} môn, cập nhật ${report.updated.length} môn, chương trình ${prog.code}.`);
  for (const d of report.nameDiffers) log(`Tên khác (có thể đã đổi tên, kiểm rồi sửa tay): ${d.id} "${d.catalog}" / seed "${d.seed}"`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = { out: TOOL_ROOT, date: new Date().toISOString().slice(0, 10) };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') a.seed = argv[++i];
    else if (argv[i] === '--out') a.out = path.resolve(argv[++i]);
    else if (argv[i] === '--date') a.date = argv[++i];
    else throw new Error(`tham số lạ: ${argv[i]}`);
  }
  if (!a.seed) {
    console.error('Cần --seed <file>.');
    process.exit(2);
  }
  const facPath = fs.existsSync(path.join(a.out, 'catalog', 'faculties.json'))
    ? path.join(a.out, 'catalog', 'faculties.json')
    : path.join(TOOL_ROOT, 'catalog', 'faculties.json');
  const faculties = JSON.parse(fs.readFileSync(facPath, 'utf8'));
  const seed = JSON.parse(fs.readFileSync(a.seed, 'utf8'));
  importSeed(seed, a.out, { date: a.date, faculties, log: (s) => console.log(s) });
}
