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

// Loại chương trình (trường type của chương trình). abbr, short: mã viết tắt Sổ tay HCMUT hiện trên badge;
// official: tên chính thức trên bộ chọn của Sổ tay (hcmut.edu.vn/study/handbook), hiện khi trỏ chuột và
// trong ghi chú viết tắt (docs/ten-chuong-trinh.md); vi, en: tên cũ, giữ làm giá trị variant.
// Nhãn vi của loại khác CQ cũng là giá trị variant mà script nhập CTĐT ghi vào chương trình.
export const PROGRAM_TYPES = {
  CQ: { abbr: 'CQ', short: { vi: 'CQ', en: 'CQ' }, official: { vi: 'Chương trình Đại học tiêu chuẩn', en: 'Vietnamese-taught Undergraduate Program' }, vi: 'Chương trình tiêu chuẩn', en: 'Standard program' },
  CTTA: { abbr: 'CTTA', short: { vi: 'CTTA', en: 'CTTA' }, official: { vi: 'Chương trình Đại học Dạy và học bằng tiếng Anh', en: 'English-taught Undergraduate Program' }, vi: 'Dạy và học bằng tiếng Anh', en: 'Taught in English' },
  CNTN: { abbr: 'CNTN', short: { vi: 'CNTN', en: 'CNTN' }, official: { vi: 'Chương trình Đại học tài năng', en: 'Honors Undergraduate Program' }, vi: 'Chương trình tài năng', en: 'Honors program' },
  PFIEV: { abbr: 'PFIEV', short: { vi: 'PFIEV', en: 'PFIEV' }, official: { vi: 'Chương trình Đại học Kỹ sư chất lượng cao tại Việt Nam', en: 'Vietnamese-French High-Quality Engineering Program (PFIEV)' }, vi: 'PFIEV (kỹ sư Việt Pháp)', en: 'PFIEV (French-Vietnamese engineer)' },
  SN: { abbr: 'SN', short: { vi: 'SN', en: 'SN' }, official: { vi: 'Chương trình Đại học Song ngành', en: 'Dual-degree Undergraduate Program' }, vi: 'Song ngành', en: 'Dual degree' },
  CTTT: { abbr: 'CTTT', short: { vi: 'CTTT', en: 'CTTT' }, official: { vi: 'Chương trình Đại học Tiên tiến', en: 'Advanced Undergraduate Program' }, vi: 'Chương trình tiên tiến', en: 'Advanced program' },
  DHNB: { abbr: 'DHNB', short: { vi: 'DHNB', en: 'DHNB' }, official: { vi: 'Chương trình Đại học Định hướng Nhật Bản', en: 'Japanese-oriented Undergraduate Program' }, vi: 'Định hướng Nhật Bản', en: 'Japan-oriented' },
  VLVH: { abbr: 'VLVH', short: { vi: 'VLVH', en: 'VLVH' }, official: { vi: 'Hình thức Vừa làm vừa học', en: 'Vừa làm vừa học (VLVH)' }, vi: 'Vừa làm vừa học', en: 'Part-time' },
  CTQT: { abbr: 'CTQT', short: { vi: 'CTQT', en: 'CTQT' }, official: { vi: 'Chương trình Chuyển tiếp quốc tế', en: 'Trans-national Education program' }, vi: 'Chuyển tiếp quốc tế', en: 'International transfer' },
  // Sau đại học (thạc sĩ, tiến sĩ). Chương trình sau đại học khóa 2022 trở về trước chưa chia hướng, ghi CQ.
  UD: { abbr: 'UD', short: { vi: 'UD', en: 'UD' }, official: { vi: 'Chương trình Thạc sĩ hướng Ứng dụng', en: 'Coursework Master Program' }, vi: 'Thạc sĩ định hướng ứng dụng', en: 'Applied master' },
  NC: { abbr: 'NC', short: { vi: 'NC', en: 'NC' }, official: { vi: 'Chương trình Thạc sĩ hướng Nghiên cứu', en: 'Research-oriented Master Program' }, vi: 'Thạc sĩ định hướng nghiên cứu', en: 'Research master' },
  CSAU: { abbr: 'CS', short: { vi: 'CS', en: 'CS' }, official: { vi: 'Chương trình Thạc sĩ hướng Nghiên cứu chuyên sâu', en: 'Research-intensive Master Program' }, vi: 'Thạc sĩ nghiên cứu chuyên sâu', en: 'Intensive research master' },
  TAUD: { abbr: 'CTTAUD', short: { vi: 'CTTAUD', en: 'CTTAUD' }, official: { vi: 'Chương trình Thạc sĩ Dạy và học bằng tiếng Anh hướng Ứng dụng', en: 'English-taught Coursework Master Program' }, vi: 'Thạc sĩ ứng dụng dạy bằng tiếng Anh', en: 'Applied master taught in English' },
  STEM: { abbr: 'THTN_STEM', short: { vi: 'THTN_STEM', en: 'THTN_STEM' }, official: { vi: 'Chương trình Thạc sĩ tài năng STEM', en: "STEM Honors Master's Program" }, vi: 'Thạc sĩ tài năng STEM', en: 'STEM honors master' },
  PT1: { abbr: 'PT1_1', short: { vi: 'PT1_1', en: 'PT1_1' }, official: { vi: 'Chương trình Tiến sĩ phương thức 1 (đã có bằng thạc sĩ)', en: "Doctoral Program, Mode 1 (with Master's entry)" }, vi: 'Tiến sĩ phương thức 1', en: 'Doctoral track 1' },
  PT2: { abbr: 'PT2_1', short: { vi: 'PT2_1', en: 'PT2_1' }, official: { vi: 'Chương trình Tiến sĩ phương thức 2 (đã có bằng thạc sĩ)', en: "Doctoral Program, Mode 2 (with Master's entry)" }, vi: 'Tiến sĩ phương thức 2', en: 'Doctoral track 2' },
  TAPT1: { abbr: 'CTTATS1_1', short: { vi: 'CTTATS1_1', en: 'CTTATS1_1' }, official: { vi: 'Chương trình Tiến sĩ Dạy và học bằng tiếng Anh phương thức 1 (đã có bằng thạc sĩ)', en: "English-taught Coursework Doctoral Program, Mode 1 (with Master's entry)" }, vi: 'Tiến sĩ phương thức 1 dạy bằng tiếng Anh', en: 'Doctoral track 1 taught in English' },
};

// Nhãn chương trình ngắn của một mã môn (scripts/lib/program-label.mjs): mã này dạy cho hệ nào.
export const PROGRAM_LABELS = Object.fromEntries(['CQ', 'CTTT', 'PFIEV', 'CTTA', 'CNTN', 'DHNB', 'SN', 'VLVH', 'CTQT'].map((k) => [k, { vi: PROGRAM_TYPES[k].abbr, en: PROGRAM_TYPES[k].abbr }]));

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
