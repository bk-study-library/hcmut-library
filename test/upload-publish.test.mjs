import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseReleaseUrl, planPublish, planRemovals, branchCode, pendingSha, verifyFile } from '../scripts/upload/publish.mjs';
import { releaseAssetUrl } from '../scripts/upload/term.mjs';

const REPO = 'bk-study-library/bk-study-library';
const NAME = 'MT1005_summary_tom-tat.pdf';
const SHA = 'b1c2d3' + 'e'.repeat(58);
const CODE = 'abcdEF1234';

function item(over = {}, file = {}) {
  return {
    id: 'tom-tat', course: 'MT1005', type: 'summary', title: 'Tóm tắt', removed: false,
    files: [{
      name: NAME, size: 1500, sha256: SHA, mime: 'application/pdf',
      url: releaseAssetUrl(REPO, 'files-HK251', NAME), quarantine: `clean/${CODE}/${NAME}`, ...file,
    }],
    ...over,
  };
}

test('parseReleaseUrl: lấy tag và tên file của Release trong repo', () => {
  assert.deepEqual(parseReleaseUrl(releaseAssetUrl(REPO, 'files-HK251', 'a b.pdf'), REPO), { tag: 'files-HK251', name: 'a b.pdf' });
});

test('parseReleaseUrl: link ngoài, repo khác hay dạng lạ thì trả null', () => {
  assert.equal(parseReleaseUrl('https://example.com/a.pdf', REPO), null);
  assert.equal(parseReleaseUrl(releaseAssetUrl('evil/repo', 'files-HK251', NAME), REPO), null);
  assert.equal(parseReleaseUrl(`https://github.com/${REPO}/releases/download/files-HK251/a/b.pdf`, REPO), null);
  assert.equal(parseReleaseUrl(`https://github.com/${REPO}/releases/download/files-HK251/..%2Fx.pdf`, REPO), null);
  assert.equal(parseReleaseUrl(`https://github.com/${REPO}/releases/download/v1/${NAME}`, REPO), null);
  assert.equal(parseReleaseUrl(`http://github.com/${REPO}/releases/download/files-HK251/${NAME}`, REPO), null);
  assert.equal(parseReleaseUrl(undefined, REPO), null);
});

test('planPublish: file chưa có trên Release thì phải đưa lên', () => {
  const plan = planPublish([item()], new Map(), REPO);
  assert.deepEqual(plan, [{ tag: 'files-HK251', name: NAME, quarantine: `clean/${CODE}/${NAME}`, sha256: SHA, size: 1500, code: CODE }]);
});

test('planPublish: asset cùng tên cùng sha256 thì bỏ qua', () => {
  const existing = new Map([['files-HK251', new Map([[NAME, SHA]])]]);
  assert.deepEqual(planPublish([item()], existing, REPO), []);
});

test('planPublish: asset cùng tên khác sha256 thì báo lỗi, không ghi đè', () => {
  const existing = new Map([['files-HK251', new Map([[NAME, 'a'.repeat(64)]])]]);
  assert.throws(() => planPublish([item()], existing, REPO), /khác nội dung/);
});

test('planPublish: Release có file khác tên thì vẫn đưa lên', () => {
  const existing = new Map([['files-HK251', new Map([['khac.pdf', SHA]])]]);
  assert.equal(planPublish([item()], existing, REPO).length, 1);
});

test('planPublish: link không trỏ Release của repo hoặc tên không khớp chỗ cách ly thì báo lỗi', () => {
  assert.throws(() => planPublish([item({}, { url: 'https://example.com/a.pdf' })], new Map(), REPO), /Release của repo/);
  assert.throws(() => planPublish([item({}, { url: releaseAssetUrl(REPO, 'files-HK251', 'khac.pdf') })], new Map(), REPO), /không khớp/);
  assert.throws(() => planPublish([item({}, { quarantine: undefined })], new Map(), REPO), /cách ly/);
});

test('planPublish: mục đã gỡ thì bỏ qua', () => {
  assert.deepEqual(planPublish([item({ removed: true })], new Map(), REPO), []);
});

test('planRemovals: chỉ mục vừa chuyển sang removed, file trên Release của repo', () => {
  const before = [item(), item({ id: 'khac' }), item({ id: 'da-go', removed: true })];
  const after = [item({ removed: true }), item({ id: 'khac' }), item({ id: 'da-go', removed: true })];
  assert.deepEqual(planRemovals(before, after, REPO), [{ tag: 'files-HK251', name: NAME }]);
});

test('planRemovals: bỏ qua link ngoài, mục mới thêm đã removed, mục bị xóa khỏi repo', () => {
  const ext = { url: 'https://example.com/a.pdf' };
  assert.deepEqual(planRemovals([item({}, ext)], [item({ removed: true }, ext)], REPO), []);
  assert.deepEqual(planRemovals([], [item({ removed: true })], REPO), []);
  assert.deepEqual(planRemovals([item()], [], REPO), []);
  const other = { url: releaseAssetUrl('evil/repo', 'files-HK251', NAME) };
  assert.deepEqual(planRemovals([item({}, other)], [item({ removed: true }, other)], REPO), []);
});

test('planRemovals: mục chuyển sang removed khớp theo môn và id', () => {
  const before = [item({ course: 'MT1005', id: 'a' }), item({ course: 'CO1005', id: 'a' }, { name: 'b.pdf', url: releaseAssetUrl(REPO, 'files-HK251', 'b.pdf') })];
  const after = [item({ course: 'MT1005', id: 'a' }), item({ course: 'CO1005', id: 'a', removed: true }, { name: 'b.pdf', url: releaseAssetUrl(REPO, 'files-HK251', 'b.pdf') })];
  assert.deepEqual(planRemovals(before, after, REPO), [{ tag: 'files-HK251', name: 'b.pdf' }]);
});

test('branchCode: chỉ nhận upload/<mã 10 ký tự>', () => {
  assert.equal(branchCode(`upload/${CODE}`), CODE);
  for (const b of ['main', 'upload/', 'upload/abc', `upload/${CODE}/x`, `upload/${CODE}x`, 'upload/../../main', 'refs/heads/main']) {
    assert.throws(() => branchCode(b), /Nhánh/);
  }
});

test('pendingSha và verifyFile: tính sha256 trong script tin cậy', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  try {
    assert.equal(pendingSha(path.join(dir, 'khong-co')), '');
    assert.equal(pendingSha(dir), '');
    const f = path.join(dir, 'x.pdf');
    fs.writeFileSync(f, 'noi dung');
    const sha = crypto.createHash('sha256').update('noi dung').digest('hex');
    assert.equal(pendingSha(dir), sha);
    verifyFile(f, sha, 8);
    assert.throws(() => verifyFile(f, 'a'.repeat(64), 8), /sha256/);
    assert.throws(() => verifyFile(f, sha, 9), /kích thước/);
    fs.writeFileSync(path.join(dir, 'y.pdf'), 'khac');
    assert.throws(() => pendingSha(dir), /nhiều/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('planPublish: asset có sẵn nhưng không có digest thì báo lỗi rõ', () => {
  const existing = new Map([['files-HK251', new Map([[NAME, '']])]]);
  assert.throws(() => planPublish([item()], existing, REPO), /không có digest sha256/);
});

test('planRemovals: file còn mục khác dùng thì giữ lại', () => {
  const before = [item(), item({ id: 'khac' })];
  const after = [item({ removed: true }), item({ id: 'khac' })];
  assert.deepEqual(planRemovals(before, after, REPO, after), []);
  const afterAll = [item({ removed: true }), item({ id: 'khac', removed: true })];
  assert.deepEqual(planRemovals(before, afterAll, REPO, afterAll), [{ tag: 'files-HK251', name: NAME }]);
});
