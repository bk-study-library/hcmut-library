import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fileName, uniqueId } from '../scripts/upload/naming.mjs';
import { termFor, releaseTag, releaseAssetUrl } from '../scripts/upload/term.mjs';

const terms = { HK1: [9, 10, 11, 12, 1], HK2: [2, 3, 4, 5, 6], HK3: [7, 8] };

test('slugify bỏ dấu và gộp ký tự lạ', () => {
  assert.equal(slugify('Bài 1: Giải tích II (đề)'), 'bai-1-giai-tich-ii-de');
  assert.equal(slugify('   '), '');
});

test('slugify cắt theo ranh giới dấu gạch', () => {
  const s = slugify('abcdefgh '.repeat(25));
  assert.ok(s.length <= 60);
  assert.ok(!s.endsWith('-'));
  assert.ok(!s.startsWith('-'));
  assert.equal(slugify('a'.repeat(200)).length, 60);
});

test('fileName ghép tên chuẩn', () => {
  assert.equal(
    fileName({ code: 'MT1005', type: 'summary', slug: 'chuong-1', term: 'HK251', ext: '.PDF' }),
    'MT1005_summary_chuong-1_HK251.pdf',
  );
  assert.equal(fileName({ code: 'MT1005', type: 'summary', slug: 'chuong-1', ext: '.md' }), 'MT1005_summary_chuong-1.md');
});

test('uniqueId thêm hậu tố số', () => {
  assert.equal(uniqueId('a', new Set()), 'a');
  assert.equal(uniqueId('a', new Set(['a'])), 'a-2');
  assert.equal(uniqueId('a', new Set(['a', 'a-2'])), 'a-3');
});

test('termFor theo năm học', () => {
  assert.equal(termFor(new Date('2025-10-03'), terms), 'HK251');
  assert.equal(termFor(new Date('2026-01-15'), terms), 'HK251');
  assert.equal(termFor(new Date('2026-03-01'), terms), 'HK252');
  assert.equal(termFor(new Date('2026-07-20'), terms), 'HK253');
  assert.equal(termFor(new Date('2026-09-01'), terms), 'HK261');
});

test('releaseTag và releaseAssetUrl', () => {
  assert.equal(releaseTag('HK251'), 'files-HK251');
  assert.equal(
    releaseAssetUrl('o/r', 'files-HK251', 'a b.pdf'),
    'https://github.com/o/r/releases/download/files-HK251/a%20b.pdf',
  );
});
