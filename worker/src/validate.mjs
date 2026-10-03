// Kiểm bài gửi từ form web: thuần hàm, không đụng mạng hay lưu trữ.
import { slugify } from '../../scripts/upload/naming.mjs';
import { formatSize } from '../../scripts/lib/labels.mjs';

const MESSAGES = {
  course: 'Không tìm thấy môn này. Chọn môn trong danh sách.',
  type: 'Không nhận loại tài liệu này. Chọn loại trong danh sách.',
  typeLink: 'Không gửi link qua form này được. Dùng nút "Thêm link" trên trang môn.',
  titleEmpty: 'Chưa có tiêu đề. Nhập tiêu đề cho tài liệu.',
  titleLong: (max) => `Tiêu đề quá dài. Rút xuống tối đa ${max} ký tự.`,
  titleSlug: 'Không đặt tên được từ tiêu đề này. Thêm chữ hoặc số vào tiêu đề.',
  license: 'Chưa chọn giấy phép hợp lệ. Chọn một giấy phép trong danh sách.',
  confirm: 'Chưa đủ xác nhận. Đánh dấu cả ba ô cam kết.',
  fileMissing: 'Chưa có file. Chọn file cần gửi.',
  fileEmpty: 'File rỗng. Chọn file khác.',
  fileExt: (list) => `Không nhận đuôi file này. Dùng một trong: ${list}.`,
  fileSize: (max) => `File quá lớn. Chọn file nhỏ hơn ${max}.`,
  fileMagic: (ext) => `Nội dung file không khớp đuôi ${ext}.`,
  lang: 'Mã ngôn ngữ không hợp lệ. Dùng dạng vi hoặc en.',
  description: (max) => `Mô tả quá dài. Rút xuống tối đa ${max} ký tự.`,
  textTotal: 'Nội dung các ô quá dài. Rút gọn bớt rồi gửi lại.',
  term: 'Học kỳ không hợp lệ. Dùng dạng HK251.',
  chapter: 'Chương không hợp lệ. Dùng số hoặc chữ không dấu, ví dụ 3 hay 3.2.',
  examKind: 'Loại kiểm tra không hợp lệ. Chọn trong danh sách.',
  teacher: (max) => `Tên giảng viên quá dài. Rút xuống tối đa ${max} ký tự.`,
  displayName: (max) => `Tên hiển thị quá dài. Rút xuống tối đa ${max} ký tự.`,
  bookFile: 'Không nhận file cho sách tham khảo. Sách chỉ ghi tên, hãy bỏ file đi.',
  bookTitle: 'Chưa có tên sách. Nhập tên sách.',
  bookAuthors: 'Chưa có tác giả. Nhập ít nhất một tác giả.',
  bookLimit: 'Thông tin sách quá dài. Rút gọn tên, tác giả hoặc nhà xuất bản.',
  bookYear: 'Năm xuất bản không hợp lệ. Nhập số từ 1000 đến 2100.',
  bookIsbn: 'ISBN không hợp lệ. Nhập 10 hoặc 13 chữ số, hoặc để trống.',
};

const LANG_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;
// Theo schema/item.schema.json.
const TERM_PATTERN = /^HK[0-9]{3}$/;
const CHAPTER_PATTERN = /^[0-9A-Za-z.-]+$/;
// Giới hạn độ dài và danh sách loại kiểm tra nằm ở policy.fields. textTotalMax là tổng byte UTF-8 của
// mọi ô chữ (trừ mã Turnstile): chặn đẩy dữ liệu lớn vào repo, nhất là qua book-ref.
const TEXT_TOTAL_SKIP = new Set(['cf-turnstile-response']);
const CONFIRMS = ['confirm-own', 'confirm-license', 'confirm-not-book'];
const OPTIONAL = ['description', 'term', 'chapter', 'examKind', 'teacher', 'displayName'];

const val = (fields, key) => String(fields[key] ?? '').trim();

function extOf(name) {
  const dot = String(name).lastIndexOf('.');
  return dot < 0 ? '' : String(name).slice(dot).toLowerCase();
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function checkFile(file, policy, errors) {
  const ext = extOf(file.name);
  const rule = policy.extensions[ext];
  if (!rule) {
    errors.file = MESSAGES.fileExt(Object.keys(policy.extensions).join(', '));
    return null;
  }
  if (file.size <= 0) {
    errors.file = MESSAGES.fileEmpty;
  } else if (file.size > policy.maxFileBytes) {
    errors.file = MESSAGES.fileSize(formatSize(policy.maxFileBytes));
  } else if (rule.magic && !toHex(file.head.subarray(0, rule.magic.length / 2)).startsWith(rule.magic)) {
    errors.file = MESSAGES.fileMagic(ext);
  }
  return ext;
}

function parseBook(fields, errors, lim) {
  const title = val(fields, 'book-title');
  if (!title) {
    errors.book = MESSAGES.bookTitle;
    return undefined;
  }
  const authors = val(fields, 'book-authors').split(/[,\n]/).map((a) => a.trim()).filter(Boolean);
  if (!authors.length) {
    errors.book = MESSAGES.bookAuthors;
    return undefined;
  }
  const publisher = val(fields, 'book-publisher');
  if (title.length > lim.bookTitleMax || publisher.length > lim.bookPublisherMax || authors.some((a) => a.length > lim.bookAuthorMax)) {
    errors.book = MESSAGES.bookLimit;
    return undefined;
  }
  const book = { title, authors };
  const year = val(fields, 'book-year');
  if (year) {
    if (!/^\d{4}$/.test(year) || Number(year) < 1000 || Number(year) > 2100) {
      errors.book = MESSAGES.bookYear;
      return undefined;
    }
    book.year = Number(year);
  }
  if (publisher) book.publisher = publisher;
  const isbn = val(fields, 'book-isbn').replace(/[-\s]/g, '').toUpperCase();
  if (isbn) {
    if (!/^(97[89][0-9]{10}|[0-9]{9}[0-9X])$/.test(isbn)) {
      errors.book = MESSAGES.bookIsbn;
      return undefined;
    }
    book.isbn = isbn;
  }
  return book;
}

export function validateSubmission(fields, file, ctx) {
  const { policy, courses } = ctx;
  const lim = policy.fields;
  const errors = {};

  const course = val(fields, 'course');
  if (!courses.has(course)) errors.course = MESSAGES.course;

  const type = val(fields, 'type');
  // Link đi theo form Issue "Thêm link", không qua đường tải file.
  if (type === 'link') errors.type = MESSAGES.typeLink;
  else if (!policy.openTypes.includes(type)) errors.type = MESSAGES.type;

  const title = val(fields, 'title');
  if (!title) errors.title = MESSAGES.titleEmpty;
  else if (title.length > lim.titleMax) errors.title = MESSAGES.titleLong(lim.titleMax);
  else if (!slugify(title)) errors.title = MESSAGES.titleSlug;

  const license = val(fields, 'license');
  if (!policy.selfMadeLicenses.includes(license)) errors.license = MESSAGES.license;

  const lang = val(fields, 'lang') || 'vi';
  if (!LANG_PATTERN.test(lang)) errors.lang = MESSAGES.lang;

  if (!CONFIRMS.every((k) => val(fields, k))) errors.confirm = MESSAGES.confirm;

  const textBytes = Object.entries(fields)
    .filter(([k, v]) => !TEXT_TOTAL_SKIP.has(k) && typeof v === 'string')
    .reduce((sum, [, v]) => sum + new TextEncoder().encode(v).length, 0);
  if (textBytes > lim.textTotalMax) errors.form = MESSAGES.textTotal;

  // Ô tùy chọn: để trống thì bỏ qua (tên hiển thị trống là ẩn danh).
  if (val(fields, 'description').length > lim.descriptionMax) errors.description = MESSAGES.description(lim.descriptionMax);
  const term = val(fields, 'term');
  if (term && !TERM_PATTERN.test(term)) errors.term = MESSAGES.term;
  const chapter = val(fields, 'chapter');
  if (chapter && !(chapter.length <= lim.chapterMax && CHAPTER_PATTERN.test(chapter))) errors.chapter = MESSAGES.chapter;
  const examKind = val(fields, 'examKind');
  if (examKind && !lim.examKinds.includes(examKind)) errors.examKind = MESSAGES.examKind;
  if (val(fields, 'teacher').length > lim.teacherMax) errors.teacher = MESSAGES.teacher(lim.teacherMax);
  if (val(fields, 'displayName').length > lim.displayNameMax) errors.displayName = MESSAGES.displayName(lim.displayNameMax);

  let ext;
  let book;
  if (file && type === 'book-ref') {
    errors.file = MESSAGES.bookFile;
  } else if (file) {
    ext = checkFile(file, policy, errors) ?? undefined;
  } else if (type === 'book-ref') {
    book = parseBook(fields, errors, lim);
  } else {
    errors.file = MESSAGES.fileMissing;
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const form = { course, type, title, lang, license };
  for (const key of OPTIONAL) {
    const v = val(fields, key);
    if (v) form[key] = v;
  }
  if (book) form.book = book;
  return { ok: true, form, ext };
}
