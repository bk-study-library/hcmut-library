import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadRepo, TOOL_ROOT } from '../scripts/lib/repo.mjs';
import { buildV1, serializeV1 } from '../scripts/lib/v1.mjs';
import { copyFixture, editJson, writeJson, codes, FIXTURES, HERE } from './helpers.mjs';

const ROOT = path.join(HERE, '..');

function walk(v, fn, at = '') {
  fn(v, at);
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, fn, `${at}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, fn, `${at}.${k}`);
}

// Kiểm hợp đồng v1 trên dữ liệu thật của repo (v1/ đã commit).
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'v1', 'index.json'), 'utf8'));
const details = index.courses.map((c) => JSON.parse(fs.readFileSync(path.join(ROOT, 'v1', c.detail), 'utf8')));

test('v1: không có null, schemaVersion 1, ngày dạng YYYY-MM-DD', () => {
  for (const doc of [index, ...details]) {
    assert.equal(doc.schemaVersion, 1);
    walk(doc, (v, at) => assert.notEqual(v, null, `null ở ${at}`));
  }
  assert.match(index.generated, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(index.site, /^https:\/\/.+\/$/);
});

test('v1: mỗi môn có file chi tiết, ID dùng được làm tên thư mục trên Windows', () => {
  for (const c of index.courses) {
    assert.match(c.id, /^[A-Z0-9_]{3,12}(-[0-9]{4})?$/);
    assert.equal(c.detail, `courses/${c.id}.json`);
    assert.ok(Array.isArray(c.aliases) && Array.isArray(c.oldNames));
    assert.ok(['active', 'retired'].includes(c.status));
    if (c.replacedBy) assert.ok(index.courses.some((x) => x.id === c.replacedBy));
  }
});

test('v1: số tài liệu trong index khớp file chi tiết', () => {
  details.forEach((d, i) => assert.equal(index.courses[i].items, d.items.filter((x) => !x.removed).length, d.id));
  assert.equal(index.counts.items, index.courses.reduce((n, c) => n + c.items, 0));
});

test('v1: link có url, tài liệu có file kèm size, sha256, ít nhất một url; mục đã gỡ chỉ còn 5 trường', () => {
  for (const d of details) {
    for (const it of d.items) {
      if (it.removed) {
        assert.deepEqual(Object.keys(it).sort(), ['added', 'id', 'removed', 'removedReason', 'type']);
        continue;
      }
      assert.match(it.updated, /^\d{4}-\d{2}-\d{2}$/);
      if (it.type === 'link') {
        assert.match(it.url, /^https:\/\//);
        assert.equal(it.files, undefined);
      } else {
        assert.ok(it.files.length >= 1, it.id);
        for (const f of it.files) {
          assert.ok(Number.isInteger(f.size) && f.size > 0);
          assert.match(f.sha256, /^[0-9a-f]{64}$/);
          assert.ok(f.urls.length >= 1 && f.urls.every((u) => u.startsWith('https://')));
        }
      }
    }
  }
});

test('v1: dựng hai lần ra cùng nội dung (ETag không đổi khi dữ liệu không đổi)', () => {
  const a = serializeV1(buildV1(loadRepo(ROOT)));
  const b = serializeV1(buildV1(loadRepo(ROOT)));
  assert.deepEqual(a, b);
});

test('v1: mục có file chưa có link tải thì chưa đưa ra ngoài', () => {
  const dir = copyFixture();
  const repo = loadRepo(dir);
  const it = repo.items.find((x) => x.files && x.files.length && !x.removed);
  it.files = [{ name: 'a.pdf', size: 10, sha256: 'a'.repeat(64) }];
  const { details: d } = buildV1(repo);
  assert.ok(!d.get(it.course).items.some((x) => x.id === it.id));
});

test('policy.json: loại chưa mở thì báo ITEM_TYPE_CLOSED', () => {
  const dir = copyFixture();
  writeJson(dir, 'catalog/policy.json', { ...JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog/policy.json'), 'utf8')), openTypes: ['link'] });
  assert.ok(codes(loadRepo(dir).errors).includes('ITEM_TYPE_CLOSED'));
  writeJson(dir, 'catalog/policy.json', { openTypes: ['khong-co'] });
  assert.ok(codes(loadRepo(dir).errors).includes('SCHEMA'));
});

test('mã bị dùng lại: được khi một ID có hậu tố năm, không thì DUP_CODE', () => {
  const dir = copyFixture();
  const src = JSON.parse(fs.readFileSync(path.join(dir, 'catalog/courses/EE1010.json'), 'utf8'));
  writeJson(dir, 'catalog/courses/EE1010-2024.json', { ...src, id: 'EE1010-2024', related: [], programs: [] });
  assert.ok(!codes(loadRepo(dir).errors).includes('DUP_CODE'));
  editJson(dir, 'catalog/courses/EE1010-2024.json', (c) => { c.id = 'EE1011'; });
  fs.renameSync(path.join(dir, 'catalog/courses/EE1010-2024.json'), path.join(dir, 'catalog/courses/EE1011.json'));
  assert.ok(codes(loadRepo(dir).errors).includes('DUP_CODE'));
});

test('updated không được trước added', () => {
  const dir = copyFixture();
  editJson(dir, 'courses/EE1009/items/tom-tat-c1.json', (it) => { it.updated = '2000-01-01'; });
  assert.ok(codes(loadRepo(dir).errors).includes('ITEM_UPDATED'));
});

test('fixture test có đủ v1 sinh sẵn', () => {
  assert.ok(fs.existsSync(path.join(FIXTURES, 'valid', 'v1', 'index.json')));
});

test('v1: mọi file có mime, không chuỗi nào chứa quarantine', () => {
  for (const d of details) {
    for (const it of d.items) for (const f of it.files || []) assert.match(f.mime, /^[a-z]+\/[A-Za-z0-9.+-]+$/, `${d.id}/${it.id}`);
  }
  for (const doc of [index, ...details]) {
    walk(doc, (v, at) => {
      assert.ok(!at.endsWith('.quarantine'), `khóa quarantine ở ${at}`);
      if (typeof v === 'string') assert.ok(!v.includes('quarantine'), `chuỗi chứa quarantine ở ${at}`);
    });
  }
});

test('v1: mime lấy từ policy khi file không ghi, ưu tiên mime của file; quarantine không lọt ra', () => {
  const repo = loadRepo(copyFixture());
  const it = repo.items.find((x) => x.files && x.files.length && !x.removed);
  it.files = [
    { name: 'a.pdf', size: 10, sha256: 'a'.repeat(64), url: 'https://example.org/a.pdf', quarantine: 'clean/abcdefghij/a.pdf' },
    { name: 'b.pdf', size: 10, sha256: 'b'.repeat(64), url: 'https://example.org/b.pdf', mime: 'application/x-test' },
  ];
  const out = buildV1(repo).details.get(it.course).items.find((x) => x.id === it.id);
  assert.deepEqual(out.files.map((f) => f.mime), ['application/pdf', 'application/x-test']);
  assert.ok(!JSON.stringify(out).includes('quarantine'));
});

test('v1: mục chỉ có quarantine, không url, vẫn bị loại', () => {
  const repo = loadRepo(copyFixture());
  const it = repo.items.find((x) => x.files && x.files.length && !x.removed);
  it.files = [{ name: 'a.pdf', size: 10, sha256: 'a'.repeat(64), quarantine: 'pending/abcdefghij/a.pdf' }];
  assert.ok(!buildV1(repo).details.get(it.course).items.some((x) => x.id === it.id));
});

test('v1: book-ref ra book, không files, không url', () => {
  const dir = copyFixture();
  writeJson(dir, 'courses/EE1009/items/sach-giai-tich.json', {
    id: 'sach-giai-tich', course: 'EE1009', type: 'book-ref', title: 'Giải tích 1', lang: 'vi', license: 'CC0-1.0', origin: 'partner:vi-du',
    book: { title: 'Giải tích 1', authors: ['Nguyễn Văn A'], year: 2020 }, added: '2026-10-01', removed: false,
  });
  const repo = loadRepo(dir);
  assert.deepEqual(repo.errors, []);
  const out = buildV1(repo).details.get('EE1009').items.find((x) => x.id === 'sach-giai-tich');
  assert.equal(out.book.title, 'Giải tích 1');
  assert.deepEqual(out.book.authors, ['Nguyễn Văn A']);
  assert.equal(out.files, undefined);
  assert.equal(out.url, undefined);
});

test('v1: đuôi file không có trong policy thì ném lỗi nêu tên file', () => {
  const repo = loadRepo(copyFixture());
  const it = repo.items.find((x) => x.files && x.files.length && !x.removed);
  it.files = [{ name: 'a.xyz', size: 10, sha256: 'a'.repeat(64), url: 'https://example.org/a.xyz' }];
  assert.throws(() => buildV1(repo), /a\.xyz.*\.xyz/);
});
