// Kiểm file tải lên (workflow kiem-file): quét virus, làm sạch siêu dữ liệu PDF,
// tìm lớp chữ và thông tin cá nhân, ghi link Release vào mục tài liệu.
// Phần logic là hàm thuần để test; phần CLI cuối file chỉ chạy khi gọi trực tiếp.
//
//   node scripts/upload/check.mjs locate --files <pr-files.jsonl> --pr <thư mục PR> --branch <nhánh>
//     in JSON { item, code, key, name, sha256 } của mục tài liệu duy nhất trong PR
//   node scripts/upload/check.mjs --item <path> --dir <thư mục file đã tải> --repo <owner/name>
//     in JSON { report, item, virus, cleanFile }; không có virus thì ghi lại mục vào <path>
//   node scripts/upload/check.mjs comment --repo <owner/name> --pr <số> --body-file <file>
//     tạo hoặc sửa comment báo cáo (cần GH_TOKEN)
//   node scripts/upload/check.mjs failure --run-url <url> [--reason-file <file>]
//     in comment báo không kiểm được
//
// Lỗi thì in ra stderr, thoát mã 1 và ghi thêm vào file CHECK_ERROR_FILE nếu có biến này.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseClamscan, renderReport, REPORT_MARKER } from './report.mjs';
import { termFor, releaseTag, releaseAssetUrl } from './term.mjs';
import { scanText, TOOL_ROOT } from '../lib/repo.mjs';
import { loadPolicy } from '../lib/policy.mjs';

const QUARANTINE = /^(pending|clean)\/([A-Za-z0-9]{10})\/([^/]+)$/;
const ITEM_FILE = /^courses\/[^/]+\/items\/[^/]+\.json$/;
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
  if (!m || m[3] !== f.name) throw new Error('Mục tài liệu không có chỗ cách ly hợp lệ.');
  if (!/^[0-9a-f]{64}$/.test(String(f.sha256 || ''))) throw new Error('Mục tài liệu không có sha256 hợp lệ.');
  if (branch !== undefined && branch !== `upload/${m[2]}`) throw new Error('Mã bài không khớp với nhánh của PR.');
  return { code: m[2], key: f.quarantine, name: f.name, sha256: f.sha256 };
}

// files: [{ filename, status }] của PR. Trả đường dẫn mục tài liệu duy nhất.
export function pickItemFile(files) {
  const hits = files.filter((f) => ITEM_FILE.test(f.filename) && f.status !== 'removed');
  if (hits.length !== 1) throw new Error(`PR cần sửa đúng một file courses/<môn>/items/<id>.json, gặp ${hits.length}.`);
  return hits[0].filename;
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

// Comment báo cáo do workflow (github-actions) viết trước đó, để sửa thay vì thêm mới.
export function findReportComment(comments) {
  const c = comments.find((x) => x.user && x.user.login === 'github-actions[bot]' && String(x.body).startsWith(REPORT_MARKER));
  return c ? c.id : null;
}

export function failureReport({ reason, runUrl }) {
  const out = [REPORT_MARKER, '## Kết quả kiểm file', '', 'Không kiểm được file. Người duyệt xem nhật ký của lần chạy để xử lý.'];
  if (reason && reason.trim()) out.push('', reason.trim());
  out.push('', runUrl);
  return out.join('\n') + '\n';
}

// Release đã có file cùng tên khác nội dung thì thêm 6 ký tự đầu sha256 trước đuôi.
function releaseName(name, sha256, existingAssets) {
  const prev = existingAssets.get(name);
  if (prev === undefined || prev === sha256) return name;
  const dot = name.lastIndexOf('.');
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

function exifJson(p) {
  return JSON.parse(tool('exiftool', ['-json', '-G0', '-a', p]).stdout)[0];
}

// Xóa siêu dữ liệu bằng exiftool, rồi qpdf viết lại file để bỏ hẳn bản cũ.
function cleanPdf(src, dest) {
  const work = `${dest}.work.pdf`;
  fs.copyFileSync(src, work);
  const before = exifJson(work);
  tool('exiftool', ['-all:all=', '-overwrite_original', work]);
  // qpdf trả mã 3 khi chỉ có cảnh báo, file vẫn được ghi.
  tool('qpdf', ['--linearize', work, dest], [0, 3]);
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
function releaseAssets(repo, tag) {
  const r = spawnSync('gh', ['api', `repos/${repo}/releases/tags/${tag}`], { encoding: 'utf8' });
  if (r.status !== 0) {
    if (/HTTP 404/.test(r.stderr)) return new Map();
    throw new Error(`Không đọc được Release ${tag}: ${String(r.stderr).trim()}`);
  }
  const assets = JSON.parse(r.stdout).assets || [];
  return new Map(assets.map((a) => [a.name, String(a.digest || '').replace(/^sha256:/, '')]));
}

function locate(a) {
  const files = fs.readFileSync(a.files, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const rel = pickItemFile(files);
  const item = JSON.parse(fs.readFileSync(path.join(a.pr, rel), 'utf8'));
  return { item: rel, ...quarantineInfo(item, a.branch) };
}

function check(a) {
  const policy = loadPolicy(TOOL_ROOT);
  const item = JSON.parse(fs.readFileSync(a.item, 'utf8'));
  const info = quarantineInfo(item);
  const ext = path.extname(info.name).toLowerCase();
  const rule = policy.extensions[ext];
  if (!rule) throw new Error(`Không nhận đuôi ${ext}.`);
  const src = path.join(a.dir, info.name);
  if (sha256File(src) !== info.sha256) throw new Error('File trong kho cách ly khác sha256 ghi trong mục.');

  const scan = tool('clamscan', ['--no-summary', src], [0, 1, 2]);
  const av = parseClamscan(scan.stdout, scan.status);
  if (av.infected) {
    return { report: renderReport({ code: info.code, virus: av.signature }), item: null, virus: av.signature, cleanFile: null };
  }

  const cleanDir = path.join(a.dir, 'clean');
  fs.mkdirSync(cleanDir, { recursive: true });
  const cleanFile = path.join(cleanDir, info.name);
  let metadataRemoved = [];
  let hasText = null;
  let pii = [];
  if (ext === '.pdf') {
    metadataRemoved = cleanPdf(src, cleanFile);
    ({ hasText, pii } = piiFromPages(pdfPages(cleanFile)));
  } else {
    fs.copyFileSync(src, cleanFile);
    if (ext === '.md' || ext === '.json') ({ pii } = piiFromPages([fs.readFileSync(cleanFile, 'utf8')]));
  }

  const term = termFor(new Date(), policy.terms);
  const next = applyCheck(item, {
    cleanName: info.name,
    size: fs.statSync(cleanFile).size,
    sha256: sha256File(cleanFile),
    mime: rule.mime,
    term,
    repo: a.repo,
    existingAssets: releaseAssets(a.repo, releaseTag(term)),
  });
  fs.writeFileSync(a.item, `${JSON.stringify(next, null, 2)}\n`);
  const report = renderReport({ code: info.code, virus: null, metadataRemoved, hasText, pii, url: next.files[0].url });
  return { report, item: next, virus: null, cleanFile };
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

async function main(argv) {
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'check';
  const a = args(argv);
  if (cmd === 'locate') console.log(JSON.stringify(locate(a)));
  else if (cmd === 'check') console.log(JSON.stringify(check(a)));
  else if (cmd === 'comment') await comment(a);
  else if (cmd === 'failure') {
    const reason = a['reason-file'] && fs.existsSync(a['reason-file']) ? fs.readFileSync(a['reason-file'], 'utf8') : '';
    process.stdout.write(failureReport({ reason, runUrl: a['run-url'] }));
  } else throw new Error(`lệnh lạ: ${cmd}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    if (process.env.CHECK_ERROR_FILE) fs.appendFileSync(process.env.CHECK_ERROR_FILE, `${e.message}\n`);
    process.exit(1);
  });
}
