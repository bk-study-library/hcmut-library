// Đọc catalog/policy.json: nguồn cấu hình chung (giới hạn file, đuôi file, loại tài liệu, học kỳ).
// Không phụ thuộc thư viện ngoài.

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED = ['openTypes', 'maxFileBytes', 'maxMdInGitBytes', 'extensions', 'quizExtensions', 'selfMadeLicenses', 'terms'];

export function loadPolicy(root) {
  const p = path.join(root, 'catalog', 'policy.json');
  let pol;
  try {
    pol = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`không đọc được catalog/policy.json: ${e.message}`);
  }
  for (const k of REQUIRED) {
    if (pol[k] === undefined) throw new Error(`catalog/policy.json thiếu khóa "${k}"`);
  }
  return pol;
}
