import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSite } from '../scripts/build-site.mjs';
import { FIXTURES, copyFixture, editJson } from './helpers.mjs';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-lib-site-'));
const result = buildSite({ root: path.join(FIXTURES, 'valid'), out, base: '/bk-study-library/' });
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
  assert.match(html, /issues\/new\?template=dong-gop-tai-lieu\.yml&amp;course=EE1009/);
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
  assert.match(html, /href="\/bk-study-library\/assets\/site\.css"/);
  assert.match(html, /href="\/bk-study-library\/en\/"/);
});

test('không tải gì từ máy chủ khác: không CDN, không font ngoài, không theo dõi', () => {
  for (const f of allHtml()) {
    const html = fs.readFileSync(f, 'utf8');
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
