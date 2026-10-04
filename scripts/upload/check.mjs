// Kiểm file tải lên (workflow kiem-file): quét virus, làm sạch siêu dữ liệu PDF,
// tìm lớp chữ và thông tin cá nhân, ghi link Release vào mục tài liệu.
// Phần logic là hàm thuần để test; phần CLI cuối file chỉ chạy khi gọi trực tiếp.
//
//   node scripts/upload/check.mjs locate --files <pr-files.jsonl> --pr <thư mục PR> --branch <nhánh> [--output-file <f>]
//     in JSON { item, course, light, code, key, name, sha256 } của mục tài liệu duy nhất trong PR;
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
import { parseClamscan, renderReport, REPORT_MARKER } from './report.mjs';
import { termFor, releaseTag, releaseAssetUrl } from './term.mjs';
import { scanText, PII_PATTERNS, TOOL_ROOT } from '../lib/repo.mjs';
import { loadPolicy } from '../lib/policy.mjs';

const QUARANTINE = /^(pending|clean)\/([A-Za-z0-9]{10})\/([^/]+)$/;
const BRANCH = /^upload\/([A-Za-z0-9]{10})$/;
const ITEM_FILE = /^courses\/([A-Za-z0-9_-]+)\/items\/[A-Za-z0-9_-]+\.json$/;
// Tên file: chữ không dấu, số, chấm, gạch dưới, gạch ngang; có phần tên trước đuôi.
const SAFE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.[A-Za-z0-9]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
// Cùng bộ ký tự tên virus với parseClamscan.
const SIGNATURE = /^[\w.\-/:]+$/;
const TAG = /^[A-Za-z0-9_-]{1,64}$/;
const PII_LABELS = new Set(PII_PATTERNS.map((p) => p.label));
// Nhóm exiftool mô tả chính file hoặc công cụ, không phải siêu dữ liệu trong file.
const NOT_METADATA = new Set(['SourceFile', 'ExifTool', 'File', 'System', 'Composite']);

// ---------- Hàm thuần ----------

// Đọc mã bài và khóa trong kho cách ly của file duy nhất trong mục.
// Có branch thì mã bài phải trùng nhánh upload/<mã bài>.
export function quarantineInfo(item, branch) {
  const files = item && item.files;
  if (!Array.isArray(files) || files.length !== 1) throw new Error('Mục tài liệu cần đúng một file.');
  const f = files[0];
  const m = QUARANTINE.exec(String(f.quarantine || ''));
  if (!SAFE_NAME.test(String(f.name || ''))) throw new Error('Mục tài liệu có tên file không hợp lệ.');
  if (!m || m[3] !== f.name) throw new Error('Mục tài liệu không có chỗ cách ly hợp lệ.');
  if (!SHA256.test(String(f.sha256 || ''))) throw new Error('Mục tài liệu không có sha256 hợp lệ.');
  if (branch !== undefined && branch !== `upload/${m[2]}`) throw new Error('Mã bài không khớp với nhánh của PR.');
  return { code: m[2], key: f.quarantine, name: f.name, sha256: f.sha256 };
}

// Tên nhánh upload/<mã bài> thì trả mã bài.
export function branchCode(branch) {
  const m = BRANCH.exec(String(branch));
  if (!m) throw new Error('Nhánh không đúng dạng upload/<mã bài>.');
  return m[1];
}

// Sách tham khảo không có file đi đường nhẹ: light 'true', mã bài lấy từ nhánh.
// Mục khác cần đúng một file trong kho cách ly như quarantineInfo.
export function locateInfo(item, branch) {
  const files = item && item.files;
  if (item && item.type === 'book-ref' && (files === undefined || (Array.isArray(files) && files.length === 0))) {
    return { light: 'true', code: branchCode(branch), key: '', name: '', sha256: '' };
  }
  return { light: 'false', ...quarantineInfo(item, branch) };
}

// files: [{ filename, status, previous_filename }] của PR. Trả đường dẫn mục tài liệu duy nhất.
// Ngoài mục đó PR chỉ được có file do validate.mjs --write sinh ra: chỉ mục, v1/ và README
// của cùng môn. File đổi tên thì đường dẫn cũ cũng phải nằm trong phạm vi đó.
export function pickItemFile(files) {
  const hits = files.filter((f) => ITEM_FILE.test(f.filename) && f.status !== 'removed');
  if (hits.length !== 1) throw new Error(`PR cần sửa đúng một file courses/<môn>/items/<id>.json, gặp ${hits.length}.`);
  const item = hits[0];
  if (item.previous_filename) throw new Error(`PR sửa file ngoài phạm vi: ${item.previous_filename}.`);
  const allowed = generatedPaths(ITEM_FILE.exec(item.filename)[1]);
  const ok = (p) => allowed.some((a) => (a.endsWith('/') ? p.startsWith(a) : p === a));
  for (const f of files) {
    if (f === item) continue;
    for (const p of [f.filename, f.previous_filename]) {
      if (p !== undefined && p !== null && !ok(p)) throw new Error(`PR sửa file ngoài phạm vi: ${p}.`);
    }
  }
  return item.filename;
}

// Đường dẫn validate.mjs --write ghi cho một môn; dấu '/' ở cuối là cả thư mục.
export function generatedPaths(course) {
  return ['index.json', 'index.min.json', 'v1/', `courses/${course}/README.md`];
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
  if (!Array.isArray(r.metadataRemoved) || !r.metadataRemoved.every((t) => typeof t === 'string' && TAG.test(t))) fail('metadataRemoved');
  const piiOk = (p) => p && PII_LABELS.has(p.label) && Number.isInteger(p.page) && p.page > 0
    && typeof p.match === 'string' && p.match.length > 0 && p.match.length <= 200;
  if (!Array.isArray(r.pii) || !r.pii.every(piiOk)) fail('pii');
  return {
    code: r.code,
    name: r.name,
    virus: null,
    metadataRemoved: [...r.metadataRemoved],
    hasText: r.hasText,
    piiChecked: r.piiChecked,
    pii: r.pii.map((p) => ({ label: p.label, page: p.page, match: p.match })),
    size: r.size,
    sha256: r.sha256,
  };
}

// Comment báo cáo do workflow (github-actions) viết trước đó, để sửa thay vì thêm mới.
export function findReportComment(comments) {
  const c = comments.find((x) => x.user && x.user.login === 'github-actions[bot]' && String(x.body).startsWith(REPORT_MARKER));
  return c ? c.id : null;
}

export function failureReport({ reason, runUrl }) {
  const out = [REPORT_MARKER, '## Kết quả kiểm file', '', 'Không kiểm được file. Người duyệt xem nhật ký của lần chạy để xử lý.'];
  if (reason && reason.trim()) out.push('', reason.trim().slice(0, 2000));
  out.push('', runUrl);
  return out.join('\n') + '\n';
}

export function bookReport(code) {
  return [
    REPORT_MARKER,
    `## Kết quả kiểm bài ${code}`,
    '',
    'Bài này là sách tham khảo, không có file, nên không quét virus hay tìm thông tin cá nhân trong file.',
    'Đã dựng lại chỉ mục của môn. Người duyệt kiểm tên sách và tác giả rồi gộp bài.',
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
    'Kiểm dữ liệu của repo không qua. Người duyệt sửa mục tài liệu theo các lỗi dưới đây.',
    FENCE,
    body || '(không có dòng lỗi, xem nhật ký)',
    FENCE,
  ].join('\n');
}

// Release đã có file cùng tên khác nội dung thì thêm 6 ký tự đầu sha256 trước đuôi.
export function releaseName(name, sha256, existingAssets) {
  const prev = existingAssets.get(name);
  if (prev === undefined || prev === sha256) return name;
  const dot = name.lastIndexOf('.');
  if (dot < 0) return `${name}-${sha256.slice(0, 6)}`;
  return `${name.slice(0, dot)}-${sha256.slice(0, 6)}${name.slice(dot)}`;
}

// Ghi link Release và thông tin bản đã làm sạch vào files[0]. Không sửa item gốc.
export function applyCheck(item, { cleanName, size, sha256, mime, term, repo, existingAssets }) {
  const { code } = quarantineInfo(item);
  const name = releaseName(cleanName, sha256, existingAssets);
  const file = {
    ...item.files[0],
    name,
    size,
    sha256,
    mime,
    quarantine: `clean/${code}/${name}`,
    url: releaseAssetUrl(repo, releaseTag(term), name),
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

// Chạy công cụ ngoài, trả stdout; mã thoát ngoài ok thì báo lỗi.
function tool(cmd, argv, ok = [0]) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`Không chạy được ${cmd}: ${r.error.message}`);
  if (!ok.includes(r.status)) throw new Error(`${cmd} lỗi (mã ${r.status}): ${String(r.stderr).trim()}`);
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

// Xóa siêu dữ liệu bằng exiftool, rồi qpdf viết lại file để bỏ hẳn bản cũ.
function cleanPdf(src, dest) {
  const work = `${dest}.work.pdf`;
  fs.copyFileSync(src, work);
  const before = exifJson(work);
  tool('exiftool', ['-all:all=', '-overwrite_original', work]);
  // qpdf trả mã 3 khi chỉ có cảnh báo, file vẫn được ghi. --deterministic-id: cùng file gốc
  // cho cùng bản sạch (ID không lấy theo giờ), nên sha256 bản sạch ổn định giữa các lần chạy.
  tool('qpdf', ['--linearize', '--deterministic-id', work, dest], [0, 3]);
  fs.rmSync(work);
  return removedTags(before, exifJson(dest));
}

function pdfPages(p) {
  const m = /^Pages:\s+(\d+)/m.exec(tool('pdfinfo', [p]).stdout);
  if (!m) throw new Error('Không đọc được số trang của PDF.');
  const pages = [];
  for (let i = 1; i <= Number(m[1]); i++) {
    pages.push(tool('pdftotext', ['-f', String(i), '-l', String(i), '-enc', 'UTF-8', p, '-']).stdout);
  }
  return pages;
}

// Tên và sha256 các file đã có trên Release; Release chưa có thì rỗng.
export function releaseAssets(repo, tag) {
  const r = spawnSync('gh', ['api', `repos/${repo}/releases/tags/${tag}`], { encoding: 'utf8' });
  if (r.status !== 0) {
    if (/HTTP 404/.test(r.stderr)) return new Map();
    throw new Error(`Không đọc được Release ${tag}: ${String(r.stderr).trim()}`);
  }
  const assets = JSON.parse(r.stdout).assets || [];
  return new Map(assets.map((x) => [x.name, String(x.digest || '').replace(/^sha256:/, '')]));
}

export function readPrFiles(p) {
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function locate(a) {
  const rel = pickItemFile(readPrFiles(a.files));
  const out = { item: rel, course: ITEM_FILE.exec(rel)[1], ...locateInfo(readJson(path.join(a.pr, rel)), a.branch) };
  writeOutputs(a['output-file'], out);
  return out;
}

function scan(a) {
  const policy = loadPolicy(TOOL_ROOT);
  const info = quarantineInfo(readJson(a.item));
  const ext = path.extname(info.name).toLowerCase();
  if (!policy.extensions[ext]) throw new Error(`Không nhận đuôi ${ext}.`);
  const src = path.join(a.dir, info.name);
  if (sha256File(src) !== info.sha256) throw new Error('File trong kho cách ly khác sha256 ghi trong mục.');
  fs.mkdirSync(a.out, { recursive: true });
  const write = (r) => fs.writeFileSync(path.join(a.out, 'result.json'), JSON.stringify(r));

  const av = tool('clamscan', ['--no-summary', src], [0, 1, 2]);
  const verdict = parseClamscan(av.stdout, av.status);
  if (verdict.infected) return write({ code: info.code, name: info.name, virus: verdict.signature });

  const cleanDir = path.join(a.out, 'clean');
  fs.mkdirSync(cleanDir, { recursive: true });
  const cleanFile = path.join(cleanDir, info.name);
  let metadataRemoved = [];
  let hasText = null;
  let pii = [];
  let piiChecked = true;
  if (ext === '.pdf') {
    metadataRemoved = cleanPdf(src, cleanFile);
    ({ hasText, pii } = piiFromPages(pdfPages(cleanFile)));
  } else {
    fs.copyFileSync(src, cleanFile);
    if (ext === '.md' || ext === '.json') ({ pii } = piiFromPages([fs.readFileSync(cleanFile, 'utf8')]));
    else piiChecked = false;
  }
  write({
    code: info.code, name: info.name, virus: null, metadataRemoved, hasText, piiChecked, pii,
    size: fs.statSync(cleanFile).size, sha256: sha256File(cleanFile),
  });
}

function apply(a) {
  const policy = loadPolicy(TOOL_ROOT);
  const item = readJson(a.item);
  const info = quarantineInfo(item);
  const r = validateResult(readJson(a.result), info);
  const done = (report, values) => {
    fs.writeFileSync(a.report, report);
    writeOutputs(a['output-file'], values);
  };
  if (r.virus) return done(renderReport({ code: info.code, virus: r.virus }), { virus: r.virus, quarantine: '', clean: '' });

  // Không tin con số trong kết quả: tính lại trên chính file sẽ đưa lên kho.
  const cleanFile = path.join(a['clean-dir'], info.name);
  if (sha256File(cleanFile) !== r.sha256 || fs.statSync(cleanFile).size !== r.size) {
    throw new Error('File đã làm sạch không khớp sha256 hoặc kích thước trong kết quả quét.');
  }
  const rule = policy.extensions[path.extname(info.name).toLowerCase()];
  if (!rule) throw new Error('Không nhận đuôi của file.');
  const term = termFor(new Date(), policy.terms);
  const next = applyCheck(item, {
    cleanName: info.name, size: r.size, sha256: r.sha256, mime: rule.mime, term, repo: a.repo,
    existingAssets: releaseAssets(a.repo, releaseTag(term)),
  });
  fs.writeFileSync(a.item, `${JSON.stringify(next, null, 2)}\n`);
  const report = renderReport({
    code: info.code, virus: null, metadataRemoved: r.metadataRemoved, hasText: r.hasText, pii: r.pii,
    piiChecked: r.piiChecked, url: next.files[0].url,
  });
  done(report, { virus: '', quarantine: next.files[0].quarantine, clean: cleanFile });
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
  else if (cmd === 'apply') apply(a);
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
