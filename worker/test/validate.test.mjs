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
    const r = validateSubmission({ ...base, term: '2025-HK1', displayName: 'An' }, pdf, ctx);
    expect(r.ok).toBe(true);
    expect(r.ext).toBe('.pdf');
    expect(r.form).toMatchObject({ course: 'CO1005', type: 'summary', title: 'Tóm tắt chương 1', lang: 'vi', license: 'CC-BY-SA-4.0', term: '2025-HK1', displayName: 'An' });
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

  it('loại khác không file: lỗi file', () => {
    expect(validateSubmission(base, null, ctx).errors.file).toBeTruthy();
  });
});
