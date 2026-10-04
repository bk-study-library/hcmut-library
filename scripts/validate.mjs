#!/usr/bin/env node
// Kiểm toàn bộ thư viện rồi dựng index.json, index.min.json, v1/ và README từng môn.
//
//   node scripts/validate.mjs            kiểm, và báo lỗi nếu file sinh ra đã cũ (dùng trong CI)
//   node scripts/validate.mjs --write    kiểm, rồi ghi lại index và README
//   node scripts/validate.mjs --root DIR kiểm một thư mục khác (dùng trong test)
//   node scripts/validate.mjs --base REF so với commit REF (git): báo lỗi khi file mục có file trên
//                                        Release bị xóa thay vì đặt removed: true (dùng trong CI)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRepo, buildIndex, serializeIndex, TOOL_ROOT } from './lib/repo.mjs';
import { syncReadmes } from './lib/readme.mjs';
import { buildV1, serializeV1 } from './lib/v1.mjs';
import { REPO } from './lib/labels.mjs';
import { deletedWithRelease } from './upload/publish.mjs';

const ITEM_PATH = /^courses\/[A-Za-z0-9_-]+\/items\/[A-Za-z0-9_-]+\.json$/;

// Mục có ở commit base nhưng file mục đã bị xóa, mà có file trên Release: lỗi ITEM_DELETED.
export function deletedItemErrors(root, base, repoItems) {
  const git = (argv) => spawnSync('git', argv, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const diff = git(['diff', '--name-only', '-z', '--no-renames', '--diff-filter=D', base, '--', 'courses']);
  if (diff.status !== 0) {
    return [{ code: 'GIT', file: base, msg: `không so được với ${base}: ${String(diff.stderr).trim()}` }];
  }
  const before = [];
  for (const p of diff.stdout.split('\0').filter((x) => ITEM_PATH.test(x))) {
    const shown = git(['show', `${base}:${p}`]);
    if (shown.status !== 0) continue;
    try {
      before.push({ ...JSON.parse(shown.stdout), _file: p });
    } catch {
      // Bản cũ không đọc được thì không có link để kiểm.
    }
  }
  return deletedWithRelease(before, repoItems, REPO).map((x) => ({
    code: 'ITEM_DELETED',
    file: `courses/${x.course}/items/${x.id}.json`,
    msg: 'file mục có file trên Release bị xóa; đặt "removed": true và "removedReason" thay vì xóa, để workflow gỡ file trên Release',
  }));
}

export function run(argv) {
  const args = { root: TOOL_ROOT, write: false, quiet: false, base: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = path.resolve(argv[++i]);
    else if (argv[i] === '--write') args.write = true;
    else if (argv[i] === '--quiet') args.quiet = true;
    // Commit đầu của bot trên nhánh upload/: file sinh ra chưa dựng lại (kiem-file sẽ dựng), chỉ cảnh báo.
    else if (argv[i] === '--allow-stale') args.allowStale = true;
    else if (argv[i] === '--base') args.base = argv[++i];
    else throw new Error(`tham số lạ: ${argv[i]}`);
  }
  const repo = loadRepo(args.root);
  if (args.base) repo.errors.push(...deletedItemErrors(args.root, args.base, repo.items));
  const index = buildIndex(repo);
  const { full, min } = serializeIndex(index);
  const stale = [];

  if (!repo.errors.length) {
    const targets = [
      ['index.json', full],
      ['index.min.json', min],
      ...serializeV1(buildV1(repo)).map(([p, c]) => [`v1/${p}`, c]),
    ];
    for (const [name, content] of targets) {
      const p = path.join(args.root, name);
      const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      if (cur !== content) {
        if (args.write) {
          fs.mkdirSync(path.dirname(p), { recursive: true });
          fs.writeFileSync(p, content);
        } else stale.push(name);
      }
    }
    // File môn trong v1/courses/ không còn môn tương ứng.
    const v1Courses = path.join(args.root, 'v1', 'courses');
    const wanted = new Set(targets.map(([n]) => n));
    if (fs.existsSync(v1Courses)) {
      for (const f of fs.readdirSync(v1Courses)) {
        const name = `v1/courses/${f}`;
        if (wanted.has(name)) continue;
        if (args.write) fs.rmSync(path.join(v1Courses, f));
        else stale.push(name);
      }
    }
    const readmes = syncReadmes(repo, { write: args.write });
    if (!args.write) stale.push(...readmes);
  }

  const log = args.quiet ? () => {} : (s) => console.log(s);
  for (const w of repo.warnings) log(`cảnh báo [${w.code}] ${w.file}: ${w.msg}`);
  for (const e of repo.errors) log(`LỖI [${e.code}] ${e.file}: ${e.msg}`);
  const staleErrors = args.allowStale ? 0 : stale.length;
  for (const s of stale) {
    if (args.allowStale) log(`cảnh báo [STALE] ${s}: file sinh ra chưa dựng lại, workflow kiem-file sẽ dựng`);
    else log(`LỖI [STALE] ${s}: file sinh ra đã cũ, chạy "npm run build" rồi commit`);
  }
  log(
    `${index.counts.courses} môn, ${index.counts.programs} chương trình, ${index.counts.items} tài liệu; ` +
      `${repo.errors.length + staleErrors} lỗi, ${repo.warnings.length + stale.length - staleErrors} cảnh báo`,
  );
  return { repo, index, stale, ok: repo.errors.length === 0 && staleErrors === 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok } = run(process.argv.slice(2));
  process.exit(ok ? 0 : 1);
}
