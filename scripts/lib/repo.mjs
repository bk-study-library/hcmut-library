// Đọc danh mục và tài liệu, kiểm tra toàn bộ, dựng index.json.
// Không phụ thuộc thư viện ngoài: chỉ dùng node:fs, node:path, node:crypto.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validate } from './schema.mjs';
import { loadPolicy, missingKeys } from './policy.mjs';
import { releaseTagOverrideErrors } from '../upload/term.mjs';
import { PII_PATTERNS, scanText } from './pii.mjs';
import { extensionsFor } from './extensions.mjs';
import { DEFAULT_LEVEL, LEVELS, courseLevels } from './labels.mjs';

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'site']);

function loadSchemas() {
  const s = (n) => JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'schema', `${n}.schema.json`), 'utf8'));
  return { course: s('course'), faculty: s('faculty'), program: s('program'), item: s('item'), major: s('major') };
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

// Mẫu nằm ở pii.mjs (JS chuẩn) để Worker dùng chung.
export { PII_PATTERNS, scanText };

// Trong JSON chỉ quét giá trị chuỗi, bỏ url, mã băm và ISBN (dãy số dài theo mẫu cố định).
const NOT_TEXT = new Set(['url', 'sha256', 'uploadSha256', 'isbn', '$schema']);
function jsonStrings(v, key, out) {
  if (typeof v === 'string') {
    if (!NOT_TEXT.has(key)) out.push(v);
  } else if (Array.isArray(v)) v.forEach((x) => jsonStrings(x, key, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) jsonStrings(x, k, out);
  return out;
}

// ---------- Link PDF chính thức của chương trình ----------

// Mẫu host: "hcmut.edu.vn" khớp đúng host đó, "*.hcmut.edu.vn" khớp mọi tên miền con.
export function hostAllowed(host, patterns) {
  const h = String(host || '').toLowerCase();
  return patterns.some((p) => {
    const x = String(p).toLowerCase();
    return x.startsWith('*.') ? h.endsWith(x.slice(1)) : h === x;
  });
}

// Link https, không có tài khoản hay cổng riêng, host nằm trong danh sách cho phép.
export function officialPdfUrl(url, hosts) {
  if (typeof url !== 'string' || !URL.canParse(url)) return false;
  const u = new URL(url);
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && hostAllowed(u.hostname, hosts);
}

// Danh sách host (programPdfHosts, handbookHosts) trong catalog/site.json của root; repo không có file thì dùng của công cụ.
function readHosts(root, err, key = 'programPdfHosts') {
  const own = path.join(root, 'catalog', 'site.json');
  const p = fs.existsSync(own) ? own : path.join(TOOL_ROOT, 'catalog', 'site.json');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    err('JSON', rel(root, p), `không đọc được JSON: ${e.message}`);
    return [];
  }
  const hosts = cfg[key];
  if (hosts === undefined) return [];
  if (!Array.isArray(hosts) || !hosts.every((h) => typeof h === 'string' && /^(\*\.)?[a-z0-9.-]+$/.test(h))) {
    err('SCHEMA', 'catalog/site.json', `${key} cần là mảng tên miền, ví dụ "drive.google.com" hoặc "*.hcmut.edu.vn"`);
    return [];
  }
  return hosts;
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
    for (const m of releaseTagOverrideErrors(localPolicy)) err('SCHEMA', 'catalog/policy.json', m);
  }
  const policy = localPolicy && !missingKeys(localPolicy).length ? localPolicy : loadPolicy(TOOL_ROOT);
  const LIMITS = {
    maxFileBytes: policy.maxFileBytes,
    maxMdInGitBytes: policy.maxMdInGitBytes,
    // File nằm trong git (GitHub chặn file trên 100 MB): giới hạn riêng, nhỏ hơn maxFileBytes của file trên Release.
    maxGitFileBytes: policy.maxGitFileBytes ?? policy.maxFileBytes,
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
  // Khóa cũ (movedTo) trỏ tới một khoa đang dùng, không trỏ tiếp tới khóa cũ khác.
  const movedKeys = new Set(faculties.faculties.filter((f) => f.movedTo).map((f) => f.key));
  for (const f of faculties.faculties) {
    if (f.movedTo && (!facultyKeys.has(f.movedTo) || movedKeys.has(f.movedTo))) err('FACULTY_MISSING', 'catalog/faculties.json', `khoa ${f.key}: movedTo "${f.movedTo}" phải là khoa đang dùng`);
  }
  const movedErr = (file, key, what) => err('FACULTY_MOVED', file, `${what} ghi khoa "${key}", khóa này đã chuyển sang "${faculties.faculties.find((f) => f.key === key).movedTo}"`);
  for (const p of faculties.prefixes) {
    if (movedKeys.has(p.faculty)) movedErr('catalog/faculties.json', p.faculty, `tiền tố ${p.pattern}`);
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

  // Ngành (file không bắt buộc): mã không trùng, khoa có trong faculties.json.
  const majorsPath = path.join(root, 'catalog', 'majors.json');
  const majors = new Map();
  let majorsUpdated = null;
  if (fs.existsSync(majorsPath)) {
    const m = readJson(majorsPath);
    if (m) {
      check(schemas.major, m, majorsPath);
      majorsUpdated = m.updated || null;
      for (const x of Array.isArray(m.majors) ? m.majors : []) {
        if (majors.has(x.code)) err('DUP_ID', 'catalog/majors.json', `trùng mã ngành ${x.code}`);
        majors.set(x.code, x);
        if (!facultyKeys.has(x.faculty)) err('FACULTY_MISSING', 'catalog/majors.json', `ngành ${x.code}: khoa "${x.faculty}" không có trong faculties.json`);
        else if (movedKeys.has(x.faculty)) movedErr('catalog/majors.json', x.faculty, `ngành ${x.code}`);
      }
      // Mã phụ (aliases) không trùng mã ngành nào, và chỉ thuộc một ngành.
      const aliasOwner = new Map();
      for (const x of majors.values()) {
        for (const a of x.aliases || []) {
          if (majors.has(a)) err('MAJOR_ALIAS', 'catalog/majors.json', `ngành ${x.code}: mã phụ ${a} đang là mã của một ngành`);
          if (aliasOwner.has(a) && aliasOwner.get(a) !== x.code) err('MAJOR_ALIAS', 'catalog/majors.json', `mã phụ ${a} ghi ở cả ${aliasOwner.get(a)} và ${x.code}`);
          aliasOwner.set(a, x.code);
        }
      }
    }
  }

  // Link PDF chính thức của chương trình: chỉ https, chỉ host trong catalog/site.json (programPdfHosts).
  // Link Sổ tay (handbookUrl) của môn, chương trình, ngành: chỉ host trong handbookHosts.
  const pdfHosts = readHosts(root, err);
  const handbookHosts = readHosts(root, err, 'handbookHosts');
  const checkHandbook = (url, file, what) => {
    if (url != null && !officialPdfUrl(url, handbookHosts)) {
      err('HANDBOOK_URL', file, `${what}handbookUrl cần là link https tới host trong catalog/site.json (handbookHosts: ${handbookHosts.join(', ') || 'trống'}), gặp ${url}`);
    }
  };
  for (const m of majors.values()) checkHandbook(m.handbookUrl, 'catalog/majors.json', `ngành ${m.code}: `);
  for (const c of courses.values()) checkHandbook(c.handbookUrl, c._file, '');
  for (const pr of programs.values()) {
    for (const k of ['ctdtUrl', 'planUrl']) {
      if (pr[k] != null && !officialPdfUrl(pr[k], pdfHosts)) {
        err('PROGRAM_URL', pr._file, `${k} cần là link https tới host trong catalog/site.json (programPdfHosts: ${pdfHosts.join(', ') || 'trống'}), gặp ${pr[k]}`);
      }
    }
    checkHandbook(pr.handbookUrl, pr._file, '');
    // Chương trình gắn ngành thì ngành phải có trong catalog/majors.json.
    if (pr.major && !majors.has(pr.major)) err('MAJOR_MISSING', pr._file, `ngành ${pr.major} không có trong catalog/majors.json`);
    // Khối cha (groups): tên không trùng, và có khối con ghi đúng tên đó ở group.
    const groupNames = (pr.groups || []).map((g) => g.name);
    if (new Set(groupNames).size !== groupNames.length) err('GROUP_REF', pr._file, 'groups có tên trùng');
    for (const g of groupNames) {
      if (!(pr.blocks || []).some((b) => b.group === g)) err('GROUP_REF', pr._file, `groups "${g}" không có khối nào ghi group này`);
    }
    for (const b of pr.blocks || []) {
      if (b.requiredUnknown && b.required) err('BLOCK_REQUIRED', pr._file, `khối ${b.id}: có requiredUnknown thì required là false`);
      for (const id of Object.keys(b.semesters || {})) {
        if (!(b.courses || []).includes(id)) err('SEMESTER_REF', pr._file, `khối ${b.id}: semesters có ${id} nhưng courses không có`);
      }
    }
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
    else if (movedKeys.has(c.faculty)) movedErr(f, c.faculty, 'môn');
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
    else if (movedKeys.has(pr.faculty)) movedErr(pr._file, pr.faculty, 'chương trình');
    const level = pr.level || DEFAULT_LEVEL;
    for (const b of pr.blocks) {
      for (const id of b.courses) {
        const c = courses.get(id);
        if (!c) err('REF_PROGRAM_COURSE', pr._file, `khối ${b.id} có môn không tồn tại: ${id}`);
        else if (LEVELS[level] && !courseLevels(c).includes(level)) err('COURSE_LEVEL', pr._file, `môn ${id} thuộc chương trình bậc ${level} nhưng levels của môn không có bậc này`);
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
          if (it.book && !(it.book.authors || []).some((a) => typeof a === 'string' && a.trim())) err('ITEM_BOOK', f, 'book cần ít nhất một tác giả');
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
          else if (LIMITS.allowedExt.includes(ext) && !extensionsFor(policy, it.type).includes(ext)) {
            err('FILE_TYPE', f, `files[${i}] ${file.name}: đuôi ${ext} không nhận cho loại ${it.type} (catalog/policy.json, extensions["${ext}"].types)`);
          }
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

  // Bản cập nhật: mục còn hiệu lực có replaces thì tài liệu cũ được coi như đã gỡ (trên web, v1, danh mục
  // của Worker), file trên đĩa không đổi. Tài liệu cũ phải có thật, khác chính nó, chưa bị thay bởi mục khác.
  const byKey = new Map(items.map((x) => [`${x.course}/${x.id}`, x]));
  const replacedBy = new Map();
  for (const it of items) {
    if (it.removed || !it.replaces) continue;
    const old = byKey.get(it.replaces);
    if (!old) err('REPLACES_REF', it._file, `replaces trỏ tới tài liệu không có: ${it.replaces}`);
    else if (old === it) err('REPLACES_REF', it._file, 'replaces trỏ tới chính nó');
    else if (replacedBy.has(it.replaces)) err('REPLACES_REF', it._file, `${it.replaces} đã được thay bởi ${replacedBy.get(it.replaces)}`);
    else replacedBy.set(it.replaces, `${it.course}/${it.id}`);
  }
  for (const [key, by] of replacedBy) {
    const old = byKey.get(key);
    if (old.removed) continue;
    old.removed = true;
    old.removedReason = `Đã có bản cập nhật: ${by}`;
    old.replacedBy = by;
  }

  // Quét file trên đĩa: kích thước, loại file trong git, thông tin cá nhân.
  scanDisk(root, root, err, LIMITS);
  for (const c of courses.values()) {
    for (const s of jsonStrings(c, '', [])) for (const h of scanText(s)) err(h.code, c._file, `có thể là ${h.label}: "${h.match}"`);
  }

  return { root, policy, faculties, partners, majors, majorsUpdated, courses, programs, items, errors, warnings };
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
    if (size > LIMITS.maxGitFileBytes) err('FILE_SIZE', r, `${size} byte, quá ${fmtSize(LIMITS.maxGitFileBytes)} (file trong git)`);
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

export function buildIndex(repo, { repoSlug = 'bk-study-library/hcmut-library' } = {}) {
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
  const majors = [...(repo.majors || new Map()).values()].sort((a, b) => a.code.localeCompare(b.code));
  return {
    version: 1,
    repo: repoSlug,
    generated,
    counts: { faculties: faculties.length, courses: repo.courses.size, programs: programs.length, majors: majors.length, items: repo.items.length },
    faculties,
    majors,
    programs,
    partners: repo.partners,
  };
}

// index.json, index.min.json trên đĩa không lặp mục programs của từng môn: quan hệ môn và chương trình
// đã nằm trong programs[].blocks[].courses (bên đọc tự dựng ngược nếu cần). Bản trong bộ nhớ vẫn đủ.
export function slimIndex(index) {
  return {
    ...index,
    faculties: index.faculties.map((f) => ({
      ...f,
      courses: f.courses.map(({ programs, ...c }) => c),
    })),
  };
}

export function serializeIndex(index) {
  const slim = slimIndex(index);
  return { full: JSON.stringify(slim, null, 2) + '\n', min: JSON.stringify(slim) };
}
