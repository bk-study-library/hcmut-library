// Môn mới gửi kèm bài qua form: file catalog/courses/<MÃ>.json do Worker dựng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildNewCourse, facultyFor, handbookUrlFor, NEW_COURSE_NOTE } from '../scripts/upload/course.mjs';
import { buildItem } from '../scripts/upload/item.mjs';
import { TOOL_ROOT } from '../scripts/lib/repo.mjs';
import { run } from '../scripts/validate.mjs';
import { copyFixture, writeJson, readJson } from './helpers.mjs';

const real = (rel) => JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, rel), 'utf8'));
const faculties = real('catalog/faculties.json');
const site = real('catalog/site.json');

test('facultyFor: khoa theo tiền tố đầu tiên khớp trong faculties.json, không khớp thì unknown', () => {
  assert.equal(facultyFor('EE5430', faculties.prefixes), 'dee');
  assert.equal(facultyFor('CO3001', faculties.prefixes), 'cse');
  assert.equal(facultyFor('MT1005', faculties.prefixes), 'chung');
  assert.equal(facultyFor('ZZ1234', faculties.prefixes), 'unknown');
  assert.equal(facultyFor('EE5430', []), 'unknown');
  assert.equal(facultyFor('EE5430', undefined), 'unknown');
});

test('handbookUrlFor: dựng từ mẫu handbookSubjectUrl của catalog/site.json', () => {
  assert.equal(site.handbookSubjectUrl, 'https://hcmut.edu.vn/study/handbook/subject/{code}');
  assert.equal(handbookUrlFor('EE5430', site.handbookSubjectUrl), 'https://hcmut.edu.vn/study/handbook/subject/EE5430');
  assert.equal(handbookUrlFor('EE5430', ''), null);
  assert.equal(handbookUrlFor('EE5430', 'https://x.example/khong-co-cho-dien'), null);
  assert.equal(handbookUrlFor('EE5430', 'http://hcmut.edu.vn/{code}'), null);
});

test('buildNewCourse: đủ trường theo schema, khoa theo tiền tố, ghi chú chờ duyệt', () => {
  const c = buildNewCourse({ code: 'EE5430', name: 'Kỹ thuật và hệ thống siêu cao tần', today: '2026-10-04', prefixes: faculties.prefixes, handbookTemplate: site.handbookSubjectUrl });
  assert.deepEqual(c, {
    $schema: '../../schema/course.schema.json',
    id: 'EE5430',
    code: 'EE5430',
    name: 'Kỹ thuật và hệ thống siêu cao tần',
    faculty: 'dee',
    aliases: [],
    status: 'active',
    programs: [],
    parts: ['theory'],
    related: [],
    handbookUrl: 'https://hcmut.edu.vn/study/handbook/subject/EE5430',
    note: NEW_COURSE_NOTE,
    updated: '2026-10-04',
  });
  assert.match(NEW_COURSE_NOTE, /^Môn mới do người gửi đề xuất, chờ người duyệt xác nhận/);
});

test('buildNewCourse: phần học suy ra từ tên như import-seed, không có mẫu link thì bỏ handbookUrl', () => {
  const lab = buildNewCourse({ code: 'EE5431', name: 'Thí nghiệm siêu cao tần', today: '2026-10-04', prefixes: [] });
  assert.deepEqual(lab.parts, ['lab']);
  assert.equal(lab.faculty, 'unknown');
  assert.equal('handbookUrl' in lab, false);
  assert.deepEqual(buildNewCourse({ code: 'CO3335', name: 'Đồ án thiết kế', today: '2026-10-04', prefixes: [] }).parts, ['project']);
});

test('validate --write nhận bài có môn mới: dựng index, v1, worker-catalog, README của môn mới', () => {
  const dir = copyFixture();
  const course = buildNewCourse({ code: 'EE5430', name: 'Kỹ thuật siêu cao tần', today: '2026-10-04', prefixes: readJson(dir, 'catalog/faculties.json').prefixes, handbookTemplate: site.handbookSubjectUrl });
  writeJson(dir, 'catalog/courses/EE5430.json', course);
  const form = { course: 'EE5430', type: 'summary', title: 'Tóm tắt', lang: 'vi', license: 'CC-BY-SA-4.0' };
  const file = { name: 'EE5430_summary_tom-tat.pdf', size: 100, sha256: 'c'.repeat(64), mime: 'application/pdf', quarantine: 'pending/abcdEF1234/EE5430_summary_tom-tat.pdf' };
  writeJson(dir, 'courses/EE5430/items/tom-tat.json', { $schema: '../../../schema/item.schema.json', ...buildItem(form, file, '2026-10-04', 'tom-tat') });

  // Commit đầu của bot: file sinh ra chưa dựng, chỉ cảnh báo.
  assert.equal(run(['--root', dir, '--quiet', '--allow-stale']).ok, true);
  const written = run(['--root', dir, '--quiet', '--write']);
  assert.deepEqual(written.repo.errors, []);
  assert.equal(written.ok, true);
  assert.equal(run(['--root', dir, '--quiet']).ok, true);
  assert.ok(fs.existsSync(path.join(dir, 'courses', 'EE5430', 'README.md')));
  assert.ok(readJson(dir, 'v1/index.json').courses.some((c) => c.id === 'EE5430' && c.faculty === 'EE'));
  assert.ok(readJson(dir, 'worker-catalog.json').courses.some((c) => c.id === 'EE5430'));
  assert.ok(fs.existsSync(path.join(dir, 'v1', 'courses', 'EE5430.json')));
});
