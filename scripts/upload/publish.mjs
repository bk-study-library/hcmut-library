// Phát hành và gỡ file trên Release (workflows phat-hanh-file, don-kho).
// Phần logic là hàm thuần để test; phần CLI cuối file chỉ chạy khi gọi trực tiếp.
// Mọi lệnh chạy từ bản main (tin được); file tải từ R2 chỉ được tính hash, không chạy gì.
//
//   node scripts/upload/publish.mjs locate --files <pr-files.jsonl> --root <repo> --branch <nhánh> --output-file <f>
//     tìm mục tài liệu duy nhất của PR đã merge, đọc ở <repo> (bản main); ghi item, code, light
//     (light=true: sách tham khảo không file, không có gì để phát hành hay dọn trong kho)
//   node scripts/upload/publish.mjs kind --files <pr-files.jsonl> --root <thư mục PR> --branch <nhánh> --output-file <f>
//     ghi light=true khi chắc chắn PR là sách tham khảo không file; mọi trường hợp khác light=false, không lỗi
//   node scripts/upload/publish.mjs plan --item <path> --branch <nhánh> --repo <owner/name> --output-file <f>
//     kế hoạch phát hành (cần GH_TOKEN): publish=true thì có tag, name, quarantine, sha256, size để tải và đưa lên
//   node scripts/upload/publish.mjs verify --file <path> --sha256 <hex> --size <byte>
//     kiểm file đã tải từ R2 khớp mục tài liệu
//   node scripts/upload/publish.mjs code --branch <nhánh> --output-file <f>
//     kiểm tên nhánh upload/<mã bài>, ghi code và branch
//   node scripts/upload/publish.mjs pending-sha --dir <thư mục> --output-file <f>
//     sha256 của file cách ly gốc (khóa chặn gửi trùng sha/<sha256>); không có file thì sha rỗng
//   node scripts/upload/publish.mjs unpublish --before <sha> --after <sha> --repo <owner/name>
//     xóa file trên Release của mục vừa chuyển sang removed (cần GH_TOKEN)
//
// Lỗi thì in ra stderr và thoát mã 1.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRepo } from '../lib/repo.mjs';
import { quarantineInfo, locateInfo, pickItemFile, githubOutput, releaseAssets, branchCode, readPrFiles } from './check.mjs';

export { branchCode };

const TAG = /^files-[A-Za-z0-9]{1,32}$/;
const ITEM_PATH = /^courses\/[A-Za-z0-9_-]+\/items\/[A-Za-z0-9_-]+\.json$/;

// ---------- Hàm thuần ----------

// Link Release của repo thì trả { tag, name }, ngoài ra (link ngoài, repo khác, dạng lạ) trả null.
export function parseReleaseUrl(url, repo) {
  const prefix = `https://github.com/${repo}/releases/download/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  const parts = url.slice(prefix.length).split('/');
  if (parts.length !== 2 || !TAG.test(parts[0]) || !parts[1]) return null;
  let name;
  try {
    name = decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
  if (/[/\\\u0000-\u001f]/.test(name) || name.startsWith('.')) return null;
  return { tag: parts[0], name };
}

// itemsChanged: mục tài liệu của PR đã merge. existingAssets: Map<tag, Map<tên, sha256>> của các Release đã có.
// Trả việc cần làm cho từng file: tải clean/... về và đưa lên Release. Bỏ qua file cùng tên cùng sha256;
// cùng tên khác sha256 thì báo lỗi, không ghi đè.
export function planPublish(itemsChanged, existingAssets, repo) {
  const plan = [];
  for (const item of itemsChanged) {
    if (item.removed) continue;
    const info = quarantineInfo(item);
    if (!info.key.startsWith('clean/')) throw new Error('Mục tài liệu chưa có bản đã làm sạch trong kho cách ly.');
    const file = item.files[0];
    const target = parseReleaseUrl(file.url, repo);
    if (!target) throw new Error('Link của file không trỏ Release của repo.');
    if (target.name !== info.name) throw new Error('Tên file trong link không khớp với chỗ cách ly.');
    if (!Number.isInteger(file.size) || file.size <= 0) throw new Error('Mục tài liệu không có kích thước hợp lệ.');
    const have = existingAssets.get(target.tag)?.get(target.name);
    if (have === info.sha256) continue;
    if (have === '') throw new Error(`Release ${target.tag} đã có ${target.name} nhưng không có digest sha256. Hãy kiểm tay file này rồi đổi tên file trong mục tài liệu.`);
    if (have !== undefined) throw new Error(`Release ${target.tag} đã có ${target.name} khác nội dung. Hãy đổi tên file rồi gửi lại.`);
    plan.push({ tag: target.tag, name: target.name, quarantine: info.key, sha256: info.sha256, size: file.size, code: info.code });
  }
  return plan;
}

// Mục vừa chuyển sang removed: true (trước chưa gỡ) thì xóa file trên Release của repo; link ngoài bỏ qua.
// liveItems: mọi mục ở bản sau; file mà mục còn hiệu lực khác vẫn dùng thì giữ lại.
export function planRemovals(itemsBefore, itemsAfter, repo, liveItems = []) {
  const inUse = new Set();
  for (const it of liveItems) {
    if (it.removed) continue;
    for (const f of it.files || []) {
      const t = parseReleaseUrl(f.url, repo);
      if (t) inUse.add(`${t.tag}/${t.name}`);
    }
  }
  const key = (i) => `${i.course}/${i.id}`;
  const before = new Map(itemsBefore.map((i) => [key(i), i]));
  const out = [];
  for (const item of itemsAfter) {
    const prev = before.get(key(item));
    if (!prev || prev.removed || !item.removed) continue;
    for (const f of item.files || []) {
      const target = parseReleaseUrl(f.url, repo);
      if (target && !inUse.has(`${target.tag}/${target.name}`) && !out.some((o) => o.tag === target.tag && o.name === target.name)) out.push(target);
    }
  }
  return out;
}

// Dọn kho: chỉ bỏ qua R2 khi chắc chắn PR là sách tham khảo không file. PR lạ hay đọc lỗi thì
// trả false để dọn như thường (dọn chỗ trống không hại gì), không bao giờ ném lỗi.
// readItem(rel): đọc mục tài liệu theo đường dẫn trong PR.
export function isLightPr(files, readItem, branch) {
  try {
    return locateInfo(readItem(pickItemFile(files)), branch).light === 'true';
  } catch {
    return false;
  }
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// Thư mục chứa file cách ly gốc đã tải về. Không có file thì trả chuỗi rỗng.
export function pendingSha(dir) {
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile());
  if (files.length === 0) return '';
  if (files.length > 1) throw new Error('Kho cách ly có nhiều file cho một bài.');
  return sha256File(path.join(dir, files[0].name));
}

export function verifyFile(file, sha256, size) {
  const actual = fs.statSync(file).size;
  if (actual !== Number(size)) throw new Error(`Sai kích thước: file tải về ${actual} byte, mục tài liệu ghi ${size}.`);
  if (sha256File(file) !== sha256) throw new Error('Sai sha256: file tải về không khớp mục tài liệu.');
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

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeOutputs(file, values) {
  if (file) fs.appendFileSync(file, githubOutput(values, `EOF_${crypto.randomBytes(16).toString('hex')}`));
}

function run(cmd, argv) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`Không chạy được ${cmd}: ${r.error.message}`);
  return r;
}

function locate(a) {
  const rel = pickItemFile(readPrFiles(a.files));
  const info = locateInfo(readJson(path.join(a.root, rel)), a.branch);
  writeOutputs(a['output-file'], { item: rel, code: info.code, light: info.light });
}

function kind(a) {
  let files = [];
  try {
    files = readPrFiles(a.files);
  } catch {
    // Không đọc được danh sách file: dọn như thường.
  }
  const light = isLightPr(files, (rel) => readJson(path.join(a.root, rel)), a.branch);
  writeOutputs(a['output-file'], { light: String(light) });
}

function plan(a) {
  branchCode(a.branch);
  const item = readJson(a.item);
  const info = quarantineInfo(item, a.branch);
  const target = parseReleaseUrl(item.files[0].url, a.repo);
  if (!target) throw new Error('Link của file không trỏ Release của repo.');
  const existing = new Map([[target.tag, releaseAssets(a.repo, target.tag)]]);
  const [todo] = planPublish([item], existing, a.repo);
  writeOutputs(a['output-file'], todo ? { publish: 'true', ...todo } : { publish: 'false', code: info.code });
}

function code(a) {
  const c = branchCode(a.branch);
  writeOutputs(a['output-file'], { code: c, branch: `upload/${c}` });
}

function unpublish(a) {
  for (const sha of [a.before, a.after]) {
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('Mã commit không hợp lệ.');
  }
  // Nhánh mới tạo (before toàn số 0): không có bản trước để so.
  if (/^0+$/.test(a.before)) return;
  const diff = run('git', ['diff', '--name-only', '-z', '--diff-filter=AM', a.before, a.after, '--', 'courses']);
  if (diff.status !== 0) throw new Error(`git diff lỗi: ${diff.stderr.trim()}`);
  const paths = diff.stdout.split('\0').filter((p) => ITEM_PATH.test(p));
  const itemsBefore = [];
  const itemsAfter = [];
  for (const p of paths) {
    const shown = run('git', ['show', `${a.before}:${p}`]);
    if (shown.status !== 0) continue;
    itemsBefore.push(JSON.parse(shown.stdout));
    itemsAfter.push(readJson(p));
  }
  const live = loadRepo('.').items;
  for (const { tag, name } of planRemovals(itemsBefore, itemsAfter, a.repo, live)) {
    if (!releaseAssets(a.repo, tag).has(name)) {
      console.log(`Release ${tag} không có ${name}, bỏ qua.`);
      continue;
    }
    const r = run('gh', ['release', 'delete-asset', tag, name, '--repo', a.repo, '--yes']);
    if (r.status !== 0) throw new Error(`Không xóa được ${name} trên Release ${tag}: ${r.stderr.trim()}`);
    console.log(`Đã xóa ${name} trên Release ${tag}.`);
  }
}

function main(argv) {
  const cmd = argv.shift();
  const a = args(argv);
  if (cmd === 'locate') locate(a);
  else if (cmd === 'kind') kind(a);
  else if (cmd === 'plan') plan(a);
  else if (cmd === 'verify') verifyFile(a.file, a.sha256, a.size);
  else if (cmd === 'code') code(a);
  else if (cmd === 'pending-sha') writeOutputs(a['output-file'], { sha: pendingSha(a.dir) });
  else if (cmd === 'unpublish') unpublish(a);
  else throw new Error(`lệnh lạ: ${cmd}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
