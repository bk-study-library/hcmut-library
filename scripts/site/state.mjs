// Trạng thái dùng chung trong một lần dựng web: buildSite đặt một lần khi biết danh mục (ngày dữ liệu, ảnh chia sẻ,
// cách tính đường dẫn và tên trang môn), các hàm dựng HTML đọc. SRC là thư mục site-src.
import path from 'node:path';
import { TOOL_ROOT } from '../lib/repo.mjs';

export const SRC = path.join(TOOL_ROOT, 'site-src');

export const state = {
  // Ngày dữ liệu (index.generated), hiện ở chân trang.
  generated: null,
  // Ảnh chia sẻ { path, width, height } hay null.
  social: null,
  // Trang của từng mã: mã thuộc môn nhiều mã thì là trang môn theo tên mon/<slug>/, còn lại course/<ID>/.
  page: {
    collapseMin: Infinity,
    label: () => '',
    subject: () => false,
    path: (id) => `course/${id}/`,
    anchor: (it) => it.id,
    name: (t, c) => (t.lang === 'en' && c.nameEn ? c.nameEn : c.name),
  },
};
