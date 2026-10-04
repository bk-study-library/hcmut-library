// Đọc catalog/policy.json: nguồn cấu hình chung (giới hạn file, đuôi file, loại tài liệu, học kỳ).
// Không phụ thuộc thư viện ngoài.

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED = ['openTypes', 'maxFileBytes', 'maxMdInGitBytes', 'extensions', 'quizExtensions', 'selfMadeLicenses', 'terms', 'fields'];

// Trả về danh sách khóa còn thiếu (rỗng nếu đủ).
export function missingKeys(pol) {
  return REQUIRED.filter((k) => !pol || pol[k] === undefined);
}

export function loadPolicy(root) {
  const p = path.join(root, 'catalog', 'policy.json');
  let pol;
  try {
    pol = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`không đọc được catalog/policy.json: ${e.message}`);
  }
  const miss = missingKeys(pol);
  if (miss.length) throw new Error(`catalog/policy.json thiếu khóa: ${miss.join(', ')}`);
  return pol;
}
