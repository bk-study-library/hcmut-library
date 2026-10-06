// Tài liệu tên gần giống trong cùng môn: nạp đúng site-src/assets/upload-core.js (similarDocs) và search-core.js
// (fold) mà form Gửi tài liệu dùng để cảnh báo trùng, để quy tắc chỉ nằm ở một chỗ.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { TOOL_ROOT } from './repo.mjs';

const ctx = vm.createContext({});
for (const f of ['search-core.js', 'upload-core.js']) vm.runInContext(fs.readFileSync(path.join(TOOL_ROOT, 'site-src', 'assets', f), 'utf8'), ctx);

// docs: [{ title }] của môn. Trả true khi có tài liệu tên gần giống title.
export function hasSimilarTitle(title, docs) {
  return ctx.BkUpload.similarDocs(String(title || ''), JSON.parse(JSON.stringify(docs)), ctx.BkSearch.fold, 1).length > 0;
}
