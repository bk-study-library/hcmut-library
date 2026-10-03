// Đọc danh mục và tài liệu, kiểm tra toàn bộ, dựng index.json.
// Không phụ thuộc thư viện ngoài: chỉ dùng node:fs, node:path, node:crypto.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validate } from './schema.mjs';
import { loadPolicy, missingKeys } from './policy.mjs';

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'site']);

function loadSchemas() {
  const s = (n) => JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'schema', `${n}.schema.json`), 'utf8'));
  return { course: s('course'), faculty: s('faculty'), program: s('program'), item: s('item') };
}

function rel(root, p) {
  return path.relative(root, p).split(path.sep).join('/');
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function fmtSize(n) {
  return n >= 1024 * 1024 ? `${+(n / 1024 / 1024).toFixed(1)} MB` : `${+(n / 1024).toFixed(1)} KB`;
}

// ---------- Quét thông tin cá nhân ----------

// MSSV Bách Khoa: 7 chữ số, hai số đầu là khóa (ví dụ 19..., 21...).
// Số điện thoại Việt Nam: 0 hoặc +84, rồi 9 chữ số (cho phép cách bằng dấu cách, chấm, gạch).
export const PII_PATTERNS = [
  { code: 'PII_STUDENT_ID', label: 'MSSV 7 chữ số', re: /(?<![\p{L}\p{N}.,])[12]\d{6}(?![\p{L}\p{N}])/gu },
  { code: 'PII_EMAIL', label: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { code: 'PII_PHONE', label: 'số điện thoại', re: /(?<![\p{N}.,])(?:\+84[ .-]?|0)[235789]\d(?:[ .-]?\d){7}(?!\p{N})/gu },
];

// Dòng có chú thích "pii-ok" được bỏ qua (dùng khi chắc chắn không phải thông tin cá nhân).
export function scanText(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('pii-ok')) return;
    for (const p of PII_PATTERNS) {
      for (const m of line.matchAll(p.re)) hits.push({ code: p.code, label: p.label, line: i + 1, match: m[0] });
    }
  });
  return hits;
}

// Trong JSON chỉ quét giá trị chuỗi, bỏ url và sha256 (URL hay có dãy số dài).
function jsonStrings(v, key, out) {
  if (typeof v === 'string') {
    if (key !== 'url' && key !== 'sha256' && key !== '$schema') out.push(v);
  } else if (Array.isArray(v)) v.forEach((x) => jsonStrings(x, key, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) jsonStrings(x, k, out);
  return out;
}

// ---------- Đọc repo ----------

export function loadRepo(root) {
  const errors = [];
  const warnings = [];
  const err = (code, file, msg) => errors.push({ code, file, msg });
  const warn = (code, file, msg) => warnings.push({ code, file, msg });
  const schemas = loadSchemas();

  const readJson = (p) => {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      err('JSON', rel(root, p), `không đọc được JSON: ${e.message}`);
      return null;
    }
  };
  const check = (schema, data, p) => {
    for (const m of validate(schema, data)) err('SCHEMA', rel(root, p), m);
  };

  // Chính sách: đọc và parse một lần. Thiếu khóa thì báo SCHEMA và dùng bản của công cụ cho giới hạn.
  const policyPath = path.join(root, 'catalog', 'policy.json');
  const localPolicy = fs.existsSync(policyPath) ? readJson(policyPath) : null;
  if (localPolicy) {
    const miss = missingKeys(localPolicy);
    if (miss.length) err('SCHEMA', 'catalog/policy.json', `thiếu khóa: ${miss.join(', ')}`);
  }
  const policy = localPolicy && !missingKeys(localPolicy).length ? localPolicy : loadPolicy(TOOL_ROOT);
  const LIMITS = {
    maxFileBytes: policy.maxFileBytes,
    maxMdInGitBytes: policy.maxMdInGitBytes,
    allowedExt: Object.keys(policy.extensions),
    quizExt: policy.quizExtensions,
    selfMadeLicenses: policy.selfMadeLicenses,
  };

  // Khoa
  const facPath = path.join(root, 'catalog', 'faculties.json');
  let faculties = { faculties: [], prefixes: [] };
  if (!fs.existsSync(facPath)) err('MISSING', 'catalog/faculties.json', 'thiếu file khoa');
  else {
    const f = readJson(facPath);
    if (f) {
      check(schemas.faculty, f, facPath);
      faculties = f;
    }
  }
  const facultyKeys = new Set(faculties.faculties.map((f) => f.key));
  for (const p of faculties.prefixes) {
    if (!facultyKeys.has(p.faculty)) err('FACULTY_MISSING', 'catalog/faculties.json', `tiền tố ${p.pattern} trỏ tới khoa lạ "${p.faculty}"`);
    try {
      new RegExp(p.pattern);
    } catch {
      err('SCHEMA', 'catalog/faculties.json', `regex sai: ${p.pattern}`);
    }
  }

  // Đối tác
  const partnersPath = path.join(root, 'catalog', 'partners.json');
  let partners = [];
  if (fs.existsSync(partnersPath)) {
    const p = readJson(partnersPath);
    if (p && !Array.isArray(p.partners)) err('SCHEMA', 'catalog/partners.json', 'cần {"partners": [...]}');
    else if (p) {
      partners = p.partners;
      for (const x of partners) {
        if (!/^[a-z0-9-]+$/.test(x.name || '') || !x.title || !/^https:\/\//.test(x.url || '')) {
          err('SCHEMA', 'catalog/partners.json', `đối tác cần name (a-z0-9-), title, url https: ${JSON.stringify(x)}`);
        }
      }
    }
  }
  const partnerNames = new Set(partners.map((p) => p.name));

  // Chính sách: loại tài liệu đang nhận. Không có file thì nhận mọi loại trong schema.
  let openTypes = null;
  if (localPolicy) {
    if (!Array.isArray(localPolicy.openTypes)) err('SCHEMA', 'catalog/policy.json', 'openTypes phải là mảng');
    else {
      openTypes = new Set(localPolicy.openTypes);
      for (const t of localPolicy.openTypes) {
        if (!schemas.item.properties.type.enum.includes(t)) err('SCHEMA', 'catalog/policy.json', `loại lạ trong openTypes: ${t}`);
      }
    }
  }

  // Môn
  const courses = new Map();
  for (const p of listJson(path.join(root, 'catalog', 'courses'))) {
    const c = readJson(p);
    if (!c) continue;
    check(schemas.course, c, p);
    const fileId = path.basename(p, '.json');
    if (c.id !== fileId) err('ID_FILE', rel(root, p), `id "${c.id}" khác tên file "${fileId}"`);
    if (courses.has(c.id)) err('DUP_ID', rel(root, p), `trùng id ${c.id}`);
    courses.set(c.id, { ...c, _file: rel(root, p) });
  }

  // Chương trình
  const programs = new Map();
  for (const p of listJson(path.join(root, 'catalog', 'programs'))) {
    const pr = readJson(p);
    if (!pr) continue;
    check(schemas.program, pr, p);
    const fileId = path.basename(p, '.json');
    if (pr.code !== fileId) err('ID_FILE', rel(root, p), `code "${pr.code}" khác tên file "${fileId}"`);
    programs.set(pr.code, { ...pr, _file: rel(root, p) });
  }

  // Tham chiếu giữa các môn
  // Hai môn chỉ được dùng chung mã hiện tại khi trường dùng lại mã cho môn khác,
  // và môn sau có ID kèm năm khóa (ví dụ GE4169 và GE4169-2024).
  const codeOwner = new Map();
  const suffixed = (id) => /-[0-9]{4}$/.test(id);
  for (const c of courses.values()) {
    const prev = codeOwner.get(c.code);
    if (prev && !(suffixed(prev) || suffixed(c.id))) err('DUP_CODE', c._file, `mã ${c.code} đang dùng cho cả ${prev} và ${c.id}`);
    if (!prev || suffixed(prev)) codeOwner.set(c.code, c.id);
  }
  for (const c of courses.values()) {
    const f = c._file;
    if (c.faculty && !facultyKeys.has(c.faculty)) err('FACULTY_MISSING', f, `khoa "${c.faculty}" không có trong faculties.json`);
    for (const h of faculties.prefixes) {
      if (h.verified && new RegExp(h.pattern).test(c.code) && h.faculty !== c.faculty) {
        warn('FACULTY_PREFIX', f, `mã ${c.code} khớp tiền tố ${h.pattern} của khoa ${h.faculty} nhưng ghi khoa ${c.faculty}`);
      }
    }
    for (const a of c.aliases || []) {
      const owner = codeOwner.get(a.code);
      // Mã cũ của môn đã ngừng, khi môn đó ghi replacedBy là môn này, thì hợp lệ.
      const retiredInto = owner && courses.get(owner).status === 'retired' && courses.get(owner).replacedBy === c.id;
      if (owner && owner !== c.id && !retiredInto && owner.replace(/-[0-9]{4}$/, '') !== c.id.replace(/-[0-9]{4}$/, '')) warn('ALIAS_CONFLICT', f, `mã cũ ${a.code} đang là mã hiện tại của ${owner}`);
    }
    for (const r of c.related || []) {
      if (!courses.has(r)) err('REF_RELATED', f, `related trỏ tới môn không có: ${r}`);
      else if (r === c.id) err('REF_RELATED', f, 'related trỏ tới chính nó');
      else if (!(courses.get(r).related || []).includes(c.id)) warn('RELATED_ONE_WAY', f, `${c.id} liên kết ${r} nhưng ${r} chưa liên kết lại`);
    }
    if (c.replacedBy) {
      if (!courses.has(c.replacedBy)) err('REF_REPLACED_BY', f, `replacedBy trỏ tới môn không có: ${c.replacedBy}`);
      else if (!(courses.get(c.replacedBy).replaces || []).includes(c.id)) warn('REPLACE_ONE_WAY', f, `${c.replacedBy} chưa ghi replaces: ${c.id}`);
      if (c.status !== 'retired') err('REPLACED_ACTIVE', f, 'có replacedBy thì status phải là retired');
    }
    for (const r of c.replaces || []) {
      if (!courses.has(r)) err('REF_REPLACES', f, `replaces trỏ tới môn không có: ${r}`);
    }
    for (const pg of c.programs || []) {
      const pr = programs.get(pg.program);
      if (!pr) {
        err('REF_PROGRAM', f, `chương trình ${pg.program} không có trong catalog/programs`);
        continue;
      }
      const b = pr.blocks.find((x) => x.id === pg.block);
      if (!b) err('REF_PROGRAM', f, `chương trình ${pg.program} không có khối ${pg.block}`);
      else if (!b.courses.includes(c.id)) err('PROGRAM_MISMATCH', f, `khối ${pg.block} của ${pg.program} không liệt kê ${c.id}`);
    }
  }
  for (const pr of programs.values()) {
    if (!facultyKeys.has(pr.faculty)) err('FACULTY_MISSING', pr._file, `khoa "${pr.faculty}" không có trong faculties.json`);
    for (const b of pr.blocks) {
      for (const id of b.courses) {
        const c = courses.get(id);
        if (!c) err('REF_PROGRAM_COURSE', pr._file, `khối ${b.id} có môn không tồn tại: ${id}`);
        else if (!(c.programs || []).some((x) => x.program === pr.code && x.block === b.id)) {
          err('PROGRAM_MISMATCH', pr._file, `môn ${id} không ghi khối ${b.id} của ${pr.code}`);
        }
      }
    }
  }

  // Tài liệu
  const items = [];
  const coursesDir = path.join(root, 'courses');
  const shaSeen = new Map();
  if (fs.existsSync(coursesDir)) {
    for (const dirName of fs.readdirSync(coursesDir).sort()) {
      const cdir = path.join(coursesDir, dirName);
      if (!fs.statSync(cdir).isDirectory()) {
        err('LAYOUT', rel(root, cdir), 'trong courses/ chỉ có thư mục môn');
        continue;
      }
      if (!courses.has(dirName)) err('COURSE_DIR_ORPHAN', rel(root, cdir), `thư mục ${dirName} không có môn tương ứng trong catalog/courses`);
      for (const p of listJson(path.join(cdir, 'items'))) {
        const it = readJson(p);
        if (!it) continue;
        const f = rel(root, p);
        check(schemas.item, it, p);
        const fileId = path.basename(p, '.json');
        if (it.id !== fileId) err('ID_FILE', f, `id "${it.id}" khác tên file "${fileId}"`);
        if (it.course !== dirName) err('ITEM_COURSE', f, `course "${it.course}" khác thư mục ${dirName}`);
        if (!courses.has(it.course)) err('ITEM_COURSE', f, `môn ${it.course} không có trong danh mục`);

        if (openTypes && !it.removed && !openTypes.has(it.type)) {
          err('ITEM_TYPE_CLOSED', f, `loại ${it.type} chưa mở nhận (catalog/policy.json)`);
        }
        if (it.updated && it.added && it.updated < it.added) err('ITEM_UPDATED', f, `updated ${it.updated} trước added ${it.added}`);
        const origin = it.origin || '';
        if (origin.startsWith('partner:') && !partnerNames.has(origin.slice(8))) {
          err('PARTNER_UNKNOWN', f, `đối tác "${origin.slice(8)}" chưa có trong catalog/partners.json`);
        }
        if (it.type === 'book-ref') {
          // Sách tham khảo chỉ ghi tên: có book, không có file hay url.
          if (!it.removed && !it.book) err('ITEM_BOOK', f, 'book-ref cần trường book');
          if (it.url) err('ITEM_BOOK', f, 'book-ref không có url');
          if (it.files && it.files.length) err('ITEM_BOOK', f, 'book-ref không có files');
          if (origin === 'link') err('ITEM_BOOK', f, 'origin link chỉ dùng cho type link');
        } else if (it.type === 'link') {
          if (!it.url) err('ITEM_LINK', f, 'link cần trường url');
          if (it.files && it.files.length) err('ITEM_LINK', f, 'link không có files');
          if (origin === 'self-made') err('ITEM_LINK', f, 'link có origin là link hoặc partner:<tên>');
        } else {
          if (it.url) err('ITEM_FILES', f, 'chỉ type link mới có url; file dùng files[].url');
          if (origin === 'link') err('ITEM_FILES', f, 'origin link chỉ dùng cho type link');
          if (!it.removed && !(it.files && it.files.length)) err('ITEM_FILES', f, 'cần ít nhất một file');
        }
        if (it.book && it.type !== 'book-ref') err('ITEM_BOOK', f, 'chỉ type book-ref mới có book');
        if (origin === 'self-made' && !LIMITS.selfMadeLicenses.includes(it.license)) {
          err('ITEM_LICENSE', f, `tài liệu tự soạn dùng ${LIMITS.selfMadeLicenses.join(', ')}, gặp ${it.license}`);
        }
        if (it.removed && !it.removedReason) err('REMOVED_REASON', f, 'removed: true cần removedReason');
        if (!it.removed && it.removedReason) warn('REMOVED_REASON', f, 'có removedReason nhưng removed là false');

        for (const [i, file] of (it.files || []).entries()) {
          const ext = path.extname(file.name || '').toLowerCase();
          if (!LIMITS.allowedExt.includes(ext)) err('FILE_TYPE', f, `files[${i}] ${file.name}: không nhận đuôi ${ext || '(trống)'}`);
          if (it.type === 'quiz-pack' && !LIMITS.quizExt.includes(ext)) err('FILE_TYPE', f, `gói quiz dùng Study Pack v1 (${LIMITS.quizExt.join(' ')})`);
          if (file.size > LIMITS.maxFileBytes) err('FILE_SIZE', f, `files[${i}] ${file.name}: ${file.size} byte, quá ${fmtSize(LIMITS.maxFileBytes)}`);
          if (file.path) {
            const abs = path.join(cdir, file.path);
            if (!fs.existsSync(abs)) err('FILE_PATH', f, `không thấy ${rel(root, abs)}`);
            else {
              const size = fs.statSync(abs).size;
              if (size !== file.size) err('FILE_PATH', f, `${file.path}: size ghi ${file.size}, thật ${size}`);
              if (sha256File(abs) !== file.sha256) err('FILE_PATH', f, `${file.path}: sha256 không khớp`);
            }
          }
          if (file.sha256 && !it.removed) {
            const prev = shaSeen.get(file.sha256);
            if (prev) err('DUP_SHA', f, `files[${i}] trùng nội dung với ${prev}`);
            else shaSeen.set(file.sha256, `${f} files[${i}]`);
          }
        }
        for (const s of jsonStrings(it, '', [])) {
          for (const h of scanText(s)) err(h.code, f, `có thể là ${h.label}: "${h.match}"`);
        }
        items.push({ ...it, _file: f });
      }
    }
  }

  // Quét file trên đĩa: kích thước, loại file trong git, thông tin cá nhân.
  scanDisk(root, root, err, LIMITS);
  for (const c of courses.values()) {
    for (const s of jsonStrings(c, '', [])) for (const h of scanText(s)) err(h.code, c._file, `có thể là ${h.label}: "${h.match}"`);
  }

  return { root, policy, faculties, partners, courses, programs, items, errors, warnings };
}

function scanDisk(root, dir, err, LIMITS) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    const r = rel(root, p);
    if (ent.isDirectory()) {
      if (r === 'test/fixtures') continue;
      scanDisk(root, p, err, LIMITS);
      continue;
    }
    const size = fs.statSync(p).size;
    if (size > LIMITS.maxFileBytes) err('FILE_SIZE', r, `${size} byte, quá ${fmtSize(LIMITS.maxFileBytes)}`);
    if (r.startsWith('courses/')) {
      const parts = r.split('/');
      const okLayout =
        (parts.length === 3 && parts[2] === 'README.md') ||
        (parts.length === 4 && parts[2] === 'items' && parts[3].endsWith('.json')) ||
        (parts.length === 4 && parts[2] === 'files' && parts[3].endsWith('.md'));
      if (!okLayout) err('GIT_FILE_TYPE', r, 'trong git chỉ có README.md, items/*.json và files/*.md; file khác đưa lên Release');
      if (parts[2] === 'files' && size > LIMITS.maxMdInGitBytes) err('FILE_SIZE', r, `file .md trong git tối đa ${fmtSize(LIMITS.maxMdInGitBytes)}`);
      if (r.endsWith('.md')) {
        for (const h of scanText(fs.readFileSync(p, 'utf8'))) err(h.code, `${r}:${h.line}`, `có thể là ${h.label}: "${h.match}"`);
      }
    }
  }
}

// ---------- index.json ----------

function cleanItem(it) {
  const out = {};
  for (const [k, v] of Object.entries(it)) {
    if (k === '$schema' || k === '_file') continue;
    out[k] = v;
  }
  if (out.files) {
    out.files = out.files.map((f) => {
      const g = { ...f };
      if (g.path) g.path = `courses/${it.course}/${g.path}`;
      return g;
    });
  }
  return out;
}

function cleanCourse(c) {
  const out = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === '$schema' || k === '_file') continue;
    out[k] = v;
  }
  return out;
}

export function buildIndex(repo, { repoSlug = 'bk-study-library/bk-study-library' } = {}) {
  const dates = [];
  for (const c of repo.courses.values()) dates.push(c.updated);
  for (const p of repo.programs.values()) dates.push(p.updated);
  for (const it of repo.items) dates.push(it.added);
  const generated = dates.filter(Boolean).sort().pop() || null;

  const itemsByCourse = new Map();
  for (const it of repo.items) {
    if (!itemsByCourse.has(it.course)) itemsByCourse.set(it.course, []);
    itemsByCourse.get(it.course).push(cleanItem(it));
  }
  for (const list of itemsByCourse.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const faculties = repo.faculties.faculties.map((f) => ({
    key: f.key,
    name: f.name,
    courses: [...repo.courses.values()]
      .filter((c) => c.faculty === f.key)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => ({ ...cleanCourse(c), items: itemsByCourse.get(c.id) || [] })),
  }));
  const programs = [...repo.programs.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((p) => cleanCourse(p));
  return {
    version: 1,
    repo: repoSlug,
    generated,
    counts: { faculties: faculties.length, courses: repo.courses.size, programs: programs.length, items: repo.items.length },
    faculties,
    programs,
    partners: repo.partners,
  };
}

export function serializeIndex(index) {
  return { full: JSON.stringify(index, null, 2) + '\n', min: JSON.stringify(index) };
}
