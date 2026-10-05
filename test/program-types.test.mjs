// Bảng loại chương trình (scripts/lib/program-types.mjs): tên hiện trên web, giá trị ghi vào dữ liệu, cách nhận loại
// từ bản thu thập và bộ dữ liệu sau đại học. Nguồn tên: docs/ten-chuong-trinh.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_TYPES, TYPE_CODES, programTypeInfo, typeFromVariant, researchType, sdhType } from '../scripts/lib/program-types.mjs';
import schema from '../schema/program.schema.json' with { type: 'json' };
import majorSchema from '../schema/major.schema.json' with { type: 'json' };

// Mảng enum có mã CQ trong một schema (enum loại chương trình nằm ở độ sâu khác nhau).
function typeEnum(node) {
  if (Array.isArray(node)) return node.includes('CQ') && node.includes('TAPT1') ? node : node.map(typeEnum).find(Boolean);
  if (node && typeof node === 'object') return Object.values(node).map(typeEnum).find(Boolean);
  return undefined;
}

test('mã thư viện khớp enum của schema (hợp đồng v1), không đổi tên', () => {
  assert.deepEqual(TYPE_CODES, typeEnum(schema));
  assert.deepEqual(TYPE_CODES, typeEnum(majorSchema));
});

test('mã viết tắt theo Sổ tay HCMUT', () => {
  const abbr = Object.fromEntries(Object.entries(PROGRAM_TYPES).map(([k, v]) => [k, v.abbr]));
  assert.deepEqual(abbr, {
    CQ: 'CQ', CTTA: 'CTTA', CNTN: 'CNTN', PFIEV: 'PFIEV', SN: 'SN', CTTT: 'CTTT', DHNB: 'DHNB', VLVH: 'VLVH', CTQT: 'CTQT',
    UD: 'UD', NC: 'NC', CSAU: 'CS', TAUD: 'CTTAUD', STEM: 'THTN_STEM', PT1: 'PT1_1', PT2: 'PT2_1', TAPT1: 'CTTATS1_1',
  });
});

test('programTypeInfo: CQ đại học là tiêu chuẩn, thạc sĩ là THCQ, tiến sĩ chỉ có mã', () => {
  assert.deepEqual(programTypeInfo('CQ'), { abbr: 'CQ', official: PROGRAM_TYPES.CQ.official });
  assert.match(programTypeInfo('CQ', 'dai-hoc').official.vi, /^Chương trình Đại học tiêu chuẩn \(hình thức chính quy; văn bản trước 2026 gọi là chính quy đại trà\)$/);
  assert.deepEqual(programTypeInfo('CQ', 'thac-si'), { abbr: 'THCQ', official: { vi: 'Chương trình Thạc sĩ tiêu chuẩn' } });
  assert.deepEqual(programTypeInfo('CQ', 'tien-si'), { abbr: 'CQ', official: {} });
  assert.equal(programTypeInfo('CSAU', 'thac-si').abbr, 'CS');
  assert.equal(programTypeInfo('XX'), null);
});

test('typeFromVariant: variant đã ghi trong dữ liệu ra đúng loại; CQ không có variant', () => {
  for (const [code, t] of Object.entries(PROGRAM_TYPES)) if (t.variant) assert.equal(typeFromVariant(t.variant), code, code);
  assert.equal(typeFromVariant('PFIEV'), 'PFIEV');
  assert.equal(PROGRAM_TYPES.CQ.variant, null);
  assert.equal(typeFromVariant('Liên kết quốc tế'), null);
  assert.equal(typeFromVariant(undefined), null);
});

test('researchType: loại, variant và đuôi id của bản thu thập (id đã dùng trong URL, không đổi)', () => {
  assert.deepEqual(researchType('standard'), { type: 'CQ', label: null, idSuffix: null });
  assert.deepEqual(researchType('day-va-hoc-bang-tieng-anh (English; formerly CLC)'), { type: 'CTTA', label: 'Dạy và học bằng tiếng Anh', idSuffix: 'TA' });
  assert.deepEqual(researchType('tien-tien (English)'), { type: 'CTTT', label: 'Chương trình tiên tiến', idSuffix: 'TT' });
  assert.deepEqual(researchType('dinh-huong-nhat-ban'), { type: 'DHNB', label: 'Định hướng Nhật Bản', idSuffix: 'NB' });
  assert.deepEqual(researchType('chuyen-tiep-quoc-te'), { type: 'CTQT', label: 'Chuyển tiếp quốc tế', idSuffix: 'CTQT' });
  assert.deepEqual(researchType('pfiev'), { type: 'PFIEV', label: 'PFIEV', idSuffix: 'PFIEV' });
  // Liên kết quốc tế không có trên Sổ tay: không có mã loại.
  assert.deepEqual(researchType('lien-ket (UTS degree)'), { type: null, label: 'Liên kết quốc tế', idSuffix: 'LK' });
  assert.equal(researchType(undefined), null);
});

test('sdhType: variant quyết định; không có variant thì theo định hướng', () => {
  const t = (level, orientation, variant) => sdhType({ level, orientation, variant });
  assert.equal(t('thac-si', null, null), 'CQ');
  assert.equal(t('thac-si', 'ung-dung', 'tieu-chuan'), 'CQ');
  assert.equal(t('thac-si', 'ung-dung', null), 'UD');
  assert.equal(t('thac-si', 'nghien-cuu', null), 'NC');
  assert.equal(t('thac-si', 'nghien-cuu', 'chuyen-sau'), 'CSAU');
  assert.equal(t('thac-si', 'ung-dung', 'tieng-anh'), 'TAUD');
  assert.equal(t('thac-si', null, 'tai-nang-stem'), 'STEM');
  assert.equal(t('tien-si', null, null), 'CQ');
  assert.equal(t('tien-si', null, 'phuong-thuc-2'), 'PT2');
  assert.equal(t('tien-si', 'ung-dung', null), null);
  assert.equal(t('dai-hoc', null, null), null);
});

test('researchType: "standard-or-unspecified" không phải tiêu chuẩn; song ngành chưa có trong bản thu thập', () => {
  assert.equal(researchType('standard-or-unspecified'), null);
  assert.equal(researchType('song-nganh'), null);
});
