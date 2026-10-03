#!/usr/bin/env node
// Kiểm toàn bộ thư viện rồi dựng index.json, index.min.json và README từng môn.
//
//   node scripts/validate.mjs            kiểm, và báo lỗi nếu file sinh ra đã cũ (dùng trong CI)
//   node scripts/validate.mjs --write    kiểm, rồi ghi lại index và README
//   node scripts/validate.mjs --root DIR kiểm một thư mục khác (dùng trong test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepo, buildIndex, serializeIndex, TOOL_ROOT } from './lib/repo.mjs';
import { syncReadmes } from './lib/readme.mjs';

export function run(argv) {
  const args = { root: TOOL_ROOT, write: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = path.resolve(argv[++i]);
    else if (argv[i] === '--write') args.write = true;
    else if (argv[i] === '--quiet') args.quiet = true;
    else throw new Error(`tham số lạ: ${argv[i]}`);
  }
  const repo = loadRepo(args.root);
  const index = buildIndex(repo);
  const { full, min } = serializeIndex(index);
  const stale = [];

  if (!repo.errors.length) {
    const targets = [
      ['index.json', full],
      ['index.min.json', min],
    ];
    for (const [name, content] of targets) {
      const p = path.join(args.root, name);
      const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      if (cur !== content) {
        if (args.write) fs.writeFileSync(p, content);
        else stale.push(name);
      }
    }
    const readmes = syncReadmes(repo, { write: args.write });
    if (!args.write) stale.push(...readmes);
  }

  const log = args.quiet ? () => {} : (s) => console.log(s);
  for (const w of repo.warnings) log(`cảnh báo [${w.code}] ${w.file}: ${w.msg}`);
  for (const e of repo.errors) log(`LỖI [${e.code}] ${e.file}: ${e.msg}`);
  for (const s of stale) log(`LỖI [STALE] ${s}: file sinh ra đã cũ, chạy "npm run build" rồi commit`);
  log(
    `${index.counts.courses} môn, ${index.counts.programs} chương trình, ${index.counts.items} tài liệu; ` +
      `${repo.errors.length + stale.length} lỗi, ${repo.warnings.length} cảnh báo`,
  );
  return { repo, index, stale, ok: repo.errors.length === 0 && stale.length === 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ok } = run(process.argv.slice(2));
  process.exit(ok ? 0 : 1);
}
