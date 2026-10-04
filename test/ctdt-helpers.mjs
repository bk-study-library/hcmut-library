// Dữ liệu dùng chung cho test nhập CTĐT và test trang web dựng từ dữ liệu đã nhập.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importCtdt, readCtdt } from '../scripts/import-ctdt.mjs';
import { importSdh, readSdh } from '../scripts/import-sdh.mjs';
import { TOOL_ROOT } from '../scripts/lib/repo.mjs';
import { FIXTURES, writeJson } from './helpers.mjs';

export const DATA = path.join(FIXTURES, 'ctdt');
const faculties = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'faculties.json'), 'utf8'));

const course = (id, extra = {}) => ({
  $schema: '../../schema/course.schema.json',
  id,
  code: id.replace(/-[0-9]{4}$/, ''),
  name: 'Tên',
  faculty: 'unknown',
  aliases: [],
  status: 'active',
  programs: [],
  parts: ['theory'],
  related: [],
  updated: '2026-10-01',
  ...extra,
});

// Thư mục tạm có faculties.json, site.json thật, vài môn đã có (tên vỡ, mã dùng lại, khoa cũ) và hai chương trình cũ chưa gắn ngành.
export function freshRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-ctdt-'));
  for (const f of ['faculties.json', 'site.json']) {
    fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
    fs.copyFileSync(path.join(TOOL_ROOT, 'catalog', f), path.join(dir, 'catalog', f));
  }
  const courses = [
    course('MT1003', { name: 'Giải tích 1', faculty: 'fas', credits: 4, aliases: [{ code: 'MT1001', name: 'Giải tích A1' }], note: 'Ghi chú của người duyệt.', programs: [{ program: 'FME_KY_THUAT_CO_KHI_2024', block: 'B1', required: true }] }),
    course('PH1003', { name: 'Vật lý 1', faculty: 'fas', credits: 4 }),
    course('ME2045', { name: 'Kinh tế kỹ th uật', nameEn: 'Engineering Economy KT', faculty: 'fme', credits: 3 }),
    course('ME2007', { name: 'Chi Tiết Máy', nameEn: 'Machine Elements', faculty: 'fme', credits: 3 }),
    course('EE4105', { name: 'Kỹ thuật điện)', nameEn: 'Internship', faculty: 'dee', credits: 2 }),
    course('GE3079', { name: 'Phương pháp viễn thám và GIS', nameEn: 'Remote Sensing and Geographic Information System', faculty: 'geopet', credits: 3 }),
    course('GE1023', { name: 'Phân tích dữ liệu trong ngành dầu khí', faculty: 'geopet' }),
    course('GE4169', { name: 'Khai phá dữ liệu', nameEn: 'Data Mining', faculty: 'geopet', credits: 3 }),
    course('GE4169-2024', { name: 'Kỹ thuật thi công công trình ngầm', faculty: 'geopet', credits: 3 }),
  ];
  for (const c of courses) writeJson(dir, `catalog/courses/${c.id}.json`, c);
  writeJson(dir, 'catalog/programs/FME_KY_THUAT_CO_KHI_2024.json', {
    $schema: '../../schema/program.schema.json',
    code: 'FME_KY_THUAT_CO_KHI_2024',
    name: 'Kỹ thuật Cơ khí',
    faculty: 'fme',
    year: '2024',
    note: 'Nhập từ nguồn công khai (03/10/2026).',
    reviewNote: 'Đã đối chiếu PDF.',
    ctdtUrl: 'https://drive.google.com/file/d/ghi-tay/view',
    blocks: [{ id: 'B1', name: 'Toán', required: true, courses: ['MT1003'] }],
    updated: '2026-10-03',
  });
  writeJson(dir, 'catalog/programs/CSE_TS_106_2026.json', {
    $schema: '../../schema/program.schema.json',
    code: 'CSE_TS_106_2026',
    name: 'Khoa học Máy tính (Chuyên ngành: Khoa học Máy tính)',
    faculty: 'cse',
    year: '2026',
    blocks: [],
    updated: '2026-10-03',
  });
  return dir;
}

export const importFixture = (dir, date = '2026-10-04') => importCtdt(readCtdt(DATA), dir, { date, faculties });

// ---------- Sau đại học (test/fixtures/sdh) ----------
export const SDH_DATA = path.join(FIXTURES, 'sdh');

// Người duyệt chọn mã chính cho ngành nguồn ghi hai mã: ghi sẵn trong majors.json trước khi nhập.
export function seedSdhMajors(dir) {
  const p = path.join(dir, 'catalog', 'majors.json');
  const cur = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { $schema: '../schema/major.schema.json', updated: '2026-10-04', majors: [] };
  cur.majors.push({ code: '8520202', name: 'Thiết kế vi mạch', faculty: 'dee', level: 'thac-si', programTypes: [], aliases: ['85202a1'], note: 'Mã ngành chờ xác nhận.' });
  cur.majors.sort((a, b) => a.code.localeCompare(b.code));
  writeJson(dir, 'catalog/majors.json', cur);
}

export const importSdhFixture = (dir, date = '2026-10-04') => importSdh(readSdh(SDH_DATA), dir, { date, faculties });

// Thư mục đã nhập cả đại học (test/fixtures/ctdt) và sau đại học, như luồng thật.
export function freshSdhRoot() {
  const dir = freshRoot();
  importFixture(dir);
  seedSdhMajors(dir);
  return dir;
}
