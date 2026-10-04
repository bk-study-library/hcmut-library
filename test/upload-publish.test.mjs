import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseReleaseUrl, planPublish, planRemovals, deletedWithRelease, branchCode, pendingSha, verifyFile, isLightPr, dispatchTarget, assertReleaseWritable } from '../scripts/upload/publish.mjs';
import { releaseAssetUrl } from '../scripts/upload/term.mjs';

const REPO = 'bk-study-library/hcmut-library';
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

test('planRemovals: bỏ qua link ngoài, mục mới thêm đã removed', () => {
  const ext = { url: 'https://example.com/a.pdf' };
  assert.deepEqual(planRemovals([item({}, ext)], [item({ removed: true }, ext)], REPO), []);
  assert.deepEqual(planRemovals([], [item({ removed: true })], REPO), []);
  assert.deepEqual(planRemovals([item({}, ext)], [], REPO), []);
  const other = { url: releaseAssetUrl('evil/repo', 'files-HK251', NAME) };
  assert.deepEqual(planRemovals([item({}, other)], [item({ removed: true }, other)], REPO), []);
});

test('planRemovals: mục chuyển sang removed khớp theo môn và id', () => {
  const before = [item({ course: 'MT1005', id: 'a' }), item({ course: 'CO1005', id: 'a' }, { name: 'b.pdf', url: releaseAssetUrl(REPO, 'files-HK251', 'b.pdf') })];
  const after = [item({ course: 'MT1005', id: 'a' }), item({ course: 'CO1005', id: 'a', removed: true }, { name: 'b.pdf', url: releaseAssetUrl(REPO, 'files-HK251', 'b.pdf') })];
  assert.deepEqual(planRemovals(before, after, REPO), [{ tag: 'files-HK251', name: 'b.pdf' }]);
});

test('planRemovals: file mục bị xóa khỏi repo thì xóa cả file trên Release, trừ khi mục khác còn dùng', () => {
  assert.deepEqual(planRemovals([item()], [], REPO), [{ tag: 'files-HK251', name: NAME }]);
  // Mục đã gỡ từ trước thì file đã được xóa lúc gỡ.
  assert.deepEqual(planRemovals([item({ removed: true })], [], REPO), []);
  // Mục chuyển chỗ (môn khác, id khác) vẫn trỏ cùng file: giữ lại.
  const moved = item({ course: 'CO1005', id: 'tom-tat-moi' });
  assert.deepEqual(planRemovals([item()], [moved], REPO, [moved]), []);
});

test('deletedWithRelease: chỉ mục chưa gỡ, bị xóa, có file trên Release của repo', () => {
  const ext = item({ id: 'link-ngoai' }, { url: 'https://example.com/a.pdf' });
  const gone = deletedWithRelease([item(), ext, item({ id: 'da-go', removed: true }), item({ id: 'con' })], [item({ id: 'con' })], REPO);
  assert.deepEqual(gone, [{ course: 'MT1005', id: 'tom-tat', assets: [{ tag: 'files-HK251', name: NAME }] }]);
});

test('branchCode: chỉ nhận upload/<mã 10 ký tự>', () => {
  assert.equal(branchCode(`upload/${CODE}`), CODE);
  for (const b of ['main', 'upload/', 'upload/abc', `upload/${CODE}/x`, `upload/${CODE}x`, 'upload/../../main', 'refs/heads/main']) {
    assert.throws(() => branchCode(b), /Branch/);
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

test('isLightPr: chỉ PR có một mục sách tham khảo không file mới bỏ qua kho', () => {
  const book = { id: 'sach', course: 'MT1005', type: 'book-ref', title: 'Sách', removed: false, book: { title: 'S', authors: ['A'] } };
  const files = [{ filename: 'courses/MT1005/items/sach.json', status: 'added' }, { filename: 'index.json', status: 'modified' }];
  const read = (m) => () => m;
  assert.equal(isLightPr(files, read(book), `upload/${CODE}`), true);
  // Mục có file, PR lạ, branch sai hay đọc lỗi thì dọn kho như thường (không ném lỗi).
  assert.equal(isLightPr(files, read(item()), `upload/${CODE}`), false);
  assert.equal(isLightPr([], read(book), `upload/${CODE}`), false);
  assert.equal(isLightPr([...files, { filename: 'scripts/x.mjs', status: 'added' }], read(book), `upload/${CODE}`), false);
  assert.equal(isLightPr(files, read(book), 'main'), false);
  assert.equal(isLightPr(files, () => { throw new Error('mất file'); }, `upload/${CODE}`), false);
});

const ITEM_REL = 'courses/MT1005/items/tom-tat.json';

test('dispatchTarget: mục do bot tải lên, còn bản sạch trong kho thì ra mã bài và branch', () => {
  const seen = [];
  const read = (rel) => {
    seen.push(rel);
    return item();
  };
  assert.deepEqual(dispatchTarget(ITEM_REL, read), { item: ITEM_REL, code: CODE, light: 'false', branch: `upload/${CODE}` });
  assert.deepEqual(seen, [ITEM_REL]);
});

test('dispatchTarget: đường dẫn sai dạng thì không đọc file', () => {
  const read = () => {
    throw new Error('không được đọc');
  };
  for (const bad of [
    undefined,
    '',
    'courses/MT1005/items/tom-tat',
    'courses/MT1005/items/tom-tat.json ',
    ' courses/MT1005/items/tom-tat.json',
    'courses/MT1005/items/../items/tom-tat.json',
    'courses/../catalog/items/x.json',
    '/courses/MT1005/items/tom-tat.json',
    './courses/MT1005/items/tom-tat.json',
    'courses/MT1005/items/sub/tom-tat.json',
    'courses\\MT1005\\items\\tom-tat.json',
    'courses/MT1005/items/tom-tat.json\nx',
    'courses/MT1005/items/$(id).json',
    'courses/MT1005/items/tom tat.json',
    'catalog/policy.json',
    'courses/MT1005/README.md',
  ]) {
    assert.throws(() => dispatchTarget(bad, read), /Đường dẫn item không hợp lệ/, JSON.stringify(bad));
  }
});

test('dispatchTarget: file không có, sai chỗ, đã gỡ hay không do bot tải lên thì lỗi', () => {
  assert.throws(() => dispatchTarget(ITEM_REL, () => { throw new Error('ENOENT'); }), /Không đọc được/);
  assert.throws(() => dispatchTarget(ITEM_REL, () => null), /không phải item/);
  assert.throws(() => dispatchTarget(ITEM_REL, () => item({ id: 'khac' })), /không khớp course và id/);
  assert.throws(() => dispatchTarget(ITEM_REL, () => item({ course: 'CO1005' })), /không khớp course và id/);
  assert.throws(() => dispatchTarget(ITEM_REL, () => item({ removed: true })), /đã gỡ/);
  // Mục do người bảo trì thêm tay: không có khóa trong bucket quarantine.
  assert.throws(() => dispatchTarget(ITEM_REL, () => item({}, { quarantine: undefined })), /cách ly/);
  assert.throws(() => dispatchTarget(ITEM_REL, () => item({}, { quarantine: `pending/${CODE}/${NAME}` })), /bản đã sanitize/);
  assert.throws(() => dispatchTarget(ITEM_REL, () => item({ files: [] })), /đúng một file/);
  const book = { id: 'tom-tat', course: 'MT1005', type: 'book-ref', title: 'Sách', removed: false };
  assert.throws(() => dispatchTarget(ITEM_REL, () => book), /đúng một file/);
});

test('dispatchTarget và planPublish: mục EE5429 trên repo phát hành lên tag thay thế', () => {
  const rel = 'courses/EE5429/items/giai-bai-tap-do-thi-smith.json';
  const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  const target = dispatchTarget(rel, read);
  assert.equal(target.code, 'unEqefr6Qt');
  const [todo] = planPublish([read(rel)], new Map(), REPO);
  assert.equal(todo.tag, 'files-HK261b');
  assert.equal(todo.quarantine, 'clean/unEqefr6Qt/EE5429_exercise-solution_giai-bai-tap-do-thi-smith.pdf');
});

test('assertReleaseWritable: immutable release mà còn file cần đưa lên thì báo cách sửa', () => {
  const todo = planPublish([item()], new Map(), REPO)[0];
  assert.doesNotThrow(() => assertReleaseWritable(todo, { exists: true, immutable: false }, 'files-HK251'));
  assert.doesNotThrow(() => assertReleaseWritable(undefined, { exists: true, immutable: true }, 'files-HK251'));
  assert.doesNotThrow(() => assertReleaseWritable(todo, { exists: false, immutable: false }, 'files-HK251'));
  assert.throws(() => assertReleaseWritable(todo, { exists: true, immutable: true }, 'files-HK251'), (e) => {
    assert.match(e.message, /files-HK251 là immutable release/);
    assert.match(e.message, /releaseTagOverrides/);
    assert.match(e.message, /workflow_dispatch/);
    return true;
  });
});
