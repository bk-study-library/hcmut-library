// Kiểm file tải lên (workflow kiem-file): quét virus, làm sạch metadata PDF,
// tìm lớp chữ và thông tin cá nhân, ghi link Release vào item.
// Phần logic là hàm thuần để test; phần CLI cuối file chỉ chạy khi gọi trực tiếp.
//
//   node scripts/upload/check.mjs locate --files <pr-files.jsonl> --pr <thư mục PR> --branch <branch> [--output-file <f>]
//     in JSON { item, course, light, code, key, name, sha256 } của item duy nhất trong PR;
//     light=true là sách tham khảo không file: không có gì để tải, quét hay đưa lên kho
//   node scripts/upload/check.mjs scan --item <item.json> --dir <thư mục file đã tải> --out <thư mục>
//     quét và làm sạch, ghi <out>/result.json và <out>/clean/<tên>. Chạy công cụ trên file
//     chưa tin được nên không cần và không được có token hay khóa nào.
//   node scripts/upload/check.mjs apply --item <path> --result <result.json> --clean-dir <thư mục>
//       --repo <owner/name> --report <file> [--output-file <f>]
//     coi kết quả quét là dữ liệu: kiểm dạng và sha256, đọc Release (cần GH_TOKEN), ghi link vào
//     mục ở <path> khi không có virus, ghi báo cáo vào <file>
//   node scripts/upload/check.mjs comment --repo <owner/name> --pr <số> --body-file <file>
//     tạo hoặc sửa comment báo cáo (cần GH_TOKEN)
//   node scripts/upload/check.mjs failure --run-url <url> [--reason-dir <thư mục>]
//     in comment báo không kiểm được, kèm lý do trong các file của thư mục
//   node scripts/upload/check.mjs book-report --code <mã bài>
//     in comment cho sách tham khảo (không có file để kiểm)
//   node scripts/upload/check.mjs rebuild --root <thư mục PR>
//     chạy validate.mjs --write của bản tin cậy trên thư mục PR; không qua thì lý do vào CHECK_ERROR_FILE
//
// --output-file (thường là $GITHUB_OUTPUT) nhận giá trị cho bước sau, viết bằng dấu phân cách.
// Lỗi thì in ra stderr, thoát mã 1 và ghi thêm vào file CHECK_ERROR_FILE nếu có biến này.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseClamscan, renderReport, REPORT_MARKER, WARNINGS, needsManualReview, fenced } from './report.mjs';
import { termFor, releaseTag, releaseAssetUrl } from './term.mjs';
import { cleanOffice, readZip, zipFindings, pdfActiveContent, splitPdfText, imageLeftovers } from './sanitize.mjs';
import { scanText, PII_PATTERNS, TOOL_ROOT } from '../lib/repo.mjs';
import { loadPolicy } from '../lib/policy.mjs';
import { extensionsFor } from '../lib/extensions.mjs';
import { newCoursePath } from './course.mjs';
import { triageFile, triageBatch } from './triage.mjs';
import { hasSimilarTitle } from '../lib/similar.mjs';

const QUARANTINE = /^(pending|clean)\/([A-Za-z0-9]{10})\/([^/]+)$/;
const BRANCH = /^upload\/([A-Za-z0-9]{10})$/;
const ITEM_FILE = /^courses\/([A-Za-z0-9_-]+)\/items\/[A-Za-z0-9_-]+\.json$/;
// Tên file: chữ không dấu, số, chấm, gạch dưới, gạch ngang; có phần tên trước đuôi.
const SAFE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.[A-Za-z0-9]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
// Cùng bộ ký tự tên virus với parseClamscan.
const SIGNATURE = /^[\w.\-/:]+$/;
// Tên metadata đã xóa: thẻ exiftool (Author) hoặc phần trong file Office (docProps/core.xml:creator).
const TAG = /^[A-Za-z0-9_./:-]{1,96}$/;
const MAX_TAGS = 500;
const PII_LABELS = new Set(PII_PATTERNS.map((p) => p.label));
// Nhóm exiftool mô tả chính file hoặc công cụ, không phải metadata trong file.
const NOT_METADATA = new Set(['SourceFile', 'ExifTool', 'File', 'System', 'Composite']);

// ---------- Hàm thuần ----------

// Đọc mã bài và khóa trong bucket quarantine của file duy nhất trong mục.
// Có branch thì mã bài phải trùng branch upload/<mã bài>.
export function quarantineInfo(item, branch) {
  const files = item && item.files;
  if (!Array.isArray(files) || files.length !== 1) throw new Error('Item cần đúng một file.');
  const f = files[0];
  const m = QUARANTINE.exec(String(f.quarantine || ''));
  if (!SAFE_NAME.test(String(f.name || ''))) throw new Error('Item có tên file không hợp lệ.');
  if (!m || m[3] !== f.name) throw new Error('Item không có chỗ cách ly hợp lệ.');
  if (!SHA256.test(String(f.sha256 || ''))) throw new Error('Item không có sha256 hợp lệ.');
  if (branch !== undefined && branch !== `upload/${m[2]}`) throw new Error('Mã bài không khớp với branch của PR.');
  return { code: m[2], key: f.quarantine, name: f.name, sha256: f.sha256 };
}

// Tên branch upload/<mã bài> thì trả mã bài.
export function branchCode(branch) {
  const m = BRANCH.exec(String(branch));
  if (!m) throw new Error('Branch không đúng dạng upload/<mã bài>.');
  return m[1];
}

// Item đã qua bước apply: file nằm ở clean/ trong bucket quarantine và đã có link Release của repo.
export function alreadyScanned(item, repo) {
  const f = item && Array.isArray(item.files) && item.files.length === 1 ? item.files[0] : null;
  if (!f || !repo) return false;
  const m = QUARANTINE.exec(String(f.quarantine || ''));
  return Boolean(m && m[1] === 'clean' && m[3] === f.name && SHA256.test(String(f.sha256 || '')) && String(f.url || '').startsWith(`https://github.com/${repo}/releases/download/`));
}

// Sách tham khảo không có file đi đường nhẹ: light 'true', mã bài lấy từ branch.
// Mục khác cần đúng một file trong bucket quarantine như quarantineInfo.
export function locateInfo(item, branch) {
  const files = item && item.files;
  if (item && item.type === 'book-ref' && (files === undefined || (Array.isArray(files) && files.length === 0))) {
    return { light: 'true', code: branchCode(branch), key: '', name: '', sha256: '' };
  }
  return { light: 'false', ...quarantineInfo(item, branch) };
}

// files: [{ filename, status, previous_filename }] của PR. Trả đường dẫn item duy nhất.
// Ngoài mục đó PR chỉ được có file do validate.mjs --write sinh ra: chỉ mục, v1/ và README
// của cùng môn, cùng file môn mới catalog/courses/<môn>.json khi người gửi đề xuất môn chưa có
// (chỉ thêm mới, không sửa môn đã có). File đổi tên thì đường dẫn cũ cũng phải nằm trong phạm vi đó.
export function pickItemFile(files) {
  const list = pickItemFiles(files, 1);
  return list[0];
}

// Đợt gửi nhiều file: PR có từ 1 tới max item, cùng một môn. Ngoài các mục đó PR chỉ được có
// generated file của môn và file môn mới (như pickItemFile). Trả đường dẫn các mục, theo thứ tự tên.
export function pickItemFiles(files, max = Infinity) {
  const hits = files.filter((f) => ITEM_FILE.test(f.filename) && f.status !== 'removed');
  if (!hits.length || hits.length > max) {
    throw new Error(max === 1 ? `PR cần sửa đúng một file courses/<môn>/items/<id>.json, gặp ${hits.length}.` : `PR cần từ 1 tới ${max} file courses/<môn>/items/<id>.json, gặp ${hits.length}.`);
  }
  for (const h of hits) if (h.previous_filename) throw new Error(`PR sửa file ngoài phạm vi: ${h.previous_filename}.`);
  const course = ITEM_FILE.exec(hits[0].filename)[1];
  if (hits.some((h) => ITEM_FILE.exec(h.filename)[1] !== course)) throw new Error('Các item trong PR phải cùng một môn.');
  const allowed = generatedPaths(course);
  const ok = (p) => allowed.some((a) => (a.endsWith('/') ? p.startsWith(a) : p === a));
  for (const f of files) {
    if (hits.includes(f)) continue;
    // Môn mới người gửi đề xuất kèm bài: chỉ thêm file của đúng môn đó, không sửa môn đã có.
    if (f.filename === newCoursePath(course) && f.status === 'added' && !f.previous_filename) continue;
    for (const p of [f.filename, f.previous_filename]) {
      if (p !== undefined && p !== null && !ok(p)) throw new Error(`PR sửa file ngoài phạm vi: ${p}.`);
    }
  }
  return hits.map((h) => h.filename).sort();
}

// Danh sách mục của đợt gửi cho các bước sau: [{ item, code, key, name, sha256, light }]. Mọi mục phải
// cùng mã bài (branch upload/<mã>); sách tham khảo không file chỉ được đi một mình.
export function batchManifest(rels, readItem, branch) {
  const list = rels.map((rel) => ({ item: rel, ...locateInfo(readItem(rel), branch) }));
  if (list.length > 1 && list.some((x) => x.light === 'true')) throw new Error('Sách tham khảo không file phải gửi riêng, không gửi chung đợt.');
  if (new Set(list.map((x) => x.code)).size !== 1) throw new Error('Các mục trong PR phải cùng một mã bài.');
  return list;
}

// Đường dẫn validate.mjs --write ghi cho một môn; dấu '/' ở cuối là cả thư mục.
export function generatedPaths(course) {
  return ['index.json', 'index.min.json', 'worker-catalog.json', 'v1/', `courses/${course}/README.md`];
}

// Output cho GitHub Actions dạng name<<delimiter, nên xuống dòng không đè được output khác.
export function githubOutput(values, delimiter) {
  let out = '';
  for (const [k, v] of Object.entries(values)) {
    const text = String(v ?? '');
    if (text.split('\n').includes(delimiter)) throw new Error(`Giá trị ${k} chứa dấu phân cách.`);
    out += `${k}<<${delimiter}\n${text}\n${delimiter}\n`;
  }
  return out;
}

// pages: chữ của từng trang (trang 1 ở vị trí 0).
export function piiFromPages(pages) {
  const pii = [];
  pages.forEach((text, i) => {
    for (const h of scanText(text)) pii.push({ label: h.label, page: i + 1, match: h.match });
  });
  return { hasText: pages.some((t) => t.trim().length > 0), pii };
}

// before, after: kết quả `exiftool -json -G0 -a` (một object). Trả tên thẻ đã bị xóa.
export function removedTags(before, after) {
  const out = [];
  for (const key of Object.keys(before)) {
    const [group, tag] = key.includes(':') ? key.split(':', 2) : [key, null];
    if (!tag || NOT_METADATA.has(group) || key in after) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

// Kết quả quét đến từ job đã chạy công cụ trên file chưa tin được: kiểm từng trường,
// chỉ giữ trường đã biết. info: quarantineInfo của mục.
export function validateResult(r, info) {
  const fail = (what) => { throw new Error(`Không dùng được kết quả quét: ${what} sai dạng.`); };
  if (!r || typeof r !== 'object') fail('kết quả');
  if (r.code !== info.code) fail('code');
  if (r.name !== info.name) fail('name');
  if (r.virus !== null && !(typeof r.virus === 'string' && SIGNATURE.test(r.virus))) fail('virus');
  if (r.virus) return { code: r.code, name: r.name, virus: r.virus };
  if (!(typeof r.sha256 === 'string' && SHA256.test(r.sha256))) fail('sha256');
  if (!(Number.isInteger(r.size) && r.size > 0)) fail('size');
  if (![true, false, null].includes(r.hasText)) fail('hasText');
  if (typeof r.piiChecked !== 'boolean') fail('piiChecked');
  if (!Array.isArray(r.metadataRemoved) || r.metadataRemoved.length > MAX_TAGS || !r.metadataRemoved.every((t) => typeof t === 'string' && TAG.test(t))) fail('metadataRemoved');
  const piiOk = (p) => p && PII_LABELS.has(p.label) && Number.isInteger(p.page) && p.page > 0
    && typeof p.match === 'string' && p.match.length > 0 && p.match.length <= 200;
  if (!Array.isArray(r.pii) || !r.pii.every(piiOk)) fail('pii');
  // Trường thêm sau: thiếu thì coi như rỗng. Cảnh báo chỉ nhận mã đã biết (câu chữ do report.mjs giữ).
  const unscannable = r.unscannable ?? null;
  if (unscannable !== null && !(typeof unscannable === 'string' && SIGNATURE.test(unscannable))) fail('unscannable');
  const warnings = r.warnings ?? [];
  if (!Array.isArray(warnings) || warnings.length > 50 || !warnings.every((w) => typeof w === 'string' && Object.hasOwn(WARNINGS, w))) fail('warnings');
  const pageCount = (v) => v === undefined || v === null || (Number.isInteger(v) && v >= 0);
  if (!pageCount(r.textPages) || !pageCount(r.totalPages)) fail('textPages');
  return {
    code: r.code,
    name: r.name,
    virus: null,
    unscannable,
    warnings: [...new Set(warnings)],
    metadataRemoved: [...r.metadataRemoved],
    hasText: r.hasText,
    piiChecked: r.piiChecked,
    pii: r.pii.map((p) => ({ label: p.label, page: p.page, match: p.match })),
    textPages: r.textPages ?? null,
    totalPages: r.totalPages ?? null,
    size: r.size,
    sha256: r.sha256,
  };
}

// Comment báo cáo do workflow (github-actions) viết trước đó, để sửa thay vì thêm mới.
export function findReportComment(comments) {
  const c = comments.find((x) => x.user && x.user.login === 'github-actions[bot]' && String(x.body).startsWith(REPORT_MARKER));
  return c ? c.id : null;
}

// reason gồm chữ chưa tin (stderr của công cụ, nội dung artifact loi-*): luôn nằm trong khối code
// có rào dài hơn mọi đoạn backtick trong chữ, có giới hạn độ dài, nên không thành link hay nhắc tên.
export const FAILURE_REASON_MAX = 2000;
export function failureReport({ reason, runUrl }) {
  const out = [REPORT_MARKER, '## Kết quả kiểm file', '', 'Không kiểm được file. Người duyệt xem nhật ký của lần chạy để xử lý.'];
  if (reason && reason.trim()) out.push('', fenced(reason.trim(), FAILURE_REASON_MAX));
  out.push('', runUrl);
  return out.join('\n') + '\n';
}

export function bookReport(code) {
  return [
    REPORT_MARKER,
    `## Kết quả kiểm bài ${code}`,
    '',
    'Bài này là sách tham khảo, không có file, nên không quét virus hay tìm thông tin cá nhân trong file.',
    'Đã dựng lại chỉ mục của môn. Người duyệt kiểm tên sách và tác giả rồi merge bài.',
  ].join('\n') + '\n';
}

// Lý do khi validate.mjs không qua: chỉ dòng LỖI, bỏ backtick để không thoát khỏi khối code
// (trong khối code, @tên và #số không thành nhắc tên hay tham chiếu), có giới hạn độ dài.
const REASON_MAX = 1500;
const FENCE = '`'.repeat(3);
export function validateFailureReason(output) {
  let body = String(output).split(/\r?\n/).filter((l) => l.startsWith('LỖI ')).join('\n').replace(/`/g, "'");
  if (body.length > REASON_MAX) body = `${body.slice(0, REASON_MAX)}\n(còn nữa, xem nhật ký)`;
  return [
    'Kiểm dữ liệu của repo không qua. Người duyệt sửa item theo các lỗi dưới đây.',
    FENCE,
    body || '(không có dòng lỗi, xem nhật ký)',
    FENCE,
  ].join('\n');
}

// Link xem file cho người duyệt từ reviewBase của catalog/site.json (bản tin cậy). Chỉ nhận https.
export function reviewUrl(site, code) {
  const base = String(site?.reviewBase ?? '').replace(/\/+$/, '');
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(base)) return '';
  return `${base}/xem-duyet/${code}`;
}

// Release đã có file cùng tên khác nội dung thì thêm 6 ký tự đầu sha256 trước đuôi.
export function releaseName(name, sha256, existingAssets) {
  const prev = existingAssets.get(name);
  if (prev === undefined || prev === sha256) return name;
  const dot = name.lastIndexOf('.');
  if (dot < 0) return `${name}-${sha256.slice(0, 6)}`;
  return `${name.slice(0, dot)}-${sha256.slice(0, 6)}${name.slice(dot)}`;
}

// Ghi link Release và thông tin bản đã sanitize vào files[0]. Không sửa item gốc.
// tag: tag Release của học kỳ, tính bằng releaseTag(term, policy) của term.mjs.
export function applyCheck(item, { cleanName, size, sha256, mime, tag, repo, existingAssets }) {
  const { code } = quarantineInfo(item);
  const name = releaseName(cleanName, sha256, existingAssets);
  const file = {
    ...item.files[0],
    name,
    size,
    sha256,
    mime,
    quarantine: `clean/${code}/${name}`,
    url: releaseAssetUrl(repo, tag, name),
  };
  return { ...item, files: [file] };
}

// ---------- CLI ----------

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`tham số lạ: ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

// Thời gian tối đa cho mỗi lần chạy công cụ (policy.scan.toolTimeoutSeconds).
let toolTimeoutMs = 0;

// Chạy công cụ ngoài, trả stdout; mã thoát ngoài ok hay chạy quá giờ thì báo lỗi.
function tool(cmd, argv, ok = [0]) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: toolTimeoutMs || undefined, killSignal: 'SIGKILL' });
  if (r.error) throw new Error(`Không chạy được ${cmd}: ${r.error.message}`);
  if (r.signal) throw new Error(`${cmd} bị dừng (${r.signal}), có thể do chạy quá ${toolTimeoutMs / 1000} giây.`);
  if (!ok.includes(r.status)) throw new Error(`${cmd} lỗi (mã ${r.status}): ${String(r.stderr).trim().slice(0, 1000)}`);
  return { stdout: r.stdout, status: r.status };
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeOutputs(file, values) {
  if (file) fs.appendFileSync(file, githubOutput(values, `EOF_${crypto.randomBytes(16).toString('hex')}`));
}

function exifJson(p) {
  return JSON.parse(tool('exiftool', ['-json', '-G0', '-a', p]).stdout)[0];
}

// Xóa metadata bằng exiftool, rồi qpdf viết lại file để bỏ hẳn bản cũ.
function cleanPdf(src, dest) {
  const work = `${dest}.work.pdf`;
  fs.copyFileSync(src, work);
  const before = exifJson(work);
  tool('exiftool', ['-all:all=', '-overwrite_original', work]);
  // qpdf trả mã 3 khi chỉ có cảnh báo, file vẫn được ghi. --deterministic-id: cùng file gốc
  // cho cùng bản đã sanitize (ID không lấy theo giờ), nên sha256 bản đã sanitize ổn định giữa các lần chạy.
  tool('qpdf', ['--linearize', '--deterministic-id', work, dest], [0, 3]);
  fs.rmSync(work);
  return removedTags(before, exifJson(dest));
}

// Chữ của tối đa maxPages trang đầu, một lần chạy pdftotext (trang cách nhau bằng \f).
function pdfText(p, maxPages) {
  const m = /^Pages:\s+(\d+)/m.exec(tool('pdfinfo', [p]).stdout);
  if (!m) throw new Error('Không đọc được số trang của PDF.');
  const total = Number(m[1]);
  const last = Math.min(total, maxPages);
  if (last < 1) return { pages: [], total };
  const out = tool('pdftotext', ['-f', '1', '-l', String(last), '-enc', 'UTF-8', p, '-']).stdout;
  return { pages: splitPdfText(out, last), total };
}

// JavaScript, Launch, OpenAction, file đính kèm: qpdf viết lại không có object stream để mọi từ điển
// nằm ở dạng chữ, rồi tìm khóa ngoài phần stream.
function pdfWarnings(p) {
  const flat = `${p}.flat.pdf`;
  tool('qpdf', ['--object-streams=disable', '--stream-data=preserve', p, flat], [0, 3]);
  try {
    return pdfActiveContent(fs.readFileSync(flat, 'latin1'));
  } finally {
    fs.rmSync(flat, { force: true });
  }
}

// Ảnh: exiftool xóa mọi metadata, rồi ghi lại hướng ảnh (Orientation) nếu có để ảnh không bị
// xoay. Đọc lại; còn sót thẻ nào thì dừng (không đưa ảnh chưa sạch lên).
function cleanImage(src, dest) {
  fs.copyFileSync(src, dest);
  const before = exifJson(dest);
  const orientation = tool('exiftool', ['-s3', '-n', '-EXIF:Orientation', dest]).stdout.trim();
  tool('exiftool', ['-all=', '-overwrite_original', dest]);
  if (/^[2-8]$/.test(orientation)) tool('exiftool', ['-n', `-EXIF:Orientation=${orientation}`, '-overwrite_original', dest]);
  const after = exifJson(dest);
  const left = imageLeftovers(after);
  if (left.length) throw new Error(`Không xóa hết được metadata của ảnh: ${left.join(', ')}.`);
  return removedTags(before, after);
}

// Tên và sha256 các file đã có trên Release; Release chưa có thì rỗng.
// Đọc Release theo tag (cần GH_TOKEN): exists, immutable (GitHub immutable release, không đưa
// thêm file được) và assets Map<tên, sha256>. Chưa có Release thì exists=false, assets rỗng.
export function releaseInfo(repo, tag) {
  const r = spawnSync('gh', ['api', `repos/${repo}/releases/tags/${tag}`], { encoding: 'utf8' });
  if (r.status !== 0) {
    if (/HTTP 404/.test(r.stderr)) return { exists: false, immutable: false, assets: new Map() };
    throw new Error(`Không đọc được Release ${tag}: ${String(r.stderr).trim()}`);
  }
  const data = JSON.parse(r.stdout);
  const assets = data.assets || [];
  return {
    exists: true,
    immutable: data.immutable === true,
    assets: new Map(assets.map((x) => [x.name, String(x.digest || '').replace(/^sha256:/, '')])),
  };
}

export function releaseAssets(repo, tag) {
  return releaseInfo(repo, tag).assets;
}

export function readPrFiles(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// Một hay nhiều mục (đợt gửi): output của mục đầu như trước, cộng count và manifest (JSON) cho các bước lặp.
function locate(a) {
  const policy = loadPolicy(TOOL_ROOT);
  const rels = pickItemFiles(readPrFiles(a.files), policy.batchMaxFiles || 1);
  const items = Object.fromEntries(rels.map((rel) => [rel, readJson(path.join(a.pr, rel))]));
  const list = batchManifest(rels, (rel) => items[rel], a.branch);
  // Mọi file của bài đã quét xong (người duyệt vừa bỏ bớt file trên trang duyệt): chỉ dựng lại generated file.
  const rebuild = list.every((x) => x.light === 'false' && alreadyScanned(items[x.item], a.repo));
  const out = {
    ...list[0],
    course: ITEM_FILE.exec(list[0].item)[1],
    count: String(list.length),
    manifest: JSON.stringify(list),
    items: rels.join('\n'),
    rebuild: String(rebuild),
  };
  writeOutputs(a['output-file'], out);
  return out;
}

// Giới hạn khi quét, từ policy.scan.
function scanLimits(policy) {
  const s = policy.scan || {};
  const posInt = (v, key) => {
    if (!Number.isInteger(v) || v <= 0) throw new Error(`catalog/policy.json: scan.${key} phải là số nguyên dương.`);
    return v;
  };
  return {
    pdfTextMaxPages: posInt(s.pdfTextMaxPages, 'pdfTextMaxPages'),
    toolTimeoutSeconds: posInt(s.toolTimeoutSeconds, 'toolTimeoutSeconds'),
    zipMaxUncompressedBytes: posInt(s.zipMaxUncompressedBytes, 'zipMaxUncompressedBytes'),
    zipAllowedInside: Array.isArray(s.zipAllowedInside) ? s.zipAllowedInside.map((x) => String(x).toLowerCase()) : [],
  };
}

const OFFICE = new Set(['.docx', '.pptx', '.xlsx']);
const IMAGES = new Set(['.png', '.jpg']);

// Quét cả bên trong file nén; file mã hóa hay vượt giới hạn quét thì ClamAV báo Heuristics.Encrypted
// hay Heuristics.Limits.Exceeded thay vì coi là sạch.
const CLAMSCAN_ARGS = ['--no-summary', '--scan-archive=yes', '--alert-encrypted=yes', '--alert-exceeds-max=yes'];

// Quét mọi file của bài trong một lần chạy clamscan (nạp cơ sở dữ liệu một lần thay vì mỗi file một lần).
// --root <thư mục in/> --out <file JSON { status, stdout }>.
function clamscanAll(a) {
  toolTimeoutMs = scanLimits(loadPolicy(TOOL_ROOT)).toolTimeoutSeconds * 1000;
  const r = tool('clamscan', CLAMSCAN_ARGS.concat('-r', path.resolve(a.root)), [0, 1, 2]);
  fs.writeFileSync(a.out, JSON.stringify({ status: r.status, stdout: r.stdout }));
}

// Phần kết quả clamscanAll của một file: dòng "<đường dẫn>: <tên> FOUND" của file đó. Lỗi (mã 2) là lỗi chung.
export function clamFor(all, src) {
  if (all.status !== 0 && all.status !== 1) return { status: all.status, stdout: '' };
  const prefix = `${path.resolve(src)}: `;
  const lines = String(all.stdout).split('\n').filter((l) => l.startsWith(prefix) && / FOUND\r?$/.test(l));
  return { status: lines.length ? 1 : 0, stdout: lines.join('\n') };
}

function scan(a) {
  const policy = loadPolicy(TOOL_ROOT);
  const limits = scanLimits(policy);
  toolTimeoutMs = limits.toolTimeoutSeconds * 1000;
  const item = readJson(a.item);
  const info = quarantineInfo(item);
  const ext = path.extname(info.name).toLowerCase();
  if (!policy.extensions[ext]) throw new Error(`Không nhận đuôi ${ext}.`);
  if (!extensionsFor(policy, item.type).includes(ext)) throw new Error(`Không nhận đuôi ${ext} cho loại ${item.type}.`);
  const src = path.join(a.dir, info.name);
  if (sha256File(src) !== info.sha256) throw new Error('File trong bucket quarantine khác sha256 ghi trong mục.');
  fs.mkdirSync(a.out, { recursive: true });
  const write = (r) => fs.writeFileSync(path.join(a.out, 'result.json'), JSON.stringify(r));

  // --clam: kết quả clamscanAll của cả bài (nạp cơ sở dữ liệu ClamAV một lần); không có thì quét riêng file này.
  const av = a.clam ? clamFor(readJson(a.clam), src) : tool('clamscan', CLAMSCAN_ARGS.concat(src), [0, 1, 2]);
  const verdict = parseClamscan(av.stdout, av.status);
  if (verdict.infected) return write({ code: info.code, name: info.name, virus: verdict.signature });

  const cleanDir = path.join(a.out, 'clean');
  fs.mkdirSync(cleanDir, { recursive: true });
  const cleanFile = path.join(cleanDir, info.name);
  let metadataRemoved = [];
  let hasText = null;
  let pii = [];
  let piiChecked = true;
  let textPages = null;
  let totalPages = null;
  const warnings = [];
  if (ext === '.pdf') {
    metadataRemoved = cleanPdf(src, cleanFile);
    warnings.push(...pdfWarnings(cleanFile));
    const text = pdfText(cleanFile, limits.pdfTextMaxPages);
    ({ hasText, pii } = piiFromPages(text.pages));
    textPages = text.pages.length;
    totalPages = text.total;
  } else if (IMAGES.has(ext)) {
    metadataRemoved = cleanImage(src, cleanFile);
    piiChecked = false;
  } else if (OFFICE.has(ext)) {
    const r = cleanOffice(fs.readFileSync(src));
    fs.writeFileSync(cleanFile, r.buf);
    metadataRemoved = r.removed;
    warnings.push(...r.warnings);
    piiChecked = false;
  } else if (ext === '.zip') {
    fs.copyFileSync(src, cleanFile);
    const zip = readZip(fs.readFileSync(cleanFile));
    warnings.push(...zipFindings(zip.entries, { allowed: limits.zipAllowedInside, maxUncompressed: limits.zipMaxUncompressedBytes }));
    piiChecked = false;
  } else {
    fs.copyFileSync(src, cleanFile);
    if (ext === '.md' || ext === '.json') ({ pii } = piiFromPages([fs.readFileSync(cleanFile, 'utf8')]));
    else piiChecked = false;
  }
  write({
    code: info.code, name: info.name, virus: null, unscannable: verdict.unscannable ?? null, warnings: [...new Set(warnings)],
    metadataRemoved, hasText, piiChecked, pii, textPages, totalPages,
    size: fs.statSync(cleanFile).size, sha256: sha256File(cleanFile),
  });
}

// Ghi kết quả quét của một mục: trả { report, values } như trước (values: virus, quarantine, clean, manual).
// assets: Map tag -> danh sách asset đã có (đọc một lần cho cả đợt gửi).
function applyOne({ itemPath, resultPath, cleanDir, repo, policy, assets }) {
  const item = readJson(itemPath);
  const info = quarantineInfo(item);
  const r = validateResult(readJson(resultPath), info);
  if (r.virus) return { info, file: { name: info.name, virus: r.virus }, values: { virus: r.virus, quarantine: '', clean: '', manual: 'false' } };

  // Không tin con số trong kết quả: tính lại trên chính file sẽ đưa lên kho.
  const cleanFile = path.join(cleanDir, info.name);
  if (sha256File(cleanFile) !== r.sha256 || fs.statSync(cleanFile).size !== r.size) {
    throw new Error('File đã sanitize không khớp sha256 hoặc kích thước trong kết quả quét.');
  }
  const rule = policy.extensions[path.extname(info.name).toLowerCase()];
  if (!rule) throw new Error('Không nhận đuôi của file.');
  const tag = releaseTag(termFor(new Date(), policy.terms), policy);
  if (!assets.has(tag)) assets.set(tag, releaseAssets(repo, tag));
  const next = applyCheck(item, {
    cleanName: info.name, size: r.size, sha256: r.sha256, mime: rule.mime, tag, repo,
    existingAssets: assets.get(tag),
  });
  fs.writeFileSync(itemPath, `${JSON.stringify(next, null, 2)}\n`);
  const file = {
    name: info.name, size: r.size, virus: null, hasText: r.hasText, pii: r.pii, piiChecked: r.piiChecked,
    unscannable: r.unscannable, warnings: r.warnings, textPages: r.textPages, totalPages: r.totalPages,
  };
  // manual=true: workflow gắn label can-xem-tay. Tính lại từ mã cảnh báo, không lấy cờ từ job scan.
  return { info, file, values: { virus: '', quarantine: next.files[0].quarantine, clean: cleanFile, manual: String(needsManualReview(r)) } };
}

function apply(a) {
  const policy = loadPolicy(TOOL_ROOT);
  const one = applyOne({ itemPath: a.item, resultPath: a.result, cleanDir: a['clean-dir'], repo: a.repo, policy, assets: new Map() });
  fs.writeFileSync(a.report, batchReport(one.info.code, [one]));
  writeOutputs(a['output-file'], one.values);
}

// Comment kết quả của bài (một hay nhiều file): một bảng, một link duyệt.
export function batchReport(code, parts, decision = null) {
  const site = readJson(path.join(TOOL_ROOT, 'catalog', 'site.json'));
  return renderReport({ code, reviewUrl: reviewUrl(site, code), files: parts.map((x) => x.file), decision });
}

// Đợt gửi: --manifest <file JSON của locate> --pr <thư mục PR> --res-dir <thư mục có <i>/result.json, <i>/clean>
// --repo --report <file> --pairs <file> [--output-file]. pairs: mỗi dòng "<file sạch>\t<khóa kho>" để đưa lên kho.
// Một file có virus thì cả đợt coi như có virus (workflow đóng PR): không ghi pairs.
function applyBatch(a) {
  const policy = loadPolicy(TOOL_ROOT);
  const list = readJson(a.manifest);
  const assets = new Map();
  const parts = list.map((m, i) => {
    const one = applyOne({ itemPath: path.join(a.pr, m.item), resultPath: path.join(a['res-dir'], String(i), 'result.json'), cleanDir: path.join(a['res-dir'], String(i), 'clean'), repo: a.repo, policy, assets });
    return { ...one, name: m.name };
  });
  const virus = parts.find((x) => x.values.virus);
  const decision = virus ? 'review' : triageItems(a, list, parts, policy);
  fs.writeFileSync(a.report, batchReport(list[0].code, parts, decision));
  fs.writeFileSync(a.pairs, virus ? '' : parts.map((x) => `${x.values.clean}\t${x.values.quarantine}\n`).join(''));
  writeOutputs(a['output-file'], { virus: virus ? virus.values.virus : '', manual: String(parts.some((x) => x.values.manual === 'true')), decision });
}

// Phân loại từng file (scripts/upload/triage.mjs), ghi lý do vào trường unclassified của item. Bài không cần người duyệt
// thì ghi --auto-file: bản ghi để cron của Worker tự merge khi check qua (giống quyết định trên trang duyệt).
function triageItems(a, list, parts, policy) {
  const course = ITEM_FILE.exec(list[0].item)[1];
  // Môn mới: PR thêm file môn mà bản main chưa có.
  const newCourse = !fs.existsSync(path.join(TOOL_ROOT, 'catalog', 'courses', `${course}.json`));
  const itemsDir = path.join(TOOL_ROOT, 'courses', course, 'items');
  const existing = fs.existsSync(itemsDir) ? fs.readdirSync(itemsDir).map((f) => readJson(path.join(itemsDir, f))).filter((x) => !x.removed) : [];
  const results = parts.map((x, i) => {
    const itemPath = path.join(a.pr, list[i].item);
    const item = readJson(itemPath);
    const r = triageFile(x.file, item, { newCourse, similar: hasSimilarTitle(item.title, existing) }, policy.triage || {});
    if (r.decision === 'unclassified') fs.writeFileSync(itemPath, `${JSON.stringify({ ...item, unclassified: r.unclassified }, null, 2)}\n`);
    x.file.triage = r;
    return { ...r, id: item.id, title: item.title };
  });
  const decision = triageBatch(results);
  if (decision !== 'review' && a['auto-file']) {
    const record = { reviewer: 'auto', at: new Date().toISOString(), keep: results.map((r) => r.id), drop: [], titles: Object.fromEntries(results.map((r) => [r.id, r.title])), waiting: true, auto: true };
    fs.writeFileSync(a['auto-file'], JSON.stringify(record));
  }
  return decision;
}

// Dòng cho vòng lặp bash của workflow: "<chỉ số>\t<khóa kho>\t<tên file>\t<đường dẫn mục>" cho mỗi mục có file.
// Giá trị đã qua kiểm ở locate (khóa và tên theo mẫu an toàn), nên đọc bằng read -r an toàn.
function manifestLines(a) {
  const list = JSON.parse(fs.readFileSync(a.manifest, 'utf8'));
  for (const [i, m] of list.entries()) {
    if (m.light === 'true') continue;
    if (!QUARANTINE.test(m.key) || !SAFE_NAME.test(m.name) || !ITEM_FILE.test(m.item)) throw new Error('Manifest không hợp lệ.');
    process.stdout.write(`${i}\t${m.key}\t${m.name}\t${m.item}\n`);
  }
}

async function comment(a) {
  const api = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${a.repo}`;
  const headers = {
    authorization: `Bearer ${process.env.GH_TOKEN}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  const call = async (url, init = {}) => {
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) throw new Error(`GitHub API lỗi ${res.status} ở ${init.method || 'GET'} ${url}`);
    return res.json();
  };
  let id = null;
  for (let page = 1; id === null; page++) {
    const list = await call(`${api}/issues/${a.pr}/comments?per_page=100&page=${page}`);
    id = findReportComment(list);
    if (list.length < 100) break;
  }
  const body = JSON.stringify({ body: fs.readFileSync(a['body-file'], 'utf8') });
  if (id) await call(`${api}/issues/comments/${id}`, { method: 'PATCH', body });
  else await call(`${api}/issues/${a.pr}/comments`, { method: 'POST', body });
}

function failure(a) {
  const dir = a['reason-dir'];
  const reason = dir && fs.existsSync(dir)
    ? fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim()).filter(Boolean).join('\n')
    : '';
  process.stdout.write(failureReport({ reason, runUrl: a['run-url'] }));
}

// Chạy validate.mjs của bản tin cậy trên thư mục PR; in nhật ký, không qua thì ném lý do đã lọc.
function rebuild(a) {
  const script = path.join(TOOL_ROOT, 'scripts', 'validate.mjs');
  const r = spawnSync(process.execPath, [script, '--root', a.root, '--write'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`Không chạy được validate.mjs: ${r.error.message}`);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(validateFailureReason(r.stdout));
}

async function main(argv) {
  const cmd = argv.shift();
  const a = args(argv);
  if (cmd === 'locate') console.log(JSON.stringify(locate(a)));
  else if (cmd === 'scan') scan(a);
  else if (cmd === 'clamscan-all') clamscanAll(a);
  else if (cmd === 'apply') apply(a);
  else if (cmd === 'apply-batch') applyBatch(a);
  else if (cmd === 'manifest-lines') manifestLines(a);
  else if (cmd === 'comment') await comment(a);
  else if (cmd === 'failure') failure(a);
  else if (cmd === 'book-report') process.stdout.write(bookReport(branchCode(`upload/${a.code}`)));
  else if (cmd === 'rebuild') rebuild(a);
  else throw new Error(`lệnh lạ: ${cmd}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    if (process.env.CHECK_ERROR_FILE) {
      fs.mkdirSync(path.dirname(process.env.CHECK_ERROR_FILE), { recursive: true });
      fs.appendFileSync(process.env.CHECK_ERROR_FILE, `${e.message}\n`);
    }
    process.exit(1);
  });
}
