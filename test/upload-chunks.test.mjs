// Tải file lớn theo phần ở trình duyệt (site-src/assets/upload-chunks.js): sha256 theo luồng phải khớp băm một lần.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { HERE } from './helpers.mjs';

const ctx = vm.createContext({ Uint8Array, Uint32Array, Math, Promise, btoa });
vm.runInContext(fs.readFileSync(path.join(HERE, '..', 'site-src', 'assets', 'upload-chunks.js'), 'utf8'), ctx);
const { Sha256 } = ctx.BkChunks;

test('Sha256 theo luồng khớp crypto với mọi cách chia phần và độ dài quanh biên khối', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 100000]) {
    const data = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);
    const want = crypto.createHash('sha256').update(data).digest('hex');
    for (const step of [1, 7, 64, 1000, n || 1]) {
      const h = new Sha256();
      for (let i = 0; i < n; i += step) h.update(data.subarray(i, i + step));
      assert.equal(h.hex(), want, `n=${n} step=${step}`);
    }
  }
});
