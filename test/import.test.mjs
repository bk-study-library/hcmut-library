import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importSeed, inferParts } from '../scripts/import-seed.mjs';
import { run } from '../scripts/validate.mjs';
import { FIXTURES, readJson, editJson } from './helpers.mjs';

const seed = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'seed-mau.json'), 'utf8'));
// Bộ khoa cố định cho test (khóa theo tiền tố mã), không phụ thuộc catalog/faculties.json đang dùng.
const FACULTIES = path.join(FIXTURES, 'faculties-prefix.json');
const faculties = JSON.parse(fs.readFileSync(FACULTIES, 'utf8'));

function freshRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-import-'));
  fs.mkdirSync(path.join(dir, 'catalog'));
  fs.copyFileSync(FACULTIES, path.join(dir, 'catalog', 'faculties.json'));
  return dir;
}

test('seed mẫu: 16 môn, không có điểm', () => {
  assert.equal(seed.courses.length, 16);
  assert.ok(!/"(score|letter|gpa\w*)"/.test(JSON.stringify(seed)));
});

test('nhập seed: 16 môn + 1 môn ngoài CTĐT, một chương trình, kiểm sạch', () => {
  const dir = freshRoot();
  const report = importSeed(seed, dir, { date: '2026-10-03', faculties });
  assert.equal(report.created.length, 17);
  assert.equal(fs.readdirSync(path.join(dir, 'catalog', 'courses')).length, 17);
  const prog = readJson(dir, 'catalog/programs/DH_MAU_2019.json');
  assert.equal(prog.faculty, 'EE');
  assert.equal(prog.blocks.reduce((n, b) => n + b.courses.length, 0), 16);
  const r = run(['--root', dir, '--write', '--quiet']);
  assert.deepEqual(r.repo.errors, []);
  assert.deepEqual(r.repo.warnings, []);
  assert.equal(r.index.counts.courses, 17);
});

test('nhập seed: khoa theo tiền tố đã xác minh, còn lại là unknown', () => {
  const dir = freshRoot();
  importSeed(seed, dir, { date: '2026-10-03', faculties });
  assert.equal(readJson(dir, 'catalog/courses/MT1005.json').faculty, 'MT');
  assert.equal(readJson(dir, 'catalog/courses/EN1003.json').faculty, 'EN');
  for (const id of ['ENG_GC', 'CCGDTC', 'MI1003', 'SA4001', '007401']) {
    assert.equal(readJson(dir, `catalog/courses/${id}.json`).faculty, 'unknown', id);
  }
});

test('nhập seed: liên kết lý thuyết với thí nghiệm, môn tương đương', () => {
  const dir = freshRoot();
  importSeed(seed, dir, { date: '2026-10-03', faculties });
  assert.deepEqual(readJson(dir, 'catalog/courses/EE1009.json').related, ['EE1010', 'EE2413']);
  assert.deepEqual(readJson(dir, 'catalog/courses/EE1010.json').parts, ['lab']);
  assert.deepEqual(readJson(dir, 'catalog/courses/SP1007.json').related, ['008001']);
  assert.deepEqual(readJson(dir, 'catalog/courses/CH1003.json').related, ['604046']);
  assert.deepEqual(readJson(dir, 'catalog/courses/EE4347.json').parts, ['project']);
  assert.deepEqual(readJson(dir, 'catalog/courses/PE1003.json').parts, []);
});

test('nhập lại sau khi môn đổi mã: giữ ID, không tạo môn trùng', () => {
  const dir = freshRoot();
  importSeed(seed, dir, { date: '2026-10-03', faculties });
  editJson(dir, 'catalog/courses/EE1009.json', (c) => {
    c.aliases.push({ code: 'EE1009', name: c.name, to: 'HK252' });
    c.code = 'EE1109';
    c.name = 'Kỹ thuật số (mới)';
  });
  const report = importSeed(seed, dir, { date: '2026-10-04', faculties });
  assert.equal(report.created.length, 0);
  assert.equal(fs.readdirSync(path.join(dir, 'catalog', 'courses')).length, 17);
  const c = readJson(dir, 'catalog/courses/EE1009.json');
  assert.equal(c.code, 'EE1109');
  assert.equal(c.updated, '2026-10-04');
  assert.ok(report.nameDiffers.some((d) => d.id === 'EE1009'));
  assert.equal(run(['--root', dir, '--write', '--quiet']).ok, true);
});

test('seed có điểm thì không nhập', () => {
  const bad = structuredClone(seed);
  bad.courses[0].score = 8;
  assert.throws(() => importSeed(bad, freshRoot(), { date: '2026-10-03', faculties }), /điểm/);
});

test('inferParts theo tên môn', () => {
  assert.deepEqual(inferParts('Thí nghiệm Vật lý'), ['lab']);
  assert.deepEqual(inferParts('Thực tập Điện 1'), ['lab']);
  assert.deepEqual(inferParts('Thực tập Ngoài trường'), []);
  assert.deepEqual(inferParts('Đồ án 1 (Kỹ thuật điện)'), ['project']);
  assert.deepEqual(inferParts('Giải tích 2'), ['theory']);
});
