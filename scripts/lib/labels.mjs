// Nhãn hiển thị dùng chung cho README môn và trang web.

export const REPO = 'bk-study-library/hcmut-library';
export const REPO_URL = `https://github.com/${REPO}`;
// Địa chỉ web công khai. Đổi khi gắn tên miền riêng; app đọc <SITE_URL>v1/index.json.
export const SITE_URL = 'https://bk-study-library.github.io/hcmut-library/';
export const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/`;

export const TYPE_ORDER = [
  'lecture-slides', 'summary', 'notes', 'cheatsheet', 'quiz-pack', 'tips', 'exercise-solution', 'exam-past', 'exam-solution',
  'prelab-template', 'prelab-reference', 'lab-report-reference', 'project-reference', 'book-ref', 'link',
];

export const TYPES = {
  'lecture-slides': { vi: 'Slide bài giảng', en: 'Lecture slides' },
  summary: { vi: 'Tóm tắt', en: 'Summaries' },
  notes: { vi: 'Ghi chú', en: 'Notes' },
  cheatsheet: { vi: 'Bảng công thức', en: 'Cheat sheets' },
  'quiz-pack': { vi: 'Gói quiz (Study Pack)', en: 'Quiz packs (Study Pack)' },
  tips: { vi: 'Mẹo học', en: 'Study tips' },
  'exercise-solution': { vi: 'Lời giải bài tập', en: 'Exercise solutions' },
  'exam-past': { vi: 'Đề cũ', en: 'Past exams (public)' },
  'exam-solution': { vi: 'Lời giải đề', en: 'Exam solutions' },
  'prelab-template': { vi: 'Mẫu prelab', en: 'Prelab templates' },
  'prelab-reference': { vi: 'Prelab tham khảo', en: 'Prelab references (after grading)' },
  'lab-report-reference': { vi: 'Báo cáo thí nghiệm tham khảo', en: 'Lab report references' },
  'project-reference': { vi: 'Bài tập lớn tham khảo', en: 'Project references' },
  'book-ref': { vi: 'Sách tham khảo (chỉ ghi tên)', en: 'Reference books (title only)' },
  link: { vi: 'Link', en: 'Links' },
};

// Loại kiểm tra của đề (khóa lấy từ policy.fields.examKinds).
export const EXAM_KINDS = { gk: 'Giữa kỳ', ck: 'Cuối kỳ', quiz: 'Quiz', kt: 'Kiểm tra' };

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

// Loại chương trình (trường type của chương trình). short: nhãn ngắn trên badge; vi, en: tên đầy đủ.
// Nhãn vi của loại khác CQ cũng là giá trị variant mà script nhập CTĐT ghi vào chương trình.
export const PROGRAM_TYPES = {
  CQ: { short: { vi: 'Chính quy', en: 'Standard' }, vi: 'Chương trình chính quy', en: 'Standard program' },
  CTTA: { short: { vi: 'Tiếng Anh', en: 'In English' }, vi: 'Dạy và học bằng tiếng Anh', en: 'Taught in English' },
  CNTN: { short: { vi: 'Tài năng', en: 'Honors' }, vi: 'Chương trình tài năng', en: 'Honors program' },
  PFIEV: { short: { vi: 'PFIEV', en: 'PFIEV' }, vi: 'PFIEV (kỹ sư Việt Pháp)', en: 'PFIEV (French-Vietnamese engineer)' },
  SN: { short: { vi: 'Song ngành', en: 'Dual degree' }, vi: 'Song ngành', en: 'Dual degree' },
  CTTT: { short: { vi: 'Tiên tiến', en: 'Advanced' }, vi: 'Chương trình tiên tiến', en: 'Advanced program' },
  DHNB: { short: { vi: 'Nhật Bản', en: 'Japan' }, vi: 'Định hướng Nhật Bản', en: 'Japan-oriented' },
  VLVH: { short: { vi: 'Vừa làm vừa học', en: 'Part-time' }, vi: 'Vừa làm vừa học', en: 'Part-time' },
  CTQT: { short: { vi: 'Chuyển tiếp quốc tế', en: 'Transfer' }, vi: 'Chuyển tiếp quốc tế', en: 'International transfer' },
  // Sau đại học (thạc sĩ, tiến sĩ). Chương trình sau đại học khóa 2022 trở về trước chưa chia hướng, ghi CQ.
  UD: { short: { vi: 'Ứng dụng', en: 'Applied' }, vi: 'Thạc sĩ định hướng ứng dụng', en: 'Applied master' },
  NC: { short: { vi: 'Nghiên cứu', en: 'Research' }, vi: 'Thạc sĩ định hướng nghiên cứu', en: 'Research master' },
  CSAU: { short: { vi: 'Nghiên cứu chuyên sâu', en: 'Intensive research' }, vi: 'Thạc sĩ nghiên cứu chuyên sâu', en: 'Intensive research master' },
  TAUD: { short: { vi: 'Tiếng Anh, ứng dụng', en: 'In English, applied' }, vi: 'Thạc sĩ ứng dụng dạy bằng tiếng Anh', en: 'Applied master taught in English' },
  STEM: { short: { vi: 'Tài năng STEM', en: 'STEM honors' }, vi: 'Thạc sĩ tài năng STEM', en: 'STEM honors master' },
  PT1: { short: { vi: 'Phương thức 1', en: 'Track 1' }, vi: 'Tiến sĩ phương thức 1', en: 'Doctoral track 1' },
  PT2: { short: { vi: 'Phương thức 2', en: 'Track 2' }, vi: 'Tiến sĩ phương thức 2', en: 'Doctoral track 2' },
  TAPT1: { short: { vi: 'Tiếng Anh, phương thức 1', en: 'In English, track 1' }, vi: 'Tiến sĩ phương thức 1 dạy bằng tiếng Anh', en: 'Doctoral track 1 taught in English' },
};

// Nhãn chương trình ngắn của một mã môn (scripts/lib/program-label.mjs): mã này dạy cho hệ nào.
export const PROGRAM_LABELS = {
  CQ: { vi: 'Chính quy', en: 'Standard' },
  CTTT: { vi: 'Tiên tiến', en: 'Advanced' },
  PFIEV: { vi: 'Việt Pháp', en: 'French-Vietnamese' },
  CTTA: { vi: 'Tiếng Anh', en: 'In English' },
  CNTN: { vi: 'Tài năng', en: 'Honors' },
  DHNB: { vi: 'Định hướng Nhật Bản', en: 'Japan-oriented' },
  SN: { vi: 'Song ngành', en: 'Dual degree' },
  VLVH: { vi: 'Vừa làm vừa học', en: 'Part-time' },
  CTQT: { vi: 'Chuyển tiếp quốc tế', en: 'International transfer' },
};

// Vai trò khối kiến thức (trường kind của khối), theo thứ tự thường gặp trong CTĐT.
export const BLOCK_KINDS = {
  'toan-khtn': { vi: 'Toán và khoa học tự nhiên', en: 'Mathematics and natural sciences' },
  'ly-luan-chinh-tri': { vi: 'Lý luận chính trị và pháp luật', en: 'Political theory and law' },
  'giao-duc-chung': { vi: 'Giáo dục chung', en: 'General education' },
  'ngoai-ngu': { vi: 'Ngoại ngữ', en: 'Foreign languages' },
  'co-so-nganh': { vi: 'Cơ sở ngành', en: 'Foundation courses' },
  nganh: { vi: 'Ngành', en: 'Major courses' },
  'tu-chon-nganh': { vi: 'Tự chọn ngành', en: 'Major electives' },
  'chuyen-nganh': { vi: 'Chuyên ngành', en: 'Specialization' },
  'tu-chon-tu-do': { vi: 'Tự chọn tự do', en: 'Free electives' },
  'tot-nghiep': { vi: 'Tốt nghiệp', en: 'Graduation' },
  // Sau đại học.
  chung: { vi: 'Đa ngành tổng quát', en: 'General interdisciplinary' },
  'hoc-phan-tien-si': { vi: 'Học phần trình độ tiến sĩ', en: 'Doctoral-level courses' },
  'tieu-luan-chuyen-de': { vi: 'Tiểu luận tổng quan và chuyên đề', en: 'Literature review and seminars' },
  'luan-van': { vi: 'Luận văn, đề án thạc sĩ', en: "Master's thesis or project" },
  'luan-an': { vi: 'Luận án tiến sĩ', en: 'Doctoral dissertation' },
  'quoc-phong': { vi: 'Giáo dục quốc phòng', en: 'Military education' },
  'the-chat': { vi: 'Giáo dục thể chất', en: 'Physical education' },
  'dieu-kien-tot-nghiep': { vi: 'Điều kiện tốt nghiệp', en: 'Graduation requirements' },
  khac: { vi: 'Khác', en: 'Other' },
};

export const DEGREES = {
  'cu-nhan': { vi: 'Cử nhân', en: 'Bachelor' },
  'ky-su': { vi: 'Kỹ sư', en: 'Engineer' },
  'ky-su-chuyen-sau': { vi: 'Kỹ sư chuyên sâu đặc thù', en: 'Specialized engineer' },
  'thac-si': { vi: 'Thạc sĩ', en: 'Master' },
  'tien-si': { vi: 'Tiến sĩ', en: 'Doctor' },
};

// Bậc đào tạo. Chương trình, ngành không ghi level là dai-hoc.
export const LEVELS = {
  'dai-hoc': { vi: 'Đại học', en: 'Undergraduate' },
  'thac-si': { vi: 'Thạc sĩ', en: 'Master' },
  'tien-si': { vi: 'Tiến sĩ', en: 'Doctoral' },
};
export const DEFAULT_LEVEL = 'dai-hoc';
// Bậc của môn: trường levels (vắng nghĩa là chỉ đại học).
export const courseLevels = (c) => (Array.isArray(c.levels) && c.levels.length ? c.levels : [DEFAULT_LEVEL]);
// Môn chỉ thuộc sau đại học (không có bậc đại học).
export const isPostgradCourse = (c) => !courseLevels(c).includes(DEFAULT_LEVEL);
// Chương trình, ngành thuộc sau đại học.
export const isPostgrad = (x) => Boolean(x.level) && x.level !== DEFAULT_LEVEL;
export const POSTGRAD_LEVELS = ['thac-si', 'tien-si'];

// Đoạn đường dẫn trang ngành: major/<khóa>/. Mã song ngành có dấu + (7520201+7520207) đổi thành dấu gạch ngang.
export const majorKey = (code) => String(code).replace(/\+/g, '-');

export function issueUrl(template, fields = {}) {
  const q = new URLSearchParams({ template, ...fields });
  return `${REPO_URL}/issues/new?${q.toString()}`;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// "Tên, tác giả, năm, NXB, ISBN", bỏ phần không có.
export function formatBook(b) {
  return [b.title, b.authors.join(', '), b.year, b.publisher, b.isbn].filter((x) => x !== undefined && x !== '').join(', ');
}

// Định dạng file hiện trên thẻ tài liệu, theo đuôi file. Đuôi không có ở đây thì ghi đuôi viết hoa.
export const FILE_FORMATS = {
  '.pdf': 'PDF',
  '.doc': 'DOC',
  '.docx': 'DOCX',
  '.ppt': 'PPT',
  '.pptx': 'PPTX',
  '.xls': 'XLS',
  '.xlsx': 'XLSX',
  '.zip': 'ZIP',
  '.png': 'PNG',
  '.jpg': 'JPG',
  '.jpeg': 'JPG',
  '.md': 'MD',
  '.txt': 'TXT',
  '.json': 'JSON',
};

export function fileFormat(name) {
  const m = /(\.[A-Za-z0-9]+)$/.exec(String(name || ''));
  if (!m) return '';
  const ext = m[1].toLowerCase();
  return FILE_FORMATS[ext] || ext.slice(1).toUpperCase();
}

// Ngôn ngữ của tài liệu (trường lang), theo ngôn ngữ trang.
export const DOC_LANGS = {
  vi: { vi: 'Tiếng Việt', en: 'Vietnamese' },
  en: { vi: 'Tiếng Anh', en: 'English' },
};
