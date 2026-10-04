#!/usr/bin/env node
// Dựng bản xem thử với dữ liệu mẫu: nhập test/fixtures/seed-mau.json (vài môn của một
// chương trình) vào một thư mục tạm, chép tài liệu ví dụ của repo, rồi sinh trang vào site/.
// Không đụng tới catalog/ thật.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT } from './lib/repo.mjs';
import { importSeed } from './import-seed.mjs';
import { run as validate } from './validate.mjs';
import { buildSite } from './build-site.mjs';

export function makeDemo(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
  for (const f of ['faculties.json', 'partners.json']) {
    fs.copyFileSync(path.join(TOOL_ROOT, 'catalog', f), path.join(dir, 'catalog', f));
  }
  const faculties = JSON.parse(fs.readFileSync(path.join(dir, 'catalog', 'faculties.json'), 'utf8'));
  const seed = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'test', 'fixtures', 'seed-mau.json'), 'utf8'));
  importSeed(seed, dir, { date: '2026-10-03', faculties });
  for (const id of fs.readdirSync(path.join(TOOL_ROOT, 'courses'))) {
    const items = path.join(TOOL_ROOT, 'courses', id, 'items');
    if (!fs.existsSync(items) || !fs.existsSync(path.join(dir, 'catalog', 'courses', `${id}.json`))) continue;
    fs.cpSync(items, path.join(dir, 'courses', id, 'items'), { recursive: true });
  }
  return dir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = makeDemo(path.join(os.tmpdir(), 'bk-study-library-demo'));
  const { ok } = validate(['--root', dir, '--write']);
  if (!ok) process.exit(1);
  const r = buildSite({ root: dir, out: path.join(TOOL_ROOT, 'site') });
  console.log(`Bản xem thử: ${r.pages} trang trong ${r.out} (dữ liệu tạm ở ${dir})`);
}
