// Nhãn hiển thị dùng chung cho README môn và trang web.

export const REPO = 'xeroz369/bk-study-library';
export const REPO_URL = `https://github.com/${REPO}`;

export const TYPE_ORDER = ['summary', 'notes', 'cheatsheet', 'solution', 'quiz-pack', 'prelab-template', 'prelab-reference', 'link'];

export const TYPES = {
  'prelab-template': { vi: 'Mẫu prelab', en: 'Prelab templates' },
  'prelab-reference': { vi: 'Prelab tham khảo (đã hết hạn chấm)', en: 'Prelab references (after grading)' },
  summary: { vi: 'Tóm tắt', en: 'Summaries' },
  notes: { vi: 'Ghi chú', en: 'Notes' },
  solution: { vi: 'Lời giải tự soạn', en: 'Worked solutions' },
  cheatsheet: { vi: 'Bảng công thức', en: 'Cheat sheets' },
  'quiz-pack': { vi: 'Gói quiz (Study Pack)', en: 'Quiz packs (Study Pack)' },
  link: { vi: 'Link', en: 'Links' },
};

export const PARTS = {
  theory: { vi: 'Lý thuyết', en: 'Theory' },
  lab: { vi: 'Thí nghiệm', en: 'Lab' },
  assignment: { vi: 'Bài tập lớn', en: 'Assignment' },
  project: { vi: 'Đồ án', en: 'Project' },
};

export const STATUS = {
  active: { vi: 'Đang dạy', en: 'Active' },
  retired: { vi: 'Đã ngừng', en: 'Retired' },
};

export function issueUrl(template, fields = {}) {
  const q = new URLSearchParams({ template, ...fields });
  return `${REPO_URL}/issues/new?${q.toString()}`;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
