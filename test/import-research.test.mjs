import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importResearch, readResearch, programCode, parseBlockName } from '../scripts/import-research.mjs';
import { run } from '../scripts/validate.mjs';
import { loadRepo, TOOL_ROOT } from '../scripts/lib/repo.mjs';
import { FIXTURES, readJson, writeJson } from './helpers.mjs';

const RESEARCH = path.join(FIXTURES, 'research');
const faculties = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'faculties.json'), 'utf8'));

// Thư mục tạm có faculties.json thật và bốn môn đã có (GE1007, GE2033, GE4169, GE4169-2024), chưa gắn chương trình.
function freshRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-research-'));
  fs.mkdirSync(path.join(dir, 'catalog', 'courses'), { recursive: true });
  fs.copyFileSync(path.join(TOOL_ROOT, 'catalog', 'faculties.json'), path.join(dir, 'catalog', 'faculties.json'));
  for (const id of ['GE1007', 'GE2033', 'GE4169', 'GE4169-2024']) {
    const c = readJson(TOOL_ROOT, `catalog/courses/${id}.json`);
    c.programs = [];
    c.related = [];
    writeJson(dir, `catalog/courses/${id}.json`, c);
  }
  return dir;
}

function importFixture(dir, research = readResearch(RESEARCH), date = '2026-10-04') {
  return importResearch(research, dir, { date, faculties });
}

test('mã chương trình: ASCII, theo khoa, ngành, khóa, loại', () => {
  assert.equal(programCode({ id: 'hcmut:fme:ky-thuat-co-khi:2024' }), 'FME_KY_THUAT_CO_KHI_2024');
  assert.equal(programCode({ id: 'hcmut:dee:ky-thuat-dien:2019:mybk-seed' }), 'DEE_KY_THUAT_DIEN_2019_MYBK_SEED');
  assert.equal(programCode({ id: 'hcmut:dee:chuyen-nganh-ky-thuat-dien-tu-vien-thong-2023:2023:dee-file-system' }), 'DEE_CHUYEN_NGANH_KY_THUAT_DIEN_TU_VIEN_THONG_2023_DEE_FILE_SYSTEM');
  assert.equal(programCode({ id: 'hcmut:admissions-2026:106:standard', faculty: 'cse', type: 'standard' }), 'CSE_TS_106_2026');
  assert.equal(programCode({ id: 'hcmut:admissions-2026:108:chuyen-tiep-quoc-te', faculty: 'dee', type: 'chuyen-tiep-quoc-te' }), 'DEE_TS_108_2026_CTQT');
  assert.equal(programCode({ id: 'hcmut:admissions-2026:159:standard', faculty: null, type: 'standard' }), 'UNKNOWN_TS_159_2026');
});

test('tên khối: tách nhóm, bắt buộc và số tín chỉ cần', () => {
  assert.deepEqual(parseBlockName('A. Toán [BB] 30 > A1. Toán (Mathematics) [BB] 15'), { name: 'A1. Toán (Mathematics)', group: 'A. Toán', required: true, creditsNeed: 15 });
  assert.deepEqual(parseBlockName('2.3. Nhóm tự chọn A [TC] 3'), { name: '2.3. Nhóm tự chọn A', group: null, required: false, creditsNeed: 3 });
  assert.deepEqual(parseBlockName('Semester 1 > Compulsive Courses'), { name: 'Compulsive Courses', group: 'Semester 1', required: null, creditsNeed: null });
});

test('nhập research: đủ môn và chương trình, kể cả chương trình chưa có danh sách môn, kiểm sạch', () => {
  const dir = freshRoot();
  const report = importFixture(dir);
  assert.equal(report.courses, 10);
  assert.equal(report.programs, 6);
  assert.equal(report.programsEmpty, 3);
  const r = run(['--root', dir, '--write', '--quiet']);
  assert.deepEqual(r.repo.errors, []);
  assert.deepEqual(r.repo.warnings, []);
  assert.equal(r.index.counts.courses, 10);
  assert.equal(r.index.counts.programs, 6);

  const sn = readJson(dir, 'catalog/programs/DEE_SONG_NGANH_KY_THUAT_DIEN_KY_THUAT_DIEN_TU_VIEN_THONG_2020.json');
  assert.deepEqual(sn.blocks, []);
  assert.equal(sn.source, 'https://hcmut.edu.vn/home/giao-dien/chuong-trinh-dao-tao/all');
  assert.match(sn.note, /chưa có file CTĐT/);
  const adm = readJson(dir, 'catalog/programs/UNKNOWN_TS_159_2026_TA.json');
  assert.equal(adm.faculty, 'unknown');
  assert.equal(adm.year, '2026');
  assert.equal(adm.variant, 'Dạy và học bằng tiếng Anh');
  const list = readJson(dir, 'catalog/programs/GEOPET_KY_THUAT_DAU_KHI_GEOPET_COURSE_LIST.json');
  assert.equal(list.year, undefined);
});

test('nhập research: khối và course.programs khớp hai chiều', () => {
  const dir = freshRoot();
  importFixture(dir);
  const repo = loadRepo(dir);
  for (const pr of repo.programs.values()) {
    for (const b of pr.blocks) {
      for (const id of b.courses) assert.ok(repo.courses.get(id).programs.some((x) => x.program === pr.code && x.block === b.id), `${pr.code} ${b.id} ${id}`);
    }
  }
  for (const c of repo.courses.values()) {
    for (const x of c.programs) assert.ok(repo.programs.get(x.program).blocks.find((b) => b.id === x.block).courses.includes(c.id), `${c.id} ${x.program}`);
  }
  // Một môn ở hai khối của cùng chương trình có hai mục.
  const mt = readJson(dir, 'catalog/courses/MT1003.json');
  assert.equal(mt.programs.filter((x) => x.program === 'GEOPET_DIA_KY_THUAT_XAY_DUNG_2024').length, 2);
  // Khối [TC] nhưng môn ghi bắt buộc: giữ cờ của môn.
  assert.ok(mt.programs.some((x) => x.program === 'GEOPET_DIA_KY_THUAT_XAY_DUNG_2024' && x.block === 'K01' && x.required === true));
  const p = readJson(dir, 'catalog/programs/GEOPET_DIA_KY_THUAT_XAY_DUNG_2024.json');
  assert.equal(p.blocks[0].required, false);
  assert.equal(p.blocks[0].creditsNeed, 6);
});

test('nhập research: mã dùng lại, mã cũ đã ngừng, môn tương đương, gợi ý trùng tên bị bỏ', () => {
  const dir = freshRoot();
  importFixture(dir);
  assert.deepEqual(readJson(dir, 'catalog/courses/GE4169.json').programs.map((x) => x.program), ['GEOPET_KY_THUAT_DIA_CHAT_2023']);
  assert.deepEqual(readJson(dir, 'catalog/courses/GE4169-2024.json').programs.map((x) => x.program), ['GEOPET_DIA_KY_THUAT_XAY_DUNG_2024']);

  const old = readJson(dir, 'catalog/courses/GE1007.json');
  assert.equal(old.status, 'retired');
  assert.equal(old.replacedBy, 'GE2033');
  const cur = readJson(dir, 'catalog/courses/GE2033.json');
  assert.deepEqual(cur.aliases.map((a) => a.code), ['GE1007']);
  assert.deepEqual(cur.replaces, ['GE1007']);

  assert.deepEqual(readJson(dir, 'catalog/courses/CH2089.json').related, ['GE2053']);
  assert.deepEqual(readJson(dir, 'catalog/courses/GE2053.json').related, ['CH2089']);
  assert.deepEqual(readJson(dir, 'catalog/courses/CH2089.json').aliases, []);

  const legacy = readJson(dir, 'catalog/courses/008001.json');
  assert.deepEqual(legacy.aliases, []);
  assert.equal(legacy.status, 'active');
  assert.equal(legacy.faculty, 'unknown');
  // Nguồn ghi khóa cũ llct: đổi sang khoa đang dùng theo movedTo.
  assert.equal(readJson(dir, 'catalog/courses/SP1007.json').faculty, 'chung');
});

test('nhập research: giữ listed, ctdtUrl, planUrl ghi tay; không nhập bản MyBK', () => {
  const dir = freshRoot();
  importFixture(dir);
  const code = 'GEOPET_KY_THUAT_DIA_CHAT_2023';
  const file = `catalog/programs/${code}.json`;
  const p = readJson(dir, file);
  assert.equal(p.listed, undefined);
  p.ctdtUrl = 'https://drive.google.com/file/d/ctdt/view';
  p.planUrl = 'https://drive.google.com/file/d/plan/view';
  p.listed = false;
  writeJson(dir, file, p);
  const research = readResearch(RESEARCH);
  research.programs.programs.push({
    id: 'hcmut:dee:ky-thuat-dien:2019:mybk-seed', name_vi: 'Kỹ thuật Điện', name_en: null, faculty: 'dee', cohort_year: 2019, type: 'standard-or-unspecified',
    source_url: null, sources: ['seed-mybk-kdi-2019'], blocks: [{ name: 'MyBK block 1', courses: [{ code: 'MT1003', required: true }] }],
  });
  importFixture(dir, research, '2026-10-09');
  const again = readJson(dir, file);
  assert.equal(again.ctdtUrl, 'https://drive.google.com/file/d/ctdt/view');
  assert.equal(again.planUrl, 'https://drive.google.com/file/d/plan/view');
  assert.equal(again.listed, false);
  assert.ok(!fs.existsSync(path.join(dir, 'catalog/programs/DEE_KY_THUAT_DIEN_2019_MYBK_SEED.json')));
  const r = run(['--root', dir, '--write', '--quiet']);
  assert.deepEqual(r.repo.errors, []);
});

test('nhập research: thiếu tên tiếng Việt, thiếu tín chỉ, ký tự gạch dài', () => {
  const dir = freshRoot();
  const research = readResearch(RESEARCH);
  const dash = String.fromCharCode(0x2013);
  research.courses.courses.find((c) => c.code === 'GE2053').name_vi = `Thiết bị ${dash} công nghệ`;
  importFixture(dir, research);
  const iu = readJson(dir, 'catalog/courses/IU3047.json');
  assert.equal(iu.name, 'Project 1');
  assert.equal(iu.nameEn, undefined);
  const ge = readJson(dir, 'catalog/courses/GE2053.json');
  assert.equal(ge.credits, undefined);
  assert.equal(ge.name, 'Thiết bị - công nghệ');
  assert.match(ge.note, /chưa ghi số tín chỉ/);
});

test('nhập research hai lần: không đổi file nào', () => {
  const dir = freshRoot();
  importFixture(dir);
  const snap = (d) => Object.fromEntries(['courses', 'programs'].flatMap((k) => fs.readdirSync(path.join(d, 'catalog', k)).map((f) => [`${k}/${f}`, fs.readFileSync(path.join(d, 'catalog', k, f), 'utf8')])));
  const before = snap(dir);
  importFixture(dir, readResearch(RESEARCH), '2026-10-09');
  assert.deepEqual(snap(dir), before);
});

test('danh mục thật: 3796 môn, 838 chương trình, 140 ngành, không lỗi, không cảnh báo', () => {
  const repo = loadRepo(TOOL_ROOT);
  assert.deepEqual(repo.errors, []);
  assert.deepEqual(repo.warnings, []);
  assert.equal(repo.courses.size, 3796);
  assert.equal(repo.programs.size, 838);
  assert.equal(repo.majors.size, 140);
  const pg = (x) => x.level === 'thac-si' || x.level === 'tien-si';
  // Đại học: 2414 môn, 547 chương trình, 62 ngành. Sau đại học: 1382 môn, 291 chương trình, 78 ngành.
  assert.equal([...repo.courses.values()].filter((c) => !c.levels).length, 2414);
  assert.equal([...repo.programs.values()].filter((p) => !pg(p)).length, 547);
  assert.equal([...repo.majors.values()].filter((m) => !pg(m)).length, 62);
  // Chương trình đại học rỗng chỉ còn mục tuyển sinh 2026 chưa khớp ngành nào; chương trình gắn ngành đều có môn.
  const empty = [...repo.programs.values()].filter((p) => !p.blocks.some((b) => b.courses.length));
  assert.equal(empty.filter((p) => !pg(p)).length, 45);
  assert.ok(empty.filter((p) => !pg(p)).every((p) => !p.major && p.code.includes('_TS_')));
  // Sau đại học rỗng là CTĐT trước khóa 2025 không ghi mã môn: có ngành và link PDF.
  assert.equal(empty.filter(pg).length, 73);
  assert.ok(empty.filter(pg).every((p) => p.major && p.ctdtUrl && p.year <= '2024' && p.type === 'CQ'));
  // Mọi khoa có ngành; chỉ còn hai mã sau đại học kiểu cũ (bản THCQ 2022) ở khoa Chưa xác định.
  assert.equal(new Set([...repo.majors.values()].map((m) => m.faculty)).size, 11);
  assert.deepEqual([...repo.courses.values()].filter((c) => c.faculty === 'unknown').map((c) => c.id), ['TH5929', 'TH5930']);
  for (const p of repo.programs.values()) assert.match(p.code, /^[A-Z0-9_]+$/);
  assert.ok(repo.courses.get('GE4169-2024').programs.every((x) => repo.programs.get(x.program).year >= '2024'));
});

// Ba mã trường dùng lại cho môn khác ở CTĐT 2024: bản 2023 giữ ID cũ, bản 2024 có ID kèm năm.
test('danh mục thật: GE4169, GE3239, GE4165 tách theo khóa giống nhau', () => {
  const repo = loadRepo(TOOL_ROOT);
  for (const code of ['GE4169', 'GE3239', 'GE4165']) {
    const old = repo.courses.get(code);
    const neu = repo.courses.get(`${code}-2024`);
    assert.ok(old && neu, code);
    assert.equal(neu.code, code);
    assert.notEqual(neu.name, old.name, code);
    // Nghĩa cũ chỉ có trong PDF CTĐT 2023, không có trong kế hoạch giảng dạy nên không còn thuộc chương trình nào.
    assert.deepEqual(old.programs, [], code);
    assert.ok(neu.programs.some((x) => x.program === 'GEOPET_DIA_KY_THUAT_XAY_DUNG_2024'), code);
    assert.ok(old.programs.every((x) => repo.programs.get(x.program).year < '2024'), code);
    assert.ok(neu.programs.every((x) => repo.programs.get(x.program).year >= '2024'), code);
    const p2024 = repo.programs.get('GEOPET_DIA_KY_THUAT_XAY_DUNG_2024').blocks.flatMap((b) => b.courses);
    assert.ok(p2024.includes(`${code}-2024`) && !p2024.includes(code), code);
  }
});

test('danh mục thật: không có chương trình hay mã khối nào chép từ MyBK', () => {
  const repo = loadRepo(TOOL_ROOT);
  for (const p of repo.programs.values()) {
    assert.ok(!/MYBK/i.test(p.code), p.code);
    for (const b of p.blocks) assert.ok(!/mybk/i.test(b.name), `${p.code} ${b.name}`);
  }
  for (const c of repo.courses.values()) assert.ok(!c.programs.some((x) => /MYBK/i.test(x.program)), c.id);
});

test('danh mục thật: điều kiện tốt nghiệp chung thuộc Môn chung toàn trường, khớp quy tắc tiền tố chưa xác minh', () => {
  const repo = loadRepo(TOOL_ROOT);
  const shared = repo.faculties.faculties.find((f) => f.key === 'chung');
  assert.equal(shared.name.vi, 'Môn chung toàn trường');
  // Tiền tố dùng chung (Toán, Vật lý, ngoại ngữ, lý luận chính trị, thể chất) cũng về Môn chung toàn trường.
  for (const id of ['SA4001', 'MT1003', 'PH1003', 'LA1003', 'SP1031', 'PE1009']) {
    assert.equal(repo.courses.get(id).faculty, 'chung', id);
    const rule = repo.faculties.prefixes.find((h) => new RegExp(h.pattern).test(id));
    assert.ok(rule, id);
    assert.equal(rule.faculty, 'chung', id);
    assert.equal(rule.verified, false, id);
  }
  for (const code of ['FRA_GC', 'ENG_GC', 'ENG_GC_600', 'CCGDTC', 'SA4003']) assert.equal(repo.faculties.prefixes.find((h) => new RegExp(h.pattern).test(code))?.faculty, 'chung', code);
});

test('nhập research: chương trình đã gắn ngành (import-ctdt) không bị ghi đè, quan hệ môn giữ nguyên', () => {
  const dir = freshRoot();
  importFixture(dir);
  const code = 'GEOPET_KY_THUAT_DIA_CHAT_2023';
  const file = `catalog/programs/${code}.json`;
  // Giả lập import-ctdt nhận chương trình này: gắn ngành, đổi khối, môn trỏ về khối mới.
  const p = readJson(dir, file);
  p.major = '7520501';
  p.type = 'CQ';
  p.blocks = [{ id: 'K99', name: 'Khối do import-ctdt ghi', required: true, courses: ['GE1007'] }];
  writeJson(dir, file, p);
  const c = readJson(dir, 'catalog/courses/GE1007.json');
  c.programs = c.programs.filter((x) => x.program !== code).concat([{ program: code, block: 'K99', required: true }]);
  writeJson(dir, 'catalog/courses/GE1007.json', c);
  const before = { p: fs.readFileSync(path.join(dir, file), 'utf8'), c: fs.readFileSync(path.join(dir, 'catalog/courses/GE1007.json'), 'utf8') };

  const report = importFixture(dir, readResearch(RESEARCH), '2026-10-09');
  assert.deepEqual(report.programsOwned, [code]);
  assert.equal(fs.readFileSync(path.join(dir, file), 'utf8'), before.p);
  const after = readJson(dir, 'catalog/courses/GE1007.json');
  assert.deepEqual(after.programs.filter((x) => x.program === code), [{ program: code, block: 'K99', required: true }]);
});
