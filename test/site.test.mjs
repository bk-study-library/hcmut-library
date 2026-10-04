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

test('trang Gửi tài liệu: đuôi file theo loại lấy từ policy (.zip chỉ cho gói quiz)', () => {
  const html = buildWithSite({ uploadEndpoint: '', turnstileSiteKey: 'K' });
  const cfg = JSON.parse(html.match(/<script type="application\/json" id="upload-config">([^<]*)<\/script>/)[1]);
  assert.ok(cfg.byType['quiz-pack'].includes('.zip'));
  assert.ok(!cfg.byType.summary.includes('.zip'));
  assert.ok(cfg.byType.summary.includes('.pdf'));
  assert.match(html, /File \.zip chỉ dùng cho Gói quiz \(Study Pack\)\./);
  assert.doesNotMatch(html, /Nhiều file thì nén thành \.zip/);
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
  // Ghi chú, rồi một hàng nút: gửi CTĐT (nút chính), link nguồn dạng nút, bảng CTĐT của trường (nút nhẹ).
  assert.match(
    html,
    /<\/div><p class="actions"><a class="btn primary" href="[^"]+" rel="noopener">Thêm chương trình đào tạo<\/a><a class="btn" href="https:\/\/example\.test\/ctdt" rel="noopener">Xem CTĐT chính thức<\/a><a class="btn subtle" href="https:\/\/hcmut\.edu\.vn\/bai-viet\/chuong-trinh-dao-tao-tu-khoa-2019" rel="noopener">Bảng CTĐT của trường<\/a><\/p>/,
  );
  // Dòng meta đọc tự nhiên: "Mã ..., khoa, ..., chưa có danh sách môn", không ghi "0 môn".
  assert.match(html, /<p class="muted">Mã EE_TS_108_2026, <a href="\.\.\/\.\.\/faculty\/EE\/">Khoa Điện - Điện tử<\/a>, Dạy và học bằng tiếng Anh, chưa có danh sách môn<\/p>/);
  assert.doesNotMatch(html, /0 môn/);
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
  const html = fs.readFileSync(path.join(outDir, 'course', 'EE1009', 'index.html'), 'utf8');
  assert.match(html, /<details class="more-items"><summary>Xem thêm 2 tài liệu<\/summary>/);
});

test('trang chủ: ô tìm không bị khóa, danh sách môn chỉ tải khi dùng', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<input id="q"[^>]*disabled/);
  const js = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site-src', 'assets', 'search.js'), 'utf8');
  assert.match(js, /pointerenter/);
});

// Dựng site có đủ loại file để kiểm hàng nút của mục tài liệu.
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
  const m = html.match(new RegExp(`<li class="item[^"]*" id="${id}">[\\s\\S]*?</li>`));
  assert.ok(m, id);
  return m[0];
};
const buttons = (li) => [...li.matchAll(/<a class="([^"]+)" href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => ({ cls: m[1], href: m[2].replace(/&amp;/g, '&'), label: m[3] }));

test('mục có file PDF: Xem trước, Tải xuống (cỡ), Yêu cầu gỡ theo đúng thứ tự', () => {
  const li = itemHtml(read4('course/EE1009/index.html'), 'co-pdf');
  const b = buttons(li);
  assert.deepEqual(b.map((x) => [x.cls, x.label]), [['btn', 'Xem trước'], ['btn', 'Tải xuống (2.0 MB)'], ['btn subtle', 'Yêu cầu gỡ']]);
  const url = 'https://github.com/bk-study-library/hcmut-library/releases/download/files-HK261/EE1009_summary_co-pdf.pdf';
  assert.equal(b[0].href, `https://up.example/xem-truoc?u=${encodeURIComponent(url)}`);
  assert.match(li, /target="_blank" rel="noopener">Xem trước/);
  assert.equal(b[1].href, url);
  // Nút xếp sau mô tả và dòng meta; không còn danh sách link trần.
  assert.ok(li.indexOf('class="meta"') < li.indexOf('class="actions"'));
  assert.doesNotMatch(li, /class="files"/);
});

test('Yêu cầu gỡ: mở form yeu-cau-go.yml điền sẵn link mục (ô item) và id mục', () => {
  const take = new URL(buttons(itemHtml(read4('course/EE1009/index.html'), 'co-pdf')).at(-1).href);
  assert.equal(take.origin + take.pathname, 'https://github.com/bk-study-library/hcmut-library/issues/new');
  assert.equal(take.searchParams.get('template'), 'yeu-cau-go.yml');
  assert.equal(take.searchParams.get('item'), 'https://bk-study-library.github.io/hcmut-library/course/EE1009/#co-pdf');
  assert.match(take.searchParams.get('title'), /co-pdf/);
  // Ô item có thật trong form.
  const form = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'ISSUE_TEMPLATE', 'yeu-cau-go.yml'), 'utf8');
  assert.match(form, /^\s+id: item$/m);
  // Bản tiếng Anh trỏ về trang môn tiếng Anh.
  const en = new URL(buttons(itemHtml(read4('en/course/EE1009/index.html'), 'co-pdf')).at(-1).href);
  assert.equal(en.searchParams.get('item'), 'https://bk-study-library.github.io/hcmut-library/en/course/EE1009/#co-pdf');
});

test('mục docx, zip: không có nút Xem trước', () => {
  const html = read4('course/EE1009/index.html');
  for (const id of ['co-docx', 'co-zip']) {
    assert.deepEqual(buttons(itemHtml(html, id)).map((x) => x.label), ['Tải xuống (2.0 MB)', 'Yêu cầu gỡ'], id);
  }
});

test('mục Markdown trong git: xem trước qua link files/ của site, tải từ files/ cùng site', () => {
  const li = itemHtml(read4('course/EE1009/index.html'), 'tom-tat-c1');
  const b = buttons(li);
  assert.deepEqual(b.map((x) => x.label), ['Xem trước', 'Tải xuống (82 B)', 'Yêu cầu gỡ']);
  assert.equal(b[0].href, `https://up.example/xem-truoc?u=${encodeURIComponent('https://bk-study-library.github.io/hcmut-library/files/EE1009/tom-tat-c1.md')}`);
  assert.equal(b[1].href, '../../files/EE1009/tom-tat-c1.md');
  assert.match(li, /download="tom-tat-c1\.md"/);
});

test('file Release không theo dạng files-HK<xxx>: không có nút Xem trước', () => {
  const li = itemHtml(read('course/EE1009/index.html'), 'prelab-2-tham-khao');
  assert.deepEqual(buttons(li).map((x) => x.label), ['Tải xuống (117 KB)', 'Yêu cầu gỡ']);
});

test('mục link: Mở link rồi Yêu cầu gỡ; mục đã gỡ: không có nút', () => {
  const html = read('course/EE1010/index.html');
  assert.deepEqual(buttons(itemHtml(html, 'link-doi-tac')).map((x) => [x.cls, x.label]), [['btn', 'Mở link'], ['btn subtle', 'Yêu cầu gỡ']]);
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
  assert.doesNotMatch(itemHtml(fs.readFileSync(path.join(o, 'course', 'EE1009', 'index.html'), 'utf8'), 'tom-tat-c1'), /xem-truoc/);
});

test('danh sách xem trước: chỉ Release files-HK<xxx> và .md của site, tên an toàn', async () => {
  const { previewTarget } = await import('../scripts/lib/preview.mjs');
  const o = { repo: 'a/b', site: 'https://s.example/lib/' };
  assert.ok(previewTarget('https://github.com/a/b/releases/download/files-HK261/x.pdf', o));
  assert.ok(previewTarget('https://s.example/lib/files/MT1005/x.md', o));
  for (const bad of [
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
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-pdf-'));
  buildSite({ root: dir, out: o });
  return o;
})();
const readPdf = (p) => fs.readFileSync(path.join(outPdf, p), 'utf8');

test('trang chương trình: nút CTĐT gốc và kế hoạch giảng dạy mở tab mới, kèm dòng ghi file do trường lưu', () => {
  const html = readPdf('program/TEST_2019/index.html');
  assert.match(
    html,
    /<p class="actions"><a class="btn" href="https:\/\/drive\.google\.com\/file\/d\/ctdt\/view" target="_blank" rel="noopener">Xem CTĐT gốc \(PDF của trường\)<\/a><a class="btn" href="https:\/\/dee\.hcmut\.edu\.vn\/khgd\.pdf" target="_blank" rel="noopener">Kế hoạch giảng dạy \(PDF\)<\/a><\/p><p class="muted small">File PDF do trường lưu trữ/,
  );
  // Đã có PDF của trường thì không cần link bảng CTĐT.
  assert.doesNotMatch(html, /hcmut\.edu\.vn\/bang-ctdt/);
  const en = readPdf('en/program/TEST_2019/index.html');
  assert.match(en, />View the original curriculum \(university PDF\)<\/a>/);
  assert.match(en, />Teaching plan \(PDF\)<\/a>/);
  assert.match(en, /The PDF files are hosted by the university/);
});

test('trang chương trình không có link PDF: nút nhẹ tới bảng CTĐT của trường theo site.json', () => {
  const html = readPdf('program/TEST_2019_NHAP/index.html');
  assert.match(html, /<p class="actions"><a class="btn subtle" href="https:\/\/hcmut\.edu\.vn\/bang-ctdt" rel="noopener">Bảng CTĐT của trường<\/a><\/p>/);
  assert.doesNotMatch(html, /File PDF do trường lưu trữ/);
  assert.match(readPdf('en/program/TEST_2019_NHAP/index.html'), />University curriculum table<\/a>/);
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
  assert.match(draft, /Đây là bản nháp nguồn, không hiện trong danh sách chương trình\./);
  assert.match(draft, /Xem bản chính: <a href="\.\.\/\.\.\/program\/TEST_2019\/">Chương trình thử \(2019\)<\/a>/);
  assert.doesNotMatch(readPdf('program/TEST_2019/index.html'), /name="robots"/);
  // Trang môn vẫn link tới bản nháp (không hỏng link), có nhãn bản nháp nguồn.
  const course = readPdf('course/EE1009/index.html');
  assert.match(course, /<a href="\.\.\/\.\.\/program\/TEST_2019_NHAP\/">Chương trình thử \(2019\)<\/a> <span class="tag">bản nháp nguồn<\/span>/);
  assert.match(readPdf('en/course/EE1009/index.html'), /<span class="tag">draft source<\/span>/);
});

test('trang khoa Môn chung toàn trường có ghi chú riêng', () => {
  const dir = copyFixture();
  editJson(dir, 'catalog/faculties.json', (f) => {
    f.faculties.push({ key: 'chung', name: { vi: 'Môn chung toàn trường', en: 'University-wide requirements' } });
  });
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-chung-'));
  buildSite({ root: dir, out: o });
  assert.match(fs.readFileSync(path.join(o, 'faculty/chung/index.html'), 'utf8'), /<p class="note">Môn và điều kiện tốt nghiệp áp dụng cho mọi ngành/);
  assert.doesNotMatch(fs.readFileSync(path.join(o, 'faculty/EE/index.html'), 'utf8'), /áp dụng cho mọi ngành/);
});

test('nhãn bấm được: khối trên trang môn trỏ tới đúng khối trên trang chương trình', () => {
  const course = read('course/EE1009/index.html');
  const m = course.match(/href="([^"]*program\/TEST_2019\/)#(khoi-[a-z0-9-]+)"/);
  assert.ok(m, 'trang môn có link tới khối');
  assert.match(read('program/TEST_2019/index.html'), new RegExp(`<section class="block" id="${m[2]}"`));
  assert.match(course, /<section class="group" id="loai-[a-z-]+"/);
});

test('ô tìm trang chủ: có danh sách chương trình, chỉ gồm chương trình được liệt kê', () => {
  const progs = JSON.parse(read('assets/programs.json'));
  assert.ok(progs.some((p) => p.code === 'TEST_2019'));
  for (const p of progs) {
    assert.deepEqual(Object.keys(p).filter((k) => !['code', 'name', 'nameEn', 'year', 'variant', 'faculty', 'courses'].includes(k)), []);
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
  const html = fs.readFileSync(path.join(o, 'course/EE1009/index.html'), 'utf8');
  if (html.includes('Nguyễn Văn Thử')) assert.match(html, /href="\.\.\/\.\.\/\?q=Nguy%E1%BB%85n%20V%C4%83n%20Th%E1%BB%AD">Nguyễn Văn Thử<\/a>/);
});

const SITE = 'https://bk-study-library.github.io/hcmut-library/';

test('ô tìm trang chủ: items.json chỉ có mục chưa gỡ, mới thêm trước, link tới mục trên trang môn', () => {
  const docs = JSON.parse(read('assets/items.json'));
  assert.deepEqual(docs.map((d) => d.id), ['tom-tat-c1', 'link-doi-tac', 'prelab-2-tham-khao']);
  const allowed = ['id', 'course', 'code', 'courseName', 'courseNameEn', 'faculty', 'title', 'description', 'type', 'term', 'examKind', 'chapter', 'teacher', 'lang', 'added', 'url'];
  for (const d of docs) assert.deepEqual(Object.keys(d).filter((k) => !allowed.includes(k)), [], d.id);
  assert.deepEqual(docs[0], {
    id: 'tom-tat-c1', course: 'EE1009', code: 'EE1009', courseName: 'Kỹ thuật số', faculty: 'EE', title: 'Tóm tắt chương 1', type: 'summary', term: 'HK251', lang: 'vi', added: '2026-10-01', url: 'course/EE1009/#tom-tat-c1',
  });
  // Link trỏ tới đúng mục có trên trang môn.
  for (const d of docs) assert.match(read(d.url.replace(/#.*/, 'index.html')), new RegExp(`<li class="item[^"]*" id="${d.id}">`));
  // Không đưa file chỉ web dùng vào v1/.
  assert.ok(!fs.existsSync(path.join(out, 'v1', 'items.json')));
});

test('items.json: mô tả dài bị cắt theo docDescriptionMax ở ranh giới từ', async () => {
  const { truncate, docIndex } = await import('../scripts/build-site.mjs');
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

test('trang môn: og:title, description ghi mã, tên môn và số tài liệu', () => {
  const html = read('course/EE1009/index.html');
  assert.equal(metaOf(html, 'property', 'og:title'), 'EE1009 Kỹ thuật số');
  const desc = metaOf(html, 'name', 'description');
  assert.match(desc, /^Môn EE1009 Kỹ thuật số: 2 tài liệu/);
  assert.equal(metaOf(html, 'property', 'og:description'), desc);
  assert.match(metaOf(read('en/course/EE1009/index.html'), 'name', 'description'), /^EE1009 .+: 2 items/);
  assert.match(metaOf(read('course/400111/index.html'), 'name', 'description'), /chưa có tài liệu/);
});

test('hreflang vi, en, x-default tuyệt đối khi trang có cả hai bản; trang Gửi tài liệu chỉ có tiếng Việt thì không', () => {
  for (const [p, vi, en] of [
    ['course/EE1009/index.html', 'course/EE1009/', 'en/course/EE1009/'],
    ['en/course/EE1009/index.html', 'course/EE1009/', 'en/course/EE1009/'],
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

test('trang chuyển hướng: canonical tuyệt đối tới ID cố định', () => {
  assert.match(read('course/402030/index.html'), new RegExp(`<link rel="canonical" href="${SITE}course/EE1009/">`));
  assert.match(read('en/course/402030/index.html'), new RegExp(`<link rel="canonical" href="${SITE}en/course/EE1009/">`));
});

test('robots.txt cho phép mọi trang, trỏ tới sitemap.xml', () => {
  assert.equal(read('robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
});

test('sitemap.xml: mọi trang thật, địa chỉ tuyệt đối, lastmod theo dữ liệu; không có 404, trang chuyển hướng, trang noindex', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const p of ['', 'en/', 'course/EE1009/', 'en/course/EE1009/', 'faculty/EE/', 'program/TEST_2019/', 'contribute/', 'gui-tai-lieu/']) assert.ok(locs.includes(SITE + p), p);
  for (const l of locs) assert.ok(l.startsWith(SITE), l);
  assert.ok(!locs.some((l) => /404|course\/402030\//.test(l)));
  assert.deepEqual(locs, [...locs].sort());
  // Mọi trang HTML có trong sitemap, trừ 404 và trang chuyển hướng.
  const pages = allHtml().map((f) => path.relative(out, f).split(path.sep).join('/')).filter((p) => p !== '404.html' && !read(p).includes('http-equiv="refresh"'));
  assert.equal(locs.length, pages.length);
  assert.match(xml, new RegExp(`<url><loc>${SITE}course/EE1009/</loc><lastmod>2026-10-01</lastmod></url>`));
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
