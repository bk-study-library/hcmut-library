import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sdhType, sdhKind, pickNameEn, sdhParts } from '../scripts/import-sdh.mjs';
import { run } from '../scripts/validate.mjs';
import { readJson } from './helpers.mjs';
import { freshSdhRoot, importSdhFixture, importFixture } from './ctdt-helpers.mjs';

test('sau đại học: loại chương trình theo định hướng và biến thể, vai trò khối, tên tiếng Anh, phần', () => {
  const t = (level, orientation, variant) => sdhType({ level, orientation, variant });
  assert.equal(t('thac-si', 'ung-dung', null), 'UD');
  assert.equal(t('thac-si', 'nghien-cuu', null), 'NC');
  assert.equal(t('thac-si', 'nghien-cuu', 'chuyen-sau'), 'CSAU');
  assert.equal(t('thac-si', 'ung-dung', 'tieng-anh'), 'TAUD');
  assert.equal(t('thac-si', null, 'tai-nang-stem'), 'STEM');
  assert.equal(t('thac-si', null, 'tieu-chuan'), 'CQ');
  assert.equal(t('thac-si', null, null), 'CQ');
  assert.equal(t('tien-si', null, 'phuong-thuc-1'), 'PT1');
  assert.equal(t('tien-si', null, 'phuong-thuc-2'), 'PT2');
  assert.equal(t('tien-si', null, 'tieng-anh-phuong-thuc-1'), 'TAPT1');
  assert.equal(t('tien-si', null, null), 'CQ');
  assert.equal(t('dai-hoc', null, null), null);
  assert.equal(t('thac-si', null, 'la'), null);
  assert.equal(sdhKind('co-so'), 'co-so-nganh');
  assert.equal(sdhKind('luan-an'), 'luan-an');
  assert.equal(sdhKind('bat-buoc'), 'khac');
  // Số phần khớp tên tiếng Việt; bỏ bản bị cắt; bỏ bản viết hoa toàn bộ khi có bản thường.
  assert.equal(pickNameEn({ name: 'Chuyên đề tiến sĩ - phần 1', nameEn: 'Doctoral Seminar - part 2', nameEnVariants: ['Doctoral Seminar - part 1', 'Doctoral Seminar - part 2'] }), 'Doctoral Seminar - part 1');
  assert.equal(pickNameEn({ name: 'X', nameEn: 'VIBRATION IN MACHINERY E', nameEnVariants: ['VIBRATION IN MACHINERY E', 'VIBRATION IN MACHINERY EQUIPMENT'] }), 'VIBRATION IN MACHINERY EQUIPMENT');
  assert.equal(pickNameEn({ name: 'X', nameEn: 'GREEN WASTES', nameEnVariants: ['GREEN WASTES', 'Green wastes'] }), 'Green wastes');
  assert.equal(pickNameEn({ name: 'X', nameEn: null }), null);
  assert.deepEqual(sdhParts('Luận văn thạc sĩ', 30), ['project']);
  assert.deepEqual(sdhParts('Tiểu luận tổng quan', 3), ['assignment']);
  assert.deepEqual(sdhParts('Anh văn 1', 0), []);
  assert.deepEqual(sdhParts('Kỹ thuật robot', 3), ['theory']);
});

test('nhập sau đại học: ngành, chương trình, môn; kiểm sạch', () => {
  const dir = freshSdhRoot();
  const r = importSdhFixture(dir);
  assert.equal(r.majors, 4);
  assert.equal(r.programs, 8);
  assert.equal(r.coursesCreated, 13);
  assert.deepEqual(r.coursesShared, ['PH1003']);
  assert.deepEqual(r.majorsMerged, [{ from: '85202a1', to: '8520202' }]);
  assert.deepEqual(r.skipped.map((x) => x.code).sort(), ['7520103', 'SDH_THS_9999999_UD_2025', 'XX 99', 'ZZ9999']);
  const v = run(['--root', dir, '--write', '--quiet']);
  assert.deepEqual(v.repo.errors, []);
  assert.deepEqual(v.repo.warnings, []);
});

test('nhập sau đại học: ngành có bậc, mã phụ gộp vào mã chính người duyệt chọn, ghi chú tay được giữ', () => {
  const dir = freshSdhRoot();
  importSdhFixture(dir);
  const majors = readJson(dir, 'catalog/majors.json').majors;
  const m = (code) => majors.find((x) => x.code === code);
  assert.equal(m('85202a1'), undefined);
  assert.deepEqual(m('8520202'), {
    code: '8520202',
    name: 'Thiết kế vi mạch',
    nameEn: 'Integrated Circuit Design',
    faculty: 'dee',
    level: 'thac-si',
    programTypes: ['UD', 'TAUD'],
    aliases: ['85202a1'],
    handbookUrl: 'https://hcmut.edu.vn/study/handbook/course/postgraduate/8520202',
    note: 'Mã ngành chờ xác nhận.',
  });
  assert.deepEqual(m('8520103').programTypes, ['CQ', 'UD', 'CSAU']);
  assert.equal(m('9520118').level, 'tien-si');
  // Ngành đại học không bị đổi.
  assert.equal(m('7520103').name, 'Kỹ thuật Cơ khí');
  assert.equal(m('7520103').level, 'dai-hoc');
});

test('nhập sau đại học: chương trình có loại, định hướng, khối cha, khối theo chữ cái nguồn; bản không ghi mã môn có link PDF', () => {
  const dir = freshSdhRoot();
  importSdhFixture(dir);
  const p = readJson(dir, 'catalog/programs/FME_THAC_SI_KY_THUAT_CO_KHI_2025_UD.json');
  assert.equal(p.major, '8520103');
  assert.equal(p.type, 'UD');
  assert.equal(p.level, 'thac-si');
  assert.equal(p.orientation, 'ung-dung');
  assert.equal(p.degree, 'thac-si');
  assert.equal(p.totalCredits, 60);
  assert.equal(p.variant, 'Thạc sĩ định hướng ứng dụng');
  assert.equal(p.source, 'https://drive.google.com/file/d/ths-ck-ud/view');
  assert.equal(p.planUrl, 'https://drive.google.com/file/d/khgd-ths-ck-ud/view');
  assert.deepEqual(p.groups, [{ name: 'A. Đa ngành Tổng quát (General Interdisciplinary Knowledge)', creditsNeed: 9 }]);
  assert.deepEqual(p.blocks.map((b) => b.name), ['A.1. Bắt buộc Đa ngành, tổng quát', 'A.2. Tự chọn Đa ngành, tổng quát', 'A.3. Ngoại ngữ (Foreign Languages)', 'B. Cơ sở ngành (Core courses)', 'C. Ngành/Chuyên ngành tự chọn', 'D. Học phần tốt nghiệp (Graduation Module)', 'E. Điều kiện tốt nghiệp']);
  assert.deepEqual(p.blocks.map((b) => b.kind), ['chung', 'chung', 'ngoai-ngu', 'co-so-nganh', 'chuyen-nganh', 'luan-van', 'dieu-kien-tot-nghiep']);
  assert.equal(p.blocks[0].group, p.groups[0].name);
  assert.equal(p.blocks[3].group, undefined);
  assert.equal(p.blocks[6].creditsNeed, undefined);
  // Mã không có trong courses.json bị bỏ, không đoán.
  assert.deepEqual(p.blocks[4].courses, ['ME5021']);
  const csau = readJson(dir, 'catalog/programs/FME_THAC_SI_KY_THUAT_CO_KHI_2025_CSAU.json');
  assert.equal(csau.orientation, 'nghien-cuu');
  assert.equal(csau.groups, undefined);
  // CTĐT 2022 không ghi mã môn: blocks rỗng, có PDF, ghi chú nguồn.
  const k22 = readJson(dir, 'catalog/programs/FME_THAC_SI_KY_THUAT_CO_KHI_2022.json');
  assert.equal(k22.type, 'CQ');
  assert.equal(k22.variant, undefined);
  assert.deepEqual(k22.blocks, []);
  assert.equal(k22.ctdtUrl, 'https://drive.google.com/file/d/ths-ck-2022/view');
  assert.match(k22.note, /không ghi mã môn/);
  // Mã phụ: chương trình nguồn ghi 85202a1 thuộc ngành 8520202, có ghi chú.
  const tkvm = readJson(dir, 'catalog/programs/DEE_THAC_SI_THIET_KE_VI_MACH_2025_UD.json');
  assert.equal(tkvm.major, '8520202');
  assert.match(tkvm.note, /Nguồn ghi mã ngành 85202a1; thư viện dùng mã 8520202\. Chờ xác nhận\./);
  assert.equal(readJson(dir, 'catalog/programs/DEE_THAC_SI_THIET_KE_VI_MACH_2026_TAUD.json').source, 'https://hcmut.edu.vn/study/handbook/course/postgraduate/8520202?program=CTTAUD');
  // Tiến sĩ: phương thức; nguồn ghi khoa khác khoa của ngành thì theo khoa ngành, ghi chú để duyệt.
  const ta = readJson(dir, 'catalog/programs/SIM_TIEN_SI_KY_THUAT_HE_THONG_CONG_NGHIEP_2026_TAPT1.json');
  assert.equal(ta.faculty, 'sim');
  assert.equal(ta.type, 'TAPT1');
  assert.match(ta.note, /Nguồn ghi khoa fme cho chương trình này; thư viện xếp theo khoa của ngành \(sim\)\./);
  // Hai bản cùng ngành, loại, khóa gộp làm một: môn theo bản Sổ tay, PDF theo bản 2022.
  const qt = readJson(dir, 'catalog/programs/SIM_THAC_SI_QUAN_TRI_KINH_DOANH_2022.json');
  assert.deepEqual(qt.blocks.map((b) => [b.name, b.kind, b.courses]), [['5. KHỐI KIẾN THỨC TỐT NGHIỆP', 'khac', ['TH5929']]]);
  assert.equal(qt.ctdtUrl, 'https://drive.google.com/file/d/ths-qtkd-2022/view');
  assert.doesNotMatch(qt.note, /không có PDF|không ghi mã môn/);
  assert.match(qt.note, /Gộp hai bản nguồn/);
});

test('nhập sau đại học: môn có levels, khoa theo tiền tố, chữ nguồn chuẩn hóa; trùng mã khác môn thì ID kèm năm', () => {
  const dir = freshSdhRoot();
  importSdhFixture(dir);
  const c = (id) => readJson(dir, `catalog/courses/${id}.json`);
  assert.deepEqual(c('AS5113').levels, ['thac-si']);
  assert.deepEqual(c('ENG_B2').levels, ['thac-si', 'tien-si']);
  for (const id of ['GK5025', 'GK5047', 'GK5007', 'ENG_B2']) assert.equal(c(id).faculty, 'chung', id);
  assert.equal(c('ME5327').faculty, 'fme');
  assert.equal(c('TH5929').faculty, 'unknown');
  // Gạch ngang dài trong nguồn thành gạch ngang thường.
  assert.equal(c('ME5327').name, 'Phương pháp số - nâng cao');
  assert.equal(c('ME6201').name, 'Luận văn thạc sĩ nghiên cứu chuyên sâu - phần 1');
  assert.equal(c('ME6201').nameEn, "Research Intensive Master's Thesis - part 1");
  assert.match(c('ME6201').note, /Nguồn còn ghi tên: Luận văn chuyên sâu phần 1\./);
  assert.equal(c('ME5021').nameEn, 'Robotics Engineering');
  assert.deepEqual(c('GK5047').parts, []);
  assert.deepEqual(c('ME6139').parts, ['project']);
  assert.match(c('ME7377').note, /Sổ tay HCMUT, truy cập 04\/10\/2026/);
  // Cùng mã, cùng tên với môn đại học: thêm bậc, giữ mọi trường.
  assert.deepEqual(c('PH1003').levels, ['dai-hoc', 'thac-si']);
  assert.equal(c('PH1003').handbookUrl, 'https://hcmut.edu.vn/study/handbook/subject/PH1003');
  // Cùng mã, khác môn: ID kèm năm khóa, môn đại học không đổi.
  assert.equal(c('MT1003').name, 'Giải tích 1');
  assert.equal(c('MT1003').levels, undefined);
  assert.equal(c('MT1003-2025').code, 'MT1003');
  assert.equal(c('MT1003-2025').name, 'Toán cao cấp cho kỹ sư');
  assert.match(c('MT1003-2025').note, /Mã MT1003 đã dùng cho môn khác/);
  assert.deepEqual(c('MT1003-2025').programs, [{ program: 'FME_THAC_SI_KY_THUAT_CO_KHI_2025_UD', block: 'K04', required: true }]);
  assert.ok(!c('MT1003').programs.some((x) => x.program.includes('THAC_SI')));
});

test('nhập sau đại học hai lần, rồi nhập lại đại học: không đổi file nào; chương trình đại học không trỏ ID kèm năm của sau đại học', () => {
  const dir = freshSdhRoot();
  importSdhFixture(dir);
  const snap = () =>
    Object.fromEntries(
      ['courses', 'programs'].flatMap((k) => fs.readdirSync(path.join(dir, 'catalog', k)).map((f) => [`${k}/${f}`, fs.readFileSync(path.join(dir, 'catalog', k, f), 'utf8')])).concat([['majors', fs.readFileSync(path.join(dir, 'catalog', 'majors.json'), 'utf8')]]),
    );
  const before = snap();
  const r = importSdhFixture(dir, '2026-10-09');
  assert.equal(r.programsKept, 8);
  assert.equal(r.programsNew, 0);
  assert.equal(r.coursesCreated, 0);
  assert.deepEqual(snap(), before);
  importFixture(dir, '2026-10-09');
  assert.deepEqual(snap(), before);
  assert.deepEqual(readJson(dir, 'catalog/programs/FME_KY_THUAT_CO_KHI_2025_CTTA.json').blocks[0].courses, ['MT1003']);
});

test('nhập sau đại học: tên ngành, listed, reviewNote sửa tay được giữ', () => {
  const dir = freshSdhRoot();
  importSdhFixture(dir);
  const file = 'catalog/programs/FME_THAC_SI_KY_THUAT_CO_KHI_2025_UD.json';
  const p = readJson(dir, file);
  p.listed = false;
  p.reviewNote = 'Đã đối chiếu PDF.';
  fs.writeFileSync(path.join(dir, file), JSON.stringify(p, null, 2) + '\n');
  importSdhFixture(dir, '2026-10-09');
  const again = readJson(dir, file);
  assert.equal(again.listed, false);
  assert.equal(again.reviewNote, 'Đã đối chiếu PDF.');
});
