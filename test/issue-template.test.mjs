// Form issue không đọc được file trong repo, nên danh sách khoa trong form Thêm chương trình
// được ghi tay. Test này giữ danh sách đó khớp với catalog/faculties.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_ROOT } from '../scripts/lib/repo.mjs';

const TPL = path.join(TOOL_ROOT, '.github', 'ISSUE_TEMPLATE', 'them-chuong-trinh.yml');

function dropdownOptions(yml, id) {
  const lines = yml.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `id: ${id}`);
  assert.ok(start >= 0, `không thấy ô ${id}`);
  const opts = [];
  let inOptions = false;
  for (const l of lines.slice(start + 1)) {
    if (/^\s+options:\s*$/.test(l)) inOptions = true;
    else if (inOptions && /^\s+- /.test(l)) opts.push(JSON.parse(l.trim().slice(2)));
    else if (inOptions) break;
  }
  return opts;
}

test('form Thêm chương trình: danh sách khoa khớp catalog/faculties.json, bỏ khóa cũ (movedTo)', () => {
  const faculties = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'faculties.json'), 'utf8'));
  assert.deepEqual(dropdownOptions(fs.readFileSync(TPL, 'utf8'), 'khoa'), faculties.faculties.filter((f) => !f.movedTo).map((f) => f.name.vi));
});

test('form Thêm chương trình: có các ô ngành, khóa, link, file, ghi chú; trang web điền sẵn đúng id', () => {
  const yml = fs.readFileSync(TPL, 'utf8');
  for (const id of ['khoa', 'nganh', 'khoa-hoc', 'link-ctdt', 'file-ctdt', 'ghi-chu']) assert.match(yml, new RegExp(`id: ${id}\r?\n`), id);
  const site = fs.readFileSync(path.join(TOOL_ROOT, 'scripts', 'site', 'programs.mjs'), 'utf8');
  assert.match(site, /them-chuong-trinh\.yml/);
  assert.match(site, /fields\.khoa = /);
  assert.match(site, /fields\.nganh = /);
  assert.match(site, /fields\['khoa-hoc'\] = /);
});
