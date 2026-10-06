// Người duyệt theo .github/CODEOWNERS (scripts/upload/reviewers.mjs): dòng khớp sau cùng thắng như GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ownersFor } from '../scripts/upload/reviewers.mjs';
import { TOOL_ROOT } from '../scripts/lib/repo.mjs';

test('CODEOWNERS của repo: file bot ghi không có code owner, người duyệt tra theo thư mục môn', () => {
  const text = fs.readFileSync(path.join(TOOL_ROOT, '.github', 'CODEOWNERS'), 'utf8');
  for (const f of ['courses/MT1005/items/a.json', 'courses/MT1005/README.md', 'index.json', 'index.min.json', 'v1/courses/MT1005.json', 'worker-catalog.json']) assert.deepEqual(ownersFor(text, f), [], f);
  assert.deepEqual(ownersFor(text, 'courses/MT1005/'), ['xeroz369']);
  assert.deepEqual(ownersFor(text, 'catalog/courses/MT1005.json'), ['xeroz369']);
});

test('dòng theo thư mục môn, glob, nhóm; dòng sau cùng thắng; ghi chú bị bỏ', () => {
  const text = '* @a\n/courses/EE*/ @a @b # khoa điện\n/courses/MT*/ @org/toan\n# /courses/ @x\n';
  assert.deepEqual(ownersFor(text, 'courses/EE2033/items/x.json'), ['a', 'b']);
  assert.deepEqual(ownersFor(text, 'courses/MT1005/items/x.json'), ['org/toan']);
  assert.deepEqual(ownersFor(text, 'courses/CO1005/items/x.json'), ['a']);
  assert.deepEqual(ownersFor('', 'courses/x'), []);
});
