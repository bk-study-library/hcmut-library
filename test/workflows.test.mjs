// Luật an toàn của workflow, kiểm bằng cách đọc chữ YAML (không cần thư viện ngoài).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_ROOT } from '../scripts/lib/repo.mjs';

const DIR = path.join(TOOL_ROOT, '.github', 'workflows');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.yml'));
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// Tách khối của từng job (thụt 2 dấu cách dưới jobs:).
function jobs(text) {
  const body = text.slice(text.indexOf('\njobs:\n') + 7);
  const out = {};
  let name = null;
  for (const line of body.split('\n')) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) {
      name = m[1];
      out[name] = '';
    } else if (name) out[name] += `${line}\n`;
  }
  return out;
}

// Chữ của mọi lệnh run (một dòng hoặc khối nhiều dòng).
function runBlocks(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    // Lệnh run của bước (thụt từ 8 dấu cách, hoặc "- run:"); outputs.run của job gate không phải lệnh.
    const m = /^(\s*)(- )?run:\s*(.*)$/.exec(lines[i]);
    if (!m || (m[1].length < 8 && !m[2])) continue;
    const indent = m[1].length;
    let block = m[3];
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > indent); j += 1) block += `\n${lines[j]}`;
    out.push(block);
  }
  return out;
}

test('mọi job có timeout-minutes; scan 15 phút, job khác 10', () => {
  for (const f of files) {
    for (const [name, body] of Object.entries(jobs(read(f)))) {
      const m = /^ {4}timeout-minutes: (\d+)$/m.exec(body);
      assert.ok(m, `${f} ${name}`);
      assert.equal(Number(m[1]), f === 'kiem-file.yml' && name === 'scan' ? 15 : 10, `${f} ${name}`);
    }
  }
});

test('không có biểu thức ${{ }} trong lệnh run', () => {
  for (const f of files) for (const block of runBlocks(read(f))) assert.ok(!block.includes('${{'), `${f}: ${block.slice(0, 80)}`);
});

test('job scan không có secret, chỉ quyền đọc', () => {
  const scan = jobs(read('kiem-file.yml')).scan;
  assert.ok(!/secrets\./.test(scan));
  assert.match(scan, /permissions:\n\s+contents: read\n/);
});

test('action chỉ lấy từ actions/*, ghim theo SHA đầy đủ', () => {
  for (const f of files) {
    for (const m of read(f).matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /^actions\/[a-z-]+@[0-9a-f]{40}$/, `${f}: ${m[1]}`);
  }
});

test('kiem-file: có virus thì đóng PR bằng token App và xóa cả mã xem bài', () => {
  const text = read('kiem-file.yml');
  assert.match(text, /id: virus-app[\s\S]*?permission-pull-requests: write/);
  const close = text.slice(text.indexOf('- name: Có virus thì đóng PR'));
  assert.match(close, /GH_TOKEN: \$\{\{ steps\.virus-app\.outputs\.token \|\| github\.token \}\}/);
  assert.match(close, /gh pr close "\$PR"/);
  assert.match(close, /token\/\$CODE/);
});

test('phat-hanh-file: chạy tay chỉ trên main, ô item đi qua env và được kiểm bằng dispatch-locate', () => {
  const text = read('phat-hanh-file.yml');
  assert.match(text, /\n {2}workflow_dispatch:\n {4}inputs:\n {6}item:\n[\s\S]*?required: true\n {8}type: string\n/);
  const job = jobs(text)['phat-hanh'];
  assert.match(job, /\(github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'\) \|\|/);
  // inputs chỉ được dùng ở một chỗ: env ITEM_INPUT của bước locate.
  assert.deepEqual([...text.matchAll(/inputs\.item/g)].length, 1);
  assert.match(job, /ITEM_INPUT: \$\{\{ inputs\.item \}\}/);
  assert.match(job, /publish\.mjs dispatch-locate --item "\$ITEM_INPUT" --root \./);
  // Bước plan lấy branch từ locate (PR: branch upload/*, chạy tay: upload/<mã bài> của mục).
  assert.match(job, /id: plan[\s\S]*?BRANCH: \$\{\{ steps\.locate\.outputs\.branch \}\}/);
  // go-file không chạy khi chạy tay.
  assert.match(jobs(text)['go-file'], /if: github\.event_name == 'push'\n/);
});

test('kiem-file: gắn nhãn can-xem-tay khi apply báo manual', () => {
  const text = read('kiem-file.yml');
  assert.match(text, /if: always\(\) && steps\.apply\.outputs\.manual == 'true'[\s\S]*?labels\[\]=can-xem-tay/);
});
