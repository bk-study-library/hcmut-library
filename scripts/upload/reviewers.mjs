// Người duyệt của một bài: lấy từ .github/CODEOWNERS (cùng file ruleset dùng để đòi code owner duyệt), dòng khớp sau
// cùng thắng như GitHub. Workflow kiem-file gọi khi bài cần người duyệt (scripts/upload/triage.mjs).
//   node scripts/upload/reviewers.mjs --codeowners .github/CODEOWNERS --path courses/MT1005/items/x.json
// In mỗi dòng một tài khoản (@user) hay nhóm (@org/team), bỏ dấu @.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mẫu CODEOWNERS sang RegExp: * khớp trong một đoạn, ** nhiều đoạn; bắt đầu bằng / là từ gốc repo, kết thúc bằng / là thư mục.
function patternRe(p) {
  const anchored = p.startsWith('/');
  const body = p.replace(/^\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  const tail = p.endsWith('/') ? '.*' : '(/.*)?';
  return new RegExp(`${anchored || p.includes('/') ? '^' : '(^|/)'}${body}${tail}$`);
}

export function ownersFor(text, file) {
  let owners = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [p, ...who] = line.split(/\s+/);
    if (p === '*' || patternRe(p).test(file)) owners = who.filter((w) => w.startsWith('@')).map((w) => w.slice(1));
  }
  return owners;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  for (const o of ownersFor(fs.readFileSync(a.codeowners, 'utf8'), a.path)) console.log(o);
}
