// Văn phong của dự án: tài liệu, form, trang web không dùng ký tự hay gặp trong
// văn bản do AI viết (gạch dài, mũi tên, chấm giữa, ký tự ba chấm, ngoặc kép cong, emoji).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_ROOT } from '../scripts/lib/repo.mjs';

const BANNED = /[—–→⇒↔·…“”‘’★✓✔]|\p{Extended_Pictographic}/u;
const EXT = new Set(['.md', '.yml', '.yaml', '.html', '.json', '.mjs', '.js', '.css']);
const SKIP = new Set(['.git', 'node_modules', 'site']);

function files(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, acc);
    else if (EXT.has(path.extname(e.name))) acc.push(p);
  }
  return acc;
}

test('không có ký tự kiểu AI trong file văn bản của repo', () => {
  const bad = [];
  for (const f of files(TOOL_ROOT)) {
    if (f.endsWith('style.test.mjs')) continue;
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
      const m = line.match(BANNED);
      if (m) bad.push(`${path.relative(TOOL_ROOT, f)}:${i + 1}: ${JSON.stringify(m[0])}`);
    });
  }
  assert.deepEqual(bad, []);
});
