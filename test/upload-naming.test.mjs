import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, fileName } from '../scripts/upload/naming.mjs';
import { readFileSync } from 'node:fs';
import { termFor, releaseTag, releaseAssetUrl, releaseTagOverrideErrors } from '../scripts/upload/term.mjs';
import { parseReleaseUrl } from '../scripts/upload/publish.mjs';
import { previewTarget } from '../scripts/lib/preview.mjs';

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

test('termFor theo năm học', () => {
  assert.equal(termFor(new Date('2025-10-03'), terms), 'HK251');
  assert.equal(termFor(new Date('2026-01-15'), terms), 'HK251');
  assert.equal(termFor(new Date('2026-03-01'), terms), 'HK252');
  assert.equal(termFor(new Date('2026-07-20'), terms), 'HK253');
  assert.equal(termFor(new Date('2026-09-01'), terms), 'HK261');
});

test('releaseTag và releaseAssetUrl', () => {
  assert.equal(releaseTag('HK251'), 'files-HK251');
  assert.equal(releaseTag('HK251', { terms }), 'files-HK251');
  assert.equal(
    releaseAssetUrl('o/r', 'files-HK251', 'a b.pdf'),
    'https://github.com/o/r/releases/download/files-HK251/a%20b.pdf',
  );
});

test('releaseTag dùng tag thay thế trong releaseTagOverrides', () => {
  const policy = { terms, releaseTagOverrides: { HK261: 'files-HK261b' } };
  assert.equal(releaseTag('HK261', policy), 'files-HK261b');
  assert.equal(releaseTag('HK262', policy), 'files-HK262');
  // Khóa của Object.prototype không bị coi là học kỳ có tag thay thế.
  assert.equal(releaseTag('toString', policy), 'files-toString');
});

test('releaseTagOverrides sai dạng thì báo lỗi', () => {
  assert.deepEqual(releaseTagOverrideErrors({}), []);
  assert.deepEqual(releaseTagOverrideErrors({ releaseTagOverrides: {} }), []);
  for (const bad of [
    [],
    null,
    'files-HK261b',
    { HK261: 'files-HK261' },
    { HK261: 'files-HK262b' },
    { HK261: 'files-HK261-b' },
    { HK261: 'files-HK261B' },
    { HK261: 'files-HK261bb' },
    { HK261: 'files-HK261b/x' },
    { HK261: 7 },
    { HK26: 'files-HK26b' },
    { hk261: 'files-hk261b' },
  ]) {
    const policy = { releaseTagOverrides: bad };
    assert.ok(releaseTagOverrideErrors(policy).length > 0, JSON.stringify(bad));
    assert.throws(() => releaseTag('HK261', policy), /catalog\/policy\.json/);
  }
});

test('tag thay thế trong catalog/policy.json hợp lệ, phát hành và xem trước được', () => {
  const policy = JSON.parse(readFileSync(new URL('../catalog/policy.json', import.meta.url), 'utf8'));
  assert.deepEqual(releaseTagOverrideErrors(policy), []);
  const repo = 'bk-study-library/hcmut-library';
  for (const term of Object.keys(policy.releaseTagOverrides || {})) {
    const tag = releaseTag(term, policy);
    const url = releaseAssetUrl(repo, tag, 'MT1005_summary_a.pdf');
    assert.deepEqual(parseReleaseUrl(url, repo), { tag, name: 'MT1005_summary_a.pdf' });
    assert.ok(previewTarget(url, { repo, site: 'https://example.org/' }), tag);
  }
});
