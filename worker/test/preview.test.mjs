import { describe, it, expect } from 'vitest';
import policy from '../../catalog/policy.json';
import { createHandler } from '../src/index.mjs';
import { PREVIEW_MESSAGES } from '../src/preview.mjs';

const REPO = 'own/lib';
const SITE = 'https://own.github.io/lib/';
const REL = `https://github.com/${REPO}/releases/download/files-HK261/MT1005_summary_tom-tat.pdf`;
const CDN = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/abc?sig=x';
const MD = `${SITE}files/MT1005/bang-cong-thuc.md`;
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);

const env = { REPO, SITE_BASE: SITE };
const ctx = { waitUntil() {}, passThroughOnException() {} };

// fetch giả: routes là Map<link, Response hoặc hàm trả Response>; link lạ trả 404.
function fakeFetch(routes = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), redirect: init.redirect });
    const r = routes[String(url)];
    if (!r) return new Response('Not Found', { status: 404 });
    return typeof r === 'function' ? r() : r.clone();
  };
  fn.calls = calls;
  return fn;
}

const redirect = (to, status = 302) => new Response(null, { status, headers: { Location: to } });

async function get(u, { fetch = fakeFetch(), method = 'GET', raw } = {}) {
  const handler = createHandler({ fetch });
  const q = raw ?? (u === undefined ? '' : `?u=${encodeURIComponent(u)}`);
  const res = await handler.fetch(new Request(`https://up.example/xem-truoc${q}`, { method }), env, ctx);
  return { res, fetch };
}

async function expectBad(res) {
  expect(res.status).toBe(400);
  expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  expect(await res.text()).toBe(`${PREVIEW_MESSAGES.bad}\n`);
}

describe('/xem-truoc: link được phép', () => {
  it('PDF trên Release: theo chuyển hướng tới githubusercontent, trả inline kèm header an toàn', async () => {
    const fetch = fakeFetch({ [REL]: redirect(CDN), [CDN]: new Response(pdf, { headers: { 'Content-Type': 'application/octet-stream' } }) });
    const { res } = await get(REL, { fetch });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="MT1005_summary_tom-tat.pdf"');
    expect(res.headers.get('content-security-policy')).toBe('sandbox');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf);
    expect(fetch.calls.map((c) => c.url)).toEqual([REL, CDN]);
    expect(fetch.calls.every((c) => c.redirect === 'manual')).toBe(true);
  });

  it('kiểu nội dung theo đuôi file, không theo máy chủ gửi về', async () => {
    for (const [name, type] of [['a.png', 'image/png'], ['b.jpg', 'image/jpeg'], ['c.md', 'text/plain; charset=utf-8']]) {
      const u = `https://github.com/${REPO}/releases/download/files-HK252/${name}`;
      const fetch = fakeFetch({ [u]: new Response('x', { headers: { 'Content-Type': 'text/html' } }) });
      const { res } = await get(u, { fetch });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe(type);
    }
  });

  it('Markdown trên site: trả chữ thường', async () => {
    const fetch = fakeFetch({ [MD]: new Response('# Bảng\n<script>x</script>', { headers: { 'Content-Type': 'text/html' } }) });
    const { res } = await get(MD, { fetch });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toBe('sandbox');
    expect(await res.text()).toContain('# Bảng');
  });

  it('file không còn: 404', async () => {
    const { res } = await get(REL);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(`${PREVIEW_MESSAGES.notFound}\n`);
  });
});

describe('/xem-truoc: link bị từ chối', () => {
  const bad = [
    ['thiếu u', undefined],
    ['máy chủ khác', 'https://evil.example/x.pdf'],
    ['repo khác', 'https://github.com/other/lib/releases/download/files-HK261/a.pdf'],
    ['http', `http://github.com/${REPO}/releases/download/files-HK261/a.pdf`],
    ['tag sai', `https://github.com/${REPO}/releases/download/v1.0/a.pdf`],
    ['tag files-<môn>', `https://github.com/${REPO}/releases/download/files-EE1009/a.pdf`],
    ['đuôi không xem được', `https://github.com/${REPO}/releases/download/files-HK261/a.docx`],
    ['đuôi html', `https://github.com/${REPO}/releases/download/files-HK261/a.html`],
    ['zip', `https://github.com/${REPO}/releases/download/files-HK261/a.zip`],
    ['thư mục con', `https://github.com/${REPO}/releases/download/files-HK261/x/a.pdf`],
    ['đi ngược thư mục', `https://github.com/${REPO}/releases/download/files-HK261/../../../x/a.pdf`],
    ['đi ngược mã hóa', `https://github.com/${REPO}/releases/download/files-HK261/%2e%2e%2fa.pdf`],
    ['tên bắt đầu bằng dấu chấm', `https://github.com/${REPO}/releases/download/files-HK261/.a.pdf`],
    ['có query', `https://github.com/${REPO}/releases/download/files-HK261/a.pdf?x=1`],
    ['có #', `https://github.com/${REPO}/releases/download/files-HK261/a.pdf#x`],
    ['có tài khoản trong link', `https://u:p@github.com/${REPO}/releases/download/files-HK261/a.pdf`],
    ['site không phải md', `${SITE}files/MT1005/a.pdf`],
    ['site ngoài files/', `${SITE}course/MT1005/a.md`],
    ['site mã môn sai', `${SITE}files/mt1005/a.md`],
    ['site đi ngược', `${SITE}files/MT1005/../../a.md`],
    ['site khác', 'https://other.github.io/lib/files/MT1005/a.md'],
  ];
  for (const [name, u] of bad) {
    it(name, async () => {
      const { res, fetch } = await get(u);
      await expectBad(res);
      expect(fetch.calls).toEqual([]);
    });
  }

  it('chỉ nhận GET', async () => {
    const { res } = await get(REL, { method: 'POST' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('chuyển hướng tới máy chủ ngoài danh sách: 400, không tải', async () => {
    const evil = 'https://evil.example/a.pdf';
    const fetch = fakeFetch({ [REL]: redirect(evil), [evil]: new Response(pdf) });
    const { res } = await get(REL, { fetch });
    await expectBad(res);
    expect(fetch.calls.map((c) => c.url)).toEqual([REL]);
  });

  it('chuyển hướng giả githubusercontent (đuôi tên miền khác, http, có cổng): 400', async () => {
    for (const to of ['https://githubusercontent.com.evil.example/a', 'http://objects.githubusercontent.com/a', 'https://objects.githubusercontent.com:8443/a', 'https://evilgithubusercontent.com/a']) {
      const fetch = fakeFetch({ [REL]: redirect(to), [to]: new Response(pdf) });
      const { res } = await get(REL, { fetch });
      await expectBad(res);
      expect(fetch.calls).toHaveLength(1);
    }
  });

  it('quá 3 lần chuyển hướng: 400', async () => {
    const hop = (i) => `https://objects.githubusercontent.com/${i}`;
    const fetch = fakeFetch({ [REL]: redirect(hop(1)), [hop(1)]: redirect(hop(2)), [hop(2)]: redirect(hop(3)), [hop(3)]: redirect(hop(4)), [hop(4)]: new Response(pdf) });
    const { res } = await get(REL, { fetch });
    await expectBad(res);
    expect(fetch.calls).toHaveLength(4);
  });

  it('đúng 3 lần chuyển hướng vẫn được', async () => {
    const hop = (i) => `https://objects.githubusercontent.com/${i}`;
    const fetch = fakeFetch({ [REL]: redirect(hop(1)), [hop(1)]: redirect(hop(2)), [hop(2)]: redirect(hop(3)), [hop(3)]: new Response(pdf) });
    const { res } = await get(REL, { fetch });
    expect(res.status).toBe(200);
  });

  it('file trên site không được chuyển hướng', async () => {
    const fetch = fakeFetch({ [MD]: redirect('https://objects.githubusercontent.com/a') });
    const { res } = await get(MD, { fetch });
    await expectBad(res);
  });
});

describe('/xem-truoc: giới hạn kích thước', () => {
  it('Content-Length lớn hơn maxFileBytes: 413, không chuyển tiếp', async () => {
    const fetch = fakeFetch({ [REL]: () => new Response(pdf, { headers: { 'Content-Length': String(policy.maxFileBytes + 1) } }) });
    const { res } = await get(REL, { fetch });
    expect(res.status).toBe(413);
    expect(await res.text()).toBe(`${PREVIEW_MESSAGES.tooLarge}\n`);
  });

  it('Content-Length nói sai: cắt luồng khi vượt giới hạn', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const body = () =>
      new ReadableStream({
        start(c) {
          for (let i = 0; i <= policy.maxFileBytes / chunk.length; i++) c.enqueue(chunk);
          c.close();
        },
      });
    const fetch = fakeFetch({ [REL]: () => new Response(body()) });
    const { res } = await get(REL, { fetch });
    expect(res.status).toBe(200);
    await expect(res.arrayBuffer()).rejects.toThrow();
  });
});
