// Tên loại chương trình theo Sổ tay HCMUT (docs/ten-chuong-trinh.md): mã viết tắt và tên chính thức theo bậc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_TYPES, programTypeInfo } from '../scripts/lib/labels.mjs';

test('programTypeInfo: CQ đại học là tiêu chuẩn, thạc sĩ là THCQ, tiến sĩ chỉ có mã', () => {
  assert.deepEqual(programTypeInfo('CQ'), { abbr: 'CQ', official: PROGRAM_TYPES.CQ.official });
  assert.match(programTypeInfo('CQ', 'dai-hoc').official.vi, /^Chương trình Đại học tiêu chuẩn \(hình thức chính quy; văn bản trước 2026 gọi là chính quy đại trà\)$/);
  assert.deepEqual(programTypeInfo('CQ', 'thac-si'), { abbr: 'THCQ', official: { vi: 'Chương trình Thạc sĩ tiêu chuẩn' } });
  assert.deepEqual(programTypeInfo('CQ', 'tien-si'), { abbr: 'CQ', official: {} });
  assert.equal(programTypeInfo('XX'), null);
});

test('mã viết tắt theo Sổ tay; mã thư viện giữ nguyên làm khóa (hợp đồng v1)', () => {
  const abbr = Object.fromEntries(Object.entries(PROGRAM_TYPES).map(([k, v]) => [k, v.abbr]));
  assert.deepEqual(abbr, {
    CQ: 'CQ', CTTA: 'CTTA', CNTN: 'CNTN', PFIEV: 'PFIEV', SN: 'SN', CTTT: 'CTTT', DHNB: 'DHNB', VLVH: 'VLVH', CTQT: 'CTQT',
    UD: 'UD', NC: 'NC', CSAU: 'CS', TAUD: 'CTTAUD', STEM: 'THTN_STEM', PT1: 'PT1_1', PT2: 'PT2_1', TAPT1: 'CTTATS1_1',
  });
  assert.equal(programTypeInfo('CSAU', 'thac-si').abbr, 'CS');
});
