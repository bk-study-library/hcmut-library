// Phát hành và gỡ file trên Release (workflows phat-hanh-file, don-kho).
// Phần logic là hàm thuần để test; phần CLI cuối file chỉ chạy khi gọi trực tiếp.
// Mọi lệnh chạy từ bản main (tin được); file tải từ R2 chỉ được tính hash, không chạy gì.
//
//   node scripts/upload/publish.mjs locate --files <pr-files.jsonl> --root <repo> --branch <branch> --output-file <f>
//     tìm item duy nhất của PR đã merge, đọc ở <repo> (bản main); ghi item, code, light, branch
//     (light=true: sách tham khảo không file, không có gì để phát hành hay dọn trong kho)
//   node scripts/upload/publish.mjs kind --files <pr-files.jsonl> --root <thư mục PR> --branch <branch> --output-file <f>
//     ghi light=true khi chắc chắn PR là sách tham khảo không file; mọi trường hợp khác light=false, không lỗi
//   node scripts/upload/publish.mjs dispatch-locate --item <courses/<MÃ>/items/<id>.json> --root <repo> --output-file <f>
//     chạy tay (workflow_dispatch): kiểm đường dẫn người bảo trì nhập, mục phải do bot tải lên và
//     còn bản đã sanitize trong bucket quarantine; ghi item, code, light=false, branch=upload/<mã bài>
//   node scripts/upload/publish.mjs plan --item <path> --branch <branch> --repo <owner/name> --output-file <f>
//     kế hoạch phát hành (cần GH_TOKEN): publish=true thì có tag, name, quarantine, sha256, size để tải và đưa lên
//   node scripts/upload/publish.mjs verify --file <path> --sha256 <hex> --size <byte>
//     kiểm file đã tải từ R2 khớp item
//   node scripts/upload/publish.mjs code --branch <branch> --output-file <f>
//     kiểm tên branch upload/<mã bài>, ghi code và branch
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
import { quarantineInfo, locateInfo, pickItemFile, pickItemFiles, batchManifest, githubOutput, releaseAssets, releaseInfo, branchCode, readPrFiles } from './check.mjs';
import { loadPolicy } from '../lib/policy.mjs';

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

// itemsChanged: item của PR đã merge. existingAssets: Map<tag, Map<tên, sha256>> của các Release đã có.
// Trả việc cần làm cho từng file: tải clean/... về và đưa lên Release. Bỏ qua file cùng tên cùng sha256;
// cùng tên khác sha256 thì báo lỗi, không ghi đè.
export function planPublish(itemsChanged, existingAssets, repo) {
  const plan = [];
  for (const item of itemsChanged) {
    if (item.removed) continue;
    const info = quarantineInfo(item);
    if (!info.key.startsWith('clean/')) throw new Error('Item chưa có bản đã sanitize trong bucket quarantine.');
    const file = item.files[0];
    const target = parseReleaseUrl(file.url, repo);
    if (!target) throw new Error('Link của file không trỏ Release của repo.');
    if (target.name !== info.name) throw new Error('Tên file trong link không khớp với chỗ cách ly.');
    if (!Number.isInteger(file.size) || file.size <= 0) throw new Error('Item không có kích thước hợp lệ.');
    const have = existingAssets.get(target.tag)?.get(target.name);
    if (have === info.sha256) continue;
    if (have === '') throw new Error(`Release ${target.tag} đã có ${target.name} nhưng không có digest sha256. Hãy kiểm tay file này rồi đổi tên file trong item.`);
    if (have !== undefined) throw new Error(`Release ${target.tag} đã có ${target.name} khác nội dung. Hãy đổi tên file rồi gửi lại.`);
    plan.push({ tag: target.tag, name: target.name, quarantine: info.key, sha256: info.sha256, size: file.size, code: info.code });
  }
  return plan;
}

// Phát hành lại bằng workflow_dispatch. rel là chuỗi người bảo trì nhập (chưa tin được), readItem(rel)
// đọc mục ở bản main (ném lỗi khi không có file). Mục phải do bot tải lên: có đúng một file với
// khóa clean/<mã bài>/<tên> trong bucket quarantine, chưa gỡ, và nằm đúng chỗ theo course và id.
export function dispatchTarget(rel, readItem) {
  if (typeof rel !== 'string' || !ITEM_PATH.test(rel)) {
    throw new Error('Đường dẫn item không hợp lệ. Cần dạng courses/<MÃ>/items/<id>.json.');
  }
  let item;
  try {
    item = readItem(rel);
  } catch {
    throw new Error(`Không đọc được ${rel} trên main.`);
  }
  if (!item || typeof item !== 'object') throw new Error(`${rel} không phải item.`);
  if (rel !== `courses/${item.course}/items/${item.id}.json`) throw new Error(`${rel} không khớp course và id ghi trong mục.`);
  if (item.removed) throw new Error(`${rel} đã gỡ (removed: true), không phát hành lại.`);
  const info = quarantineInfo(item);
  if (!info.key.startsWith('clean/')) throw new Error('Item chưa có bản đã sanitize trong bucket quarantine.');
  return { item: rel, code: info.code, light: 'false', branch: `upload/${info.code}` };
}

// Thông báo khi Release đích là immutable release: GitHub không cho đưa thêm file, kể cả sau khi
// tắt tính năng (chỉ Release tạo sau đó mới sửa được), và tag của nó không dùng lại được.
export function immutableReleaseMessage(tag) {
  return [
    `Release ${tag} là immutable release nên không đưa thêm file lên được.`,
    'Người bảo trì làm như sau:',
    '(1) tắt Immutable releases trong Settings của repo (trang General);',
    `(2) đặt tag mới cho học kỳ trong releaseTagOverrides của catalog/policy.json, ví dụ "HK261": "files-HK261b" (tag ${tag} không dùng lại được);`,
    '(3) sửa url của item sang tag mới, chạy npm run build, merge vào main;',
    '(4) chạy lại workflow phat-hanh-file bằng workflow_dispatch với ô item là đường dẫn item.',
    'Xem docs/cai-dat-luong-tai-len.md, mục Release.',
  ].join(' ');
}

// Release đích có thể nhận file không: lỗi khi đang có file cần đưa lên mà Release là immutable.
export function assertReleaseWritable(todo, release, tag) {
  if (todo && release.immutable) throw new Error(immutableReleaseMessage(tag));
}

const itemKey = (i) => `${i.course}/${i.id}`;

// Mục có ở bản trước (chưa gỡ) nhưng file mục bị xóa khỏi repo, mà có file trên Release của repo.
// Gỡ tài liệu phải đặt removed: true, không xóa file mục; validate.mjs --base báo lỗi theo hàm này.
export function deletedWithRelease(itemsBefore, itemsAfter, repo) {
  const after = new Set(itemsAfter.map(itemKey));
  return itemsBefore
    .filter((it) => !it.removed && !after.has(itemKey(it)))
    .map((it) => ({ course: it.course, id: it.id, assets: (it.files || []).map((f) => parseReleaseUrl(f.url, repo)).filter(Boolean) }))
    .filter((x) => x.assets.length);
}

// File trên Release của repo cần xóa: của mục vừa chuyển sang removed: true (trước chưa gỡ), và của mục
// bị xóa hẳn khỏi repo (có ở itemsBefore, không có ở itemsAfter). Link ngoài bỏ qua.
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
  const before = new Map(itemsBefore.map((i) => [itemKey(i), i]));
  const files = [];
  for (const item of itemsAfter) {
    const prev = before.get(itemKey(item));
    if (!prev || prev.removed || !item.removed) continue;
    files.push(...(item.files || []));
  }
  for (const gone of deletedWithRelease(itemsBefore, itemsAfter, repo)) {
    files.push(...before.get(itemKey(gone)).files);
  }
  const out = [];
  for (const f of files) {
    const target = parseReleaseUrl(f.url, repo);
    if (target && !inUse.has(`${target.tag}/${target.name}`) && !out.some((o) => o.tag === target.tag && o.name === target.name)) out.push(target);
  }
  return out;
}

// Dọn kho: chỉ bỏ qua R2 khi chắc chắn PR là sách tham khảo không file. PR lạ hay đọc lỗi thì
// trả false để dọn như thường (dọn chỗ trống không hại gì), không bao giờ ném lỗi.
// readItem(rel): đọc item theo đường dẫn trong PR.
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
// sha256 của mọi file cách ly gốc của một bài (đợt gửi có nhiều file).
export function pendingShas(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => sha256File(path.join(dir, e.name))).sort();
}

export function pendingSha(dir) {
  if (!fs.existsSync(dir)) return '';
  const files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile());
  if (files.length === 0) return '';
  if (files.length > 1) throw new Error('Kho cách ly có nhiều file cho một bài.');
  return sha256File(path.join(dir, files[0].name));
}

export function verifyFile(file, sha256, size) {
  const actual = fs.statSync(file).size;
  if (actual !== Number(size)) throw new Error(`Sai kích thước: file tải về ${actual} byte, item ghi ${size}.`);
  if (sha256File(file) !== sha256) throw new Error('Sai sha256: file tải về không khớp item.');
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

// Một hay nhiều mục (đợt gửi): item là mục đầu, items là mọi mục (mỗi dòng một đường dẫn).
function locate(a) {
  const rels = pickItemFiles(readPrFiles(a.files), loadPolicy(path.resolve(a.root)).batchMaxFiles || 1);
  const list = batchManifest(rels, (rel) => readJson(path.join(a.root, rel)), a.branch);
  // batchManifest đã kiểm branch khớp mã bài; branch ghi ra để bước sau dùng chung với dispatch-locate.
  writeOutputs(a['output-file'], { item: list[0].item, items: rels.join('\n'), code: list[0].code, light: list[0].light, branch: a.branch });
}

// Kế hoạch phát hành cho nhiều mục: mỗi dòng của --plan-file là "tag<TAB>tên<TAB>khóa kho<TAB>sha256<TAB>cỡ"
// cho file cần đưa lên. Kiểm sớm mọi Release đích như plan.
function planBatch(a) {
  branchCode(a.branch);
  const rows = [];
  const releases = new Map();
  for (const rel of a.items.split('\n').filter(Boolean)) {
    const item = readJson(path.join(a.root, rel));
    quarantineInfo(item, a.branch);
    const target = parseReleaseUrl(item.files[0].url, a.repo);
    if (!target) throw new Error(`Link của file trong ${rel} không trỏ Release của repo.`);
    if (!releases.has(target.tag)) releases.set(target.tag, releaseInfo(a.repo, target.tag));
    const release = releases.get(target.tag);
    const [todo] = planPublish([item], new Map([[target.tag, release.assets]]), a.repo);
    assertReleaseWritable(todo, release, target.tag);
    if (todo) rows.push([todo.tag, todo.name, todo.quarantine, todo.sha256, todo.size].join('\t'));
  }
  fs.writeFileSync(a['plan-file'], rows.map((r) => `${r}\n`).join(''));
  writeOutputs(a['output-file'], { publish: rows.length ? 'true' : 'false' });
}

function dispatchLocate(a) {
  const readItem = (rel) => {
    const p = path.join(a.root, rel);
    // Chỉ file thường trong repo, không theo symlink.
    if (!fs.lstatSync(p).isFile()) throw new Error('không phải file');
    return readJson(p);
  };
  writeOutputs(a['output-file'], dispatchTarget(a.item, readItem));
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
  const release = releaseInfo(a.repo, target.tag);
  const [todo] = planPublish([item], new Map([[target.tag, release.assets]]), a.repo);
  // Kiểm sớm, trước khi tải file từ bucket quarantine: immutable release thì gh release upload chắc chắn lỗi 422.
  assertReleaseWritable(todo, release, target.tag);
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
  // Branch mới tạo (before toàn số 0): không có bản trước để so.
  if (/^0+$/.test(a.before)) return;
  // Cả file mục bị xóa (D): gỡ bằng cách xóa file mục thì file trên Release cũng phải xóa.
  const diff = run('git', ['diff', '--name-status', '-z', '--no-renames', '--diff-filter=AMD', a.before, a.after, '--', 'courses']);
  if (diff.status !== 0) throw new Error(`git diff lỗi: ${diff.stderr.trim()}`);
  const parts = diff.stdout.split('\0');
  const itemsBefore = [];
  const itemsAfter = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [status, p] = [parts[i], parts[i + 1]];
    if (!ITEM_PATH.test(p)) continue;
    const shown = run('git', ['show', `${a.before}:${p}`]);
    if (shown.status === 0) itemsBefore.push(JSON.parse(shown.stdout));
    if (status !== 'D') itemsAfter.push(readJson(p));
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
  else if (cmd === 'dispatch-locate') dispatchLocate(a);
  else if (cmd === 'kind') kind(a);
  else if (cmd === 'plan') plan(a);
  else if (cmd === 'plan-batch') planBatch(a);
  else if (cmd === 'verify') verifyFile(a.file, a.sha256, a.size);
  else if (cmd === 'code') code(a);
  else if (cmd === 'pending-sha') {
    const shas = pendingShas(a.dir);
    writeOutputs(a['output-file'], { sha: shas[0] || '', shas: shas.join('\n') });
  }
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
