import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { viNameBroken, enNameBroken, enNameSuspicious, nameKey, slug } from '../scripts/import-ctdt.mjs';
import { run } from '../scripts/validate.mjs';
import { readJson, writeJson } from './helpers.mjs';
import { freshRoot, importFixture } from './ctdt-helpers.mjs';

test('nhận diện tên vỡ khi trích PDF', () => {
  assert.equal(viNameBroken('khiển và Tự động hóa)', 'Đồ án 1 (KT Điện tử)'), true);
  assert.equal(viNameBroken('Kỹ thuật điện)', 'Thực tập (Kỹ thuật điện)'), true);
  assert.equal(viNameBroken('Cô ng nghệ may mặc', 'Công nghệ may mặc'), true);
  assert.equal(viNameBroken('Thực hành', 'Thực hành quản lý dự án'), true);
  assert.equal(viNameBroken('Health, Safety and Environment', 'Sức khỏe, an toàn và môi trường'), true);
  assert.equal(viNameBroken('Kiến trúc máy tínhx', 'Kiến trúc máy tính'), true);
  // Tên đang có dài hơn tên PDF bị cắt cuối: giữ.
  assert.equal(viNameBroken('Phương pháp viễn thám và GIS', 'Phương pháp viễn thám và'), false);
  assert.equal(enNameBroken('Engineering Economy KT', 'Engineering Economy'), true);
  assert.equal(enNameBroken('Logi st i cs Market i ng', 'Logistics Marketing'), true);
  assert.equal(enNameBroken('Calculus1', 'Calculus 1'), true);
  assert.equal(enNameBroken('may Sewing Equipment', 'Sewing Equipment'), true);
  assert.equal(enNameBroken('Labs of', 'Labs of CAD'), true);
  assert.equal(enNameBroken('Numerical Analysis', 'Numerical Methods'), false);
  assert.equal(enNameSuspicious('GIS', 'Phương pháp viễn thám và'), true);
  assert.equal(enNameSuspicious('EXPLOITATION AND SAVING UNDERGROUND WATER', 'Khai thác nước'), true);
  assert.equal(enNameSuspicious('SCADA', 'SCADA'), false);
  assert.equal(enNameSuspicious('Data Mining', 'Khai phá dữ liệu', { reviewReason: 'x' }), true);
});

test('khóa tên ngành và mã dễ đọc: không dấu, bỏ (thí điểm), (Ngành mới)', () => {
  assert.equal(nameKey('Thiết kế vi mạch (thí điểm)'), nameKey('Thiết kế vi mạch'));
  assert.equal(nameKey('(Ngành mới) Kỹ thuật Hạt nhân'), nameKey('Kỹ thuật hạt nhân'));
  assert.equal(nameKey('Cử nhân Công nghệ Sinh học'), nameKey('Công nghệ Sinh học'));
  assert.equal(slug('Địa kỹ thuật xây dựng'), 'DIA_KY_THUAT_XAY_DUNG');
});

test('nhập CTĐT: ngành, chương trình, môn mới, kiểm sạch', () => {
  const dir = freshRoot();
  const r = importFixture(dir);
  assert.equal(r.majors, 3);
  assert.equal(r.programs, 5);
  assert.equal(r.coursesCreated, 4);
  const v = run(['--root', dir, '--write', '--quiet']);
  assert.deepEqual(v.repo.errors, []);
  assert.deepEqual(v.repo.warnings, []);

  const majors = readJson(dir, 'catalog/majors.json');
  assert.equal(majors.updated, '2026-10-04');
  assert.deepEqual(majors.majors.map((m) => m.code), ['7520103', '7520201+7520207', '7580211']);
  assert.deepEqual(majors.majors[0], {
    code: '7520103',
    name: 'Kỹ thuật Cơ khí',
    nameEn: 'Mechanical Engineering',
    faculty: 'fme',
    level: 'dai-hoc',
    programTypes: ['CQ', 'CTTA'],
    handbookUrl: 'https://hcmut.edu.vn/study/handbook/course/undergraduate/7520103?program=CQ',
  });
  assert.equal(majors.majors[1].nameEn, undefined);
});

test('nhập CTĐT: giữ mã chương trình cũ khớp ngành, khóa, loại; mã mới dễ đọc; chương trình cũ không khớp giữ nguyên', () => {
  const dir = freshRoot();
  const r = importFixture(dir);
  assert.deepEqual(r.programsLegacy.map((x) => x.code), ['FME_KY_THUAT_CO_KHI_2024']);
  const files = fs.readdirSync(path.join(dir, 'catalog', 'programs')).sort();
  assert.deepEqual(files, [
    'CSE_TS_106_2026.json',
    'DEE_SONG_NGANH_KY_THUAT_DIEN_KY_THUAT_DIEN_TU_VIEN_THONG_2024_SN.json',
    'FME_KY_THUAT_CO_KHI_2019.json',
    'FME_KY_THUAT_CO_KHI_2024.json',
    'FME_KY_THUAT_CO_KHI_2025_CTTA.json',
    'GEOPET_DIA_KY_THUAT_XAY_DUNG_2024.json',
  ]);
  const p = readJson(dir, 'catalog/programs/FME_KY_THUAT_CO_KHI_2024.json');
  assert.equal(p.major, '7520103');
  assert.equal(p.type, 'CQ');
  assert.equal(p.level, 'dai-hoc');
  assert.equal(p.degree, 'cu-nhan');
  assert.equal(p.totalCredits, 132);
  assert.equal(p.variant, undefined);
  // Trường ghi tay giữ nguyên; note do script ghi lại.
  assert.equal(p.ctdtUrl, 'https://drive.google.com/file/d/ghi-tay/view');
  assert.equal(p.planUrl, 'https://drive.google.com/file/d/khgd-ck-2024/view');
  assert.equal(p.reviewNote, 'Đã đối chiếu PDF.');
  assert.equal(p.note, undefined);
  assert.equal(p.handbookUrl, 'https://hcmut.edu.vn/study/handbook/course/undergraduate/7520103?program=CQ');
  assert.equal(readJson(dir, 'catalog/programs/CSE_TS_106_2026.json').updated, '2026-10-03');
  const ctta = readJson(dir, 'catalog/programs/FME_KY_THUAT_CO_KHI_2025_CTTA.json');
  assert.equal(ctta.variant, 'Dạy và học bằng tiếng Anh');
  assert.match(ctta.note, /Lệch nhiều so với Kế hoạch giảng dạy/);
  assert.match(ctta.note, /mượn kế hoạch giảng dạy của chương trình tiêu chuẩn/);
  // Link ngoài host cho phép không được ghi.
  assert.equal(readJson(dir, 'catalog/programs/GEOPET_DIA_KY_THUAT_XAY_DUNG_2024.json').ctdtUrl, undefined);
  assert.ok(r.skipped.some((x) => x.code === 'XX9999'));
});

test('nhập CTĐT: khối có kind, học kỳ đề xuất ở semesters, courses vẫn là mảng ID; khối không rõ bắt buộc', () => {
  const dir = freshRoot();
  importFixture(dir);
  const p = readJson(dir, 'catalog/programs/FME_KY_THUAT_CO_KHI_2024.json');
  assert.deepEqual(p.blocks.map((b) => b.id), ['K01', 'K02', 'K03', 'K04', 'K05']);
  const [toan, , coso, gdtc, tutdo] = p.blocks;
  assert.deepEqual(toan, { id: 'K01', name: 'A.1. TOÁN', group: 'A. TOÁN & KHOA HỌC TỰ NHIÊN', kind: 'toan-khtn', required: true, creditsNeed: 15, courses: ['MT1003', 'PH1003'], semesters: { MT1003: 1, PH1003: 1 } });
  assert.deepEqual(coso.courses, ['ME2045', 'ME2007', 'ME3239']);
  assert.deepEqual(coso.semesters, { ME2045: 3, ME2007: 4 });
  assert.equal(gdtc.coursesNeed, 1);
  assert.equal(gdtc.semesters, undefined);
  assert.deepEqual(tutdo, { id: 'K05', name: 'G. TỰ CHỌN TỰ DO', kind: 'tu-chon-tu-do', required: false, requiredUnknown: true, creditsNeed: 9, courses: [] });
  const k19 = readJson(dir, 'catalog/programs/FME_KY_THUAT_CO_KHI_2019.json');
  assert.equal(k19.blocks[0].name, 'Học kỳ 1');
  assert.equal(k19.blocks[0].kind, 'khac');
  assert.equal(k19.blocks[0].requiredUnknown, true);
  assert.equal(k19.source, 'https://drive.google.com/file/d/khgd-ck-2019/view');
  assert.match(k19.note, /Sổ tay không có năm này/);
  // Môn trỏ ngược về khối, required theo khối.
  const mt = readJson(dir, 'catalog/courses/MT1003.json');
  assert.deepEqual(
    mt.programs.map((x) => `${x.program}/${x.block}/${x.required}`),
    ['FME_KY_THUAT_CO_KHI_2019/K01/false', 'FME_KY_THUAT_CO_KHI_2024/K01/true', 'FME_KY_THUAT_CO_KHI_2025_CTTA/K01/true'],
  );
});

test('nhập CTĐT: sửa tên theo Sổ tay, tên PDF chỉ thay tên vỡ, tiếng Anh, tín chỉ, Sổ tay, khoa chung', () => {
  const dir = freshRoot();
  const r = importFixture(dir);
  const c = (id) => readJson(dir, `catalog/courses/${id}.json`);
  // Sổ tay thắng; khác chỉ ở chữ hoa thì giữ.
  assert.equal(c('ME2045').name, 'Kinh tế Kỹ thuật');
  assert.equal(c('ME2045').nameEn, 'Engineering Economy');
  assert.equal(c('ME2007').name, 'Chi Tiết Máy');
  assert.match(c('ME2007').note, /Tên trong Kế hoạch giảng dạy: Thiết kế chi tiết máy\./);
  // Tên chỉ có trong PDF: thay tên vỡ kèm ghi chú chờ duyệt, giữ tên đang có nếu không vỡ, không ghi đè nameEn đáng ngờ.
  assert.equal(c('EE4105').name, 'Thực tập ngoài trường (KT Điện tử- Viễn thông & Kỹ thuật điện)');
  assert.match(c('EE4105').note, /Chờ người duyệt xác nhận\./);
  assert.equal(c('GE3079').name, 'Phương pháp viễn thám và GIS');
  assert.equal(c('GE3079').nameEn, 'Remote Sensing and Geographic Information System');
  assert.deepEqual(r.namesKept.map((x) => x.id), ['GE3079']);
  // Tín chỉ điền khi trống; handbookUrl.
  assert.equal(c('GE1023').credits, 3);
  assert.equal(c('GE1023').handbookUrl, 'https://hcmut.edu.vn/study/handbook/subject/GE1023');
  // Mã dùng lại: chương trình 2024 trỏ ID kèm năm, môn cũ không đổi tên.
  assert.equal(c('GE4169').name, 'Khai phá dữ liệu');
  assert.deepEqual(c('GE4169').programs, []);
  assert.deepEqual(c('GE4169-2024').programs.map((x) => x.program), ['GEOPET_DIA_KY_THUAT_XAY_DUNG_2024']);
  assert.equal(c('GE4169-2024').nameEn, 'Underground construction engineering');
  // Môn có sẵn: giữ aliases, ghi chú người duyệt; tiền tố dùng chung về khoa chung.
  assert.deepEqual(c('MT1003').aliases, [{ code: 'MT1001', name: 'Giải tích A1' }]);
  assert.equal(c('MT1003').note, 'Ghi chú của người duyệt.');
  assert.equal(c('MT1003').faculty, 'chung');
  assert.equal(c('PH1003').faculty, 'chung');
  // Môn mới: khoa theo tiền tố, 0 tín chỉ thì không đoán phần, tên PDF đáng ngờ có ghi chú.
  assert.equal(c('ME3239').faculty, 'fme');
  assert.deepEqual(c('ME3239').parts, ['theory']);
  assert.match(c('ME3239').note, /Nhập từ CTĐT chính thức \(Sổ tay HCMUT, truy cập 04\/10\/2026\)\./);
  assert.equal(c('LA1003').faculty, 'chung');
  assert.equal(c('PE1009').faculty, 'chung');
  assert.deepEqual(c('PE1009').parts, []);
  assert.equal(c('CH4093').faculty, 'che');
  assert.equal(c('CH4093').nameEn, undefined);
  assert.match(c('CH4093').note, /Chờ người duyệt xác nhận\. Tên lấy từ PDF có vẻ bị cắt cuối\./);
});

test('nhập CTĐT hai lần: không đổi file nào, kể cả ngày cập nhật', () => {
  const dir = freshRoot();
  importFixture(dir);
  const snap = () =>
    Object.fromEntries(
      ['courses', 'programs'].flatMap((k) => fs.readdirSync(path.join(dir, 'catalog', k)).map((f) => [`${k}/${f}`, fs.readFileSync(path.join(dir, 'catalog', k, f), 'utf8')])).concat([['majors', fs.readFileSync(path.join(dir, 'catalog', 'majors.json'), 'utf8')]]),
    );
  const before = snap();
  const r = importFixture(dir, '2026-10-09');
  assert.deepEqual(snap(), before);
  assert.equal(r.programsKept, 5);
  assert.equal(r.programsNew, 0);
});

test('nhập CTĐT: tên ngành sửa tay và listed: false được giữ, tên chương trình theo ngành', () => {
  const dir = freshRoot();
  importFixture(dir);
  const majors = readJson(dir, 'catalog/majors.json');
  majors.majors[0].nameEn = 'Mechanical Engineering (sửa tay)';
  writeJson(dir, 'catalog/majors.json', majors);
  const file = 'catalog/programs/FME_KY_THUAT_CO_KHI_2019.json';
  const p = readJson(dir, file);
  p.listed = false;
  writeJson(dir, file, p);
  importFixture(dir, '2026-10-09');
  assert.equal(readJson(dir, 'catalog/majors.json').majors[0].nameEn, 'Mechanical Engineering (sửa tay)');
  const again = readJson(dir, file);
  assert.equal(again.listed, false);
  assert.equal(again.nameEn, 'Mechanical Engineering (sửa tay)');
  assert.equal(again.updated, '2026-10-09');
});
