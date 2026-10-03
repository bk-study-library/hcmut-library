import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, 'fixtures');

// Chép một fixture sang thư mục tạm để test sửa thoải mái.
export function copyFixture(name = 'valid') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bk-lib-${name}-`));
  fs.cpSync(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

export function readJson(dir, rel) {
  return JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
}

export function writeJson(dir, rel, data) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

export function editJson(dir, rel, fn) {
  const data = readJson(dir, rel);
  fn(data);
  writeJson(dir, rel, data);
}

export function codes(list) {
  return [...new Set(list.map((e) => e.code))].sort();
}
