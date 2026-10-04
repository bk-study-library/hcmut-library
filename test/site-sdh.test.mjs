// Trang web dựng từ dữ liệu đại học (test/fixtures/ctdt) và sau đại học (test/fixtures/sdh) đã nhập.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSite } from '../scripts/build-site.mjs';
import { freshSdhRoot, importSdhFixture } from './ctdt-helpers.mjs';

const out = (() => {
  const dir = freshSdhRoot();
  importSdhFixture(dir);
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-sdh-'));
  buildSite({ root: dir, out: o });
  return o;
})();
const read = (p) => fs.readFileSync(path.join(out, p), 'utf8');
const mainOf = (html) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));

test('trang chủ: đại học giữ nguyên, sau đại học là phần riêng bên dưới, gập theo bậc', () => {
  const html = read('index.html');
  const ug = html.slice(html.indexOf('<section aria-labelledby="h-prog">'), html.indexOf('<section aria-labelledby="h-sdh">'));
  const pg = html.slice(html.indexOf('<section aria-labelledby="h-sdh">'), html.indexOf('<section class="cta-row">'));
  assert.ok(ug.length > 0 && pg.length > 0);
  // Phần đại học: không có ngành, chương trình sau đại học; số đếm chỉ tính đại học.
  assert.match(ug, /<p class="muted">3 ngành, 6 chương trình<\/p>/);
  assert.doesNotMatch(ug, /major\/8520103\/|THAC_SI|TIEN_SI/);
  assert.match(ug, /<span class="prog-fac-name">Khoa Cơ khí<\/span> <span class="muted small">1 ngành, 3 chương trình<\/span>/);
  // Phần sau đại học: thạc sĩ, tiến sĩ, mỗi bậc một khối đóng mở, ngành theo khoa.
  assert.match(pg, /<h2 id="h-sdh">Sau đại học<\/h2>/);
  assert.match(pg, /<p class="muted">3 ngành thạc sĩ, 1 ngành tiến sĩ, 8 chương trình<\/p>/);
  assert.match(pg, /<details class="prog-fac"><summary><span class="prog-fac-name">Thạc sĩ<\/span> <span class="muted small">3 ngành, 6 chương trình<\/span><\/summary><h3>Khoa Cơ khí<\/h3>/);
  assert.match(pg, /<summary><span class="prog-fac-name">Tiến sĩ<\/span> <span class="muted small">1 ngành, 2 chương trình<\/span><\/summary><h3>Khoa Quản lý Công nghiệp<\/h3>/);
  assert.match(pg, /<a class="major-name" href="\.\/major\/8520103\/">Kỹ thuật cơ khí<\/a><a class="tag" href="\.\/\?q=CQ">Tiêu chuẩn<\/a><a class="tag" href="\.\/\?q=UD">Ứng dụng<\/a><a class="tag" href="\.\/\?q=CSAU">Nghiên cứu chuyên sâu<\/a>/);
  assert.match(pg, /<a class="tag" href="\.\/\?q=PT1">Phương thức 1<\/a><a class="tag" href="\.\/\?q=TAPT1">Tiếng Anh, phương thức 1<\/a>/);
  // Nhãn bậc cho ô tìm, lấy từ LEVELS.
  assert.match(html, /"levels":\{"thac-si":\["Thạc sĩ","Master"\],"tien-si":\["Tiến sĩ","Doctoral"\]\}/);
  const en = read('en/index.html');
  assert.match(en, /<h2 id="h-sdh">Postgraduate<\/h2>/);
  assert.match(en, /3 master&#39;s majors, 1 doctoral major, 8 programs/);
});

test('trang khoa: bảng môn của khoa chỉ gồm đại học; sau đại học là phần riêng cuối trang, môn sau đại học gập lại', () => {
  const html = mainOf(read('faculty/fme/index.html'));
  const at = (s) => html.indexOf(s);
  const own = html.slice(at('<h2>Môn của khoa</h2>'), at('<h2>Môn chung khoa dùng</h2>'));
  const shared = html.slice(at('<h2>Môn chung khoa dùng</h2>'), at('<h2 id="h-sdh">'));
  const pg = html.slice(at('<h2 id="h-sdh">'));
  assert.ok(at('<h2>Ngành của khoa</h2>') < at('<h2>Môn của khoa</h2>') && at('<h2>Môn chung khoa dùng</h2>') < at('<h2 id="h-sdh">Sau đại học</h2>'));
  assert.match(own, /<p class="muted">3 môn<\/p>/);
  assert.doesNotMatch(own, /ME5327|ME6139/);
  // Môn chung sau đại học (GK, ENG_B2) không lẫn vào Môn chung khoa dùng.
  assert.doesNotMatch(shared, /GK5025|ENG_B2|MT1003-2025/);
  assert.match(pg, /<h3>Thạc sĩ<\/h3>\n<p class="muted">1 ngành, 3 chương trình<\/p>/);
  assert.match(pg, /<details class="prog-empty"><summary>Môn sau đại học \(5 môn\)<\/summary>/);
  for (const id of ['ME5021', 'ME5327', 'ME6139', 'ME6201', 'ME7377']) assert.match(pg, new RegExp(`course/${id}/`), id);
  const chung = mainOf(read('faculty/chung/index.html'));
  const chungOwn = chung.slice(chung.indexOf('<h2>Môn của khoa</h2>'), chung.indexOf('<h2 id="h-sdh">'));
  assert.match(chungOwn, /course\/MT1003\//);
  assert.doesNotMatch(chungOwn, /GK5047|ENG_B2/);
  assert.match(chung.slice(chung.indexOf('<h2 id="h-sdh">')), /course\/GK5047\/[\s\S]*course\/MT1003-2025\//);
});

test('trang ngành sau đại học: tên kèm bậc, bộ chọn loại và khóa, khối kiến thức có khối cha (không có học kỳ)', () => {
  const html = mainOf(read('major/8520103/index.html'));
  assert.match(html, /<li aria-current="page">Thạc sĩ Kỹ thuật cơ khí<\/li>/);
  assert.match(html, /<h1>Thạc sĩ Kỹ thuật cơ khí<\/h1><p class="muted">Mã ngành 8520103, <a href="\.\.\/\.\.\/faculty\/fme\/">Khoa Cơ khí<\/a>, Thạc sĩ, 3 chương trình<\/p>/);
  assert.match(html, /<a class="tag" href="\.\.\/\.\.\/\?q=UD">Thạc sĩ định hướng ứng dụng<\/a>/);
  assert.match(html, /<a class="chip" href="\.\.\/\.\.\/program\/FME_THAC_SI_KY_THUAT_CO_KHI_2025_UD\/" aria-current="true">Ứng dụng<\/a><a class="chip" href="\.\.\/\.\.\/program\/FME_THAC_SI_KY_THUAT_CO_KHI_2025_CSAU\/">Nghiên cứu chuyên sâu<\/a>/);
  assert.match(html, /<h2 id="h-road">Khối kiến thức<\/h2><p class="muted">Theo chương trình Khóa 2025, Ứng dụng\./);
  assert.doesNotMatch(html, /Lộ trình theo học kỳ|id="hoc-ky-/);
  assert.match(html, /<h3>A\.1\. Bắt buộc Đa ngành, tổng quát <span class="muted small">bắt buộc, cần 3 tín chỉ<\/span><\/h3><p class="muted small">A\. Đa ngành Tổng quát \(General Interdisciplinary Knowledge\), cần 9 tín chỉ<\/p>/);
  assert.match(html, /<a class="btn" href="https:\/\/drive\.google\.com\/file\/d\/ths-ck-ud\/view" target="_blank" rel="noopener">PDF chương trình đào tạo/);
  assert.match(mainOf(read('en/major/8520103/index.html')), /<h1>Mechanical Engineering \(Master\)<\/h1>/);
  assert.match(read('major/8520103/index.html'), /<title>Thạc sĩ Kỹ thuật cơ khí \| BK Study Library<\/title>/);
});

test('trang chương trình sau đại học: CTĐT không ghi mã môn thì ghi rõ, nút chính là PDF; có môn thì khối theo nguồn', () => {
  const k22 = mainOf(read('program/FME_THAC_SI_KY_THUAT_CO_KHI_2022/index.html'));
  assert.match(k22, /<h1>Thạc sĩ Kỹ thuật cơ khí \(2022\)<\/h1>/);
  assert.match(k22, /Thạc sĩ, 60 tín chỉ, chưa có danh sách mã môn<\/p>/);
  assert.match(k22, /<div class="note" role="note"><p>Chương trình đào tạo của khóa này không ghi mã môn\. Xem danh sách môn trong PDF của trường\.<\/p><\/div><p class="actions"><a class="btn primary" href="https:\/\/drive\.google\.com\/file\/d\/ths-ck-2022\/view" target="_blank" rel="noopener">PDF chương trình đào tạo<\/a><a class="btn subtle" href="[^"]*them-chuong-trinh\.yml/);
  const ud = mainOf(read('program/FME_THAC_SI_KY_THUAT_CO_KHI_2025_UD/index.html'));
  assert.match(ud, /<a class="tag" href="\.\.\/\.\.\/\?q=UD">Thạc sĩ định hướng ứng dụng<\/a>, Thạc sĩ, 60 tín chỉ, 9 môn<\/p>/);
  assert.doesNotMatch(ud, /Thạc sĩ, Thạc sĩ/);
  assert.match(ud, /<li><a href="\.\.\/\.\.\/major\/8520103\/">Thạc sĩ Kỹ thuật cơ khí<\/a><\/li><li aria-current="page">Khóa 2025, Ứng dụng<\/li>/);
  assert.match(ud, /<section class="block" id="khoi-k04"><h3>B\. Cơ sở ngành \(Core courses\)/);
  // Dòng chương trình chưa có môn ở danh sách ghi "chưa có danh sách mã môn".
  assert.match(mainOf(read('faculty/fme/index.html')), /Khóa: <a href="\.\.\/\.\.\/program\/FME_THAC_SI_KY_THUAT_CO_KHI_2025_UD\/">2025<\/a>/);
});

test('trang môn sau đại học: dòng Bậc, ngành sau đại học ghi kèm bậc và xếp sau ngành đại học', () => {
  const me = mainOf(read('course/ME5327/index.html'));
  assert.match(me, /<div><dt>Bậc<\/dt><dd>Thạc sĩ<\/dd><\/div>/);
  const ph = mainOf(read('course/PH1003/index.html'));
  assert.match(ph, /<dt>Bậc<\/dt><dd>Đại học, Thạc sĩ<\/dd>/);
  assert.match(ph, /<a href="\.\.\/\.\.\/major\/7520103\/">Kỹ thuật Cơ khí<\/a>: <a href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2024\/#khoi-k01">2024<\/a><br><a href="\.\.\/\.\.\/major\/8520103\/">Thạc sĩ Kỹ thuật cơ khí<\/a>: <a href="\.\.\/\.\.\/program\/FME_THAC_SI_KY_THUAT_CO_KHI_2025_UD\/#khoi-k04">2025 Ứng dụng<\/a>/);
  // Môn chỉ có ở đại học: không có dòng Bậc.
  assert.doesNotMatch(mainOf(read('course/MT1003/index.html')), /<dt>Bậc<\/dt>/);
  assert.match(mainOf(read('course/MT1003-2025/index.html')), /MT1003 <span class="muted">\(ID MT1003-2025\)<\/span>/);
});

test('ô tìm: programs.json ghi bậc cho ngành, chương trình sau đại học; v1 ghi levels cho môn có ở sau đại học', () => {
  const rows = JSON.parse(read('assets/programs.json'));
  assert.equal(rows.find((r) => r.kind === 'major' && r.code === '8520103').level, 'thac-si');
  assert.equal(rows.find((r) => r.kind === 'major' && r.code === '9520118').level, 'tien-si');
  assert.equal(rows.find((r) => r.kind === 'major' && r.code === '7520103').level, undefined);
  assert.equal(rows.find((r) => r.code === 'FME_THAC_SI_KY_THUAT_CO_KHI_2022').level, 'thac-si');
  const v1 = JSON.parse(read('v1/index.json'));
  const row = (id) => v1.courses.find((c) => c.id === id);
  assert.deepEqual(row('ENG_B2').levels, ['thac-si', 'tien-si']);
  assert.deepEqual(row('PH1003').levels, ['dai-hoc', 'thac-si']);
  assert.equal(row('MT1003').levels, undefined);
  const majors = JSON.parse(read('v1/majors.json')).majors;
  assert.deepEqual(majors.find((m) => m.code === '8520202').aliases, ['85202a1']);
  assert.equal(majors.find((m) => m.code === '8520202').level, 'thac-si');
  assert.equal(majors.find((m) => m.code === '7520103').aliases, undefined);
});
