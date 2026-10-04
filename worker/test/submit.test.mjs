import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import policy from '../../catalog/policy.json';
import { createHandler } from '../src/index.mjs';

const REPO = 'own/lib';
const SITE = 'https://site.example';
const IP = '203.0.113.9';
const DISPLAY = 'Nguyen Van An';
const TITLE = 'Tóm tắt chương 1 giải tích';
const SLUG = 'tom-tat-chuong-1-giai-tich';
const UPLOAD_NAME = 'bai-giai-cua-toi.pdf';
const KNOWN_SHA = 'a'.repeat(64);

const index = {
  version: 1,
  faculties: [
    {
      key: 'x',
      courses: [
        { id: 'MT1005', code: 'MT1005', status: 'active', items: [
          { id: 'bang-cong-thuc', files: [{ sha256: KNOWN_SHA }] },
          { id: SLUG, removed: true },
        ] },
        { id: 'GE4169-2024', code: 'GE4169', status: 'active', items: [] },
      ],
    },
  ],
};

let pem;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
});

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

// Nội dung thô chỉ trả khi xin đúng Accept raw, để file lớn hơn 1 MB vẫn đọc được.
const raw = (init, text) =>
  init.headers?.Accept === 'application/vnd.github.raw' ? new Response(text) : json({ encoding: 'none', content: '', sha: 's' });

// fetch giả cho Turnstile và GitHub; fail[tên bước] = mã lỗi để giả lập GitHub hỏng.
function fakeFetch({ turnstile = true, hostname = 'site.example', fail = {} } = {}) {
  const calls = [];
  let pr = 0;
  const fn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const call = { url: String(url), method, body: init.body };
    calls.push(call);
    const u = new URL(call.url);
    const p = u.pathname;
    const step = (name, ok) => (fail[name] ? json({ message: 'Server Error' }, fail[name]) : ok());
    if (u.host === 'challenges.cloudflare.com') return json({ success: turnstile, hostname });
    if (p.startsWith('/app/installations/')) return step('token', () => json({ token: 'ghs_secret' }, 201));
    if (method === 'GET' && p === `/repos/${REPO}/contents/catalog/policy.json`) {
      return step('catalog', () => raw(init, JSON.stringify(policy)));
    }
    if (method === 'GET' && p === `/repos/${REPO}/contents/index.json`) {
      return step('catalog', () => raw(init, JSON.stringify(index)));
    }
    if (method === 'GET' && p.startsWith(`/repos/${REPO}/git/ref/heads/`)) return step('branchSha', () => json({ object: { sha: 'base1' } }));
    if (method === 'POST' && p === `/repos/${REPO}/git/refs`) return step('createBranch', () => json({}, 201));
    if (method === 'DELETE' && p.startsWith(`/repos/${REPO}/git/refs/heads/`)) return new Response(null, { status: 204 });
    if (method === 'PUT' && p.startsWith(`/repos/${REPO}/contents/`)) return step('putFile', () => json({}, 201));
    if (method === 'POST' && p === `/repos/${REPO}/pulls`) {
      return step('openPr', () => {
        pr += 1;
        return json({ number: pr, html_url: `https://github.com/${REPO}/pull/${pr}` }, 201);
      });
    }
    if (method === 'POST' && /\/issues\/\d+\/labels$/.test(p)) return step('labels', () => json([]));
    return json({ message: 'Not Found' }, 404);
  };
  fn.calls = calls;
  fn.find = (method, pathPart) => calls.filter((c) => c.method === method && c.url.includes(pathPart));
  return fn;
}

const allow = { limit: async () => ({ success: true }) };

function makeEnv(over = {}) {
  return {
    QUARANTINE: env.QUARANTINE,
    SUBMIT_LIMIT: allow,
    REPO,
    BRANCH: 'main',
    ALLOWED_ORIGINS: `${SITE}, https://other.example`,
    CATALOG_TTL_SECONDS: '0',
    PUBLIC_PR_LINKS: 'false',
    TURNSTILE_SECRET: 'ts-secret',
    GH_APP_ID: '1',
    GH_APP_PRIVATE_KEY: pem,
    GH_INSTALLATION_ID: '2',
    REVIEW_BASE: 'https://up.example/',
    ...over,
  };
}

const pdfBytes = (n = 1000, seed = 1) => {
  const b = new Uint8Array(n);
  b.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  for (let i = 5; i < n; i += 1) b[i] = (i * seed) % 251;
  return b;
};

function form(over = {}, file = pdfBytes()) {
  const fd = new FormData();
  const fields = {
    'cf-turnstile-response': 'tok',
    course: 'MT1005',
    type: 'summary',
    title: TITLE,
    license: 'CC-BY-SA-4.0',
    displayName: DISPLAY,
    'confirm-own': 'on',
    'confirm-license': 'on',
    'confirm-not-book': 'on',
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.set(k, v);
  if (file) fd.set('file', new File([file], UPLOAD_NAME, { type: 'application/pdf' }));
  return fd;
}

const post = (body, headers = {}) =>
  new Request('https://worker.example/submit', { method: 'POST', body, headers: { Origin: SITE, 'CF-Connecting-IP': IP, ...headers } });

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

async function run(req, { fetch = fakeFetch(), envOver = {} } = {}) {
  const handler = createHandler({ fetch });
  const res = await handler.fetch(req, makeEnv(envOver), ctx());
  return { res, body: await res.json(), fetch };
}

async function r2Keys() {
  const list = await env.QUARANTINE.list();
  return list.objects.map((o) => o.key).sort();
}

beforeEach(async () => {
  const keys = await r2Keys();
  if (keys.length) await env.QUARANTINE.delete(keys);
});

async function sha256Hex(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('POST /submit', () => {
  it('bài hợp lệ: lưu vào kho cách ly và mở PR', async () => {
    const bytes = pdfBytes();
    const sha = await sha256Hex(bytes);
    const { res, body, fetch } = await run(post(form({ term: 'HK251' }, bytes)));
    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.code).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(body).not.toHaveProperty('pr');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE);

    const name = `MT1005_summary_${SLUG}_HK251.pdf`;
    expect(await r2Keys()).toEqual([`pending/${body.code}/${name}`, `sha/${sha}`, `token/${body.code}`].sort());
    // Link xem bài của người gửi: R2 chỉ giữ sha256 của mã bí mật, kèm môn.
    const view = new URL(body.viewUrl);
    expect(`${view.origin}${view.pathname}`).toBe(`https://up.example/xem/${body.code}`);
    const k = view.searchParams.get('k');
    expect(k).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const tok = await env.QUARANTINE.get(`token/${body.code}`);
    expect(await tok.text()).toBe(await sha256Hex(new TextEncoder().encode(k)));
    expect(tok.customMetadata).toEqual({ course: 'MT1005' });
    const stored = await env.QUARANTINE.get(`pending/${body.code}/${name}`);
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(bytes);
    expect(stored.httpMetadata.contentType).toBe('application/pdf');
    expect(await (await env.QUARANTINE.get(`sha/${sha}`)).text()).toBe(body.code);

    const [branch] = fetch.find('POST', '/git/refs');
    expect(JSON.parse(branch.body)).toEqual({ ref: `refs/heads/upload/${body.code}`, sha: 'base1' });

    // id trùng với mục đã gỡ nên thành -2.
    const [put] = fetch.find('PUT', '/contents/');
    expect(put.url).toContain(`/contents/courses/MT1005/items/${SLUG}-2.json`);
    const sent = JSON.parse(put.body);
    expect(sent.branch).toBe(`upload/${body.code}`);
    const text = new TextDecoder().decode(Uint8Array.from(atob(sent.content), (c) => c.charCodeAt(0)));
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "id": ');
    const item = JSON.parse(text);
    expect(Object.keys(item)[0]).toBe('$schema');
    expect(item).toMatchObject({
      $schema: '../../../schema/item.schema.json',
      id: `${SLUG}-2`,
      course: 'MT1005',
      type: 'summary',
      title: TITLE,
      term: 'HK251',
      authors: [DISPLAY],
      origin: 'self-made',
      files: [{ name, size: bytes.length, sha256: sha, uploadSha256: sha, mime: 'application/pdf', quarantine: `pending/${body.code}/${name}` }],
    });
    expect(item.added).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(item.files[0]).not.toHaveProperty('url');

    const [pr] = fetch.find('POST', '/pulls');
    const prBody = JSON.parse(pr.body);
    expect(prBody).toMatchObject({ head: `upload/${body.code}`, base: 'main', title: `Tài liệu mới: MT1005 ${TITLE}` });
    expect(prBody.body).toContain(body.code);
    expect(prBody.body).toContain(sha);
    expect(prBody.body).toContain(DISPLAY);
    expect(prBody.body).not.toContain(UPLOAD_NAME);
    expect(prBody.body).not.toContain('| Mô tả |');
    expect(prBody.body).toContain(`Xem file (người duyệt): https://up.example/xem-duyet/${body.code}`);
    expect(prBody.body).not.toContain(k);
    const [labels] = fetch.find('POST', '/labels');
    expect(JSON.parse(labels.body)).toEqual({ labels: ['tai-lieu-moi'] });
    // Không gửi token GitHub hay secret Turnstile ra ngoài phản hồi.
    expect(JSON.stringify(body)).not.toContain('ghs_secret');
  });

  it('REVIEW_BASE trống: không tạo mã xem bài, không có link', async () => {
    const { res, body, fetch } = await run(post(form()), { envOver: { REVIEW_BASE: '' } });
    expect(res.status).toBe(201);
    expect(body).not.toHaveProperty('viewUrl');
    expect((await r2Keys()).some((k) => k.startsWith('token/'))).toBe(false);
    expect(JSON.parse(fetch.find('POST', '/pulls')[0].body).body).not.toContain('xem-duyet');
  });

  it('trả link PR khi PUBLIC_PR_LINKS là "true"', async () => {
    const { res, body } = await run(post(form()), { envOver: { PUBLIC_PR_LINKS: 'true' } });
    expect(res.status).toBe(201);
    expect(body.pr).toBe(`https://github.com/${REPO}/pull/1`);
  });

  it('Turnstile chặn: 403, kho rỗng, không gọi GitHub tạo nhánh', async () => {
    const { res, body, fetch } = await run(post(form()), { fetch: fakeFetch({ turnstile: false }) });
    expect(res.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(await r2Keys()).toEqual([]);
    expect(fetch.find('POST', '/git/refs')).toEqual([]);
    const [verify] = fetch.find('POST', 'challenges.cloudflare.com');
    expect(verify.url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
  });

  it('Turnstile qua nhưng hostname không thuộc ALLOWED_ORIGINS: 403', async () => {
    const { res, fetch } = await run(post(form()), { fetch: fakeFetch({ hostname: 'evil.example' }) });
    expect(res.status).toBe(403);
    expect(await r2Keys()).toEqual([]);
    expect(fetch.find('POST', '/git/refs')).toEqual([]);
  });

  it('hostname của origin thứ hai trong danh sách cũng được nhận', async () => {
    const { res } = await run(post(form()), { fetch: fakeFetch({ hostname: 'other.example' }) });
    expect(res.status).toBe(201);
  });

  it('lấy token GitHub App lỗi 401: 502', async () => {
    const { res, body } = await run(post(form()), { fetch: fakeFetch({ fail: { token: 401 } }) });
    expect(res.status).toBe(502);
    expect(body).toEqual({ ok: false, error: 'Chưa gửi được. Thử lại sau ít phút.' });
  });

  it('phụ thuộc ném lỗi: 500 JSON có CORS, kho rỗng', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const handler = createHandler({ fetch: fakeFetch(), now: boom });
    const res = await handler.fetch(post(form()), makeEnv(), ctx());
    expect(res.status).toBe(500);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    expect(await res.json()).toEqual({ ok: false, error: 'Chưa gửi được. Thử lại sau ít phút.' });
    expect(await r2Keys()).toEqual([]);

    const res2 = await createHandler({ fetch: fakeFetch() }).fetch(post(form()), makeEnv({ SUBMIT_LIMIT: { limit: boom } }), ctx());
    expect(res2.status).toBe(500);
    expect(res2.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    expect((await res2.json()).ok).toBe(false);
  });

  it('PR không tạo liên kết hay tham chiếu từ chữ người gửi', async () => {
    const title = 'Xem owner/repo#1 va [x](http://a)';
    const { res, fetch } = await run(post(form({ title, description: 'owner/repo#1 [x](http://a)' })));
    expect(res.status).toBe(201);
    const pr = JSON.parse(fetch.find('POST', '/pulls')[0].body);
    for (const text of [pr.title, pr.body]) {
      expect(text).not.toContain('#1');
      expect(text).not.toContain('[x]');
      expect(text).not.toContain('](');
    }
  });

  it('tiêu đề PR: chặn tham chiếu và nhắc tên mà không hiện mã HTML', async () => {
    const title = 'Xem owner/repo#1 va [x](http://a) @an C# GH-2 & <b>';
    const { res, fetch } = await run(post(form({ title })));
    expect(res.status).toBe(201);
    const pr = JSON.parse(fetch.find('POST', '/pulls')[0].body);
    expect(pr.title).toBe('Tài liệu mới: MT1005 Xem owner/repo# 1 va x(http://a) an C# GH- 2 & <b>');
    expect(pr.title).not.toMatch(/&#|&amp;|&lt;/);
    // Bảng trong thân PR vẫn thoát như cũ.
    expect(pr.body).toContain('&#35;1');
  });

  it('quá số lần gửi: 429', async () => {
    const { res, body } = await run(post(form()), { envOver: { SUBMIT_LIMIT: { limit: async () => ({ success: false }) } } });
    expect(res.status).toBe(429);
    expect(body.ok).toBe(false);
    expect(await r2Keys()).toEqual([]);
  });

  it('quá số lần gửi: không gọi GitHub, không đọc body', async () => {
    const req = post(form());
    const { res, fetch } = await run(req, { envOver: { SUBMIT_LIMIT: { limit: async () => ({ success: false }) } } });
    expect(res.status).toBe(429);
    expect(fetch.calls.filter((c) => c.url.startsWith('https://api.github.com'))).toEqual([]);
    expect(fetch.calls).toEqual([]);
    expect(req.bodyUsed).toBe(false);
  });

  it('khóa giới hạn là IP của người gửi', async () => {
    const keys = [];
    await run(post(form()), { envOver: { SUBMIT_LIMIT: { limit: async (o) => { keys.push(o.key); return { success: true }; } } } });
    expect(keys).toEqual([IP]);
  });

  it('Content-Length 21 MB: 413 mà không đọc body', async () => {
    let pulled = 0;
    const stream = new ReadableStream({ pull(c) { pulled += 1; c.enqueue(new Uint8Array(10)); c.close(); } }, { highWaterMark: 0 });
    const req = post(stream, { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(21 * 1024 * 1024) });
    const { res, body } = await run(req);
    expect(res.status).toBe(413);
    expect(body.ok).toBe(false);
    expect(pulled).toBe(0);
    expect(req.bodyUsed).toBe(false);
  });

  it('body thật 21 MB với Content-Length nhỏ: 413, kho rỗng', async () => {
    const big = pdfBytes(21 * 1024 * 1024);
    const encoded = new Request('https://x/', { method: 'POST', body: form({}, big) });
    const type = encoded.headers.get('content-type');
    const raw = new Uint8Array(await encoded.arrayBuffer());
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < raw.length; i += 1 << 20) c.enqueue(raw.subarray(i, i + (1 << 20)));
        c.close();
      },
    });
    const { res, body, fetch } = await run(post(stream, { 'Content-Type': type, 'Content-Length': '1000' }));
    expect(res.status).toBe(413);
    expect(body.ok).toBe(false);
    expect(await r2Keys()).toEqual([]);
    expect(fetch.find('POST', '/git/refs')).toEqual([]);
  });

  it('gửi hai lần cùng file: lần hai 409 đang chờ duyệt, chỉ một PR', async () => {
    const fetch = fakeFetch();
    const first = await run(post(form()), { fetch });
    expect(first.res.status).toBe(201);
    const second = await run(post(form()), { fetch });
    expect(second.res.status).toBe(409);
    expect(second.body).toEqual({ ok: false, error: 'Tài liệu này đang chờ duyệt.' });
    expect(fetch.find('POST', '/pulls')).toHaveLength(1);
  });

  it('trùng sha256 với tài liệu đã có: 409 đã có trong thư viện', async () => {
    const bytes = pdfBytes(500, 7);
    const sha = await sha256Hex(bytes);
    const saved = index.faculties[0].courses[0].items[0].files[0].sha256;
    index.faculties[0].courses[0].items[0].files[0].sha256 = sha;
    try {
      const { res, body } = await run(post(form({}, bytes)));
      expect(res.status).toBe(409);
      expect(body).toEqual({ ok: false, error: 'Tài liệu này đã có trong thư viện.' });
      expect(await r2Keys()).toEqual([]);
    } finally {
      index.faculties[0].courses[0].items[0].files[0].sha256 = saved;
    }
  });

  it('trùng sha256 file gốc của tài liệu đã có (bản sạch khác sha256): 409', async () => {
    const bytes = pdfBytes(600, 9);
    const sha = await sha256Hex(bytes);
    const f = index.faculties[0].courses[0].items[0].files[0];
    f.uploadSha256 = sha;
    try {
      const { res, body } = await run(post(form({}, bytes)));
      expect(res.status).toBe(409);
      expect(body).toEqual({ ok: false, error: 'Tài liệu này đã có trong thư viện.' });
      expect(await r2Keys()).toEqual([]);
    } finally {
      delete f.uploadSha256;
    }
  });

  it('openPr lỗi 500: 502, dọn kho và xóa nhánh', async () => {
    const fetch = fakeFetch({ fail: { openPr: 500 } });
    const { res, body } = await run(post(form()), { fetch });
    expect(res.status).toBe(502);
    expect(body).toEqual({ ok: false, error: 'Chưa gửi được. Thử lại sau ít phút.' });
    expect(await r2Keys()).toEqual([]);
    const ref = JSON.parse(fetch.find('POST', '/git/refs')[0].body).ref.replace('refs/heads/', '');
    expect(ref).toMatch(/^upload\/[A-Za-z0-9]{10}$/);
    const del = fetch.find('DELETE', '/git/refs/heads/');
    expect(del.map((c) => c.url)).toEqual([`https://api.github.com/repos/${REPO}/git/refs/heads/${ref}`]);
  });

  it('putFile lỗi 403 (quá giới hạn): 502, không lộ chữ của GitHub', async () => {
    const { res, body } = await run(post(form()), { fetch: fakeFetch({ fail: { putFile: 403 } }) });
    expect(res.status).toBe(502);
    expect(body.error).toBe('Chưa gửi được. Thử lại sau ít phút.');
    expect(await r2Keys()).toEqual([]);
  });

  it('đọc danh mục lỗi: 502, không lưu gì', async () => {
    const { res, body } = await run(post(form()), { fetch: fakeFetch({ fail: { catalog: 500 } }) });
    expect(res.status).toBe(502);
    expect(body.error).toBe('Chưa gửi được. Thử lại sau ít phút.');
    expect(await r2Keys()).toEqual([]);
  });

  it('lỗi kiểm theo ô: 400 kèm errors, không lưu gì', async () => {
    const { res, body } = await run(post(form({ course: 'XX9999', title: '' })));
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(Object.keys(body.errors).sort()).toEqual(['course', 'title']);
    expect(await r2Keys()).toEqual([]);
  });

  it('môn GE4169-2024: mục nằm ở courses/GE4169-2024, tên file bắt đầu GE4169_', async () => {
    const { res, body, fetch } = await run(post(form({ course: 'GE4169-2024' })));
    expect(res.status).toBe(201);
    const [put] = fetch.find('PUT', '/contents/');
    expect(put.url).toContain(`/contents/courses/GE4169-2024/items/${SLUG}.json`);
    const keys = await r2Keys();
    expect(keys.find((k) => k.startsWith('pending/'))).toBe(`pending/${body.code}/GE4169_summary_${SLUG}.pdf`);
    const [pr] = fetch.find('POST', '/pulls');
    expect(JSON.parse(pr.body).title).toBe(`Tài liệu mới: GE4169 ${TITLE}`);
  });

  it('sách tham khảo: không có file, vẫn mở PR, kho chỉ có mã xem bài', async () => {
    const { res, body, fetch } = await run(post(form({ type: 'book-ref', 'book-title': 'Giải tích', 'book-authors': 'A, B' }, null)));
    expect(res.status).toBe(201);
    expect(await r2Keys()).toEqual([`token/${body.code}`]);
    expect(JSON.parse(fetch.find('POST', '/pulls')[0].body).body).not.toContain('xem-duyet');
    const [put] = fetch.find('PUT', '/contents/');
    const item = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(JSON.parse(put.body).content), (c) => c.charCodeAt(0))));
    expect(item.book).toEqual({ title: 'Giải tích', authors: ['A', 'B'] });
    expect(item).not.toHaveProperty('files');
  });

  it('danh mục được giữ trong Cache API theo CATALOG_TTL_SECONDS', async () => {
    const fetch = fakeFetch();
    const envOver = { CATALOG_TTL_SECONDS: '60', BRANCH: `cache-${crypto.randomUUID()}` };
    await run(post(form({}, pdfBytes(800, 3))), { fetch, envOver });
    await run(post(form({}, pdfBytes(800, 5))), { fetch, envOver });
    expect(fetch.find('GET', '/contents/index.json')).toHaveLength(1);
    expect(fetch.find('GET', '/contents/catalog/policy.json')).toHaveLength(1);
  });
});

describe('CORS và đường khác', () => {
  it('OPTIONS từ origin được phép', async () => {
    const req = new Request('https://worker.example/submit', { method: 'OPTIONS', headers: { Origin: 'https://other.example' } });
    const res = await createHandler({ fetch: fakeFetch() }).fetch(req, makeEnv(), ctx());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://other.example');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('origin lạ: không có Access-Control-Allow-Origin', async () => {
    const req = new Request('https://worker.example/submit', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    const res = await createHandler({ fetch: fakeFetch() }).fetch(req, makeEnv(), ctx());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const { res: res2 } = await run(post(form(), { Origin: 'https://evil.example' }));
    expect(res2.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('đường khác 404, phương thức khác 405, trả JSON', async () => {
    const h = createHandler({ fetch: fakeFetch() });
    const r404 = await h.fetch(new Request('https://worker.example/abc'), makeEnv(), ctx());
    expect(r404.status).toBe(404);
    expect((await r404.json()).ok).toBe(false);
    const r405 = await h.fetch(new Request('https://worker.example/submit'), makeEnv(), ctx());
    expect(r405.status).toBe(405);
    expect(r405.headers.get('Allow')).toBe('POST, OPTIONS');
    expect((await r405.json()).ok).toBe(false);
  });
});

describe('nhật ký', () => {
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  let spies;
  beforeEach(() => {
    spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
  });
  afterEach(() => {
    for (const s of spies) s.mockRestore();
  });

  it('dọn kho lỗi thì ghi bước cleanup, chỉ có bước, mã và tên lỗi', async () => {
    const r2 = {
      head: (...a) => env.QUARANTINE.head(...a),
      put: (...a) => env.QUARANTINE.put(...a),
      delete: async () => {
        throw new TypeError('khong xoa duoc');
      },
    };
    const { res } = await run(post(form()), { fetch: fakeFetch({ fail: { openPr: 500 } }), envOver: { QUARANTINE: r2 } });
    expect(res.status).toBe(502);
    const logged = spies.flatMap((sp) => sp.mock.calls.flat()).map((a) => JSON.parse(a));
    expect(logged).toContainEqual({ event: 'submit_failed', step: 'cleanup', status: null, error: 'TypeError' });
    expect(logged).toContainEqual({ event: 'submit_failed', step: 'pr', status: 500, error: 'GitHubError' });
  });

  it('không in IP, tên hiển thị, tên file hay tiêu đề', async () => {
    await run(post(form({ term: 'HK251' })));
    await run(post(form({}, pdfBytes(900, 9))), { fetch: fakeFetch({ fail: { openPr: 500 } }) });
    await run(post(form({}, pdfBytes(900, 11))), { fetch: fakeFetch({ fail: { putFile: 500 } }) });
    await run(post(form()), { fetch: fakeFetch({ turnstile: false }) });
    const printed = spies.flatMap((s) => s.mock.calls.flat()).map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a)));
    expect(printed.length).toBeGreaterThan(0);
    for (const text of printed) {
      for (const secret of [IP, DISPLAY, UPLOAD_NAME, TITLE, SLUG, 'ghs_secret']) expect(text).not.toContain(secret);
    }
  });
});
