// Kiểm bài gửi từ form web: thuần hàm, không đụng mạng hay lưu trữ.
import { slugify } from '../../scripts/upload/naming.mjs';
import { formatSize } from '../../scripts/lib/labels.mjs';
import { scanText } from '../../scripts/lib/pii.mjs';
import { extensionsFor } from '../../scripts/lib/extensions.mjs';
import courseSchema from '../../schema/course.schema.json';

const MESSAGES = {
  course: 'Không tìm thấy môn này. Chọn môn trong danh sách.',
  courseBoth: 'Chọn một môn trong danh sách hoặc thêm môn mới, không chọn cả hai.',
  newCode: 'Mã môn không hợp lệ. Dùng chữ in hoa và số như trên Sổ tay, ví dụ EE5429.',
  newCodeExists: (code) => `Môn ${code} đã có trong thư viện. Chọn môn này trong danh sách.`,
  newNameEmpty: 'Chưa có tên môn. Nhập tên môn như trên Sổ tay.',
  newNameLong: (max) => `Tên môn quá dài. Rút xuống tối đa ${max} ký tự.`,
  newNameChars: 'Tên môn chỉ gồm chữ, số, khoảng trắng và các dấu , . ( ) - & / + \' :. Không ghi link hay @.',
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
  quizExt: (list) => `Không nhận file này cho gói quiz. Dùng một trong: ${list}.`,
  fileExtType: (list) => `Không nhận đuôi file này cho loại tài liệu đã chọn. Dùng một trong: ${list}.`,
  pii: (where, label) => `Không nhận thông tin cá nhân trong ${where} (có thể là ${label}). Bỏ phần đó rồi gửi lại.`,
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
  email: 'Email không hợp lệ. Kiểm lại hoặc để trống.',
  replaces: 'Không tìm thấy tài liệu cần thay. Chọn lại trong danh sách hoặc bỏ ô bản cập nhật.',
  replacesNew: 'Môn mới chưa có tài liệu nào để thay. Bỏ ô bản cập nhật.',
};

// Email nhận kết quả duyệt: dạng đơn giản, đủ để gửi; không lưu vào repo (index.mjs giữ trong kho cách ly).
const EMAIL = /^[^\s@<>()",;:]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const EMAIL_MAX = 254;
// Tài liệu được thay: <ID môn>/<id tài liệu>, như trường replaces của schema mục tài liệu.
const REPLACES = /^([A-Z0-9_]{3,12}(?:-[0-9]{4})?)\/([a-z0-9][a-z0-9-]*)$/;

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

// Mã môn mới: mẫu mã hiện tại (code) của schema môn, không có hậu tố năm.
const COURSE_CODE = new RegExp(courseSchema.properties.code.pattern);
// Tên môn mới thành tên môn công khai trên web, README và v1: chỉ chữ, số, khoảng trắng và vài dấu
// hay gặp trong tên môn. Không có @, #, [ ], < >, |, dấu `: không thành nhắc tên, tham chiếu,
// liên kết hay thẻ ở bất kỳ đâu tên môn hiện ra.
const COURSE_NAME = /^[\p{L}\p{M}\p{N} ,.()&/+':-]+$/u;
const LINKISH = /:\/\/|\bwww\./i;

// Môn có sẵn trùng mã: id, mã hiện tại, hay id bỏ hậu tố năm (GE4169-2024 là GE4169).
function courseTaken(courses, code) {
  for (const c of courses.values()) {
    if (c.id === code || c.code === code || c.id.replace(/-[0-9]{4}$/, '') === code) return true;
  }
  return false;
}

// Môn mới: chỉ khi không chọn môn có sẵn. Trả { code, name } hoặc undefined khi có lỗi.
function parseNewCourse(fields, errors, lim, courses) {
  const code = val(fields, 'newCourseCode').toUpperCase();
  const name = val(fields, 'newCourseName').replace(/\s+/g, ' ');
  if (!COURSE_CODE.test(code)) errors.newCourseCode = MESSAGES.newCode;
  else if (courseTaken(courses, code)) errors.newCourseCode = MESSAGES.newCodeExists(code);
  if (!name) errors.newCourseName = MESSAGES.newNameEmpty;
  else if (name.length > lim.courseNameMax) errors.newCourseName = MESSAGES.newNameLong(lim.courseNameMax);
  else if (LINKISH.test(name) || !COURSE_NAME.test(name) || !slugify(name)) errors.newCourseName = MESSAGES.newNameChars;
  else {
    const label = piiLabel(name);
    if (label) errors.newCourseName = MESSAGES.pii('tên môn', label);
  }
  return errors.newCourseCode || errors.newCourseName ? undefined : { code, name };
}

// Các ô chữ thành siêu dữ liệu công khai của mục, nên chặn thông tin cá nhân (cùng mẫu với
// validate.mjs, không bỏ qua dòng "pii-ok"). Tên ô dùng trong thông báo lỗi.
const PII_FIELDS = [
  ['title', 'tiêu đề'],
  ['description', 'mô tả'],
  ['chapter', 'chương'],
  ['teacher', 'tên giảng viên'],
  ['displayName', 'tên hiển thị'],
];
const PII_BOOK = 'thông tin sách';

function piiLabel(...texts) {
  for (const t of texts) {
    const hit = scanText(String(t), { skipMarked: false })[0];
    if (hit) return hit.label;
  }
  return null;
}

function extOf(name) {
  const dot = String(name).lastIndexOf('.');
  return dot < 0 ? '' : String(name).slice(dot).toLowerCase();
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Đuôi phải có trong policy và được nhận cho loại tài liệu (extensions[].types, quizExtensions).
function checkFile(file, policy, errors, type) {
  const ext = extOf(file.name);
  const rule = policy.extensions[ext];
  if (!rule) {
    errors.file = MESSAGES.fileExt(Object.keys(policy.extensions).join(', '));
    return null;
  }
  const allowed = extensionsFor(policy, type);
  if (!allowed.includes(ext)) {
    errors.file = type === 'quiz-pack' ? MESSAGES.quizExt(allowed.join(', ')) : MESSAGES.fileExtType(allowed.join(', '));
  } else if (file.size <= 0) {
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

  // Môn: chọn môn có sẵn, hoặc đề xuất đúng một môn mới (mã và tên), không cả hai.
  let course = val(fields, 'course');
  let newCourse;
  const wantsNew = Boolean(val(fields, 'newCourseCode') || val(fields, 'newCourseName'));
  if (course && wantsNew) errors.course = MESSAGES.courseBoth;
  else if (wantsNew) {
    newCourse = parseNewCourse(fields, errors, lim, courses);
    if (newCourse) course = newCourse.code;
  } else if (!courses.has(course)) errors.course = MESSAGES.course;

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
    ext = checkFile(file, policy, errors, type) ?? undefined;
  } else if (type === 'book-ref') {
    book = parseBook(fields, errors, lim);
  } else {
    errors.file = MESSAGES.fileMissing;
  }

  // Thông tin cá nhân: chỉ xét ô chưa có lỗi khác. Tiêu đề xét cả slug vì slug thành id và tên file.
  for (const [key, where] of PII_FIELDS) {
    if (errors[key]) continue;
    const v = val(fields, key);
    const label = piiLabel(v, ...(key === 'title' ? [slugify(v)] : []));
    if (label) errors[key] = MESSAGES.pii(where, label);
  }
  if (book && !errors.book) {
    const label = piiLabel(book.title, ...book.authors, book.publisher ?? '');
    if (label) errors.book = MESSAGES.pii(PII_BOOK, label);
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  // Email báo kết quả (không bắt buộc) và tài liệu được thay (bản cập nhật, không bắt buộc).
  const email = val(fields, 'notifyEmail');
  if (email && !(email.length <= EMAIL_MAX && EMAIL.test(email))) return { ok: false, errors: { notifyEmail: MESSAGES.email } };
  const replaces = val(fields, 'replaces');
  if (replaces) {
    const m = REPLACES.exec(replaces);
    if (newCourse) return { ok: false, errors: { replaces: MESSAGES.replacesNew } };
    if (!m || !courses.has(m[1]) || !courses.get(m[1]).ids.has(m[2])) return { ok: false, errors: { replaces: MESSAGES.replaces } };
  }

  const form = { course, type, title, lang, license };
  if (email) form.notifyEmail = email;
  if (replaces) form.replaces = replaces;
  for (const key of OPTIONAL) {
    const v = val(fields, key);
    if (v) form[key] = v;
  }
  if (book) form.book = book;
  if (newCourse) form.newCourse = newCourse;
  return { ok: true, form, ext };
}
