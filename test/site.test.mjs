import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build-site.mjs';
import { TOOL_ROOT } from '../scripts/lib/repo.mjs';
import { FIXTURES, copyFixture, editJson } from './helpers.mjs';
import { freshRoot, importFixture } from './ctdt-helpers.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-'));
const result = buildSite({ root: path.join(FIXTURES, 'valid'), out, base: '/hcmut-library/' });
const read = (p) => fs.readFileSync(path.join(out, p), 'utf8');

function allHtml(dir = out, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) allHtml(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

test('sinh đủ các trang, cả tiếng Việt và tiếng Anh', () => {
  for (const lang of ['', 'en/']) {
    for (const p of ['index.html', 'faculty/EE/index.html', 'faculty/unknown/index.html', 'program/TEST_2019/index.html', 'course/EE1009/index.html', 'course/400111/index.html', 'mon/ky-thuat-so/index.html', 'contribute/index.html', 'review/index.html', 'takedown/index.html']) {
      assert.ok(fs.existsSync(path.join(out, lang, p)), lang + p);
    }
  }
  for (const p of ['404.html', 'index.json', 'index.min.json', 'assets/site.css', 'assets/search.js', '.nojekyll']) assert.ok(fs.existsSync(path.join(out, p)), p);
  assert.ok(result.pages >= 19);
});

// Fixture: EE1009 "Kỹ thuật số" và EE1010 "Kỹ thuật số (Thí nghiệm)" cùng tên (bỏ phần ngoặc cuối) nên là một
// môn theo tên mon/ky-thuat-so/; 400111 là môn một mã, giữ trang course/400111/.
test('trang môn theo tên: tên, dòng mã, mọi tài liệu của mọi mã theo loại, nút đóng góp điền sẵn mã chính', () => {
  const html = read('mon/ky-thuat-so/index.html');
  assert.match(html, /<html lang="vi"/);
  // Mỗi mã một nhãn: mã và chương trình (hoặc khoa khi mã không thuộc chương trình nào).
  assert.match(html, /<h1>Kỹ thuật số<\/h1>\n<p class="codes"><span class="sr">Mã môn: <\/span><span class="code-chip"><span class="code">EE1009<\/span> CQ<\/span> <span class="code-chip"><span class="code">EE1010<\/span> [^<]+<\/span><\/p>/);
  // Không còn ngữ cảnh, số mã hay bảng thông tin trên trang môn theo tên.
  assert.doesNotMatch(html, /class="facts"|class="subtitle"|twins|theo ngành hoặc khóa/);
  assert.match(html, /Tóm tắt chương 1/);
  assert.match(html, /Ghi chú đã gỡ/);
  assert.match(html, /Link từ đối tác/);
  assert.match(html, /Prelab tham khảo/);
  assert.match(html, /Chỉ để tham khảo sau khi đã hết hạn chấm/);
  // EE1009 thuộc một chương trình, EE1010 không: form gửi điền sẵn EE1009.
  assert.match(html, /<a class="btn primary" href="\.\.\/\.\.\/gui-tai-lieu\/\?course=EE1009">Gửi tài liệu cho môn này<\/a>/);
  assert.doesNotMatch(html, /template=dong-gop-tai-lieu/);
  assert.doesNotMatch(html, /issue-to-pr/);
  assert.match(html, /issues\/new\?template=them-link\.yml&amp;course=EE1009/);
  assert.match(html, /href="\.\.\/\.\.\/en\/mon\/ky-thuat-so\/"/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/site\.css"/);
  // Trong nhóm: mới trước.
  assert.match(read('en/mon/ky-thuat-so/index.html'), /<h1>Kỹ thuật số<\/h1>|<h1>Digital/);
});

test('mã thuộc môn nhiều mã: trang course/<ID>/ chuyển hướng tới trang môn theo tên, giữ #id bằng redirect.js', () => {
  for (const id of ['EE1009', 'EE1010']) {
    const html = read(`course/${id}/index.html`);
    assert.match(html, /<meta http-equiv="refresh" content="0; url=\.\.\/\.\.\/mon\/ky-thuat-so\/">/, id);
    assert.match(html, /<link rel="canonical" href="https:\/\/bk-study-library\.github\.io\/hcmut-library\/mon\/ky-thuat-so\/">/, id);
    assert.match(html, /<script src="\.\.\/\.\.\/assets\/redirect\.js"><\/script>/, id);
  }
  assert.match(read('en/course/EE1009/index.html'), /url=\.\.\/\.\.\/\.\.\/en\/mon\/ky-thuat-so\/"/);
  assert.match(read('assets/redirect.js'), /location\.replace\(url \+ location\.hash\)/);
});

test('trang môn một mã: tên kèm mã, tín chỉ và khoa, mã cũ; không có ngữ cảnh hay danh sách dài', () => {
  const html = read('course/400111/index.html');
  assert.match(html, /<h1><span class="code">400111<\/span> Môn cũ đã ngừng<\/h1>/);
  assert.match(html, /<dt>Tín chỉ<\/dt><dd>3<\/dd>/);
  assert.match(html, /<dt>Khoa<\/dt>/);
  assert.doesNotMatch(html, /class="subtitle"|twins|<dt>Trạng thái<\/dt>|<dt>Phần<\/dt>/);
  // Chưa có tài liệu: một câu và một nút chính.
  assert.match(html, /<div class="note" role="note"><p>Chưa có tài liệu cho môn này\.<\/p><\/div>\n<p class="actions"><a class="btn primary" href="\.\.\/\.\.\/gui-tai-lieu\/\?course=400111">Gửi tài liệu cho môn này<\/a><\/p>/);
});

test('môn đã ngừng: có thông báo và link tới môn thay thế', () => {
  const html = read('course/400111/index.html');
  assert.match(html, /Môn này đã ngừng dạy/);
  // Môn thay thế thuộc môn nhiều mã: link thẳng tới trang môn theo tên.
  assert.match(html, /href="\.\.\/\.\.\/mon\/ky-thuat-so\/"/);
  assert.match(read('en/course/400111/index.html'), /This course is no longer taught/);
});

test('tài liệu đã gỡ: còn mục, không còn link tải', () => {
  const html = read('mon/ky-thuat-so/index.html');
  assert.match(html, /Ghi chú đã gỡ/);
  assert.match(html, /Người gửi rút lại/);
});

test('mã cũ chuyển hướng thẳng tới trang của môn (môn theo tên nếu có)', () => {
  const html = read('course/402030/index.html');
  assert.match(html, /http-equiv="refresh" content="0; url=\.\.\/\.\.\/mon\/ky-thuat-so\/"/);
});

test('404 dùng đường dẫn tuyệt đối theo base', () => {
  const html = read('404.html');
  assert.match(html, /href="\/hcmut-library\/assets\/site\.css"/);
  assert.match(html, /href="\/hcmut-library\/en\/"/);
});

test('không tải gì từ máy chủ khác: không CDN, không font ngoài, không theo dõi', () => {
  // Ngoại lệ duy nhất: script Turnstile của Cloudflare trên trang Gửi tài liệu (khi form đã mở).
  const TURNSTILE = /<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js" async defer><\/script>/;
  for (const f of allHtml()) {
    let html = fs.readFileSync(f, 'utf8');
    if (/[\\/]gui-tai-lieu[\\/]index\.html$/.test(f)) html = html.replace(TURNSTILE, '');
    assert.doesNotMatch(html, /<script[^>]+src="https?:/i, f);
    assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"[^>]+href="https?:/i, f);
    assert.doesNotMatch(html, /<img[^>]+src="https?:/i, f);
    assert.doesNotMatch(html, /google-analytics|googletagmanager|gtag\(|plausible|umami|fonts\.googleapis/i, f);
  }
  const css = read('assets/site.css');
  assert.doesNotMatch(css, /@import|url\(\s*["']?https?:/i);
});

test('chữ có ký tự đặc biệt được escape', () => {
  const dir = copyFixture();
  editJson(dir, 'catalog/courses/EE1010.json', (c) => { c.name = 'Thí nghiệm <script>alert(1)</script> & "q"'; });
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-esc-'));
  buildSite({ root: dir, out: out2 });
  for (const p of ['course/EE1010/index.html', 'faculty/EE/index.html']) {
    const html = fs.readFileSync(path.join(out2, p), 'utf8');
    assert.doesNotMatch(html, /<script>alert/, p);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;q&quot;/, p);
  }
});

test('mỗi trang có lang, viewport, tiêu đề và link bỏ qua tới nội dung', () => {
  for (const f of allHtml()) {
    const html = fs.readFileSync(f, 'utf8');
    if (html.includes('http-equiv="refresh"')) continue;
    assert.match(html, /<html lang="(vi|en)"/, f);
    assert.match(html, /name="viewport"/, f);
    assert.match(html, /<title>[^<]+<\/title>/, f);
    assert.match(html, /class="skip" href="#main"/, f);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, f);
  }
});

// Dựng từ site.json riêng của test, không phụ thuộc địa chỉ Worker đang dùng trong catalog/site.json.
function buildWithSite(site) {
  const dir = copyFixture();
  fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'catalog', 'site.json'), JSON.stringify(site));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-up-'));
  buildSite({ root: dir, out: outDir });
  return fs.readFileSync(path.join(outDir, 'gui-tai-lieu/index.html'), 'utf8');
}

test('trang Gửi tài liệu: có site key, loại sách, không có loại link, form đóng khi chưa có địa chỉ Worker', () => {
  const html = buildWithSite({ uploadEndpoint: '', turnstileSiteKey: 'KEY-DONG' });
  assert.match(html, /data-endpoint=""/);
  assert.match(html, /data-sitekey="KEY-DONG"/);
  assert.match(html, /<option value="book-ref">/);
  assert.match(html, /<option value="summary">/);
  assert.doesNotMatch(html, /<option value="link">/);
  assert.match(html, /<option value="CC-BY-SA-4\.0">/);
  assert.match(html, /Form gửi tài liệu chưa mở\./);
  assert.match(html, /<fieldset class="upload-set" disabled/);
  assert.doesNotMatch(html, /challenges\.cloudflare\.com/);
  assert.match(html, /Mỗi file tối đa 1\.0 GB/);
  assert.match(html, /src="\.\.\/assets\/upload\.js"/);
});

test('trang Gửi tài liệu: có địa chỉ Worker thì form mở và nạp Turnstile', () => {
  const html = buildWithSite({ uploadEndpoint: 'https://up.example.test/submit', turnstileSiteKey: 'KEY123' });
  assert.match(html, /data-endpoint="https:\/\/up\.example\.test\/submit"/);
  assert.match(html, /data-sitekey="KEY123"/);
  assert.doesNotMatch(html, /<fieldset class="upload-set" disabled/);
  assert.doesNotMatch(html, /Form gửi tài liệu chưa mở/);
  assert.match(html, /<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"/);
});

test('trang Gửi tài liệu: đuôi file theo loại lấy từ policy (.zip chỉ cho gói quiz)', () => {
  const html = buildWithSite({ uploadEndpoint: '', turnstileSiteKey: 'K' });
  const cfg = JSON.parse(html.match(/<script type="application\/json" id="upload-config">([^<]*)<\/script>/)[1]);
  assert.ok(cfg.byType['quiz-pack'].includes('.zip'));
  assert.ok(!cfg.byType.summary.includes('.zip'));
  assert.ok(cfg.byType.summary.includes('.pdf'));
  assert.match(html, /File \.zip chỉ dùng cho Gói quiz \(Study Pack\)\./);
  assert.doesNotMatch(html, /Nhiều file thì nén thành \.zip/);
});

test('trang Gửi tài liệu: thêm môn mới lấy mẫu mã từ schema, giới hạn tên từ policy, khoảng gợi ý từ site.json', () => {
  const html = buildWithSite({ uploadEndpoint: '', turnstileSiteKey: 'K', nearCodeSpan: 3 });
  const cfg = JSON.parse(html.match(/<script type="application\/json" id="upload-config">([^<]*)<\/script>/)[1]);
  const schema = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'schema', 'course.schema.json'), 'utf8'));
  const policy = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'policy.json'), 'utf8'));
  assert.deepEqual(cfg.newCourse, { codePattern: schema.properties.code.pattern, nameMax: policy.fields.courseNameMax, nearSpan: 3 });
  for (const k of ['newCodeEmpty', 'newCodePattern', 'newNameEmpty', 'newNameLong', 'courseExists', 'maybe']) assert.equal(typeof cfg.msg[k], 'string', k);
  // Ô môn mới ẩn và tắt sẵn (không gửi đi) cho tới khi người gửi bấm Thêm môn mới.
  assert.match(html, /<fieldset class="field new-course" id="new-course-box" hidden disabled>/);
  assert.match(html, /name="newCourseCode" type="text"/);
  assert.match(html, new RegExp(`name="newCourseName" type="text" maxlength="${policy.fields.courseNameMax}"`));
  assert.match(html, /data-err="newCourseCode"/);
  assert.match(html, /data-err="newCourseName"/);
  assert.match(html, /<p id="new-course-offer" class="new-offer" hidden>/);
  assert.match(html, /<button class="btn subtle" type="button" id="new-course-open" aria-controls="new-course-box" aria-expanded="false">/);
  assert.ok(html.indexOf('assets/upload-core.js') > 0 && html.indexOf('assets/upload-core.js') < html.indexOf('assets/upload.js'));
  // Không có nearCodeSpan thì không gợi ý mã gần.
  const cfg0 = JSON.parse(buildWithSite({ uploadEndpoint: '', turnstileSiteKey: 'K' }).match(/id="upload-config">([^<]*)</)[1]);
  assert.equal(cfg0.newCourse.nearSpan, 0);
});

test('trang Gửi tài liệu: ô môn mời tìm theo tên, môn nhiều mã có ô Mã môn, giảng viên chọn hoặc thêm, nạp subject-core.js', () => {
  const html = buildWithSite({ uploadEndpoint: '', turnstileSiteKey: 'K', sameNameGroupMin: 2, sameNameChipsMax: 4 });
  assert.match(html, /<label for="course-q">Môn học \(gõ tên môn, ví dụ Giải tích 2\)<\/label>/);
  const ph = html.match(/id="course-q"[^>]*placeholder="([^"]+)"/)[1];
  assert.ok(ph.indexOf('Giải tích 2') >= 0 && ph.indexOf('Giải tích 2') < ph.indexOf('MT1005'), ph);
  assert.match(html, /Nên tìm theo tên môn, vì mã có thể đổi qua các khóa\./);
  const cfg = JSON.parse(html.match(/id="upload-config">([^<]*)</)[1]);
  assert.deepEqual(cfg.sameName, { groupMin: 2, chipsMax: 4 });
  assert.equal(cfg.msg.sameNameCount, undefined);
  // Ô mã môn: ẩn sẵn, chỉ hiện khi môn có từ 2 mã.
  assert.match(html, /<div id="code-box" class="code-pick" hidden>\s*<label for="course-code">Mã môn \(nếu bạn biết\)<\/label>\s*<select id="course-code"><\/select>/);
  // Giảng viên: danh sách tên (ẩn sẵn), ô gõ tên gửi đi là name="teacher", chữ gợi ý lấy từ strings.mjs.
  assert.match(html, /<div id="teacher-pick-box" hidden>\s*<label for="teacher-pick">Giảng viên \(không bắt buộc\)<\/label>\s*<select id="teacher-pick"><\/select>/);
  assert.match(html, /<input id="teacher" name="teacher" type="text" autocomplete="off" maxlength="\d+" placeholder="Ví dụ: Nguyễn Văn A"/);
  assert.match(html, /Ghi đủ họ tên, bỏ Thầy, Cô và học hàm\. Có gợi ý thì chọn trong gợi ý\./);
  assert.doesNotMatch(html, /datalist/);
  assert.equal(cfg.msg.teacherAdd, 'Thêm tên giảng viên khác');
  assert.equal(cfg.msg.teacherNone, 'Không ghi');
  assert.ok(html.indexOf('assets/search-core.js') < html.indexOf('assets/subject-core.js') && html.indexOf('assets/subject-core.js') < html.indexOf('assets/upload.js'));
  // Thiếu cấu hình thì dùng mặc định: từ 2 mã cùng tên là một môn.
  const cfg0 = JSON.parse(buildWithSite({ uploadEndpoint: '', turnstileSiteKey: 'K' }).match(/id="upload-config">([^<]*)</)[1]);
  assert.deepEqual(cfg0.sameName, { groupMin: 2, chipsMax: 4 });
});

test('catalog/site.json thật: gộp từ 2 môn cùng tên, hiện tối đa 4 mã', () => {
  const site = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'site.json'), 'utf8'));
  assert.equal(site.sameNameGroupMin, 2);
  assert.equal(site.sameNameChipsMax, 4);
});

test('trang môn tiếng Anh trỏ tới form tiếng Việt', () => {
  assert.match(read('en/mon/ky-thuat-so/index.html'), /href="\.\.\/\.\.\/\.\.\/gui-tai-lieu\/\?course=EE1009"/);
  assert.match(read('en/course/400111/index.html'), /href="\.\.\/\.\.\/\.\.\/gui-tai-lieu\/\?course=400111"/);
});

test('hướng dẫn đóng góp: chỉ cấm sách có bản quyền, không còn luật cũ', () => {
  const html = read('contribute/index.html');
  assert.match(html, /sách có bản quyền/);
  assert.doesNotMatch(html, /Bài đang trong hạn nộp/);
  assert.doesNotMatch(html, /Scribd/);
  assert.match(html, /PRIVACY\.md/);
  assert.match(read('en/contribute/index.html'), /href="\.\.\/\.\.\/contribute\/"/);
});

test('trang Gửi tài liệu: maxlength và loại kiểm tra lấy từ policy.fields', () => {
  const html = read('gui-tai-lieu/index.html');
  assert.match(html, /name="title" type="text" maxlength="200"/);
  assert.match(html, /<option value="ck">Cuối kỳ<\/option>/);
});

test('thanh điều hướng: Trang chủ, Gửi tài liệu, Duyệt bài, Gỡ tài liệu, rồi GitHub và ngôn ngữ; không còn Đóng góp', () => {
  const nav = (html) => html.match(/<nav class="nav"[\s\S]*?<\/nav>/)[0];
  const labels = (html) => [...nav(html).matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(labels(read('index.html')), ['Trang chủ', 'Gửi tài liệu', 'Duyệt bài', 'Gỡ tài liệu', 'GitHub', 'English']);
  assert.deepEqual(labels(read('en/index.html')), ['Home', 'Send material', 'Review', 'Takedown', 'GitHub', 'Tiếng Việt']);
  assert.match(nav(read('en/review/index.html')), /href="\.\.\/\.\.\/gui-tai-lieu\/"/);
  assert.match(nav(read('gui-tai-lieu/index.html')), /href="\.\.\/gui-tai-lieu\/" aria-current="page"/);
  assert.match(nav(read('review/index.html')), /href="\.\.\/review\/" aria-current="page"/);
  assert.doesNotMatch(nav(read('contribute/index.html')), /aria-current/);
  // Trang hướng dẫn đóng góp vẫn tới được từ trang chủ và trang Gửi tài liệu.
  assert.match(read('index.html'), /href="\.\/contribute\/"/);
  assert.match(read('en/index.html'), /href="\.\.\/en\/contribute\/"/);
  assert.match(read('gui-tai-lieu/index.html'), /href="\.\.\/contribute\/"/);
});

// Dựng site từ bản sao fixture có thêm: một chương trình chưa có danh sách môn, một khoa chưa có dữ liệu.
const out3 = (() => {
  const dir = copyFixture();
  editJson(dir, 'catalog/faculties.json', (f) => {
    f.faculties.push({ key: 'fx', name: { vi: 'Khoa Thử Rỗng', en: 'Empty Test Faculty' } });
  });
  fs.writeFileSync(
    path.join(dir, 'catalog', 'programs', 'EE_TS_108_2026.json'),
    JSON.stringify({ code: 'EE_TS_108_2026', name: 'Ngành tuyển sinh thử', faculty: 'EE', year: '2026', variant: 'Dạy và học bằng tiếng Anh', note: 'Chưa có danh sách môn công khai.', source: 'https://example.test/ctdt', blocks: [], updated: '2026-10-01' }),
  );
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-prog-'));
  buildSite({ root: dir, out: o });
  return o;
})();
const read3 = (p) => fs.readFileSync(path.join(out3, p), 'utf8');

test('trang khoa: chương trình theo khóa mới nhất trước, có số môn, chương trình chưa có danh sách môn gập lại, nút thêm chương trình điền sẵn khoa', () => {
  const html = read3('faculty/EE/index.html');
  assert.match(html, /<p class="muted">2 chương trình<\/p>/);
  assert.match(html, /<h3>Khóa 2019<\/h3><ul class="list"><li><a href="[^"]+">Chương trình thử<\/a> <span class="muted small">1 môn<\/span>/);
  // Chương trình chưa có danh sách môn nằm trong khối gập, sau chương trình đã có môn.
  const empty = html.indexOf('<details class="prog-empty"><summary>1 chương trình chưa có danh sách môn</summary>');
  assert.ok(empty > html.indexOf('Khóa 2019'));
  assert.ok(html.indexOf('Khóa 2026') > empty);
  assert.match(html, /Ngành tuyển sinh thử<\/a> <a class="tag" href="\.\.\/\.\.\/\?q=D%E1%BA%A1y%20v%C3%A0%20h%E1%BB%8Dc%20b%E1%BA%B1ng%20ti%E1%BA%BFng%20Anh">Dạy và học bằng tiếng Anh<\/a> <span class="muted small">chưa có danh sách môn<\/span>/);
  assert.match(html, /issues\/new\?template=them-chuong-trinh\.yml&amp;khoa=Khoa\+%C4%90i%E1%BB%87n\+-\+%C4%90i%E1%BB%87n\+t%E1%BB%AD"[^>]*>Thêm chương trình đào tạo</);
  // Bảng môn của khoa: mã thuộc môn nhiều mã trỏ tới trang môn theo tên; không còn dòng ngữ cảnh.
  assert.match(html, /<th scope="row"><a href="\.\.\/\.\.\/mon\/ky-thuat-so\/">EE1009<\/a>/);
  assert.doesNotMatch(html, /class="sub"/);
  assert.match(read3('en/faculty/EE/index.html'), /Cohort 2026/);
});

test('trang khoa chưa có dữ liệu: có thông báo, vẫn có nút thêm chương trình', () => {
  const html = read3('faculty/fx/index.html');
  // Khoa trống: một ghi chú và một nút chính, không lặp "0 chương trình", "0 môn" hay bảng rỗng.
  assert.match(html, /<div class="note" role="note"><p>Khoa này chưa có môn hay chương trình nào\.<\/p><\/div><p class="actions"><a class="btn primary" href="[^"]*them-chuong-trinh\.yml/);
  assert.doesNotMatch(html, /0 chương trình|0 môn|Chưa có môn nào|<table/);
  assert.match(html, /template=them-chuong-trinh\.yml&amp;khoa=Khoa\+Th%E1%BB%AD\+R%E1%BB%97ng/);
  assert.match(read3('index.html'), /<strong>Khoa Thử Rỗng<\/strong><span class="muted">Chưa có môn<\/span>/);
});

test('trang chương trình chưa có danh sách môn: thông báo, nút gửi CTĐT điền sẵn khoa, ngành, khóa', () => {
  const html = read3('program/EE_TS_108_2026/index.html');
  assert.match(html, /<h1>Ngành tuyển sinh thử \(2026\)<\/h1>/);
  assert.match(html, /Chưa có danh sách môn\. Gửi chương trình đào tạo của khóa bạn để thêm vào\./);
  assert.match(html, /template=them-chuong-trinh\.yml&amp;khoa=[^"]+&amp;nganh=Ng%C3%A0nh\+tuy%E1%BB%83n\+sinh\+th%E1%BB%AD&amp;khoa-hoc=2026"/);
  // Ghi chú, rồi một hàng nút: gửi CTĐT (nút chính), link nguồn dạng nút, bảng CTĐT của trường (nút nhẹ).
  assert.match(
    html,
    /<\/div><p class="actions"><a class="btn primary" href="[^"]+" rel="noopener">Thêm chương trình đào tạo<\/a><a class="btn" href="https:\/\/example\.test\/ctdt" rel="noopener">Nguồn chính thức<\/a><a class="btn subtle" href="https:\/\/hcmut\.edu\.vn\/bai-viet\/chuong-trinh-dao-tao-tu-khoa-2019" rel="noopener">Danh sách chương trình của trường<\/a><\/p>/,
  );
  // Dòng meta đọc tự nhiên: "Mã ..., khoa, ..., chưa có danh sách môn", không ghi "0 môn".
  assert.match(html, /<p class="muted">Mã EE_TS_108_2026, <a href="\.\.\/\.\.\/faculty\/EE\/">Khoa Điện - Điện tử<\/a>, <a class="tag" href="\.\.\/\.\.\/\?q=D%E1%BA%A1y%20v%C3%A0%20h%E1%BB%8Dc%20b%E1%BA%B1ng%20ti%E1%BA%BFng%20Anh">Dạy và học bằng tiếng Anh<\/a>, chưa có danh sách môn<\/p>/);
  assert.doesNotMatch(html, /0 môn/);
  assert.doesNotMatch(html, /<table/);
  assert.match(read3('en/program/EE_TS_108_2026/index.html'), /No course list yet/);
});

test('trang chủ: chương trình gộp theo khoa trong khối đóng mở, có nút thêm chương trình', () => {
  const html = read3('index.html');
  assert.equal((html.match(/<details class="prog-fac">/g) || []).length, 1);
  // Khoa chưa có chương trình nào không có dòng ở danh sách chương trình.
  assert.doesNotMatch(html, /prog-fac-name">Khoa Thử Rỗng/);
  assert.match(html, /<summary><span class="prog-fac-name">Khoa Điện - Điện tử<\/span> <span class="muted small">2 chương trình<\/span><\/summary>/);
  assert.match(html, /Chương trình thử \(2019\)<\/a>/);
  assert.match(html, /template=them-chuong-trinh\.yml"/);
});

test('bảng môn: môn chưa có tài liệu ghi "chưa có"', () => {
  assert.match(read3('faculty/unknown/index.html'), /<td class="num"><span class="muted">chưa có<\/span><\/td>/);
});

test('sách tham khảo: link tìm ở nguồn hợp pháp theo site.json, ưu tiên ISBN', async () => {
  const { bookLinks } = await import('../scripts/site/items.mjs');
  const sources = [
    { label: 'A', isbn: 'https://a.example/isbn/{isbn}', search: 'https://a.example/s?q={q}' },
    { label: 'B', url: 'https://b.example/' },
    { label: 'C', url: 'http://khong-https.example/' },
  ];
  const withIsbn = bookLinks({ title: 'Giải tích', authors: ['Nguyễn A'], isbn: '9786040000000' }, sources, 'vi');
  assert.deepEqual(withIsbn.map((l) => l.href), ['https://a.example/isbn/9786040000000', 'https://b.example/']);
  const noIsbn = bookLinks({ title: 'Giải tích', authors: ['Nguyễn A'] }, sources, 'vi');
  assert.equal(noIsbn[0].href, `https://a.example/s?q=${encodeURIComponent('Giải tích Nguyễn A')}`);
});

test('trang môn: mục sách tham khảo có nút tra sách', () => {
  const dir = copyFixture();
  fs.writeFileSync(path.join(dir, 'catalog', 'site.json'), JSON.stringify({ uploadEndpoint: '', turnstileSiteKey: 'K', bookSources: [{ label: 'Tra trên Open Library', isbn: 'https://openlibrary.org/isbn/{isbn}' }] }));
  fs.writeFileSync(path.join(dir, 'courses', 'EE1009', 'items', 'sach-ky-thuat-so.json'), JSON.stringify({
    id: 'sach-ky-thuat-so', course: 'EE1009', type: 'book-ref', title: 'Digital Design', lang: 'en', license: 'CC0-1.0', origin: 'self-made',
    book: { title: 'Digital Design', authors: ['M. Morris Mano'], isbn: '9780134549897' }, added: '2026-10-04', removed: false,
  }));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-book-'));
  buildSite({ root: dir, out: outDir });
  const html = fs.readFileSync(path.join(outDir, 'mon', 'ky-thuat-so', 'index.html'), 'utf8');
  assert.match(html, /href="https:\/\/openlibrary\.org\/isbn\/9780134549897"/);
  assert.match(html, /Tra trên Open Library/);
  assert.match(html, /<dt>Định dạng<\/dt><dd>Sách, chỉ ghi tên<\/dd>/);
  assert.match(html, /<dt>Ngôn ngữ<\/dt><dd>Tiếng Anh<\/dd>/);
});

test('trang môn: nhóm nhiều tài liệu chỉ hiện số mục theo itemsPerGroup, còn lại gập', () => {
  const dir = copyFixture();
  fs.writeFileSync(path.join(dir, 'catalog', 'site.json'), JSON.stringify({ uploadEndpoint: '', turnstileSiteKey: 'K', itemsPerGroup: 2 }));
  for (let i = 1; i <= 4; i++) {
    fs.writeFileSync(path.join(dir, 'courses', 'EE1009', 'items', `link-${i}.json`), JSON.stringify({
      id: `link-${i}`, course: 'EE1009', type: 'link', title: `Link ${i}`, lang: 'vi', license: 'CC-BY-4.0', origin: 'link',
      url: `https://example.org/${i}`, added: '2026-10-04', removed: false,
    }));
  }
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-more-'));
  buildSite({ root: dir, out: outDir });
  // Nhóm Link của môn theo tên: 4 link mới và 1 link sẵn có của EE1010.
  const html = fs.readFileSync(path.join(outDir, 'mon', 'ky-thuat-so', 'index.html'), 'utf8');
  assert.match(html, /<details class="more-items"><summary>Xem thêm 3 tài liệu<\/summary>/);
});

test('trang chủ: ô tìm không bị khóa, danh sách môn chỉ tải khi dùng', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<input id="q"[^>]*disabled/);
  const js = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site-src', 'assets', 'search.js'), 'utf8');
  assert.match(js, /pointerenter/);
});

// Dựng site có đủ loại file để kiểm hàng nút của item.
const out4 = (() => {
  const dir = copyFixture();
  fs.writeFileSync(path.join(dir, 'catalog', 'site.json'), JSON.stringify({ uploadEndpoint: '', turnstileSiteKey: 'K', reviewBase: 'https://up.example/' }));
  const rel = (name) => `https://github.com/bk-study-library/hcmut-library/releases/download/files-HK261/${name}`;
  // .zip chỉ nhận cho gói quiz (policy.json).
  const item = (id, name, size, sha) => ({
    id, course: 'EE1009', type: name.endsWith('.zip') ? 'quiz-pack' : 'summary', title: `Mục ${id}`, lang: 'vi', license: 'CC-BY-SA-4.0', origin: 'self-made',
    files: [{ name, size, sha256: sha.repeat(64), url: rel(name) }], added: '2026-10-04', removed: false,
  });
  for (const [id, name, sha] of [['co-pdf', 'EE1009_summary_co-pdf.pdf', '2'], ['co-docx', 'EE1009_summary_co-docx.docx', '3'], ['co-zip', 'EE1009_quiz-pack_co-zip.zip', '4']]) {
    fs.writeFileSync(path.join(dir, 'courses', 'EE1009', 'items', `${id}.json`), JSON.stringify(item(id, name, 2 * 1024 * 1024, sha)));
  }
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-btn-'));
  buildSite({ root: dir, out: o });
  return o;
})();
const read4 = (p) => fs.readFileSync(path.join(out4, p), 'utf8');
const itemHtml = (html, id) => {
  // Thẻ có thể chứa danh sách file (li lồng): lấy tới thẻ tài liệu kế tiếp hoặc hết nhóm.
  const m = html.match(new RegExp(`<li class="item[^"]*" id="${id}"[^>]*>[\\s\\S]*?</li>(?=<li class="item|</ul></section>|</ul><details|</ul></details>)`));
  assert.ok(m, id);
  return m[0];
};
const buttons = (li) => [...li.matchAll(/<a class="([^"]+)" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({ cls: m[1], href: m[2].replace(/&amp;/g, '&'), label: m[3] }));

test('mục có file PDF: Xem trước, Tải xuống (cỡ), Yêu cầu gỡ theo đúng thứ tự', () => {
  const li = itemHtml(read4('mon/ky-thuat-so/index.html'), 'co-pdf');
  const b = buttons(li);
  assert.deepEqual(b.map((x) => [x.cls, x.label]), [['btn', 'Xem trước'], ['btn', 'Tải xuống (2.0 MB)'], ['btn subtle', 'Báo sai thông tin'], ['btn subtle', 'Yêu cầu gỡ']]);
  const url = 'https://github.com/bk-study-library/hcmut-library/releases/download/files-HK261/EE1009_summary_co-pdf.pdf';
  assert.equal(b[0].href, `https://up.example/xem-truoc?u=${encodeURIComponent(url)}`);
  assert.match(li, /target="_blank" rel="noopener">Xem trước/);
  assert.equal(b[1].href, url);
  // Nút xếp sau khối chi tiết; không còn danh sách link trần.
  assert.ok(li.indexOf('class="item-facts"') < li.indexOf('class="actions"'));
  assert.doesNotMatch(li, /class="files"/);
  assert.match(li, /<dt>Định dạng<\/dt><dd>PDF<\/dd>/);
  assert.match(li, /<dt>Dung lượng<\/dt><dd>2\.0 MB<\/dd>/);
  assert.match(li, /<dt>Ngày tải lên<\/dt><dd><time datetime="2026-10-04">04\/10\/2026<\/time><\/dd>/);
});

test('Yêu cầu gỡ: mở form yeu-cau-go.yml điền sẵn link mục (ô item) và id mục', () => {
  const take = new URL(buttons(itemHtml(read4('mon/ky-thuat-so/index.html'), 'co-pdf')).at(-1).href);
  assert.equal(take.origin + take.pathname, 'https://github.com/bk-study-library/hcmut-library/issues/new');
  assert.equal(take.searchParams.get('template'), 'yeu-cau-go.yml');
  assert.equal(take.searchParams.get('item'), 'https://bk-study-library.github.io/hcmut-library/mon/ky-thuat-so/#co-pdf');
  assert.match(take.searchParams.get('title'), /co-pdf/);
  // Ô item có thật trong form.
  const form = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'ISSUE_TEMPLATE', 'yeu-cau-go.yml'), 'utf8');
  assert.match(form, /^\s+id: item$/m);
  // Bản tiếng Anh trỏ về trang môn tiếng Anh.
  const en = new URL(buttons(itemHtml(read4('en/mon/ky-thuat-so/index.html'), 'co-pdf')).at(-1).href);
  assert.equal(en.searchParams.get('item'), 'https://bk-study-library.github.io/hcmut-library/en/mon/ky-thuat-so/#co-pdf');
});

test('mục docx, zip: không có nút Xem trước', () => {
  const html = read4('mon/ky-thuat-so/index.html');
  for (const id of ['co-docx', 'co-zip']) {
    assert.deepEqual(buttons(itemHtml(html, id)).map((x) => x.label), ['Tải xuống (2.0 MB)', 'Báo sai thông tin', 'Yêu cầu gỡ'], id);
  }
});

test('mục Markdown trong git: xem trước qua link files/ của site, tải từ files/ cùng site', () => {
  const li = itemHtml(read4('mon/ky-thuat-so/index.html'), 'tom-tat-c1');
  const b = buttons(li);
  assert.deepEqual(b.map((x) => x.label), ['Xem trước', 'Tải xuống (82 B)', 'Báo sai thông tin', 'Yêu cầu gỡ']);
  assert.equal(b[0].href, `https://up.example/xem-truoc?u=${encodeURIComponent('https://bk-study-library.github.io/hcmut-library/files/EE1009/tom-tat-c1.md')}`);
  assert.equal(b[1].href, '../../files/EE1009/tom-tat-c1.md');
  assert.match(li, /download="tom-tat-c1\.md"/);
});

test('file Release không theo dạng files-HK<xxx>: không có nút Xem trước', () => {
  const li = itemHtml(read('mon/ky-thuat-so/index.html'), 'prelab-2-tham-khao');
  assert.deepEqual(buttons(li).map((x) => x.label), ['Tải xuống (117 KB)', 'Báo sai thông tin', 'Yêu cầu gỡ']);
});

test('mục link: Mở link rồi Yêu cầu gỡ; mục đã gỡ: không có nút', () => {
  const html = read('mon/ky-thuat-so/index.html');
  assert.deepEqual(buttons(itemHtml(html, 'link-doi-tac')).map((x) => [x.cls, x.label]), [['btn', 'Mở link'], ['btn subtle', 'Báo sai thông tin'], ['btn subtle', 'Yêu cầu gỡ']]);
  const gone = itemHtml(html, 'go-bo');
  assert.deepEqual(buttons(gone), []);
  assert.doesNotMatch(gone, /class="actions"/);
  assert.match(gone, /Người gửi rút lại/);
});

test('site.json không có reviewBase thì không có nút Xem trước', () => {
  const dir = copyFixture();
  fs.writeFileSync(path.join(dir, 'catalog', 'site.json'), JSON.stringify({ uploadEndpoint: '', turnstileSiteKey: 'K' }));
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-nopv-'));
  buildSite({ root: dir, out: o });
  assert.doesNotMatch(itemHtml(fs.readFileSync(path.join(o, 'mon', 'ky-thuat-so', 'index.html'), 'utf8'), 'tom-tat-c1'), /xem-truoc/);
});

test('danh sách xem trước: chỉ Release files-HK<xxx> và .md của site, tên an toàn', async () => {
  const { previewTarget } = await import('../scripts/lib/preview.mjs');
  const o = { repo: 'a/b', site: 'https://s.example/lib/' };
  assert.ok(previewTarget('https://github.com/a/b/releases/download/files-HK261/x.pdf', o));
  // Tag thay thế (releaseTagOverrides): thêm một chữ thường.
  assert.ok(previewTarget('https://github.com/a/b/releases/download/files-HK261b/x.pdf', o));
  assert.ok(previewTarget('https://s.example/lib/files/MT1005/x.md', o));
  for (const bad of [
    'https://github.com/a/b/releases/download/files-HK261bb/x.pdf',
    'https://github.com/a/b/releases/download/files-HK261B/x.pdf',
    'https://github.com/a/b/releases/download/files-HK261-b/x.pdf',
    'https://github.com/a/b/releases/download/files-HK2611/x.pdf',
    'https://github.com/a/b/releases/download/files-HK261/x.docx',
    'https://github.com/a/b/releases/download/files-HK261/../x.pdf',
    'https://github.com/a/b/releases/download/files-HK26/x.pdf',
    'https://github.com/a/c/releases/download/files-HK261/x.pdf',
    'https://s.example/lib/files/MT1005/x.pdf',
    'https://s.example/lib/files/MT1005/sub/x.md',
    'https://s.example/lib/files/MT1005/%2e%2e/x.md',
    'javascript:alert(1)//x.pdf',
  ]) assert.equal(previewTarget(bad, o), null, bad);
});

// CSP trong thẻ meta: { chỉ thị: [nguồn] }.
function cspOf(html) {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(m, 'thiếu CSP');
  return Object.fromEntries(m[1].replace(/&#39;/g, "'").split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
}

test('CSP: mọi trang (kể cả 404 và trang chuyển hướng) có CSP chặt, đặt trước mọi script và CSS', () => {
  for (const f of allHtml()) {
    const html = fs.readFileSync(f, 'utf8');
    const csp = cspOf(html);
    assert.deepEqual(csp['default-src'], ["'self'"], f);
    assert.deepEqual(csp['style-src'], ["'self'"], f);
    assert.deepEqual(csp['img-src'], ["'self'", 'data:'], f);
    assert.deepEqual(csp['base-uri'], ["'none'"], f);
    assert.deepEqual(csp['object-src'], ["'none'"], f);
    assert.ok(!html.includes("'unsafe-inline'") && !html.includes('unsafe-eval'), f);
    const at = html.indexOf('http-equiv="Content-Security-Policy"');
    for (const tag of ['<script', '<link rel="stylesheet"']) {
      const i = html.indexOf(tag);
      if (i >= 0) assert.ok(at < i, `${f}: CSP phải đứng trước ${tag}`);
    }
    // Không có script chạy được viết thẳng trong trang (chỉ script JSON, không chạy).
    for (const s of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)) assert.match(s[1], /type="application\/json"/, f);
    assert.doesNotMatch(html, /\son[a-z]+="/i, f);
    assert.doesNotMatch(html, /\sstyle="/i, f);
  }
});

test('CSP: trang thường chỉ có self; không có Turnstile, không có địa chỉ Worker', () => {
  for (const p of ['index.html', 'en/index.html', 'faculty/EE/index.html', 'program/TEST_2019/index.html', 'course/EE1009/index.html', 'contribute/index.html', '404.html', 'course/402030/index.html']) {
    const csp = cspOf(read(p));
    assert.deepEqual(csp['script-src'], ["'self'"], p);
    assert.deepEqual(csp['connect-src'], ["'self'"], p);
    assert.deepEqual(csp['form-action'], ["'self'"], p);
    assert.equal(csp['frame-src'], undefined, p);
  }
});

test('CSP: trang Gửi tài liệu khi form mở cho Turnstile và gốc địa chỉ Worker, khi đóng thì không', () => {
  const open = cspOf(buildWithSite({ uploadEndpoint: 'https://up.example.test/submit', turnstileSiteKey: 'K' }));
  assert.deepEqual(open['script-src'], ["'self'", 'https://challenges.cloudflare.com']);
  assert.deepEqual(open['frame-src'], ['https://challenges.cloudflare.com']);
  assert.deepEqual(open['connect-src'], ["'self'", 'https://up.example.test']);
  assert.deepEqual(open['form-action'], ["'self'", 'https://up.example.test']);
  const closed = cspOf(buildWithSite({ uploadEndpoint: '', turnstileSiteKey: 'K' }));
  assert.deepEqual(closed['script-src'], ["'self'"]);
  assert.equal(closed['frame-src'], undefined);
  assert.deepEqual(closed['connect-src'], ["'self'"]);
});

// Fixture có link PDF chính thức cho TEST_2019 và một bản nháp nguồn (listed: false) cùng ngành, cùng khóa.
const outPdf = (() => {
  const dir = copyFixture();
  fs.writeFileSync(
    path.join(dir, 'catalog', 'site.json'),
    JSON.stringify({ uploadEndpoint: '', turnstileSiteKey: 'K', programPdfHosts: ['drive.google.com', '*.hcmut.edu.vn'], officialProgramsPage: 'https://hcmut.edu.vn/bang-ctdt' }),
  );
  editJson(dir, 'catalog/programs/TEST_2019.json', (p) => {
    p.ctdtUrl = 'https://drive.google.com/file/d/ctdt/view';
    p.planUrl = 'https://dee.hcmut.edu.vn/khgd.pdf';
  });
  fs.writeFileSync(
    path.join(dir, 'catalog', 'programs', 'TEST_2019_NHAP.json'),
    JSON.stringify({ code: 'TEST_2019_NHAP', name: 'Chương trình thử', faculty: 'EE', year: '2019', listed: false, blocks: [{ id: 'B1', name: 'Khối nháp', required: false, courses: ['EE1009'] }], updated: '2026-10-01' }),
  );
  editJson(dir, 'catalog/courses/EE1009.json', (c) => {
    c.programs.push({ program: 'TEST_2019_NHAP', block: 'B1', required: false });
  });
  // Đổi tên EE1010 để EE1009 là môn một mã, có trang course/EE1009/ đầy đủ.
  editJson(dir, 'catalog/courses/EE1010.json', (c) => {
    c.name = 'Thí nghiệm kỹ thuật số';
  });
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-pdf-'));
  buildSite({ root: dir, out: o });
  return o;
})();
const readPdf = (p) => fs.readFileSync(path.join(outPdf, p), 'utf8');

test('trang chương trình: nút CTĐT gốc và kế hoạch giảng dạy mở tab mới, kèm dòng ghi file do trường lưu', () => {
  const html = readPdf('program/TEST_2019/index.html');
  assert.match(
    html,
    /<p class="actions"><a class="btn" href="https:\/\/drive\.google\.com\/file\/d\/ctdt\/view" target="_blank" rel="noopener">PDF chương trình đào tạo<\/a><a class="btn" href="https:\/\/dee\.hcmut\.edu\.vn\/khgd\.pdf" target="_blank" rel="noopener">PDF kế hoạch giảng dạy<\/a><\/p><p class="muted small">PDF nằm trên trang của trường/,
  );
  // Đã có PDF của trường thì không cần link bảng CTĐT.
  assert.doesNotMatch(html, /hcmut\.edu\.vn\/bang-ctdt/);
  const en = readPdf('en/program/TEST_2019/index.html');
  assert.match(en, />Curriculum PDF<\/a>/);
  assert.match(en, />Teaching plan PDF<\/a>/);
  assert.match(en, /The PDFs are on the university site/);
});

test('trang chương trình không có link PDF: nút nhẹ tới bảng CTĐT của trường theo site.json', () => {
  const html = readPdf('program/TEST_2019_NHAP/index.html');
  assert.match(html, /<p class="actions"><a class="btn subtle" href="https:\/\/hcmut\.edu\.vn\/bang-ctdt" rel="noopener">Danh sách chương trình của trường<\/a><\/p>/);
  assert.doesNotMatch(html, /PDF nằm trên trang của trường/);
  assert.match(readPdf('en/program/TEST_2019_NHAP/index.html'), />University program list<\/a>/);
});

test('chương trình listed: false: không vào danh sách trang chủ, trang khoa; trang riêng ghi bản nháp, không lập chỉ mục', () => {
  for (const p of ['index.html', 'faculty/EE/index.html', 'en/index.html', 'en/faculty/EE/index.html']) {
    assert.doesNotMatch(readPdf(p), /program\/TEST_2019_NHAP\//, p);
    assert.match(readPdf(p), /program\/TEST_2019\//, p);
  }
  assert.match(readPdf('index.html'), /<summary><span class="prog-fac-name">Khoa Điện - Điện tử<\/span> <span class="muted small">1 chương trình<\/span><\/summary>/);
  assert.match(readPdf('faculty/EE/index.html'), /<p class="muted">1 chương trình<\/p>/);
  const draft = readPdf('program/TEST_2019_NHAP/index.html');
  assert.match(draft, /<meta name="robots" content="noindex">/);
  assert.match(draft, /Đây là bản nháp, không hiện trong danh sách\./);
  assert.match(draft, /Xem bản chính: <a href="\.\.\/\.\.\/program\/TEST_2019\/">Chương trình thử \(2019\)<\/a>/);
  assert.doesNotMatch(readPdf('program/TEST_2019/index.html'), /name="robots"/);
  // Trang môn một mã vẫn link tới bản nháp (không hỏng link), có nhãn bản nháp nguồn, trong khối gập.
  const course = readPdf('course/EE1009/index.html');
  assert.match(course, /<details class="course-progs"><summary>Có trong 2 chương trình<\/summary>/);
  assert.match(course, /<a href="\.\.\/\.\.\/program\/TEST_2019_NHAP\/">Chương trình thử \(2019\)<\/a> <span class="tag">bản nháp<\/span>/);
  assert.match(readPdf('en/course/EE1009/index.html'), /<span class="tag">draft<\/span>/);
});

test('trang khoa Môn chung toàn trường có ghi chú riêng', () => {
  const dir = copyFixture();
  editJson(dir, 'catalog/faculties.json', (f) => {
    f.faculties.push({ key: 'chung', name: { vi: 'Môn chung toàn trường', en: 'University-wide requirements' } });
  });
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-chung-'));
  buildSite({ root: dir, out: o });
  assert.match(fs.readFileSync(path.join(o, 'faculty/chung/index.html'), 'utf8'), /<div class="note" role="note"><p>Các môn và điều kiện tốt nghiệp mọi ngành đều học/);
  assert.doesNotMatch(fs.readFileSync(path.join(o, 'faculty/EE/index.html'), 'utf8'), /áp dụng cho mọi ngành/);
});

test('nhãn bấm được: khối trên trang môn trỏ tới đúng khối trên trang chương trình', () => {
  const course = readPdf('course/EE1009/index.html');
  const m = course.match(/href="([^"]*program\/TEST_2019\/)#(khoi-[a-z0-9-]+)"/);
  assert.ok(m, 'trang môn có link tới khối');
  assert.match(readPdf('program/TEST_2019/index.html'), new RegExp(`<section class="block" id="${m[2]}"`));
  assert.match(read('mon/ky-thuat-so/index.html'), /<section class="group" id="loai-[a-z-]+"/);
});

test('ô tìm trang chủ: có danh sách chương trình, chỉ gồm chương trình được liệt kê', () => {
  const progs = JSON.parse(read('assets/programs.json'));
  assert.ok(progs.some((p) => p.code === 'TEST_2019'));
  for (const p of progs) {
    assert.deepEqual(Object.keys(p).filter((k) => !['code', 'name', 'nameEn', 'year', 'variant', 'type', 'major', 'majorName', 'faculty', 'courses'].includes(k)), []);
    assert.equal(typeof p.courses, 'number');
  }
  const home = read('index.html');
  assert.match(home, /id="q-prog" hidden/);
  assert.ok(home.indexOf('id="q-prog"') < home.indexOf('id="q-status"'));
});

test('tên giảng viên trên tài liệu mở ô tìm ở trang chủ', () => {
  const dir = copyFixture();
  const itemsDir = path.join(dir, 'courses', 'EE1009', 'items');
  const f = fs.readdirSync(itemsDir).find((x) => x.endsWith('.json'));
  editJson(dir, `courses/EE1009/items/${f}`, (it) => {
    if (!it.removed) it.teacher = 'Nguyễn Văn Thử';
  });
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-gv-'));
  buildSite({ root: dir, out: o });
  const html = fs.readFileSync(path.join(o, 'mon/ky-thuat-so/index.html'), 'utf8');
  if (html.includes('Nguyễn Văn Thử')) assert.match(html, /href="\.\.\/\.\.\/\?q=Nguy%E1%BB%85n%20V%C4%83n%20Th%E1%BB%AD">Nguyễn Văn Thử<\/a>/);
});

const SITE = 'https://bk-study-library.github.io/hcmut-library/';

test('ô tìm trang chủ: items.json chỉ có mục chưa gỡ, mới thêm trước, link tới mục trên trang môn', () => {
  const docs = JSON.parse(read('assets/items.json'));
  assert.deepEqual(docs.map((d) => d.id), ['tom-tat-c1', 'link-doi-tac', 'prelab-2-tham-khao']);
  const allowed = ['id', 'course', 'code', 'courseName', 'courseNameEn', 'faculty', 'title', 'description', 'type', 'term', 'examKind', 'chapter', 'teacher', 'added', 'url'];
  for (const d of docs) assert.deepEqual(Object.keys(d).filter((k) => !allowed.includes(k)), [], d.id);
  // Link tới trang môn theo tên; tên môn là tên của môn theo tên.
  assert.deepEqual(docs[0], {
    id: 'tom-tat-c1', course: 'EE1009', code: 'EE1009', courseName: 'Kỹ thuật số', faculty: 'EE', title: 'Tóm tắt chương 1', type: 'summary', term: 'HK251', added: '2026-10-01', url: 'mon/ky-thuat-so/#tom-tat-c1',
  });
  assert.equal(docs.find((d) => d.id === 'link-doi-tac').url, 'mon/ky-thuat-so/#link-doi-tac');
  // Link trỏ tới đúng mục có trên trang môn.
  for (const d of docs) assert.match(read(d.url.replace(/#.*/, 'index.html')), new RegExp(`<li class="item[^"]*" id="${d.id}"[^>]*>`));
  // Không đưa file chỉ web dùng vào v1/.
  assert.ok(!fs.existsSync(path.join(out, 'v1', 'items.json')));
});

test('items.json: mô tả dài bị cắt theo docDescriptionMax ở ranh giới từ', async () => {
  const { truncate } = await import('../scripts/site/html.mjs');
  const { docIndex } = await import('../scripts/site/data.mjs');
  assert.equal(truncate('ngắn', 20), 'ngắn');
  assert.equal(truncate('một hai ba bốn năm sáu bảy tám', 16), 'một hai ba...');
  assert.ok(truncate('x'.repeat(50), 20).length <= 20);
  const courses = new Map([['A1', { id: 'A1', code: 'A1', name: 'Môn', faculty: 'f' }]]);
  const items = [
    { id: 'a', course: 'A1', type: 'notes', title: 'A', description: 'chữ '.repeat(100), lang: 'vi', added: '2026-01-01', removed: false },
    { id: 'b', course: 'A1', type: 'notes', title: 'B', lang: 'vi', added: '2026-02-01', removed: true },
    { id: 'c', course: 'ZZ', type: 'notes', title: 'C', lang: 'vi', added: '2026-02-01', removed: false },
  ];
  const rows = docIndex(items, courses, { descriptionMax: 40 });
  assert.deepEqual(rows.map((r) => r.id), ['a']);
  assert.ok(rows[0].description.length <= 40 && rows[0].description.endsWith('...'));
});

test('trang chủ: ô lọc tài liệu có nhãn, chỉ gồm giá trị có trong items.json; nạp search-docs.js trước search.js', () => {
  const html = read('index.html');
  assert.match(html, /<label for="q-type">Loại tài liệu<\/label><select id="q-type"><option value="">Mọi loại<\/option><option value="summary">Tóm tắt<\/option><option value="prelab-reference">Prelab tham khảo<\/option><option value="link">Link<\/option><\/select>/);
  assert.match(html, /<label for="q-term">Học kỳ<\/label><select id="q-term"><option value="">Mọi học kỳ<\/option><option value="HK251">HK251<\/option><\/select>/);
  // Fixture không có mục nào ghi kỳ thi: không có ô này.
  assert.doesNotMatch(html, /id="q-kind"/);
  assert.match(html, /<div id="q-docs" hidden>\s*<h2 class="results-head">Tài liệu<\/h2>/);
  assert.ok(html.indexOf('id="q-prog"') < html.indexOf('id="q-docs"') && html.indexOf('id="q-docs"') < html.indexOf('id="q-status"'));
  assert.ok(html.indexOf('search-core.js') < html.indexOf('search-docs.js') && html.indexOf('search-docs.js') < html.indexOf('assets/search.js'));
  const strings = JSON.parse(html.match(/<script type="application\/json" id="search-strings">([^<]*)<\/script>/)[1]);
  assert.equal(strings.docs.max, 10);
  assert.deepEqual(strings.docs.types.summary, ['Tóm tắt', 'Summaries']);
  const en = read('en/index.html');
  assert.match(en, /<label for="q-type">Material type<\/label>/);
  assert.deepEqual(JSON.parse(en.match(/id="search-strings">([^<]*)</)[1]).docs.types.summary, ['Summaries', 'Tóm tắt']);
});

test('trang chủ: có mục ghi kỳ thi thì có ô Kỳ thi', () => {
  const dir = copyFixture();
  editJson(dir, 'courses/EE1009/items/tom-tat-c1.json', (it) => {
    it.type = 'exam-past';
    it.examKind = 'ck';
  });
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-ky-'));
  buildSite({ root: dir, out: o });
  const html = fs.readFileSync(path.join(o, 'index.html'), 'utf8');
  assert.match(html, /<label for="q-kind">Kỳ thi<\/label><select id="q-kind"><option value="">Mọi kỳ thi<\/option><option value="ck">Cuối kỳ<\/option><\/select>/);
  assert.match(fs.readFileSync(path.join(o, 'en/index.html'), 'utf8'), /<option value="ck">Final<\/option>/);
});

const metaOf = (html, attr, key) => {
  const m = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`));
  return m ? m[1] : null;
};

test('mọi trang có canonical tuyệt đối, Open Graph và Twitter card; 404 không có canonical', () => {
  for (const f of allHtml()) {
    const html = fs.readFileSync(f, 'utf8');
    if (html.includes('http-equiv="refresh"')) continue;
    const rel = path.relative(out, f).split(path.sep).join('/');
    const url = SITE + rel.replace(/(^|\/)index\.html$/, '$1');
    if (rel === '404.html') {
      assert.doesNotMatch(html, /rel="canonical"/);
      assert.match(html, /<meta name="robots" content="noindex">/);
      assert.equal(metaOf(html, 'property', 'og:url'), null);
    } else {
      assert.match(html, new RegExp(`<link rel="canonical" href="${url.replace(/[.?]/g, '\\$&')}">`), rel);
      assert.equal(metaOf(html, 'property', 'og:url'), url, rel);
    }
    for (const k of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:locale', 'og:image']) assert.ok(metaOf(html, 'property', k), `${rel}: ${k}`);
    assert.equal(metaOf(html, 'property', 'og:locale'), rel.startsWith('en/') ? 'en_US' : 'vi_VN', rel);
    assert.equal(metaOf(html, 'property', 'og:image'), `${SITE}assets/social-preview.png`);
    assert.equal(metaOf(html, 'name', 'twitter:card'), 'summary_large_image', rel);
  }
  assert.ok(fs.existsSync(path.join(out, 'assets', 'social-preview.png')));
  assert.equal(metaOf(read('index.html'), 'property', 'og:image:width'), '1280');
  assert.equal(metaOf(read('index.html'), 'property', 'og:image:height'), '640');
});

test('trang môn: og:title, description ghi tên môn và số tài liệu', () => {
  const html = read('mon/ky-thuat-so/index.html');
  assert.equal(metaOf(html, 'property', 'og:title'), 'Kỹ thuật số');
  const desc = metaOf(html, 'name', 'description');
  assert.match(desc, /^Kỹ thuật số: 3 tài liệu/);
  assert.equal(metaOf(html, 'property', 'og:description'), desc);
  assert.match(metaOf(read('en/mon/ky-thuat-so/index.html'), 'name', 'description'), /: 3 items/);
  assert.equal(metaOf(read('course/400111/index.html'), 'property', 'og:title'), '400111 Môn cũ đã ngừng');
  assert.match(metaOf(read('course/400111/index.html'), 'name', 'description'), /chưa có tài liệu/);
});

test('hreflang vi, en, x-default tuyệt đối khi trang có cả hai bản; trang Gửi tài liệu chỉ có tiếng Việt thì không', () => {
  for (const [p, vi, en] of [
    ['mon/ky-thuat-so/index.html', 'mon/ky-thuat-so/', 'en/mon/ky-thuat-so/'],
    ['en/course/400111/index.html', 'course/400111/', 'en/course/400111/'],
    ['index.html', '', 'en/'],
    ['en/takedown/index.html', 'takedown/', 'en/takedown/'],
  ]) {
    const html = read(p);
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="vi" href="${SITE}${vi}">`), p);
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="en" href="${SITE}${en}">`), p);
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="x-default" href="${SITE}${vi}">`), p);
  }
  assert.doesNotMatch(read('gui-tai-lieu/index.html'), /<link rel="alternate"/);
  assert.doesNotMatch(read('404.html'), /<link rel="alternate"/);
});

test('trang chuyển hướng: canonical tuyệt đối tới trang của môn', () => {
  assert.match(read('course/402030/index.html'), new RegExp(`<link rel="canonical" href="${SITE}mon/ky-thuat-so/">`));
  assert.match(read('en/course/402030/index.html'), new RegExp(`<link rel="canonical" href="${SITE}en/mon/ky-thuat-so/">`));
});

test('robots.txt cho phép mọi trang, trỏ tới sitemap.xml', () => {
  assert.equal(read('robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
});

test('sitemap.xml: mọi trang thật, địa chỉ tuyệt đối, lastmod theo dữ liệu; không có 404, trang chuyển hướng, trang noindex', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const p of ['', 'en/', 'mon/ky-thuat-so/', 'en/mon/ky-thuat-so/', 'course/400111/', 'faculty/EE/', 'program/TEST_2019/', 'contribute/', 'gui-tai-lieu/']) assert.ok(locs.includes(SITE + p), p);
  for (const l of locs) assert.ok(l.startsWith(SITE), l);
  // Trang chuyển hướng (mã cũ, mã thuộc môn nhiều mã) không vào sitemap.
  assert.ok(!locs.some((l) => /404|course\/402030\/|course\/EE1009\/|course\/EE1010\//.test(l)));
  assert.deepEqual(locs, [...locs].sort());
  // Mọi trang HTML có trong sitemap, trừ 404 và trang chuyển hướng.
  const pages = allHtml().map((f) => path.relative(out, f).split(path.sep).join('/')).filter((p) => p !== '404.html' && !read(p).includes('http-equiv="refresh"') && !read(p).includes('content="noindex"'));
  assert.equal(locs.length, pages.length);
  assert.match(xml, new RegExp(`<url><loc>${SITE}mon/ky-thuat-so/</loc><lastmod>2026-10-01</lastmod></url>`));
  // Chương trình listed: false không vào sitemap.
  const draft = fs.readFileSync(path.join(outPdf, 'sitemap.xml'), 'utf8');
  assert.doesNotMatch(draft, /TEST_2019_NHAP/);
  assert.match(draft, /program\/TEST_2019\//);
});

test('site.json không có socialImage thì không ghi og:image, Twitter card dạng summary', () => {
  const dir = copyFixture();
  fs.writeFileSync(path.join(dir, 'catalog', 'site.json'), JSON.stringify({ uploadEndpoint: '', turnstileSiteKey: 'K' }));
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-noimg-'));
  buildSite({ root: dir, out: o });
  const html = fs.readFileSync(path.join(o, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /og:image/);
  assert.equal(metaOf(html, 'name', 'twitter:card'), 'summary');
  assert.ok(metaOf(html, 'property', 'og:title'));
});

// ---------- Ngành, lộ trình theo học kỳ: dựng web từ dữ liệu CTĐT đã nhập (test/fixtures/ctdt) ----------
const outM = (() => {
  const dir = freshRoot();
  importFixture(dir);
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-major-'));
  buildSite({ root: dir, out: o });
  return o;
})();
const readM = (p) => fs.readFileSync(path.join(outM, p), 'utf8');
const mainOf = (html) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));

test('trang ngành: mã ngành, nút PDF và Sổ tay, bộ chọn loại và khóa, lộ trình theo học kỳ', () => {
  const html = mainOf(readM('major/7520103/index.html'));
  assert.match(html, /<h1>Kỹ thuật Cơ khí<\/h1><p class="muted">Mã ngành 7520103, <a href="\.\.\/\.\.\/faculty\/fme\/">Khoa Cơ khí<\/a>, 3 chương trình<\/p>/);
  // Nút theo chương trình chính (khóa mới nhất có học kỳ đề xuất, loại tiêu chuẩn), rồi Sổ tay.
  assert.match(html, /href="https:\/\/drive\.google\.com\/file\/d\/ghi-tay\/view" target="_blank" rel="noopener">PDF chương trình đào tạo/);
  assert.match(html, /href="https:\/\/drive\.google\.com\/file\/d\/khgd-ck-2024\/view" target="_blank" rel="noopener">PDF kế hoạch giảng dạy/);
  assert.match(html, /<a class="btn subtle" href="https:\/\/hcmut\.edu\.vn\/study\/handbook\/course\/undergraduate\/7520103\?program=CQ" rel="noopener">Xem ngành trên Sổ tay HCMUT<\/a>/);
  assert.match(html, /<a class="chip" href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2024\/" title="[^"]+" aria-current="true">CQ<\/a><a class="chip" href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2025_CTTA\/" title="[^"]+">CTTA<\/a>/);
  assert.match(html, /<a class="chip" href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2024\/" aria-current="true">2024<\/a><a class="chip" href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2019\/">2019<\/a>/);
  assert.match(html, /Theo chương trình Khóa 2024, CQ\./);
  // Học kỳ 1 đến N theo thứ tự, mỗi kỳ một bảng; môn chưa có học kỳ gập theo vai trò khối.
  const at = (s) => html.indexOf(s);
  assert.ok(at('id="hoc-ky-1"') > 0 && at('id="hoc-ky-1"') < at('id="hoc-ky-2"') && at('id="hoc-ky-2"') < at('id="hoc-ky-3"') && at('id="hoc-ky-3"') < at('id="hoc-ky-4"'));
  const hk1 = html.slice(at('id="hoc-ky-1"'), at('id="hoc-ky-2"'));
  assert.match(hk1, /<h3>Học kỳ 1 <span class="muted small">2 môn<\/span><\/h3>/);
  assert.match(hk1, /course\/MT1003\//);
  assert.match(hk1, /course\/PH1003\//);
  const rest = html.slice(at('<h3>Chưa có học kỳ đề xuất</h3>'));
  assert.ok(rest.indexOf('<summary>Cơ sở ngành <span class="muted small">1 môn</span></summary>') < rest.indexOf('<summary>Giáo dục thể chất'));
  assert.match(rest, /course\/ME3239\//);
  assert.match(rest, /course\/PE1009\//);
  assert.match(html, /<a class="btn" href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2024\/">Xem đủ khối kiến thức<\/a>/);
  assert.match(readM('en/major/7520103/index.html'), /<h1>Mechanical Engineering<\/h1>/);
  assert.match(readM('en/major/7520103/index.html'), /<h3>Semester 1 <span class="muted small">2 courses<\/span><\/h3>/);
});

test('trang ngành chưa có danh sách môn: thông báo, nút gửi CTĐT; mã song ngành có dấu + thành dấu gạch ngang', () => {
  const html = mainOf(readM('major/7520201-7520207/index.html'));
  assert.match(html, /Chưa có danh sách môn\. Gửi chương trình đào tạo của khóa bạn để thêm vào\./);
  assert.match(html, /<a class="btn primary" href="[^"]*them-chuong-trinh\.yml[^"]*" rel="noopener">Thêm chương trình đào tạo<\/a>/);
  assert.match(readM('sitemap.xml'), /major\/7520103\/<\/loc>/);
});

test('trang chương trình gắn ngành: bộ chọn khóa, ngành trong meta và đường dẫn, lộ trình rồi khối kiến thức', () => {
  const html = mainOf(readM('program/FME_KY_THUAT_CO_KHI_2024/index.html'));
  assert.match(html, /<li><a href="\.\.\/\.\.\/major\/7520103\/">Kỹ thuật Cơ khí<\/a><\/li><li aria-current="page">Khóa 2024, CQ<\/li>/);
  assert.match(html, /Ngành <a href="\.\.\/\.\.\/major\/7520103\/">Kỹ thuật Cơ khí<\/a>, Cử nhân, 132 tín chỉ, 7 môn<\/p>/);
  assert.match(html, /<p class="small" lang="vi">Đã đối chiếu PDF\.<\/p>/);
  assert.match(html, /<a class="chip" href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2024\/" aria-current="page">2024<\/a>/);
  assert.ok(html.indexOf('<h2 id="h-road">Lộ trình theo học kỳ</h2>') < html.indexOf('<h2 id="h-blocks">Khối kiến thức</h2>'));
  assert.match(html, /<section class="block" id="khoi-k01"><h3>A\.1\. TOÁN <span class="muted small">bắt buộc, cần 15 tín chỉ<\/span><\/h3>/);
  assert.match(html, /<h3>H\.1\. GIÁO DỤC THỂ CHẤT HỌC PHẦN 1 <span class="muted small">tự chọn, chọn 1 môn<\/span><\/h3>/);
  // Khối đã là từng học kỳ (chỉ có kế hoạch giảng dạy): không thêm lộ trình riêng, khối không ghi bắt buộc hay tự chọn.
  const k19 = mainOf(readM('program/FME_KY_THUAT_CO_KHI_2019/index.html'));
  assert.doesNotMatch(k19, /id="h-road"/);
  assert.match(k19, /<h2 id="h-blocks">Lộ trình theo học kỳ<\/h2><section class="block" id="khoi-k01"><h3>Học kỳ 1<\/h3>/);
  assert.match(mainOf(readM('en/program/FME_KY_THUAT_CO_KHI_2025_CTTA/index.html')), /title="English-taught Undergraduate Program">CTTA</);
});

test('trang chủ: khoa rồi ngành, mỗi ngành một dòng có nhãn loại và các khóa; chương trình chưa có môn gập lại', () => {
  const html = readM('index.html');
  assert.match(html, /<summary><span class="prog-fac-name">Khoa Cơ khí<\/span> <span class="muted small">1 ngành, 3 chương trình<\/span><\/summary>/);
  assert.match(
    html,
    /<li class="major-row"><span class="major-head"><a class="major-name" href="\.\/major\/7520103\/">Kỹ thuật Cơ khí<\/a><a class="tag" href="\.\/\?q=CQ" title="[^"]+">CQ<\/a><a class="tag" href="\.\/\?q=CTTA" title="[^"]+">CTTA<\/a><\/span><span class="muted small">Khóa: <a href="\.\/program\/FME_KY_THUAT_CO_KHI_2025_CTTA\/">2025<\/a>, <a href="\.\/program\/FME_KY_THUAT_CO_KHI_2024\/">2024<\/a>, <a href="\.\/program\/FME_KY_THUAT_CO_KHI_2019\/">2019<\/a><\/span><\/li>/,
  );
  assert.match(html, /<details class="prog-empty"><summary>1 chương trình chưa có danh sách môn<\/summary><ul class="list"><li><a href="\.\/program\/CSE_TS_106_2026\/">/);
  assert.match(html, /major-name" href="\.\/major\/7520201-7520207\/">[^<]+<\/a><a class="tag" href="\.\/\?q=SN" title="[^"]+">SN<\/a><\/span><span class="muted small">chưa có danh sách môn<\/span>/);
});

test('trang khoa: ngành trước, rồi Môn của khoa và Môn chung khoa dùng; trang Môn chung toàn trường liệt kê môn chung', () => {
  const html = mainOf(readM('faculty/fme/index.html'));
  const at = (s) => html.indexOf(s);
  assert.ok(at('<h2>Ngành của khoa</h2>') > 0 && at('<h2>Ngành của khoa</h2>') < at('<h2>Môn của khoa</h2>'));
  assert.ok(at('<h2>Môn của khoa</h2>') < at('<h2>Môn chung khoa dùng</h2>'));
  const own = html.slice(at('<h2>Môn của khoa</h2>'), at('<h2>Môn chung khoa dùng</h2>'));
  const shared = html.slice(at('<h2>Môn chung khoa dùng</h2>'));
  assert.match(own, /course\/ME2045\//);
  assert.doesNotMatch(own, /course\/MT1003\//);
  assert.match(shared, /<p class="muted">4 môn\. Danh sách đủ ở trang <a href="\.\.\/\.\.\/faculty\/chung\/">Môn chung toàn trường<\/a>\.<\/p>/);
  for (const id of ['MT1003', 'PH1003', 'LA1003', 'PE1009']) assert.match(shared, new RegExp(`course/${id}/`), id);
  const chung = mainOf(readM('faculty/chung/index.html'));
  assert.match(chung, /<div class="note" role="note"><p>Các môn và điều kiện tốt nghiệp mọi ngành đều học/);
  assert.match(chung, /course\/MT1003\//);
  assert.doesNotMatch(chung, /Môn chung khoa dùng/);
  // Khóa cũ (flc, movedTo: chung): trang ngắn chuyển tới Môn chung toàn trường, không có trong trang chủ.
  assert.match(readM('faculty/flc/index.html'), /<meta http-equiv="refresh" content="0; url=\.\.\/chung\/">[\s\S]*Đang chuyển tới <a href="\.\.\/chung\/">Môn chung toàn trường<\/a>\./);
  assert.doesNotMatch(readM('index.html'), /faculty\/flc\/|Trung tâm Ngoại ngữ/);
});

test('trang môn: link Sổ tay, chương trình gom theo ngành với link tới khối (gập lại)', () => {
  const html = mainOf(readM('course/MT1003/index.html'));
  assert.match(html, /<details class="course-progs"><summary>Có trong \d+ chương trình<\/summary>/);
  assert.match(html, /<dt>Sổ tay HCMUT<\/dt><dd><a href="https:\/\/hcmut\.edu\.vn\/study\/handbook\/subject\/MT1003" rel="noopener">Trang môn trên Sổ tay HCMUT<\/a><\/dd>/);
  assert.match(
    html,
    /<a href="\.\.\/\.\.\/major\/7520103\/">Kỹ thuật Cơ khí<\/a>: <a href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2025_CTTA\/#khoi-k01">2025 CTTA<\/a>, <a href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2024\/#khoi-k01">2024<\/a>, <a href="\.\.\/\.\.\/program\/FME_KY_THUAT_CO_KHI_2019\/#khoi-k01">2019<\/a>/,
  );
});

test('ô tìm trang chủ: programs.json có dòng ngành (kind major) và chương trình ghi mã ngành', () => {
  const rows = JSON.parse(readM('assets/programs.json'));
  const major = rows.find((r) => r.kind === 'major' && r.code === '7520103');
  assert.deepEqual(major, { kind: 'major', code: '7520103', key: '7520103', name: 'Kỹ thuật Cơ khí', nameEn: 'Mechanical Engineering', faculty: 'fme', types: ['CQ', 'CTTA'], programs: 3 });
  assert.equal(rows.find((r) => r.code === 'FME_KY_THUAT_CO_KHI_2024').major, '7520103');
  assert.ok(rows.findIndex((r) => r.kind === 'major') < rows.findIndex((r) => !r.kind));
});

test('nhãn loại chương trình là link mở ô tìm trang chủ (?q=<loại>) ở mọi trang có nhãn', () => {
  const pages = ['index.html', 'faculty/fme/index.html', 'major/7520103/index.html', 'program/FME_KY_THUAT_CO_KHI_2025_CTTA/index.html', 'en/index.html', 'en/major/7520103/index.html'];
  const labels = /(Tiêu chuẩn|Tiếng Anh|Song ngành|Chương trình tiêu chuẩn|Dạy và học bằng tiếng Anh|Standard|In English|Taught in English|Standard program)/;
  for (const p of pages) {
    const html = mainOf(readM(p));
    assert.doesNotMatch(html, new RegExp('<span class="tag">' + labels.source + '<'), p);
  }
  assert.match(mainOf(readM('major/7520103/index.html')), /<a class="tag" href="\.\.\/\.\.\/\?q=CTTA" title="[^"]+">CTTA<\/a>/);
  assert.match(mainOf(readM('program/FME_KY_THUAT_CO_KHI_2025_CTTA/index.html')), /<a class="tag" href="\.\.\/\.\.\/\?q=CTTA" title="[^"]+">CTTA<\/a>/);
  assert.match(mainOf(readM('en/major/7520103/index.html')), /<a class="tag" href="\.\.\/\.\.\/\.\.\/en\/\?q=CTTA" title="[^"]+">CTTA<\/a>/);
  assert.match(mainOf(readM('faculty/fme/index.html')), /<a class="tag" href="\.\.\/\.\.\/\?q=CQ" title="[^"]+">CQ<\/a>/);
  // Ô tìm khớp mã loại: chương trình có type, ngành có types.
  const rows = JSON.parse(readM('assets/programs.json'));
  assert.equal(rows.find((r) => r.code === 'FME_KY_THUAT_CO_KHI_2025_CTTA').type, 'CTTA');
  assert.ok(fs.readFileSync(path.join(outM, 'assets', 'search.js'), 'utf8').includes('p.type'));
});

test('thẻ tài liệu: khối chi tiết đủ thông tin; nhiều file thì mỗi file có định dạng, cỡ và nút riêng', () => {
  const dir = copyFixture();
  fs.writeFileSync(path.join(dir, 'catalog', 'site.json'), JSON.stringify({ uploadEndpoint: '', turnstileSiteKey: 'K', reviewBase: 'https://up.example' }));
  const rel = (name) => `https://github.com/bk-study-library/hcmut-library/releases/download/files-HK261/${name}`;
  fs.writeFileSync(path.join(dir, 'courses', 'EE1009', 'items', 'de-thi.json'), JSON.stringify({
    id: 'de-thi', course: 'EE1009', type: 'exam-past', title: 'Đề cuối kỳ', lang: 'vi', term: 'HK241', examKind: 'ck', chapter: '3', teacher: 'Nguyễn Văn Thử',
    authors: ['Bạn A'], license: 'CC-BY-SA-4.0', origin: 'self-made', source: 'Tự soạn',
    files: [
      { name: 'de.pdf', size: 265216, sha256: '5'.repeat(64), url: rel('de.pdf') },
      { name: 'dap-an.docx', size: 2048, sha256: '6'.repeat(64), url: rel('dap-an.docx') },
    ],
    added: '2026-09-01', updated: '2026-10-02', removed: false,
  }));
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-facts-'));
  buildSite({ root: dir, out: o });
  const li = itemHtml(fs.readFileSync(path.join(o, 'mon', 'ky-thuat-so', 'index.html'), 'utf8'), 'de-thi');
  const facts = Object.fromEntries([...li.matchAll(/<dt>([^<]+)<\/dt><dd>(.*?)<\/dd>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')]));
  assert.deepEqual(facts, {
    'Mã môn': 'EE1009 CQ',
    'Định dạng': 'PDF, DOCX',
    'Dung lượng': '261 KB',
    'Ngày tải lên': '01/09/2026',
    'Ngày cập nhật': '02/10/2026',
    'Loại tài liệu': 'Đề cũ',
    'Học kỳ': 'HK241',
    'Loại kiểm tra': 'Cuối kỳ',
    'Chương': '3',
    'Giảng viên': 'Nguyễn Văn Thử',
    'Người gửi': 'Bạn A',
    'Ngôn ngữ': 'Tiếng Việt',
    'Giấy phép': 'CC-BY-SA-4.0',
    'Nguồn': 'Tự soạn',
  });
  // Mỗi file một dòng: tên, định dạng và cỡ, nút riêng; hàng nút cuối chỉ còn Báo sai thông tin và Yêu cầu gỡ.
  assert.match(li, /<ul class="files"><li><span class="file-name">de\.pdf<\/span> <span class="muted">PDF, 259 KB<\/span><p class="actions"><a class="btn" href="https:\/\/up\.example\/xem-truoc[^"]*"[^>]*>Xem trước de\.pdf<\/a><a class="btn" href="[^"]*de\.pdf" rel="noopener">Tải xuống de\.pdf \(259 KB\)<\/a><\/p><\/li>/);
  assert.match(li, /<span class="file-name">dap-an\.docx<\/span> <span class="muted">DOCX, 2 KB<\/span><p class="actions"><a class="btn" href="[^"]*dap-an\.docx" rel="noopener">Tải xuống dap-an\.docx \(2 KB\)<\/a><\/p>/);
  assert.deepEqual(buttons(li.slice(li.indexOf('</ul>'))).map((x) => x.label), ['Báo sai thông tin', 'Yêu cầu gỡ']);
  // Bản tiếng Anh: nhãn tiếng Anh.
  const en = itemHtml(fs.readFileSync(path.join(o, 'en', 'mon', 'ky-thuat-so', 'index.html'), 'utf8'), 'de-thi');
  assert.match(en, /<dt>Format<\/dt><dd>PDF, DOCX<\/dd>/);
  assert.match(en, /<dt>Language<\/dt><dd>Vietnamese<\/dd>/);
  // Tài liệu mới ở trang chủ: định dạng cạnh cỡ.
  assert.match(fs.readFileSync(path.join(o, 'index.html'), 'utf8'), /<span class="muted recent-meta">Đề cũ, PDF, DOCX, 261 KB<\/span>/);
});

test('định dạng file theo đuôi: bảng FILE_FORMATS, đuôi lạ ghi chữ hoa', async () => {
  const { fileFormat } = await import('../scripts/lib/labels.mjs');
  assert.equal(fileFormat('a.PDF'), 'PDF');
  assert.equal(fileFormat('b.jpeg'), 'JPG');
  assert.equal(fileFormat('c.md'), 'MD');
  assert.equal(fileFormat('d.tex'), 'TEX');
  assert.equal(fileFormat('khong-duoi'), '');
});

test('bảng môn: môn có tài liệu trước; bảng dài gập môn chưa có tài liệu; tập môn không đổi', () => {
  const build = (site) => {
    const dir = copyFixture();
    fs.writeFileSync(path.join(dir, 'catalog', 'site.json'), JSON.stringify({ uploadEndpoint: '', turnstileSiteKey: 'K', ...site }));
    const course = (id, name) => ({ id, code: id, name, credits: 3, faculty: 'EE', aliases: [], status: 'active', programs: [], parts: [], related: [], updated: '2026-10-01' });
    fs.writeFileSync(path.join(dir, 'catalog', 'courses', 'EE0001.json'), JSON.stringify(course('EE0001', 'Môn A chưa có')));
    fs.writeFileSync(path.join(dir, 'catalog', 'courses', 'EE0003.json'), JSON.stringify(course('EE0003', 'Môn B chưa có')));
    const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-docs-first-'));
    buildSite({ root: dir, out: o });
    return fs.readFileSync(path.join(o, 'faculty', 'EE', 'index.html'), 'utf8');
  };
  const codes = (html) => [...html.matchAll(/<th scope="row"><a href="[^"]+">([^<]+)<\/a>/g)].map((m) => m[1]);
  // Không cấu hình: một bảng, môn có tài liệu (EE1009, EE1010) trước môn chưa có (EE0001, EE0003).
  const flat = build({});
  assert.deepEqual(codes(flat), ['EE1009', 'EE1010', 'EE0001', 'EE0003']);
  assert.doesNotMatch(flat, /class="no-docs"/);
  // Từ 3 môn: môn chưa có tài liệu gập lại; cùng tập môn, cùng thứ tự.
  const folded = build({ noDocsCollapseMin: 3 });
  assert.deepEqual(codes(folded), codes(flat));
  assert.match(folded, /<details class="no-docs"><summary>Môn chưa có tài liệu \(2\)<\/summary><div class="table-wrap">/);
  const before = folded.slice(0, folded.indexOf('class="no-docs"'));
  assert.deepEqual(codes(before), ['EE1009', 'EE1010']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'catalog', 'site.json'), 'utf8')).noDocsCollapseMin, 20);
});

test('items.json: tài liệu của môn sau đại học ghi levels cho ô Bậc; môn đại học thì không', async () => {
  const { docIndex } = await import('../scripts/site/data.mjs');
  const courses = new Map([
    ['A1', { id: 'A1', code: 'A1', name: 'Môn', faculty: 'f' }],
    ['B1', { id: 'B1', code: 'B1', name: 'Môn sau đại học', faculty: 'f', levels: ['thac-si'] }],
    ['C1', { id: 'C1', code: 'C1', name: 'Môn chung', faculty: 'f', levels: ['dai-hoc'] }],
  ]);
  const items = ['A1', 'B1', 'C1'].map((course) => ({ id: `x-${course.toLowerCase()}`, course, type: 'notes', title: course, lang: 'vi', added: '2026-01-01', removed: false }));
  const rows = Object.fromEntries(docIndex(items, courses).map((r) => [r.course, r]));
  assert.equal(rows.A1.levels, undefined);
  assert.deepEqual(rows.B1.levels, ['thac-si']);
  assert.equal(rows.C1.levels, undefined);
});

test('trang chủ: không có môn, chương trình sau đại học thì không có ô Bậc', () => {
  assert.doesNotMatch(read('index.html'), /id="q-level"/);
});

test('mọi trang có icon: SVG, PNG 32 px và apple-touch-icon, file có thật', () => {
  for (const f of ['assets/favicon.svg', 'assets/favicon-32.png', 'assets/apple-touch-icon.png']) assert.ok(fs.existsSync(path.join(out, f)), f);
  for (const p of ['index.html', 'en/index.html', 'gui-tai-lieu/index.html', '404.html']) {
    const html = read(p);
    assert.match(html, /<link rel="icon" href="[^"]*assets\/favicon\.svg" type="image\/svg\+xml">/, p);
    assert.match(html, /<link rel="apple-touch-icon" href="[^"]*assets\/apple-touch-icon\.png">/, p);
  }
});

test('trang chua-phan-loai/: noindex, liệt kê tài liệu có trường unclassified kèm lý do và link sửa item', () => {
  const html = read('chua-phan-loai/index.html');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<h1>Tài liệu chưa phân loại<\/h1>/);
  assert.match(read('en/chua-phan-loai/index.html'), /<h1>Unclassified material<\/h1>/);
});

test('Báo sai thông tin: mở form bao-loi.yml điền sẵn link mục và id mục trong tiêu đề', async () => {
  const { wrongInfoUrl } = await import('../scripts/site/items.mjs');
  const { state } = await import('../scripts/site/state.mjs');
  state.page = state.page ?? { path: (c) => `course/${c}/`, anchor: (it) => it.id };
  const u = new URL(wrongInfoUrl({ lang: 'vi' }, { course: 'MT1005', id: 'tom-tat' }));
  assert.equal(u.searchParams.get('template'), 'bao-loi.yml');
  assert.equal(u.searchParams.get('title'), '[Sai thông tin] MT1005 tom-tat');
  assert.match(u.searchParams.get('url'), /#tom-tat$/);
});
