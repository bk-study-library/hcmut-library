import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build-site.mjs';
import { FIXTURES, copyFixture, editJson } from './helpers.mjs';

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
    for (const p of ['index.html', 'faculty/EE/index.html', 'faculty/unknown/index.html', 'program/TEST_2019/index.html', 'course/EE1009/index.html', 'course/400111/index.html', 'contribute/index.html', 'review/index.html', 'takedown/index.html']) {
      assert.ok(fs.existsSync(path.join(out, lang, p)), lang + p);
    }
  }
  for (const p of ['404.html', 'index.json', 'index.min.json', 'assets/site.css', 'assets/search.js', '.nojekyll']) assert.ok(fs.existsSync(path.join(out, p)), p);
  assert.ok(result.pages >= 19);
});

test('trang môn: thông tin, mã cũ, tài liệu theo loại, nút đóng góp điền sẵn mã môn', () => {
  const html = read('course/EE1009/index.html');
  assert.match(html, /<html lang="vi"/);
  assert.match(html, /402030 Kỹ thuật số \(mã cũ\)/);
  assert.match(html, /Tóm tắt chương 1/);
  assert.match(html, /Prelab tham khảo/);
  assert.match(html, /Chỉ để tham khảo sau khi đã hết hạn chấm/);
  assert.match(html, /href="\.\.\/\.\.\/gui-tai-lieu\/\?course=EE1009"/);
  assert.doesNotMatch(html, /template=dong-gop-tai-lieu/);
  assert.doesNotMatch(html, /issue-to-pr/);
  assert.match(html, /issues\/new\?template=them-link\.yml&amp;course=EE1009/);
  assert.match(html, /href="\.\.\/\.\.\/en\/course\/EE1009\/"/);
  assert.match(html, /href="\.\.\/\.\.\/assets\/site\.css"/);
});

test('môn đã ngừng: có thông báo và link tới môn thay thế', () => {
  const html = read('course/400111/index.html');
  assert.match(html, /Môn này đã ngừng dạy/);
  assert.match(html, /href="\.\.\/\.\.\/course\/EE1009\/"/);
  assert.match(read('en/course/400111/index.html'), /This course is no longer taught/);
});

test('tài liệu đã gỡ: còn mục, không còn link tải', () => {
  const html = read('course/EE1010/index.html');
  assert.match(html, /Ghi chú đã gỡ/);
  assert.match(html, /Người gửi rút lại/);
});

test('mã cũ chuyển hướng tới ID cố định', () => {
  const html = read('course/402030/index.html');
  assert.match(html, /http-equiv="refresh" content="0; url=\.\.\/EE1009\/"/);
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
  for (const p of ['course/EE1010/index.html', 'course/EE1009/index.html', 'faculty/EE/index.html']) {
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
  assert.match(html, /20\.0 MB/);
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

test('trang môn tiếng Anh trỏ tới form tiếng Việt', () => {
  assert.match(read('en/course/EE1009/index.html'), /href="\.\.\/\.\.\/\.\.\/gui-tai-lieu\/\?course=EE1009"/);
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

test('trang khoa: chương trình theo khóa mới nhất trước, có số môn, nút thêm chương trình điền sẵn khoa', () => {
  const html = read3('faculty/EE/index.html');
  assert.ok(html.indexOf('Khóa 2026') < html.indexOf('Khóa 2019'));
  assert.match(html, /Chương trình thử<\/a> <span class="muted small">1 môn<\/span>/);
  assert.match(html, /Ngành tuyển sinh thử<\/a> <span class="tag">Dạy và học bằng tiếng Anh<\/span> <span class="muted small">chưa có danh sách môn<\/span>/);
  assert.match(html, /issues\/new\?template=them-chuong-trinh\.yml&amp;khoa=Khoa\+%C4%90i%E1%BB%87n\+-\+%C4%90i%E1%BB%87n\+t%E1%BB%AD"[^>]*>Thêm chương trình đào tạo</);
  assert.match(html, /<th scope="row"><a href="\.\.\/\.\.\/course\/EE1009\/">EE1009<\/a>/);
  assert.match(read3('en/faculty/EE/index.html'), /Cohort 2026/);
});

test('trang khoa chưa có dữ liệu: có thông báo, vẫn có nút thêm chương trình', () => {
  const html = read3('faculty/fx/index.html');
  assert.match(html, /Khoa này chưa có môn và chương trình nào trong thư viện\./);
  assert.match(html, /Khoa này chưa có chương trình nào\. Bạn có thể gửi CTĐT của khóa mình\./);
  assert.match(html, /Chưa có môn nào\./);
  assert.match(html, /template=them-chuong-trinh\.yml&amp;khoa=Khoa\+Th%E1%BB%AD\+R%E1%BB%97ng/);
  assert.match(read3('index.html'), /<strong>Khoa Thử Rỗng<\/strong><span class="muted">Chưa có dữ liệu<\/span>/);
});

test('trang chương trình chưa có danh sách môn: thông báo, nút gửi CTĐT điền sẵn khoa, ngành, khóa', () => {
  const html = read3('program/EE_TS_108_2026/index.html');
  assert.match(html, /<h1>Ngành tuyển sinh thử \(2026\)<\/h1>/);
  assert.match(html, /Chưa có danh sách môn\. Bạn có thể gửi CTĐT của khóa mình\./);
  assert.match(html, /template=them-chuong-trinh\.yml&amp;khoa=[^"]+&amp;nganh=Ng%C3%A0nh\+tuy%E1%BB%83n\+sinh\+th%E1%BB%AD&amp;khoa-hoc=2026"/);
  assert.match(html, /<a href="https:\/\/example\.test\/ctdt" rel="noopener">Xem CTĐT chính thức<\/a>/);
  assert.doesNotMatch(html, /<table/);
  assert.match(read3('en/program/EE_TS_108_2026/index.html'), /No course list yet/);
});

test('trang chủ: chương trình gộp theo khoa trong khối đóng mở, có nút thêm chương trình', () => {
  const html = read3('index.html');
  assert.equal((html.match(/<details class="prog-fac">/g) || []).length, 3);
  assert.match(html, /<summary><span class="prog-fac-name">Khoa Điện - Điện tử<\/span> <span class="muted small">2 chương trình<\/span><\/summary>/);
  assert.match(html, /Chương trình thử \(2019\)<\/a>/);
  assert.match(html, /template=them-chuong-trinh\.yml"/);
});

test('bảng môn: môn chưa có tài liệu ghi "chưa có"', () => {
  assert.match(read3('faculty/unknown/index.html'), /<td class="num"><span class="muted">chưa có<\/span><\/td>/);
});

test('sách tham khảo: link tìm ở nguồn hợp pháp theo site.json, ưu tiên ISBN', async () => {
  const { bookLinks } = await import('../scripts/build-site.mjs');
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
  const html = fs.readFileSync(path.join(outDir, 'course', 'EE1009', 'index.html'), 'utf8');
  assert.match(html, /href="https:\/\/openlibrary\.org\/isbn\/9780134549897"/);
  assert.match(html, /Tra trên Open Library/);
});
