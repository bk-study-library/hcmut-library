// Môn theo tên cho build: nạp đúng file site-src/assets/subject-core.js mà trình duyệt dùng, để quy tắc gộp
// tên và slug chỉ nằm ở một chỗ. Chỉ web dùng, không thuộc hợp đồng v1.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { TOOL_ROOT } from './repo.mjs';

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(TOOL_ROOT, 'site-src', 'assets', 'subject-core.js'), 'utf8'), ctx);
const core = ctx.BkSubject;

export const { baseName, nameKey, slugOf, title } = core;

// Mảng từ vm có prototype khác: chép sang mảng thường để so sánh, JSON như bình thường.
const plain = (x) => JSON.parse(JSON.stringify(x));

export const groups = (courses, min = 2) => plain(core.groups(plain([...courses].map((c) => ({ id: c.id, name: c.name }))), min));
export const pickCode = (courses) => {
  const hit = core.pickCode(plain(courses.map((c) => ({ id: c.id, code: c.code, status: c.status, progs: c.progs || 0, items: c.items || 0 }))));
  return hit ? courses.find((c) => c.id === hit.id) : null;
};

// Môn theo tên của cả danh mục: subjects (slug -> { slug, ids, name, nameEn }) và subjectOf (id -> slug).
//   courses: Map id -> môn (có name, nameEn, code, status, programs, items như index trong bộ nhớ)
export function subjectIndex(courses, { min = 2 } = {}) {
  const all = [...courses.values()];
  const subjects = new Map();
  const subjectOf = new Map();
  for (const g of groups(all, min)) {
    const list = g.ids.map((id) => courses.get(id));
    const name = title(list.map((c) => c.name));
    const en = list.map((c) => c.nameEn).filter(Boolean);
    const progs = (c) => new Set((c.programs || []).map((p) => p.program)).size;
    const items = (c) => (c.items || []).filter((i) => !i.removed).length;
    const main = pickCode(list.map((c) => ({ id: c.id, code: c.code, status: c.status, progs: progs(c), items: items(c) })));
    subjects.set(g.slug, { slug: g.slug, ids: g.ids, name, nameEn: en.length ? title(en) : '', main: main.id });
    for (const id of g.ids) subjectOf.set(id, g.slug);
  }
  return { subjects, subjectOf };
}
