#!/usr/bin/env node
// Nạp riêng cho chủ dự án qua POST /xem-duyet/nap (worker/src/routes/intake.mjs, sau Cloudflare Access). Dùng đúng
// site-src/assets/upload-chunks.js của form: trình duyệt hay script đều tính sha256 rồi gửi file theo phần, Worker chỉ
// chuyển dữ liệu vào R2 (gói Worker miễn phí giới hạn 10 ms CPU mỗi request). Xem docs/cai-dat-luong-tai-len.md mục 8.8.
//
//   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... node scripts/upload/nap.mjs --bai bai.json [--worker https://upload.xerozsoft.com]
//
// bai.json (một bài, một môn, tối đa batchMaxFiles file):
//   { "course": "AS1003", "type": "lecture-slides", "license": "CC-BY-SA-4.0", "teacher": "...", "term": "HK251",
//     "examKind": "gk", "description": "...", "files": [{ "path": "a.pdf", "title": "Slide chương 8", "type": "..." }] }
// Các ô ngoài files là ô chung của bài (như form); type, title của từng file ghi đè ô chung.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { TOOL_ROOT } from '../lib/repo.mjs';
import { loadPolicy } from '../lib/policy.mjs';

const SHARED = ['course', 'type', 'title', 'license', 'teacher', 'displayName', 'term', 'examKind', 'chapter', 'description', 'lang', 'notifyEmail', 'newCourseCode', 'newCourseName'];

// Ô form của một bài: ô chung, title-<i>, type-<i> của từng file, ba ô xác nhận (người nạp đã xác nhận quyền chia sẻ).
export function intakeFields(bai) {
  const fields = new FormData();
  for (const k of SHARED) if (bai[k] !== undefined && bai[k] !== '') fields.set(k, String(bai[k]));
  bai.files.forEach((f, i) => {
    if (f.title) fields.set(`title-${i}`, f.title);
    if (f.type) fields.set(`type-${i}`, f.type);
  });
  if (!fields.has('title') && bai.files[0]?.title) fields.set('title', bai.files[0].title);
  for (const k of ['confirm-own', 'confirm-license', 'confirm-not-book']) fields.set(k, 'on');
  return fields;
}

async function main(argv) {
  const a = { worker: 'https://upload.xerozsoft.com' };
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!a.bai) throw new Error('Cần --bai <file JSON của bài>.');
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Cần biến môi trường CF_ACCESS_CLIENT_ID và CF_ACCESS_CLIENT_SECRET (service token của Access).');
  const bai = JSON.parse(fs.readFileSync(a.bai, 'utf8'));
  const dir = path.dirname(path.resolve(a.bai));
  const files = await Promise.all(bai.files.map(async (f) => new File([await fs.openAsBlob(path.resolve(dir, f.path))], path.basename(f.path))));

  const ctx = vm.createContext({ fetch, FormData, File, Blob, btoa, Promise, Uint8Array, Uint32Array, Math, encodeURIComponent, JSON, String });
  vm.runInContext(fs.readFileSync(path.join(TOOL_ROOT, 'site-src', 'assets', 'upload-chunks.js'), 'utf8'), ctx);
  const res = await ctx.BkChunks.upload(`${a.worker}/xem-duyet/nap`, intakeFields(bai), files, loadPolicy(TOOL_ROOT).uploadPartBytes, (p) => process.stderr.write(`\r${Math.round(p * 100)}%`), {
    headers: { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret },
    uploadBase: a.worker,
  });
  process.stderr.write('\n');
  console.log(JSON.stringify({ status: res.status, ...res.body }));
  if (!res.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
