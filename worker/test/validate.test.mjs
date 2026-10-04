import { describe, it, expect } from 'vitest';
import { validateSubmission } from '../src/validate.mjs';

const policy = {
  openTypes: ['summary', 'notes', 'book-ref', 'link'],
  maxFileBytes: 20 * 1024 * 1024,
  extensions: {
    '.pdf': { mime: 'application/pdf', magic: '25504446' },
    '.zip': { mime: 'application/zip', magic: '504b0304' },
    '.md': { mime: 'text/markdown' },
  },
  selfMadeLicenses: ['CC-BY-SA-4.0', 'CC-BY-4.0', 'CC0-1.0'],
  fields: { titleMax: 200, descriptionMax: 1000, chapterMax: 20, teacherMax: 80, displayNameMax: 80, bookTitleMax: 200, bookAuthorMax: 80, bookPublisherMax: 120, textTotalMax: 8192, examKinds: ['gk', 'ck', 'quiz', 'kt'] },
};
const courses = new Map([
  ['GE1007', { id: 'GE1007', status: 'retired' }],
  ['GE4169-2024', { id: 'GE4169-2024', status: 'active' }],
  ['CO1005', { id: 'CO1005', status: 'active' }],
]);
const ctx = { policy, courses };

const base = {
  course: 'CO1005',
  type: 'summary',
  title: 'Tóm tắt chương 1',
  description: '',
  lang: '',
  license: 'CC-BY-SA-4.0',
  'confirm-own': 'on',
  'confirm-license': 'on',
  'confirm-not-book': 'on',
};
const pdf = { name: 'Bai 1.PDF', size: 1000, head: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2]) };

describe('validateSubmission', () => {
  it('nhận bài hợp lệ và dựng form', () => {
    const r = validateSubmission({ ...base, term: 'HK251', displayName: 'An' }, pdf, ctx);
    expect(r.ok).toBe(true);
    expect(r.ext).toBe('.pdf');
    expect(r.form).toMatchObject({ course: 'CO1005', type: 'summary', title: 'Tóm tắt chương 1', lang: 'vi', license: 'CC-BY-SA-4.0', term: 'HK251', displayName: 'An' });
  });

  it('môn không có', () => {
    const r = validateSubmission({ ...base, course: 'XX9999' }, pdf, ctx);
    expect(r.ok).toBe(false);
    expect(r.errors.course).toBe('Không tìm thấy môn này. Chọn môn trong danh sách.');
  });

  it('nhận môn retired và môn có hậu tố năm', () => {
    expect(validateSubmission({ ...base, course: 'GE1007' }, pdf, ctx).ok).toBe(true);
    expect(validateSubmission({ ...base, course: 'GE4169-2024' }, pdf, ctx).ok).toBe(true);
  });

  it('loại không có trong policy', () => {
    expect(validateSubmission({ ...base, type: 'zzz' }, pdf, ctx).errors.type).toBeTruthy();
  });

  it('tiêu đề rỗng hoặc quá dài', () => {
    expect(validateSubmission({ ...base, title: '  ' }, pdf, ctx).errors.title).toBeTruthy();
    expect(validateSubmission({ ...base, title: 'a'.repeat(201) }, pdf, ctx).errors.title).toBeTruthy();
    expect(validateSubmission({ ...base, title: 'a'.repeat(200) }, pdf, ctx).ok).toBe(true);
  });

  it('tiêu đề không tạo được slug', () => {
    expect(validateSubmission({ ...base, title: '???' }, pdf, ctx).errors.title).toBeTruthy();
  });

  it('giấy phép phải thuộc selfMadeLicenses', () => {
    expect(validateSubmission({ ...base, license: 'MIT' }, pdf, ctx).errors.license).toBeTruthy();
    expect(validateSubmission({ ...base, license: '' }, pdf, ctx).errors.license).toBeTruthy();
  });

  it('thiếu một ô xác nhận', () => {
    for (const k of ['confirm-own', 'confirm-license', 'confirm-not-book']) {
      const f = { ...base };
      delete f[k];
      expect(validateSubmission(f, pdf, ctx).errors.confirm).toBeTruthy();
    }
  });

  it('đuôi không được nhận', () => {
    const r = validateSubmission(base, { name: 'a.exe', size: 10, head: new Uint8Array([0x4d, 0x5a]) }, ctx);
    expect(r.errors.file).toBeTruthy();
  });

  it('nội dung không khớp đuôi', () => {
    const r = validateSubmission(base, { name: 'a.pdf', size: 10, head: new Uint8Array([0x50, 0x4b, 3, 4]) }, ctx);
    expect(r.errors.file).toBe('Nội dung file không khớp đuôi .pdf.');
  });

  it('đuôi không có magic thì bỏ qua kiểm byte', () => {
    const r = validateSubmission(base, { name: 'a.md', size: 10, head: new Uint8Array([0x23]) }, ctx);
    expect(r.ok).toBe(true);
    expect(r.ext).toBe('.md');
  });

  it('file quá lớn, thông báo lấy từ policy', () => {
    const r = validateSubmission(base, { ...pdf, size: policy.maxFileBytes + 1 }, ctx);
    expect(r.errors.file).toContain('20.0 MB');
    const small = validateSubmission(base, { ...pdf, size: 10 }, { ...ctx, policy: { ...policy, maxFileBytes: 5 } });
    expect(small.errors.file).toContain('5 B');
  });

  it('file rỗng', () => {
    expect(validateSubmission(base, { ...pdf, size: 0 }, ctx).errors.file).toBeTruthy();
  });

  it('book-ref không file: cần tên sách', () => {
    const f = { ...base, type: 'book-ref' };
    expect(validateSubmission(f, null, ctx).errors.book).toBeTruthy();
    const r = validateSubmission({ ...f, 'book-title': 'Giải tích 1', 'book-authors': 'A, B\nC', 'book-year': '2020', 'book-publisher': 'NXB X', 'book-isbn': '978-0-13-110362-7' }, null, ctx);
    expect(r.ok).toBe(true);
    expect(r.ext).toBeUndefined();
    expect(r.form.book).toEqual({ title: 'Giải tích 1', authors: ['A', 'B', 'C'], year: 2020, publisher: 'NXB X', isbn: '9780131103627' });
  });

  it('book-ref thiếu tác giả', () => {
    const r = validateSubmission({ ...base, type: 'book-ref', 'book-title': 'S' }, null, ctx);
    expect(r.errors.book).toBeTruthy();
  });

  it('book-ref sai năm hoặc ISBN', () => {
    const f = { ...base, type: 'book-ref', 'book-title': 'S', 'book-authors': 'A' };
    expect(validateSubmission({ ...f, 'book-year': '20x0' }, null, ctx).errors.book).toBeTruthy();
    expect(validateSubmission({ ...f, 'book-isbn': '12' }, null, ctx).errors.book).toBeTruthy();
  });

  it('ISBN 13 số kết thúc X bị từ chối, ISBN-10 có X được nhận', () => {
    const f = { ...base, type: 'book-ref', 'book-title': 'S', 'book-authors': 'A' };
    expect(validateSubmission({ ...f, 'book-isbn': '978013110362X' }, null, ctx).errors.book).toBeTruthy();
    const r = validateSubmission({ ...f, 'book-isbn': '0-8044-2957-X' }, null, ctx);
    expect(r.ok).toBe(true);
    expect(r.form.book.isbn).toBe('080442957X');
  });

  it('book-ref kèm file bị từ chối', () => {
    const f = { ...base, type: 'book-ref', 'book-title': 'S', 'book-authors': 'A' };
    expect(validateSubmission(f, pdf, ctx).errors.file).toContain('bỏ file');
  });

  it('lang: giữ "en", từ chối "english"', () => {
    expect(validateSubmission({ ...base, lang: 'en' }, pdf, ctx).form.lang).toBe('en');
    expect(validateSubmission({ ...base, lang: 'english' }, pdf, ctx).errors.lang).toBeTruthy();
  });

  it('loại khác không file: lỗi file', () => {
    expect(validateSubmission(base, null, ctx).errors.file).toBeTruthy();
  });
  it('học kỳ theo dạng HKxxx', () => {
    expect(validateSubmission({ ...base, term: 'HK251' }, pdf, ctx).ok).toBe(true);
    for (const t of ['2025-HK1', 'HK25', 'hk251', '../HK251']) {
      expect(validateSubmission({ ...base, term: t }, pdf, ctx).errors.term).toBe('Học kỳ không hợp lệ. Dùng dạng HK251.');
    }
  });

  it('chương: chữ, số, dấu chấm, gạch nối, tối đa 20 ký tự', () => {
    expect(validateSubmission({ ...base, chapter: '3.2' }, pdf, ctx).ok).toBe(true);
    expect(validateSubmission({ ...base, chapter: 'a'.repeat(20) }, pdf, ctx).ok).toBe(true);
    for (const c of ['a'.repeat(21), 'chương 3', '3/2']) {
      expect(validateSubmission({ ...base, chapter: c }, pdf, ctx).errors.chapter).toBe('Chương không hợp lệ. Dùng số hoặc chữ không dấu, ví dụ 3 hay 3.2.');
    }
  });

  it('loại kiểm tra thuộc gk, ck, quiz, kt', () => {
    for (const k of ['gk', 'ck', 'quiz', 'kt']) expect(validateSubmission({ ...base, examKind: k }, pdf, ctx).ok).toBe(true);
    expect(validateSubmission({ ...base, examKind: 'final' }, pdf, ctx).errors.examKind).toBe('Loại kiểm tra không hợp lệ. Chọn trong danh sách.');
  });

  it('giảng viên tối đa 80 ký tự', () => {
    expect(validateSubmission({ ...base, teacher: 'a'.repeat(80) }, pdf, ctx).ok).toBe(true);
    expect(validateSubmission({ ...base, teacher: 'a'.repeat(81) }, pdf, ctx).errors.teacher).toBe('Tên giảng viên quá dài. Rút xuống tối đa 80 ký tự.');
  });

  it('tên hiển thị tối đa 80 ký tự sau khi bỏ khoảng trắng, để trống là ẩn danh', () => {
    expect(validateSubmission({ ...base, displayName: `  ${'a'.repeat(80)}  ` }, pdf, ctx).form.displayName).toBe('a'.repeat(80));
    expect(validateSubmission({ ...base, displayName: 'a'.repeat(81) }, pdf, ctx).errors.displayName).toBe('Tên hiển thị quá dài. Rút xuống tối đa 80 ký tự.');
    const r = validateSubmission({ ...base, displayName: '   ' }, pdf, ctx);
    expect(r.ok).toBe(true);
    expect(r.form).not.toHaveProperty('displayName');
  });
  it('mô tả tối đa 1000 ký tự sau khi bỏ khoảng trắng', () => {
    expect(validateSubmission({ ...base, description: ` ${'a'.repeat(1000)} ` }, pdf, ctx).form.description).toBe('a'.repeat(1000));
    expect(validateSubmission({ ...base, description: 'a'.repeat(1001) }, pdf, ctx).errors.description).toBe('Mô tả quá dài. Rút xuống tối đa 1000 ký tự.');
  });

  it('tổng chữ của mọi ô vượt 8 KB bị từ chối', () => {
    const authors = Array.from({ length: 600 }, (_, i) => `Tac gia so ${i}`).join(', ');
    const f = { ...base, type: 'book-ref', 'book-title': 'S', 'book-authors': authors };
    expect(validateSubmission(f, null, ctx).errors.form).toBe('Nội dung các ô quá dài. Rút gọn bớt rồi gửi lại.');
    expect(validateSubmission({ ...f, 'book-authors': 'A, B' }, null, ctx).ok).toBe(true);
  });
});

describe('loại link', () => {
  it('từ chối link qua form web và chỉ sang form Thêm link', () => {
    const r = validateSubmission({ ...base, type: 'link' }, pdf, ctx);
    expect(r.ok).toBe(false);
    expect(r.errors.type).toMatch(/Thêm link/);
  });
});

describe('giới hạn lấy từ policy.fields', () => {
  it('đổi titleMax trong policy thì đổi ngưỡng chặn', () => {
    const small = { ...ctx, policy: { ...policy, fields: { ...policy.fields, titleMax: 5 } } };
    const r = validateSubmission({ ...base, title: 'Tiêu đề dài' }, pdf, small);
    expect(r.ok).toBe(false);
    expect(r.errors.title).toMatch(/5 ký tự/);
  });
});

describe('thông tin cá nhân trong các ô chữ', () => {
  const book = { ...base, type: 'book-ref', 'book-title': 'Giải tích', 'book-authors': 'A' };
  it('từ chối email, MSSV, số điện thoại trong từng ô, lỗi nằm đúng ô', () => {
    const cases = [
      [{ ...base, title: 'Tóm tắt 2112345' }, pdf, 'title', 'tiêu đề', 'MSSV 7 chữ số'],
      [{ ...base, title: 'Bai a.2112345' }, pdf, 'title', 'tiêu đề', 'MSSV 7 chữ số'],
      [{ ...base, description: 'liên hệ an@hcmut.edu.vn' }, pdf, 'description', 'mô tả', 'email'],
      [{ ...base, description: 'dòng 1\nGọi 0912 345 678 pii-ok' }, pdf, 'description', 'mô tả', 'số điện thoại'],
      [{ ...base, teacher: 'Thầy B 0912345678' }, pdf, 'teacher', 'tên giảng viên', 'số điện thoại'],
      [{ ...base, displayName: 'an@hcmut.edu.vn' }, pdf, 'displayName', 'tên hiển thị', 'email'],
      [{ ...base, chapter: '2112345' }, pdf, 'chapter', 'chương', 'MSSV 7 chữ số'],
      [{ ...book, 'book-title': 'Sách của 2112345' }, null, 'book', 'thông tin sách', 'MSSV 7 chữ số'],
      [{ ...book, 'book-authors': 'A, b@x.vn' }, null, 'book', 'thông tin sách', 'email'],
      [{ ...book, 'book-publisher': 'NXB 0912345678' }, null, 'book', 'thông tin sách', 'số điện thoại'],
    ];
    for (const [fields, file, key, where, label] of cases) {
      const r = validateSubmission(fields, file, ctx);
      expect(r.ok, JSON.stringify(fields)).toBe(false);
      expect(r.errors[key]).toBe(`Không nhận thông tin cá nhân trong ${where} (có thể là ${label}). Bỏ phần đó rồi gửi lại.`);
    }
  });

  it('ISBN chỉ là số nên không bị coi là số điện thoại', () => {
    expect(validateSubmission({ ...book, 'book-isbn': '0912345678' }, null, ctx).ok).toBe(true);
  });

  it('chữ thường không bị chặn', () => {
    expect(validateSubmission({ ...base, title: 'Đề thi 2023 chương 3', description: 'Bài 1.2345, trang 12' }, pdf, ctx).ok).toBe(true);
  });
});

describe('gói quiz', () => {
  const quizCtx = { ...ctx, policy: { ...policy, openTypes: [...policy.openTypes, 'quiz-pack'], quizExtensions: ['.json', '.md', '.zip'] } };
  it('chỉ nhận đuôi trong policy.quizExtensions', () => {
    const r = validateSubmission({ ...base, type: 'quiz-pack' }, pdf, quizCtx);
    expect(r.ok).toBe(false);
    expect(r.errors.file).toBe('Không nhận file này cho gói quiz. Dùng một trong: .json, .md, .zip.');
    const md = { name: 'quiz.md', size: 10, head: new Uint8Array([0x23]) };
    expect(validateSubmission({ ...base, type: 'quiz-pack' }, md, quizCtx).ok).toBe(true);
  });
});
