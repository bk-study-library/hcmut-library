import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadRepo, TOOL_ROOT, buildIndex, serializeIndex, scanText } from '../scripts/lib/repo.mjs';
import { run, deletedItemErrors } from '../scripts/validate.mjs';
import { spawnSync } from 'node:child_process';
import { syncReadmes } from '../scripts/lib/readme.mjs';
import { copyFixture, editJson, writeJson, codes, FIXTURES } from './helpers.mjs';

const ITEM = 'courses/EE1009/items/tom-tat-c1.json';
const PRELAB = 'courses/EE1009/items/prelab-2-tham-khao.json';

function errorsAfter(mutate) {
  const dir = copyFixture();
  mutate(dir);
  return codes(loadRepo(dir).errors);
}

test('fixture hợp lệ: không lỗi, không cảnh báo, file sinh ra không cũ', () => {
  const r = run(['--root', path.join(FIXTURES, 'valid'), '--quiet']);
  assert.deepEqual(r.repo.errors, []);
  assert.deepEqual(r.repo.warnings, []);
  assert.deepEqual(r.stale, []);
  assert.equal(r.ok, true);
});

test('schema: thiếu trường và trường lạ', () => {
  assert.deepEqual(
    errorsAfter((d) => editJson(d, ITEM, (it) => { delete it.title; it.extra = 1; })),
    ['SCHEMA'],
  );
});

test('item.course phải có trong danh mục và khớp thư mục', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.course = 'EE9999'; })), ['ITEM_COURSE']);
});

test('chương trình: ctdtUrl, planUrl chỉ nhận https tới host trong site.json; listed là boolean', () => {
  const PROG = 'catalog/programs/TEST_2019.json';
  const withUrl = (k, url, hosts = ['drive.google.com', 'hcmut.edu.vn', '*.hcmut.edu.vn']) =>
    errorsAfter((d) => {
      writeJson(d, 'catalog/site.json', { uploadEndpoint: '', turnstileSiteKey: 'K', programPdfHosts: hosts });
      editJson(d, PROG, (p) => { p[k] = url; });
    });
  assert.deepEqual(withUrl('ctdtUrl', 'https://drive.google.com/file/d/abc/view'), []);
  assert.deepEqual(withUrl('planUrl', 'https://hcmut.edu.vn/a.pdf'), []);
  assert.deepEqual(withUrl('planUrl', 'https://dee.hcmut.edu.vn/file-system/a.pdf'), []);
  assert.deepEqual(withUrl('ctdtUrl', 'http://drive.google.com/file/d/abc/view'), ['PROGRAM_URL', 'SCHEMA']);
  assert.deepEqual(withUrl('ctdtUrl', 'https://example.com/a.pdf'), ['PROGRAM_URL']);
  assert.deepEqual(withUrl('ctdtUrl', 'https://hcmut.edu.vn.example.com/a.pdf'), ['PROGRAM_URL']);
  assert.deepEqual(withUrl('ctdtUrl', 'https://evilhcmut.edu.vn/a.pdf'), ['PROGRAM_URL']);
  assert.deepEqual(withUrl('ctdtUrl', 'https://user@drive.google.com/a.pdf'), ['PROGRAM_URL']);
  assert.deepEqual(withUrl('ctdtUrl', 'https://drive.google.com:8443/a.pdf'), ['PROGRAM_URL']);
  // Host chỉ có trong danh sách khi site.json ghi: bỏ drive.google.com thì link Drive bị từ chối.
  assert.deepEqual(withUrl('ctdtUrl', 'https://drive.google.com/file/d/abc/view', ['hcmut.edu.vn']), ['PROGRAM_URL']);
  assert.deepEqual(withUrl('ctdtUrl', 'https://drive.google.com/a', 'drive.google.com'), ['PROGRAM_URL', 'SCHEMA']);
  assert.deepEqual(errorsAfter((d) => editJson(d, PROG, (p) => { p.listed = 'no'; })), ['SCHEMA']);
  assert.deepEqual(errorsAfter((d) => editJson(d, PROG, (p) => { p.listed = false; })), []);
});

test('catalog/site.json thật: programPdfHosts chỉ gồm Drive và tên miền của trường, có bảng CTĐT chính thức', () => {
  const site = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'site.json'), 'utf8'));
  assert.deepEqual(site.programPdfHosts, ['drive.google.com', 'hcmut.edu.vn', '*.hcmut.edu.vn']);
  assert.match(site.officialProgramsPage, /^https:\/\/hcmut\.edu\.vn\//);
  assert.deepEqual(site.handbookHosts, ['hcmut.edu.vn']);
  assert.equal(site.sharedFaculty, 'chung');
});

// Fixture có thêm catalog/majors.json và chương trình TEST_2019 gắn ngành, có loại, bậc, vai trò khối, học kỳ đề xuất.
function withMajor(d) {
  writeJson(d, 'catalog/majors.json', {
    updated: '2026-10-04',
    majors: [{ code: '7520201', name: 'Kỹ thuật Điện', faculty: 'EE', level: 'dai-hoc', programTypes: ['CQ'], handbookUrl: 'https://hcmut.edu.vn/study/handbook/course/undergraduate/7520201?program=CQ' }],
  });
  editJson(d, 'catalog/programs/TEST_2019.json', (p) => {
    Object.assign(p, { major: '7520201', type: 'CQ', level: 'dai-hoc', degree: 'cu-nhan', totalCredits: 132, handbookUrl: 'https://hcmut.edu.vn/study/handbook/course/undergraduate/7520201?program=CQ' });
    Object.assign(p.blocks[0], { kind: 'co-so-nganh', coursesNeed: 1, semesters: { EE1009: 3 } });
  });
}

test('ngành và trường mới của chương trình: hợp lệ khi đủ, báo lỗi đúng mã khi sai', () => {
  const PROG = 'catalog/programs/TEST_2019.json';
  const after = (fn) => errorsAfter((d) => { withMajor(d); fn(d); });
  assert.deepEqual(after(() => {}), []);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.major = '7999999'; })), ['MAJOR_MISSING']);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.type = 'ABC'; })), ['SCHEMA']);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.level = 'cao-dang'; })), ['SCHEMA']);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.blocks[0].kind = 'khoi-la'; })), ['SCHEMA']);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.blocks[0].semesters = { EE1010: 2 }; })), ['SEMESTER_REF']);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.blocks[0].semesters = { EE1009: 0 }; })), ['SCHEMA']);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.blocks[0].semesters = { 'ee 1009': 1 }; })), ['SCHEMA', 'SEMESTER_REF']);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.blocks[0].requiredUnknown = true; })), ['BLOCK_REQUIRED']);
  assert.deepEqual(after((d) => editJson(d, PROG, (p) => { p.handbookUrl = 'https://example.com/so-tay'; })), ['HANDBOOK_URL']);
  assert.deepEqual(after((d) => editJson(d, 'catalog/courses/EE1009.json', (c) => { c.handbookUrl = 'https://hcmut.edu.vn/study/handbook/subject/EE1009'; })), []);
  assert.deepEqual(after((d) => editJson(d, 'catalog/courses/EE1009.json', (c) => { c.handbookUrl = 'http://hcmut.edu.vn/x'; })), ['HANDBOOK_URL', 'SCHEMA']);
  assert.deepEqual(after((d) => editJson(d, 'catalog/majors.json', (m) => { m.majors[0].faculty = 'khong-co'; })), ['FACULTY_MISSING']);
  assert.deepEqual(after((d) => editJson(d, 'catalog/majors.json', (m) => { m.majors.push({ ...m.majors[0] }); })), ['DUP_ID']);
  assert.deepEqual(after((d) => editJson(d, 'catalog/majors.json', (m) => { delete m.updated; m.majors[0].programTypes = ['XX']; })), ['SCHEMA']);
  assert.deepEqual(after((d) => editJson(d, 'catalog/majors.json', (m) => { m.majors[0].handbookUrl = 'https://example.com/'; })), ['HANDBOOK_URL']);
  // Không có catalog/majors.json mà chương trình ghi major: lỗi.
  assert.deepEqual(after((d) => fs.rmSync(path.join(d, 'catalog', 'majors.json'))), ['MAJOR_MISSING']);
});

test('sau đại học: khối cha (groups), mã ngành phụ (aliases), bậc của môn (levels) khớp bậc chương trình', () => {
  const PROG = 'catalog/programs/TEST_2019.json';
  const COURSE = 'catalog/courses/EE1009.json';
  const after = (fn) => errorsAfter((d) => { withMajor(d); fn(d); });
  const pg = (d) => {
    editJson(d, 'catalog/majors.json', (m) => { Object.assign(m.majors[0], { code: '8520201', level: 'thac-si', programTypes: ['UD'], aliases: ['85202a1'] }); });
    editJson(d, PROG, (p) => Object.assign(p, { major: '8520201', type: 'UD', level: 'thac-si', orientation: 'ung-dung', degree: 'thac-si', groups: [{ name: 'A. Khối A', creditsNeed: 9 }] }));
    editJson(d, PROG, (p) => { p.blocks[0].group = 'A. Khối A'; p.blocks[0].kind = 'luan-van'; });
    editJson(d, COURSE, (c) => { c.levels = ['thac-si', 'tien-si']; });
  };
  assert.deepEqual(after(pg), []);
  // Môn thiếu bậc của chương trình.
  assert.deepEqual(after((d) => { pg(d); editJson(d, COURSE, (c) => { delete c.levels; }); }), ['COURSE_LEVEL']);
  assert.deepEqual(after((d) => { pg(d); editJson(d, COURSE, (c) => { c.levels = ['tien-si']; }); }), ['COURSE_LEVEL']);
  assert.deepEqual(after((d) => { pg(d); editJson(d, COURSE, (c) => { c.levels = []; }); }), ['COURSE_LEVEL', 'SCHEMA']);
  assert.deepEqual(after((d) => { pg(d); editJson(d, COURSE, (c) => { c.levels = ['thac-si', 'thac-si']; }); }), ['SCHEMA']);
  // Khối cha không khối nào trỏ tới, hoặc trùng tên.
  assert.deepEqual(after((d) => { pg(d); editJson(d, PROG, (p) => { p.groups.push({ name: 'B. Khối B' }); }); }), ['GROUP_REF']);
  assert.deepEqual(after((d) => { pg(d); editJson(d, PROG, (p) => { p.groups.push({ name: 'A. Khối A' }); }); }), ['GROUP_REF']);
  assert.deepEqual(after((d) => { pg(d); editJson(d, PROG, (p) => { p.orientation = 'khac'; }); }), ['SCHEMA']);
  // Mã phụ trùng mã một ngành, hoặc ghi ở hai ngành.
  assert.deepEqual(after((d) => { pg(d); editJson(d, 'catalog/majors.json', (m) => { m.majors[0].aliases = ['8520201']; }); }), ['MAJOR_ALIAS']);
  assert.deepEqual(
    after((d) => { pg(d); editJson(d, 'catalog/majors.json', (m) => { m.majors.push({ code: '8520202', name: 'Ngành khác', faculty: 'EE', level: 'thac-si', programTypes: [], aliases: ['85202a1'] }); }); }),
    ['MAJOR_ALIAS'],
  );
});

test('worker-catalog.json thật khớp summarize(index) của Worker; index.json không lặp programs của môn', async () => {
  const { summarize } = await import('../worker/src/catalog.mjs');
  const { workerCatalog } = await import('../scripts/lib/worker-catalog.mjs');
  const index = buildIndex(loadRepo(TOOL_ROOT));
  const file = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'worker-catalog.json'), 'utf8'));
  const disk = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'index.json'), 'utf8'));
  // So hai file đã commit với nhau, không so với danh mục dựng lại: ở commit đầu của bot (bài gửi qua
  // form) file sinh ra còn cũ, validate --allow-stale cho qua và kiem-file dựng lại sau.
  // Kiểm file cũ hay mới là việc của validate (lỗi STALE).
  assert.deepEqual(file, workerCatalog(disk));
  const fromIndex = summarize({ p: 1 }, disk);
  assert.deepEqual({ courses: file.courses, shas: file.shas, blocked: file.blocked }, { courses: fromIndex.courses, shas: fromIndex.shas, blocked: fromIndex.blocked });
  assert.equal(file.schemaVersion, 1);
  assert.equal(file.courses.length, disk.counts.courses);
  // Worker parse nhanh: file nhỏ hơn nhiều so với index.json.
  assert.ok(fs.statSync(path.join(TOOL_ROOT, 'worker-catalog.json')).size < 512 * 1024);
  assert.ok(disk.faculties.every((f) => f.courses.every((c) => !('programs' in c))));
  // Quan hệ môn, chương trình vẫn dựng lại được từ programs[].blocks[].courses.
  const inBlocks = new Set(disk.programs.flatMap((p) => p.blocks.flatMap((b) => b.courses)));
  for (const f of index.faculties) for (const c of f.courses) assert.equal(inBlocks.has(c.id), c.programs.length > 0, c.id);
});

test('index.json có danh sách ngành và counts.majors', () => {
  const dir = copyFixture();
  withMajor(dir);
  const index = buildIndex(loadRepo(dir));
  assert.equal(index.counts.majors, 1);
  assert.deepEqual(index.majors.map((m) => m.code), ['7520201']);
  assert.deepEqual(index.programs[0].blocks[0].semesters, { EE1009: 3 });
});

test('related, replacedBy, replaces phải trỏ tới môn có thật', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, 'catalog/courses/EE1010.json', (c) => { c.related.push('EE7777'); })), ['REF_RELATED']);
  assert.deepEqual(errorsAfter((d) => editJson(d, 'catalog/courses/400111.json', (c) => { c.replacedBy = 'EE7777'; })), ['REF_REPLACED_BY']);
  assert.deepEqual(errorsAfter((d) => editJson(d, 'catalog/courses/EE1009.json', (c) => { c.replaces = ['EE7777']; })), ['REF_REPLACES']);
});

test('có replacedBy thì phải retired', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, 'catalog/courses/400111.json', (c) => { c.status = 'active'; })), ['REPLACED_ACTIVE']);
});

test('khoa phải có trong faculties.json', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, 'catalog/courses/EE1010.json', (c) => { c.faculty = 'XX'; })), ['FACULTY_MISSING']);
});

test('chương trình và môn phải khớp hai chiều', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, 'catalog/courses/EE1009.json', (c) => { c.programs = []; })), ['PROGRAM_MISMATCH']);
  assert.deepEqual(errorsAfter((d) => editJson(d, 'catalog/courses/EE1010.json', (c) => { c.programs = [{ program: 'NOPE', block: 'B1', required: true }]; })), ['REF_PROGRAM']);
});

test('hai môn không dùng chung một mã hiện tại', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, 'catalog/courses/EE1010.json', (c) => { c.code = 'EE1009'; })), ['DUP_CODE']);
});

test('thư mục môn không có trong danh mục', () => {
  assert.deepEqual(errorsAfter((d) => fs.mkdirSync(path.join(d, 'courses', 'ZZ0000', 'items'), { recursive: true })), ['COURSE_DIR_ORPHAN']);
});

test('file trên 20 MB bị từ chối (khai báo và trên đĩa)', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, PRELAB, (it) => { it.files[0].size = 21 * 1024 * 1024; })), ['FILE_SIZE']);
  const onDisk = errorsAfter((d) => {
    const fd = fs.openSync(path.join(d, 'big.bin'), 'w');
    fs.ftruncateSync(fd, 21 * 1024 * 1024);
    fs.closeSync(fd);
  });
  assert.deepEqual(onDisk, ['FILE_SIZE']);
});

test('loại file không cho phép', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, PRELAB, (it) => { it.files[0].name = 'setup.exe'; })), ['FILE_TYPE']);
  assert.deepEqual(errorsAfter((d) => editJson(d, PRELAB, (it) => { it.files[0].name = 'prelab-2.docm'; })), ['FILE_TYPE']);
});

test('gói quiz chỉ nhận định dạng Study Pack (.json, .md, .zip)', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, PRELAB, (it) => { it.type = 'quiz-pack'; delete it.gradedAfter; })), ['FILE_TYPE']);
});

test('.zip chỉ nhận cho gói quiz (extensions[".zip"].types trong policy.json)', () => {
  const zipName = (it) => { it.files[0].name = 'prelab-2.zip'; it.files[0].mime = 'application/zip'; };
  assert.deepEqual(errorsAfter((d) => editJson(d, PRELAB, zipName)), ['FILE_TYPE']);
  const dir = copyFixture();
  editJson(dir, PRELAB, zipName);
  const e = loadRepo(dir).errors.find((x) => x.code === 'FILE_TYPE');
  assert.match(e.msg, /đuôi \.zip không nhận cho loại prelab-reference/);
  assert.deepEqual(errorsAfter((d) => editJson(d, PRELAB, (it) => { zipName(it); it.type = 'quiz-pack'; delete it.gradedAfter; })), []);
});

test('PDF, ảnh trong git bị từ chối; chỉ README, items/*.json, files/*.md', () => {
  assert.deepEqual(errorsAfter((d) => fs.writeFileSync(path.join(d, 'courses', 'EE1009', 'files', 'slide.pdf'), 'x')), ['GIT_FILE_TYPE']);
});

test('trùng sha256 giữa hai tài liệu', () => {
  assert.deepEqual(
    errorsAfter((d) => {
      writeJson(d, 'courses/EE1010/items/ban-sao.json', {
        id: 'ban-sao', course: 'EE1010', type: 'notes', title: 'Bản sao', lang: 'vi', license: 'CC-BY-SA-4.0', origin: 'self-made',
        files: [{ name: 'prelab-2.pdf', size: 120000, sha256: '1'.repeat(64) }], added: '2026-10-01', removed: false,
      });
    }),
    ['DUP_SHA'],
  );
});

test('file .md trong git: size và sha256 phải khớp nội dung', () => {
  assert.deepEqual(errorsAfter((d) => fs.appendFileSync(path.join(d, 'courses', 'EE1009', 'files', 'tom-tat-c1.md'), 'thêm\n')), ['FILE_PATH']);
});

test('prelab tham khảo không cần gradedAfter', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, PRELAB, (it) => { delete it.gradedAfter; })), []);
});

test('tự soạn phải dùng CC BY-SA 4.0 (hoặc CC BY 4.0, CC0)', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.license = 'CC-BY-NC-4.0'; })), ['ITEM_LICENSE']);
});

test('link cần url, không có files; file không có url ở cấp item', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, 'courses/EE1010/items/link-doi-tac.json', (it) => { delete it.url; })), ['ITEM_LINK']);
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.url = 'https://example.org/'; })), ['ITEM_FILES']);
});

test('đối tác phải có trong partners.json', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, 'courses/EE1010/items/link-doi-tac.json', (it) => { it.origin = 'partner:la'; })), ['PARTNER_UNKNOWN']);
});

test('removed cần removedReason', () => {
  assert.deepEqual(errorsAfter((d) => editJson(d, 'courses/EE1010/items/go-bo.json', (it) => { delete it.removedReason; })), ['REMOVED_REASON']);
});

test('quét thông tin cá nhân trong file .md và trong JSON', () => {
  const md = errorsAfter((d) => fs.copyFileSync(path.join(FIXTURES, 'pii', 'bai-lam.md'), path.join(d, 'courses', 'EE1009', 'files', 'bai-lam.md')));
  assert.deepEqual(md, ['PII_EMAIL', 'PII_PHONE', 'PII_STUDENT_ID']);
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.authors = ['Nguyễn An 2012345']; })), ['PII_STUDENT_ID']);
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.description = 'liên hệ an.nguyen@hcmut.edu.vn'; })), ['PII_EMAIL']);
});

test('scanText: không báo nhầm số thường gặp trong tài liệu học', () => {
  const ok = [
    'x = 0.5234567890 và y = 3,1234567',
    'Mã cũ 604046, năm 2026, khối 3682',
    'MT1005 HK251 có 4 tín chỉ',
    'sha 1a2b3c4d5e6f1234567abcdef',
    'Dòng này chắc chắn không phải MSSV 2012345 <!-- pii-ok -->',
    'pi = 3.14159265358979',
  ];
  for (const s of ok) assert.deepEqual(scanText(s), [], s);
  assert.equal(scanText('MSSV: 1951000')[0].code, 'PII_STUDENT_ID');
  assert.equal(scanText('Gọi 0912.345.678')[0].code, 'PII_PHONE');
  assert.equal(scanText('Gọi +84 912 345 678')[0].code, 'PII_PHONE');
});

test('index.json: môn xếp theo khoa, có tài liệu từng môn; index.min.json là bản rút gọn của cùng dữ liệu', () => {
  const repo = loadRepo(path.join(FIXTURES, 'valid'));
  const index = buildIndex(repo);
  assert.equal(index.version, 1);
  assert.equal(index.generated, '2026-10-01');
  const ee = index.faculties.find((f) => f.key === 'EE');
  assert.deepEqual(ee.courses.map((c) => c.id), ['EE1009', 'EE1010']);
  assert.deepEqual(ee.courses[0].items.map((i) => i.id), ['prelab-2-tham-khao', 'tom-tat-c1']);
  assert.equal(ee.courses[0].items[1].files[0].path, 'courses/EE1009/files/tom-tat-c1.md');
  assert.equal(index.faculties.find((f) => f.key === 'unknown').courses[0].status, 'retired');
  const { full, min } = serializeIndex(index);
  assert.deepEqual(JSON.parse(min), JSON.parse(full));
  assert.ok(min.length < full.length);
  assert.ok(!full.includes('_file') && !full.includes('$schema'));
});

test('index cũ thì validate báo STALE; --write sửa được', () => {
  const dir = copyFixture();
  editJson(dir, 'courses/EE1009/items/tom-tat-c1.json', (it) => { it.title = 'Tóm tắt chương 1 (sửa)'; });
  const r = run(['--root', dir, '--quiet']);
  assert.equal(r.ok, false);
  assert.ok(r.stale.includes('index.json') && r.stale.includes('courses/EE1009/README.md'));
  assert.equal(run(['--root', dir, '--write', '--quiet']).ok, true);
  assert.equal(run(['--root', dir, '--quiet']).ok, true);
});

test('README môn giữ nguyên phần Mẹo học khi sinh lại', () => {
  const dir = copyFixture();
  const p = path.join(dir, 'courses', 'EE1009', 'README.md');
  const tip = 'Làm hết bài tập chương 2 trước khi thi giữa kỳ.';
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/(<!-- meo-hoc:start -->\n)[\s\S]*?(\n<!-- meo-hoc:end -->)/, `$1${tip}$2`));
  editJson(dir, 'catalog/courses/EE1009.json', (c) => { c.credits = 4; });
  syncReadmes(loadRepo(dir), { write: true });
  const out = fs.readFileSync(p, 'utf8');
  assert.ok(out.includes(tip));
  assert.ok(out.includes('| Tín chỉ | 4 |'));
});

test('giới hạn dung lượng trong thông báo lấy từ policy.json', () => {
  const dir = copyFixture();
  const pol = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'policy.json'), 'utf8'));
  writeJson(dir, 'catalog/policy.json', { ...pol, maxFileBytes: 5 * 1024 * 1024 });
  editJson(dir, PRELAB, (it) => { it.files[0].size = 6 * 1024 * 1024; });
  const e = loadRepo(dir).errors.find((x) => x.code === 'FILE_SIZE');
  assert.match(e.msg, /quá 5 MB/);
});

test('policy.json thiếu khóa thì báo SCHEMA, không ném lỗi', () => {
  const dir = copyFixture();
  const pol = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'policy.json'), 'utf8'));
  delete pol.terms;
  writeJson(dir, 'catalog/policy.json', pol);
  const e = loadRepo(dir).errors.find((x) => x.code === 'SCHEMA' && x.file === 'catalog/policy.json');
  assert.match(e.msg, /terms/);
});

const BOOK = { title: 'Giải tích 1', authors: ['Nguyễn Văn A'], year: 2020, publisher: 'NXB ĐHQG', isbn: '9780306406157' };
const bookItem = (extra = {}) => ({
  id: 'sach-giai-tich', course: 'EE1009', type: 'book-ref', title: 'Giải tích 1', lang: 'vi', license: 'CC0-1.0', origin: 'partner:vi-du',
  book: BOOK, added: '2026-10-01', removed: false, ...extra,
});

test('book-ref: cần book, không có files hay url; loại khác không có book', () => {
  const put = (d, it) => writeJson(d, 'courses/EE1009/items/sach-giai-tich.json', it);
  const noBook = bookItem();
  delete noBook.book;
  assert.deepEqual(errorsAfter((d) => put(d, noBook)), ['ITEM_BOOK']);
  const withFiles = bookItem({ files: [{ name: 'a.pdf', size: 10, sha256: 'b'.repeat(64) }] });
  assert.ok(errorsAfter((d) => put(d, withFiles)).includes('ITEM_BOOK'));
  assert.ok(errorsAfter((d) => put(d, bookItem({ url: 'https://example.org/' }))).includes('ITEM_BOOK'));
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.book = BOOK; })), ['ITEM_BOOK']);
});

test('schema: isbn sai định dạng và quarantine sai dạng', () => {
  assert.deepEqual(errorsAfter((d) => writeJson(d, 'courses/EE1009/items/sach-giai-tich.json', bookItem({ book: { ...BOOK, isbn: '12-3' } }))), ['SCHEMA']);
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.files[0].quarantine = 'bad/path'; })), ['SCHEMA']);
});

test('book-ref: book cần ít nhất một tác giả không rỗng', () => {
  for (const authors of [[], ['  ']]) {
    assert.ok(errorsAfter((d) => writeJson(d, 'courses/EE1009/items/sach-giai-tich.json', bookItem({ book: { ...BOOK, authors } }))).includes('ITEM_BOOK'));
  }
});

test('ISBN không bị quét như số điện thoại, tên sách vẫn bị quét', () => {
  const put = (book) => (d) => writeJson(d, 'courses/EE1009/items/sach-giai-tich.json', bookItem({ book: { ...BOOK, ...book } }));
  assert.deepEqual(errorsAfter(put({ isbn: '0912345678' })), []);
  assert.deepEqual(errorsAfter(put({ title: 'Sách 0912345678' })), ['PII_PHONE']);
});

test('mẫu thông tin cá nhân dùng chung: repo.mjs xuất lại đúng pii.mjs', async () => {
  const pii = await import('../scripts/lib/pii.mjs');
  const repo = await import('../scripts/lib/repo.mjs');
  assert.equal(repo.scanText, pii.scanText);
  assert.equal(repo.PII_PATTERNS, pii.PII_PATTERNS);
  // Chữ người gửi không được bỏ qua bằng "pii-ok".
  assert.equal(pii.scanText('an@hcmut.edu.vn pii-ok').length, 0);
  assert.equal(pii.scanText('an@hcmut.edu.vn pii-ok', { skipMarked: false })[0].code, 'PII_EMAIL');
});

test('uploadSha256 hợp lệ trong schema và không bị quét như số điện thoại', () => {
  // Chuỗi hex có đoạn giống số điện thoại.
  const hex = '0912345678' + 'a'.repeat(54);
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.files[0].uploadSha256 = hex; })), []);
  assert.deepEqual(errorsAfter((d) => editJson(d, ITEM, (it) => { it.files[0].uploadSha256 = 'x'; })), ['SCHEMA']);
});

test('README môn: file gửi qua trang web, link gửi qua form Thêm link, không còn form issue cũ', () => {
  const dir = copyFixture();
  const p = path.join(dir, 'courses', 'EE1009', 'README.md');
  syncReadmes(loadRepo(dir), { write: true });
  const out = fs.readFileSync(p, 'utf8');
  assert.ok(out.includes('/gui-tai-lieu/?course=EE1009'));
  assert.ok(out.includes('template=them-link.yml&course=EE1009'));
  assert.ok(!out.includes('dong-gop-tai-lieu'));
});

test('--allow-stale: file sinh ra cũ chỉ là cảnh báo, lỗi khác vẫn chặn', () => {
  const dir = copyFixture();
  fs.writeFileSync(path.join(dir, 'index.json'), '{}\n');
  assert.equal(run(['--root', dir, '--quiet']).ok, false);
  assert.equal(run(['--root', dir, '--quiet', '--allow-stale']).ok, true);
  editJson(dir, ITEM, (it) => { delete it.title; });
  assert.equal(run(['--root', dir, '--quiet', '--allow-stale']).ok, false);
});

test('--base: xóa file mục có file trên Release thì báo ITEM_DELETED; đặt removed thì không', () => {
  const dir = copyFixture();
  const git = (...a) => {
    const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'goc');
  fs.rmSync(path.join(dir, PRELAB));
  const errs = deletedItemErrors(dir, 'HEAD', loadRepo(dir).items);
  assert.deepEqual(errs.map((e) => [e.code, e.file]), [['ITEM_DELETED', PRELAB]]);
  assert.match(errs[0].msg, /removed/);
  // Mục chỉ có file .md trong git (không có Release) thì xóa không bị báo.
  git('checkout', '-q', '--', PRELAB);
  fs.rmSync(path.join(dir, ITEM));
  assert.deepEqual(deletedItemErrors(dir, 'HEAD', loadRepo(dir).items), []);
  // Ref không có thì báo lỗi, không bỏ qua.
  assert.equal(deletedItemErrors(dir, 'khong-co-ref', [])[0].code, 'GIT');
});
