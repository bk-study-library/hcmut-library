// Đọc kết quả ClamAV và soạn comment báo cáo kiểm file. Chỉ dùng JS chuẩn.

export const REPORT_MARKER = '<!-- kiem-file -->';
// Nhãn gắn vào PR khi máy không kết luận được, người duyệt phải xem tay trước khi merge.
export const MANUAL_LABEL = 'can-xem-tay';

const SIG = /^.*: ([\w.\-/:]+) FOUND\r?$/gm;
// ClamAV báo các chữ ký này khi không quét được (file mã hóa, vượt giới hạn) chứ không phải virus.
const UNSCANNABLE = /^Heuristics\.(Encrypted|Limits\.Exceeded)(\.|$)/;

// Kết quả clamscan. Có virus thật thì infected; chỉ có cảnh báo không quét được thì unscannable.
export function parseClamscan(stdout, exitCode) {
  if (exitCode === 0) return { infected: false };
  if (exitCode === 1) {
    const sigs = [...String(stdout).matchAll(SIG)].map((m) => m[1]);
    if (!sigs.length) throw new Error('Không đọc được tên virus từ kết quả ClamAV.');
    const virus = sigs.find((s) => !UNSCANNABLE.test(s));
    if (virus) return { infected: true, signature: virus };
    return { infected: false, unscannable: sigs[0] };
  }
  throw new Error(`ClamAV báo lỗi (mã ${exitCode}).`);
}

// Câu cố định cho từng mã cảnh báo của job scan. manual: cần người duyệt xem tay (gắn label).
export const WARNINGS = {
  'pdf-javascript': { manual: true, text: 'PDF có JavaScript. Người duyệt mở xem tay; tài liệu học tập không cần JavaScript, có thể nhờ người gửi xuất lại PDF.' },
  'pdf-launch': { manual: true, text: 'PDF có lệnh mở chương trình khác (Launch). Người duyệt mở xem tay.' },
  'pdf-openaction': { manual: false, text: 'PDF có hành động tự chạy khi mở hoặc khi bấm (OpenAction, AA). Thường chỉ là chọn trang đầu, người duyệt xem qua.' },
  'pdf-embedded': { manual: false, text: 'PDF có file đính kèm bên trong. Người duyệt mở xem file đính kèm là gì.' },
  'office-macro': { manual: true, text: 'File Office có macro (vbaProject.bin). Người duyệt mở xem tay; tài liệu học tập thường không cần macro.' },
  'office-comments': { manual: false, text: 'File có comment hoặc sửa đổi có theo dõi. Tên người viết đã được xóa, nội dung comment vẫn còn.' },
  'office-external': { manual: true, text: 'File Office trỏ tới tài nguyên bên ngoài (mẫu, đối tượng nhúng, ảnh tải từ mạng). Người duyệt mở xem tay.' },
  'zip-encrypted': { manual: true, text: 'File .zip có mục đặt mật khẩu nên không quét được bên trong. Người duyệt mở xem tay.' },
  'zip-unsafe-path': { manual: true, text: 'File .zip có đường dẫn lạ (tuyệt đối hoặc có ..). Người duyệt mở xem tay.' },
  'zip-symlink': { manual: true, text: 'File .zip có liên kết tượng trưng. Người duyệt mở xem tay.' },
  'zip-nested': { manual: true, text: 'File .zip chứa file nén khác. Người duyệt mở xem tay.' },
  'zip-other-type': { manual: true, text: 'File .zip có file thuộc loại không nhận trong gói quiz (catalog/policy.json, scan.zipAllowedInside). Người duyệt mở xem tay.' },
  'zip-large': { manual: true, text: 'File .zip giải nén ra lớn hơn giới hạn. Người duyệt mở xem tay.' },
  'zip-images': { manual: false, text: 'Ảnh bên trong file .zip chưa được xóa metadata (vị trí GPS, tên máy). Người duyệt mở xem.' },
};

// Có cần người duyệt xem tay không: ClamAV không quét được, hoặc có cảnh báo loại manual.
export function needsManualReview({ unscannable, warnings = [] }) {
  return Boolean(unscannable) || warnings.some((w) => WARNINGS[w]?.manual);
}

// Ghi chú ngắn cho từng mã cảnh báo, dùng trong bảng kết quả (câu dài ở WARNINGS[].text).
const SHORT = {
  'pdf-javascript': 'PDF có JavaScript',
  'pdf-launch': 'PDF có lệnh Launch',
  'pdf-openaction': 'PDF có OpenAction',
  'pdf-embedded': 'PDF có file đính kèm',
  'office-macro': 'Office có macro',
  'office-comments': 'Còn nội dung comment',
  'office-external': 'Office trỏ ra ngoài',
  'zip-encrypted': '.zip có mật khẩu',
  'zip-unsafe-path': '.zip có đường dẫn lạ',
  'zip-symlink': '.zip có symlink',
  'zip-nested': '.zip lồng .zip',
  'zip-other-type': '.zip có loại file lạ',
  'zip-large': '.zip quá lớn khi giải nén',
  'zip-images': 'Ảnh trong .zip còn metadata',
};

// Ô trong bảng markdown: bỏ ký tự có thể phá bảng hay chèn HTML, link, gọi tên người.
const cell = (s) => String(s).replace(/[|<>`[\]@#\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Các ghi chú của một file; rỗng là không có gì cần xem.
function fileNotes(f) {
  if (f.virus) return [`Có virus: ${cell(f.virus)}`];
  const notes = [];
  if (f.unscannable) notes.push(`ClamAV không quét hết (${cell(f.unscannable)})`);
  for (const w of f.warnings || []) if (SHORT[w]) notes.push(SHORT[w]);
  if (f.hasText === false) notes.push('PDF không có lớp chữ');
  if (Number.isInteger(f.textPages) && Number.isInteger(f.totalPages) && f.textPages < f.totalPages) notes.push(`Chỉ đọc chữ ${f.textPages}/${f.totalPages} trang`);
  if (f.piiChecked === false) notes.push('Chưa kiểm thông tin cá nhân');
  const byLabel = new Map();
  for (const p of f.pii || []) {
    if (!byLabel.has(p.label)) byLabel.set(p.label, new Set());
    byLabel.get(p.label).add(p.page);
  }
  for (const [label, pages] of byLabel) notes.push(`Có thể có ${cell(label)} (trang ${[...pages].sort((a, b) => a - b).join(', ')})`);
  return notes;
}

// Kết quả phân loại (scripts/upload/triage.mjs) cho dòng đầu comment.
const REVIEW_REASONS = { manual: 'cảnh báo cần xem tay', type: 'loại tài liệu cần người duyệt (đề thi)', 'book-like': 'file dày như sách', duplicate: 'tên gần giống tài liệu đã có' };
const UNCLASSIFIED_REASONS = { 'new-course': 'môn mới', pii: 'có thể có thông tin cá nhân', 'no-text': 'PDF không có lớp chữ', warning: 'cảnh báo nhẹ', update: 'bản cập nhật' };
// reviewers: người duyệt (bỏ @) theo .github/CODEOWNERS; bài Chưa phân loại nhắc tên để GitHub báo cho họ.
// Bot merge ở lượt cron kế tiếp của Worker (worker/wrangler.jsonc), không ngay khi check qua.
function decisionLine(decision, files, reviewers, unclassifiedUrl) {
  const reasons = (key, names) => [...new Set(files.flatMap((f) => f.triage?.[key] || []))].map((r) => names[r] || r).join(', ');
  if (decision === 'review') return `Cần người duyệt: ${reasons('review', REVIEW_REASONS)}. Bot đã yêu cầu review.`;
  const merge = 'bot merge ở lượt chạy kế tiếp (vài phút) sau khi check qua';
  if (decision === 'unclassified') return `Đăng vào mục Chưa phân loại (${reasons('unclassified', UNCLASSIFIED_REASONS)}), ${merge}. ${reviewers.map((r) => `@${r}`).join(' ')} phân loại ở ${unclassifiedUrl}`.replace(/  +/g, ' ');
  return `Tự đăng: ${merge}.`;
}

// Comment kết quả kiểm của một bài (một hay nhiều file): một bảng, một link duyệt.
// files: [{ name, size, virus, unscannable, warnings, hasText, pii, piiChecked, textPages, totalPages }].
// reviewUrl: trang duyệt (sau Cloudflare Access); không có thì bỏ dòng này.
export function renderReport({ code, reviewUrl = '', files, decision = null, reviewers = [], unclassifiedUrl = 'chua-phan-loai/' }) {
  const virus = files.some((f) => f.virus);
  const manual = !virus && files.some((f) => needsManualReview(f));
  const out = [REPORT_MARKER, `## Kiểm file bài ${cell(code)}: ${files.length} file, ${virus ? 'CÓ VIRUS' : 'không có virus'}`, ''];
  if (virus) out.push('Bài bị đóng, file không được dùng. Hãy quét máy rồi gửi lại bằng file sạch.', '');
  else {
    if (decision) out.push(decisionLine(decision, files, reviewers, unclassifiedUrl), '');
    if (reviewUrl) out.push(`Duyệt: ${reviewUrl}`, '');
  }
  out.push('| # | File | Cần xem |', '|---|---|---|');
  files.forEach((f, i) => {
    const notes = fileNotes(f);
    const size = formatBytes(f.size);
    out.push(`| ${i + 1} | ${cell(f.name)}${size ? `, ${size}` : ''} | ${notes.length ? notes.join('; ') : 'Không'} |`);
  });
  out.push('');
  if (manual) out.push(`Đã gắn label \`${MANUAL_LABEL}\`: máy không kết luận được, mở file xem tay trước khi duyệt.`);
  if (!virus) out.push('Metadata đã được xóa. Thông tin cá nhân chỉ là cảnh báo, không bị chặn. File lên Release khi merge.');
  return `${out.join('\n')}\n`;
}

// Khối code markdown chứa chữ chưa tin (stderr của công cụ, nội dung artifact): rào bằng số dấu `
// nhiều hơn đoạn ` dài nhất trong chữ, nên chữ không thoát ra được; cắt bớt khi quá dài.
export function fenced(text, max = 2000) {
  let body = String(text ?? '');
  if (body.length > max) body = `${body.slice(0, max)}\n(còn nữa, xem nhật ký)`;
  const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${body}\n${fence}`;
}
