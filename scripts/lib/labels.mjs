// Nhãn hiển thị dùng chung cho README môn và trang web.

export const REPO = 'bk-study-library/bk-study-library';
export const REPO_URL = `https://github.com/${REPO}`;
// Địa chỉ web công khai. Đổi khi gắn tên miền riêng; app đọc <SITE_URL>v1/index.json.
export const SITE_URL = 'https://bk-study-library.github.io/bk-study-library/';
export const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/`;

export const TYPE_ORDER = [
  'summary', 'notes', 'cheatsheet', 'quiz-pack', 'tips', 'exercise-solution', 'exam-past', 'exam-solution',
  'prelab-template', 'prelab-reference', 'lab-report-reference', 'project-reference', 'link',
];

export const TYPES = {
  summary: { vi: 'Tóm tắt', en: 'Summaries' },
  notes: { vi: 'Ghi chú', en: 'Notes' },
  cheatsheet: { vi: 'Bảng công thức', en: 'Cheat sheets' },
  'quiz-pack': { vi: 'Gói quiz (Study Pack)', en: 'Quiz packs (Study Pack)' },
  tips: { vi: 'Mẹo học', en: 'Study tips' },
  'exercise-solution': { vi: 'Lời giải bài tập tự làm', en: 'Exercise solutions' },
  'exam-past': { vi: 'Đề cũ đã công khai', en: 'Past exams (public)' },
  'exam-solution': { vi: 'Lời giải đề tự làm', en: 'Exam solutions' },
  'prelab-template': { vi: 'Mẫu prelab', en: 'Prelab templates' },
  'prelab-reference': { vi: 'Prelab tham khảo (đã hết hạn chấm)', en: 'Prelab references (after grading)' },
  'lab-report-reference': { vi: 'Báo cáo thí nghiệm tham khảo', en: 'Lab report references' },
  'project-reference': { vi: 'Bài tập lớn tham khảo', en: 'Project references' },
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
