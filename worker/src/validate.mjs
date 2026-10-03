// Kiểm bài gửi từ form web: thuần hàm, không đụng mạng hay lưu trữ.
import { slugify } from '../../scripts/upload/naming.mjs';
import { formatSize } from '../../scripts/lib/labels.mjs';

const MESSAGES = {
  course: 'Không tìm thấy môn này. Chọn môn trong danh sách.',
  type: 'Không nhận loại tài liệu này. Chọn loại trong danh sách.',
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
  bookTitle: 'Chưa có tên sách. Nhập tên sách.',
  bookAuthors: 'Chưa có tác giả. Nhập ít nhất một tác giả.',
  bookLimit: 'Thông tin sách quá dài. Rút gọn tên, tác giả hoặc nhà xuất bản.',
  bookYear: 'Năm xuất bản không hợp lệ. Nhập số từ 1000 đến 2100.',
  bookIsbn: 'ISBN không hợp lệ. Nhập 10 hoặc 13 chữ số, hoặc để trống.',
};

const TITLE_MAX = 200;
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

function parseBook(fields, errors) {
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
  if (title.length > 200 || publisher.length > 120 || authors.some((a) => a.length > 80)) {
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
    if (!/^(97[89])?[0-9]{9}[0-9X]$/.test(isbn)) {
      errors.book = MESSAGES.bookIsbn;
      return undefined;
    }
    book.isbn = isbn;
  }
  return book;
}

export function validateSubmission(fields, file, ctx) {
  const { policy, courses } = ctx;
  const errors = {};

  const course = val(fields, 'course');
  if (!courses.has(course)) errors.course = MESSAGES.course;

  const type = val(fields, 'type');
  if (!policy.openTypes.includes(type)) errors.type = MESSAGES.type;

  const title = val(fields, 'title');
  if (!title) errors.title = MESSAGES.titleEmpty;
  else if (title.length > TITLE_MAX) errors.title = MESSAGES.titleLong(TITLE_MAX);
  else if (!slugify(title)) errors.title = MESSAGES.titleSlug;

  const license = val(fields, 'license');
  if (!policy.selfMadeLicenses.includes(license)) errors.license = MESSAGES.license;

  if (!CONFIRMS.every((k) => val(fields, k))) errors.confirm = MESSAGES.confirm;

  let ext;
  let book;
  if (file) {
    ext = checkFile(file, policy, errors) ?? undefined;
  } else if (type === 'book-ref') {
    book = parseBook(fields, errors);
  } else {
    errors.file = MESSAGES.fileMissing;
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  const form = { course, type, title, lang: val(fields, 'lang') || 'vi', license };
  for (const key of OPTIONAL) {
    const v = val(fields, key);
    if (v) form[key] = v;
  }
  if (book) form.book = book;
  return { ok: true, form, ext };
}
