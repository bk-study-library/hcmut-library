import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import policy from '../../catalog/policy.json';
import { createHandler } from '../src/index.mjs';
import { cell } from '../src/routes/submit.mjs';
import { rateKey, countKey } from '../src/limits.mjs';
import { serializeWorkerCatalog } from '../../scripts/lib/worker-catalog.mjs';

const REPO = 'own/lib';
const SITE = 'https://site.example';
const IP = '203.0.113.9';
const DISPLAY = 'Nguyen Van An';
const TITLE = 'Tóm tắt chương 1 giải tích';
const SLUG = 'tom-tat-chuong-1-giai-tich';
const UPLOAD_NAME = 'bai-giai-cua-toi.pdf';
const KNOWN_SHA = 'a'.repeat(64);
const REMOVED_SHA = 'b'.repeat(64);

const index = {
  version: 1,
  faculties: [
    {
      key: 'x',
      courses: [
        { id: 'MT1005', code: 'MT1005', status: 'active', items: [
          { id: 'bang-cong-thuc', files: [{ sha256: KNOWN_SHA }] },
          { id: SLUG, removed: true },
          { id: 'da-go', removed: true, files: [{ sha256: REMOVED_SHA }] },
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
// smallCatalog: branch có worker-catalog.json (sinh từ index lúc gọi, nên test sửa index vẫn thấy);
// false thì giả branch cũ chưa có file này, Worker phải đọc index.json.
function fakeFetch({ turnstile = true, hostname = 'site.example', fail = {}, smallCatalog = true } = {}) {
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
    if (method === 'GET' && p === `/repos/${REPO}/contents/worker-catalog.json` && smallCatalog) {
      return step('catalog', () => raw(init, serializeWorkerCatalog(index)));
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
  it('bài hợp lệ: lưu vào bucket quarantine và mở PR', async () => {
    const bytes = pdfBytes();
    const sha = await sha256Hex(bytes);
    const { res, body, fetch } = await run(post(form({ term: 'HK251' }, bytes)));
    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.code).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(body).not.toHaveProperty('pr');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE);

    // Tên file theo id (id trùng mục đã gỡ nên thành -2), để tên trên Release không trùng.
    const name = `MT1005_summary_${SLUG}-2_HK251.pdf`;
    expect(await r2Keys()).toEqual([`id/MT1005/${SLUG}-2`, `pending/${body.code}/${name}`, `sha/${sha}`, `token/${body.code}`].sort());
    expect(await (await env.QUARANTINE.get(`id/MT1005/${SLUG}-2`)).text()).toBe(body.code);
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
    // Tiêu đề và nội dung PR trung tính: mã bài, mã môn, loại, cỡ file, sha256; không có chữ người gửi.
    expect(prBody).toMatchObject({ head: `upload/${body.code}`, base: 'main', title: `Bài gửi ${body.code}: MT1005` });
    expect(prBody.body).toContain(`| Mã bài | ${body.code} |`);
    expect(prBody.body).toContain('| Môn | MT1005 |');
    expect(prBody.body).toContain('| Loại | Tóm tắt |');
    expect(prBody.body).toContain(`| sha256 | ${sha} |`);
    expect(prBody.body).toContain('| Kích thước | 1000 B |');
    for (const userText of [DISPLAY, TITLE, SLUG, UPLOAD_NAME, k, 'pending/']) expect(prBody.body).not.toContain(userText);
    expect(prBody.body).toContain(`Xem file (người duyệt): https://up.example/xem-duyet/${body.code}`);
    expect(prBody.body).toContain('hiện ở trang trên');
    // Commit trên branch cũng không có chữ người gửi.
    expect(sent.message).toBe(`feat(courses): thêm tài liệu gửi qua form ${body.code}`);
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

  it('Turnstile chặn: 403, kho rỗng, không gọi GitHub tạo branch', async () => {
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

  it('chữ người gửi (link, @, mô tả, giảng viên) không vào tiêu đề hay nội dung PR', async () => {
    const over = { title: 'Xem https://hcmut-login.example/a @an', description: 'www.lua-dao.example noi xau', teacher: 'Nguyen Van Teo' };
    const { res, body, fetch } = await run(post(form(over)));
    expect(res.status).toBe(201);
    const pr = JSON.parse(fetch.find('POST', '/pulls')[0].body);
    expect(pr.title).toBe(`Bài gửi ${body.code}: MT1005`);
    for (const text of [pr.title, pr.body]) {
      for (const bad of ['https://hcmut', 'www.', '@an', 'noi xau', 'Nguyen Van Teo']) expect(text).not.toContain(bad);
    }
    // Mục tài liệu (file trong PR) vẫn giữ đủ chữ để đăng sau khi duyệt.
    const put = JSON.parse(fetch.find('PUT', '/contents/')[0].body);
    const item = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(put.content), (c) => c.charCodeAt(0))));
    expect(item).toMatchObject({ title: over.title, description: over.description, teacher: over.teacher });
    expect(put.message).not.toMatch(/https|www|Teo/);
  });

  it('cell(): thoát bảng, HTML, nhắc tên, tham chiếu và tự tạo link', () => {
    expect(cell('a|b <i> @x #1 [y](z)')).toBe('a\\|b &lt;i&gt; &#64;x &#35;1 &#91;y&#93;(z)');
    expect(cell('https://evil.example/a WWW.evil.example')).toBe('https&#58;//evil.example/a WWW&#46;evil.example');
    expect(cell('dong 1\n dong 2')).toBe('dong 1 dong 2');
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

  it('khóa giới hạn: IPv4 giữ nguyên, IPv6 theo dải /64', async () => {
    const keys = [];
    const envOver = { SUBMIT_LIMIT: { limit: async (o) => { keys.push(o.key); return { success: true }; } } };
    await run(post(form()), { envOver });
    await run(post(form({}, pdfBytes(700, 3)), { 'CF-Connecting-IP': '2001:db8:1:2::1' }), { envOver });
    await run(post(form({}, pdfBytes(700, 5)), { 'CF-Connecting-IP': '2001:db8:1:2:a:b:c:d' }), { envOver });
    expect(keys).toEqual([IP, '2001:db8:1:2::/64', '2001:db8:1:2::/64']);
  });

  it('rateKey: viết tắt ::, IPv4 dạng IPv6, chuỗi hỏng', () => {
    // Cùng dải /64 dù cách viết khác nhau (nhóm 0 bị rút gọn).
    expect(rateKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateKey('2001:db8:0:0:ffff:1:2:3')).toBe('2001:db8:0:0::/64');
    expect(rateKey('2001:DB8:0:0::abcd')).toBe('2001:db8:0:0::/64');
    expect(rateKey('2001:db8:0:1::1')).toBe('2001:db8:0:1::/64');
    expect(rateKey('::ffff:198.51.100.7')).toBe('198.51.100.7');
    for (const bad of ['', null, 'abc', '1.2.3', '1::2::3', '1:2:3:4:5:6:7:8:9', '::ffff:1.2.3.999']) expect(rateKey(bad)).toBe('unknown');
  });

  it('trần mỗi ngày: đủ SUBMIT_DAILY_CAP bài thì 429, không đọc body, không gọi GitHub', async () => {
    const now = Date.UTC(2026, 9, 4, 12);
    const handler = createHandler({ fetch: fakeFetch(), now: () => now });
    const e = makeEnv({ SUBMIT_DAILY_CAP: '2' });
    const send = (seed) => handler.fetch(post(form({}, pdfBytes(700, seed))), e, ctx());
    expect((await send(3)).status).toBe(201);
    expect((await send(5)).status).toBe(201);
    expect(await (await env.QUARANTINE.get(countKey(now))).text()).toBe('2');
    const f = fakeFetch();
    const req = post(form({}, pdfBytes(700, 7)));
    const res = await createHandler({ fetch: f, now: () => now }).fetch(req, e, ctx());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, error: 'Hôm nay thư viện đã nhận đủ số bài. Gửi lại vào ngày mai.' });
    expect(req.bodyUsed).toBe(false);
    expect(f.calls).toEqual([]);
    // Sang ngày mới (UTC) thì gửi lại được.
    const next = await createHandler({ fetch: fakeFetch(), now: () => now + 86_400_000 }).fetch(post(form({}, pdfBytes(700, 9))), e, ctx());
    expect(next.status).toBe(201);
  });

  it('trần mỗi ngày: bài bị từ chối (lỗi ô, Turnstile) không tính', async () => {
    const now = Date.UTC(2026, 9, 5, 1);
    const e = makeEnv({ SUBMIT_DAILY_CAP: '1' });
    await createHandler({ fetch: fakeFetch(), now: () => now }).fetch(post(form({ title: '' })), e, ctx());
    await createHandler({ fetch: fakeFetch({ turnstile: false }), now: () => now }).fetch(post(form()), e, ctx());
    expect(await env.QUARANTINE.get(countKey(now))).toBeNull();
    expect((await createHandler({ fetch: fakeFetch(), now: () => now }).fetch(post(form()), e, ctx())).status).toBe(201);
  });

  it('không đặt SUBMIT_DAILY_CAP: không đếm', async () => {
    const { res } = await run(post(form()));
    expect(res.status).toBe(201);
    expect((await r2Keys()).some((k) => k.startsWith('dem/'))).toBe(false);
  });

  it('Content-Length vượt giới hạn gửi thẳng (91 MB): 413 mà không đọc body', async () => {
    let pulled = 0;
    const stream = new ReadableStream({ pull(c) { pulled += 1; c.enqueue(new Uint8Array(10)); c.close(); } }, { highWaterMark: 0 });
    const req = post(stream, { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(91 * 1024 * 1024) });
    const { res, body } = await run(req);
    expect(res.status).toBe(413);
    expect(body.ok).toBe(false);
    expect(pulled).toBe(0);
    expect(req.bodyUsed).toBe(false);
  });

  it('body thật 91 MB với Content-Length nhỏ: 413, kho rỗng', async () => {
    const big = pdfBytes(91 * 1024 * 1024);
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

  it('hai bài cùng môn cùng tiêu đề đang chờ duyệt song song: bài sau nhận id khác (khóa id/ trong R2)', async () => {
    const fetch = fakeFetch();
    expect((await run(post(form()), { fetch })).res.status).toBe(201);
    expect((await run(post(form({}, pdfBytes(5000, 7))), { fetch })).res.status).toBe(201);
    const paths = fetch.find('PUT', '/contents/').map((r) => new URL(r.url).pathname.split('/').pop());
    expect(paths).toEqual([`${SLUG}-2.json`, `${SLUG}-3.json`]);
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

  it('trùng sha256 của tài liệu đã gỡ: 409 không nhận lại', async () => {
    const bytes = pdfBytes(650, 13);
    const sha = await sha256Hex(bytes);
    const f = index.faculties[0].courses[0].items[2].files[0];
    for (const key of ['sha256', 'uploadSha256']) {
      const saved = f[key];
      f[key] = sha;
      try {
        const { res, body } = await run(post(form({}, bytes)));
        expect(res.status).toBe(409);
        expect(body).toEqual({ ok: false, error: 'Tài liệu này đã bị gỡ khỏi thư viện nên không nhận lại.' });
        expect(await r2Keys()).toEqual([]);
      } finally {
        if (saved === undefined) delete f[key];
        else f[key] = saved;
      }
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

  it('openPr lỗi 500: 502, dọn kho và xóa branch', async () => {
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
    expect(JSON.parse(pr.body).title).toBe(`Bài gửi ${body.code}: GE4169`);
  });

  it('sách tham khảo: không có file, vẫn mở PR, kho chỉ có mã xem bài và khóa id', async () => {
    const { res, body, fetch } = await run(post(form({ type: 'book-ref', 'book-title': 'Giải tích', 'book-authors': 'A, B' }, null)));
    expect(res.status).toBe(201);
    expect(await r2Keys()).toEqual([`id/MT1005/${SLUG}-2`, `token/${body.code}`]);
    const prText = JSON.parse(fetch.find('POST', '/pulls')[0].body).body;
    expect(prText).toContain(`Xem bài (người duyệt): https://up.example/xem-duyet/${body.code}`);
    for (const userText of ['Giải tích', 'A, B']) expect(prText).not.toContain(userText);
    const [put] = fetch.find('PUT', '/contents/');
    const item = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(JSON.parse(put.body).content), (c) => c.charCodeAt(0))));
    expect(item.book).toEqual({ title: 'Giải tích', authors: ['A', 'B'] });
    expect(item).not.toHaveProperty('files');
  });

  describe('môn mới gửi kèm bài', () => {
    const NEW_NAME = 'Kỹ thuật và hệ thống siêu cao tần';
    const newForm = (over = {}, file) => form({ course: '', newCourseCode: 'EE5430', newCourseName: NEW_NAME, ...over }, file);
    const decode = (put) => new TextDecoder().decode(Uint8Array.from(atob(JSON.parse(put.body).content), (c) => c.charCodeAt(0)));

    it('thêm file môn và item trên branch, PR nêu môn mới mà không có tên môn', async () => {
      const bytes = pdfBytes(900, 17);
      const { res, body, fetch } = await run(post(newForm({}, bytes)));
      expect(res.status).toBe(201);

      const puts = fetch.find('PUT', '/contents/');
      expect(puts.map((p) => new URL(p.url).pathname)).toEqual([
        `/repos/${REPO}/contents/catalog/courses/EE5430.json`,
        `/repos/${REPO}/contents/courses/EE5430/items/${SLUG}.json`,
      ]);
      const courseText = decode(puts[0]);
      expect(courseText.endsWith('}\n')).toBe(true);
      expect(JSON.parse(courseText)).toEqual({
        $schema: '../../schema/course.schema.json',
        id: 'EE5430',
        code: 'EE5430',
        name: NEW_NAME,
        faculty: 'dee',
        aliases: [],
        status: 'active',
        programs: [],
        parts: ['theory'],
        related: [],
        handbookUrl: 'https://hcmut.edu.vn/study/handbook/subject/EE5430',
        note: 'Môn mới do người gửi đề xuất, chờ người duyệt xác nhận.',
        updated: JSON.parse(decode(puts[1])).added,
      });
      const item = JSON.parse(decode(puts[1]));
      expect(item.course).toBe('EE5430');
      expect(item.files[0].name).toBe(`EE5430_summary_${SLUG}.pdf`);
      expect((await r2Keys()).find((k) => k.startsWith('pending/'))).toBe(`pending/${body.code}/EE5430_summary_${SLUG}.pdf`);
      expect((await env.QUARANTINE.get(`token/${body.code}`)).customMetadata).toEqual({ course: 'EE5430' });

      const pr = JSON.parse(fetch.find('POST', '/pulls')[0].body);
      // Tiêu đề giữ trung tính như bài thường; nội dung PR báo môn mới (mã đã qua mẫu) kèm link Sổ tay.
      expect(pr.title).toBe(`Bài gửi ${body.code}: EE5430`);
      expect(pr.body).toContain('Môn mới: EE5430');
      expect(pr.body).toContain('https://hcmut.edu.vn/study/handbook/subject/EE5430');
      expect(pr.body).toContain('catalog/courses/EE5430.json');
      for (const text of [pr.title, pr.body, ...puts.map((p) => JSON.parse(p.body).message)]) {
        for (const userText of [NEW_NAME, 'siêu cao tần', 'sieu-cao-tan', TITLE, DISPLAY]) expect(text).not.toContain(userText);
      }
      expect(JSON.parse(puts[0].body).message).toBe(`feat(catalog): thêm môn mới EE5430 gửi qua form ${body.code}`);
      expect(JSON.parse(puts[0].body).branch).toBe(`upload/${body.code}`);
    });

    it('bài thường: PR không có dòng môn mới, chỉ một file trên branch', async () => {
      const { res, fetch } = await run(post(form({}, pdfBytes(900, 19))));
      expect(res.status).toBe(201);
      expect(fetch.find('PUT', '/contents/')).toHaveLength(1);
      expect(JSON.parse(fetch.find('POST', '/pulls')[0].body).body).not.toContain('Môn mới');
    });

    const rejected = async (fd, key) => {
      const { res, body, fetch } = await run(post(fd));
      expect(res.status).toBe(400);
      expect(body.errors[key]).toBeTruthy();
      expect(await r2Keys()).toEqual([]);
      expect(fetch.find('POST', '/git/refs')).toEqual([]);
      return body;
    };

    it('mã sai mẫu: 400, không lưu gì', async () => {
      await rejected(newForm({ newCourseCode: 'EE5430-2024' }), 'newCourseCode');
    });

    it('mã đã có trong danh mục (kể cả mã của môn có hậu tố năm): 400', async () => {
      await rejected(newForm({ newCourseCode: 'MT1005' }), 'newCourseCode');
      await rejected(newForm({ newCourseCode: 'GE4169' }), 'newCourseCode');
    });

    it('tên môn quá dài: 400', async () => {
      await rejected(newForm({ newCourseName: 'A'.repeat(policy.fields.courseNameMax + 1) }), 'newCourseName');
    });

    it('chọn cả môn có sẵn và môn mới: 400', async () => {
      await rejected(newForm({ course: 'MT1005' }), 'course');
    });

    it('không chọn môn, không thêm môn mới: 400', async () => {
      await rejected(form({ course: '' }), 'course');
    });

    it('gửi hai mã môn mới (ô lặp): 400, chỉ một môn mới mỗi bài', async () => {
      const fd = newForm();
      fd.append('newCourseCode', 'EE5432');
      await rejected(fd, 'course');
      const fd2 = form();
      fd2.append('course', 'GE4169-2024');
      await rejected(fd2, 'course');
    });

    it('ghi file môn lỗi: 502, dọn kho và xóa branch', async () => {
      const fetch = fakeFetch({ fail: { putFile: 500 } });
      const { res } = await run(post(newForm({}, pdfBytes(900, 23))), { fetch });
      expect(res.status).toBe(502);
      expect(await r2Keys()).toEqual([]);
      expect(fetch.find('DELETE', '/git/refs/heads/')).toHaveLength(1);
      expect(fetch.find('POST', '/pulls')).toEqual([]);
    });
  });

  it('danh mục được giữ trong Cache API theo CATALOG_TTL_SECONDS', async () => {
    const fetch = fakeFetch();
    const envOver = { CATALOG_TTL_SECONDS: '60', BRANCH: `cache-${crypto.randomUUID()}` };
    await run(post(form({}, pdfBytes(800, 3))), { fetch, envOver });
    await run(post(form({}, pdfBytes(800, 5))), { fetch, envOver });
    expect(fetch.find('GET', '/contents/worker-catalog.json')).toHaveLength(1);
    expect(fetch.find('GET', '/contents/index.json')).toHaveLength(0);
    expect(fetch.find('GET', '/contents/catalog/policy.json')).toHaveLength(1);
  });

  it('danh mục đọc từ worker-catalog.json, không đọc index.json', async () => {
    const fetch = fakeFetch();
    const { res } = await run(post(form({}, pdfBytes(800, 7))), { fetch });
    expect(res.status).toBe(201);
    expect(fetch.find('GET', '/contents/worker-catalog.json')).toHaveLength(1);
    expect(fetch.find('GET', '/contents/index.json')).toHaveLength(0);
  });

  it('branch chưa có worker-catalog.json: đọc index.json như cũ', async () => {
    const fetch = fakeFetch({ smallCatalog: false });
    const { res } = await run(post(form({}, pdfBytes(800, 9))), { fetch });
    expect(res.status).toBe(201);
    expect(fetch.find('GET', '/contents/worker-catalog.json')).toHaveLength(1);
    expect(fetch.find('GET', '/contents/index.json')).toHaveLength(1);
  });

  it('file đã gỡ vẫn bị chặn khi chỉ đọc index.json', async () => {
    const bytes = pdfBytes(650, 21);
    const f = index.faculties[0].courses[0].items[2].files[0];
    const saved = f.sha256;
    f.sha256 = await sha256Hex(bytes);
    try {
      const { res } = await run(post(form({}, bytes)), { fetch: fakeFetch({ smallCatalog: false }) });
      expect(res.status).toBe(409);
    } finally {
      f.sha256 = saved;
    }
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

describe('email báo kết quả và bản cập nhật', () => {
  it('email người gửi chỉ nằm trong bucket quarantine, không vào item hay PR', async () => {
    const { res, body, fetch } = await run(post(form({ notifyEmail: 'an@example.com' })));
    expect(res.status).toBe(201);
    const stored = await env.QUARANTINE.get(`notify/${body.code}`);
    expect(JSON.parse(await stored.text())).toEqual({ email: 'an@example.com', course: 'MT1005' });
    for (const c of [...fetch.find('PUT', '/contents/'), ...fetch.find('POST', '/pulls')]) {
      const text = c.body.includes('"content"') ? atob(JSON.parse(c.body).content ?? '') : c.body;
      expect(text).not.toContain('an@example.com');
      expect(text).not.toContain('notifyEmail');
    }
  });

  it('email sai dạng thì báo lỗi ô email', async () => {
    const { res, body } = await run(post(form({ notifyEmail: 'khong-phai-email' })));
    expect(res.status).toBe(400);
    expect(body.errors).toHaveProperty('notifyEmail');
  });

  it('bản cập nhật: mục mới ghi replaces, PR có link so bản đang có và bản mới', async () => {
    const { res, body, fetch } = await run(post(form({ replaces: 'MT1005/bang-cong-thuc' }, pdfBytes(1200, 3))), { envOver: { SITE_BASE: 'https://lib.example/' } });
    expect(res.status).toBe(201);
    const [put] = fetch.find('PUT', '/contents/courses/');
    const item = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(JSON.parse(put.body).content), (c) => c.charCodeAt(0))));
    expect(item.replaces).toBe('MT1005/bang-cong-thuc');
    const pr = JSON.parse(fetch.find('POST', '/pulls')[0].body);
    expect(pr.body).toContain('**Bản cập nhật** cho tài liệu `MT1005/bang-cong-thuc`');
    expect(pr.body).toContain('https://lib.example/course/MT1005/#bang-cong-thuc');
    expect(pr.body).toContain(`https://up.example/xem-duyet/${body.code}`);
  });

  it('bản cập nhật trỏ tới tài liệu không có thì báo lỗi', async () => {
    for (const replaces of ['MT1005/khong-co', 'XX9999/bang-cong-thuc', 'linh-tinh']) {
      const { res, body } = await run(post(form({ replaces }, pdfBytes(1300, 5))));
      expect(res.status).toBe(400);
      expect(body.errors).toHaveProperty('replaces');
    }
  });
});

describe('POST /bao-ket-qua', () => {
  const CODE = 'Abcde12345';
  function notifyFetch({ state = 'closed', merged = false, comment = 'Trùng tài liệu đã có, xem **bảng công thức**.' } = {}) {
    const base = fakeFetch();
    const sent = [];
    const fn = async (url, init = {}) => {
      const u = new URL(String(url));
      if (u.host === 'api.resend.com') {
        sent.push({ headers: init.headers, body: JSON.parse(init.body) });
        return json({ id: 'e1' });
      }
      if (u.pathname === `/repos/${REPO}/pulls`) return json([{ number: 7, state, merged_at: merged ? '2026-10-04T00:00:00Z' : null }]);
      if (u.pathname === `/repos/${REPO}/issues/7/comments`) return json([{ body: comment }]);
      return base(url, init);
    };
    fn.sent = sent;
    return fn;
  }
  const call = (code = CODE) => new Request('https://worker.example/bao-ket-qua', { method: 'POST', body: JSON.stringify({ code }) });
  const envMail = { RESEND_API_KEY: 're_test', NOTIFY_FROM: 'Lib <a@mail.example>', SITE_BASE: 'https://lib.example/' };

  it('PR bị đóng: gửi một email kèm lý do rồi xóa email khỏi kho', async () => {
    await env.QUARANTINE.put(`notify/${CODE}`, JSON.stringify({ email: 'an@example.com', course: 'MT1005' }));
    const fetch = notifyFetch();
    const { res, body } = await run(call(), { fetch, envOver: envMail });
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, sent: true });
    expect(fetch.sent).toHaveLength(1);
    expect(fetch.sent[0].headers.Authorization).toBe('Bearer re_test');
    expect(fetch.sent[0].body.to).toEqual(['an@example.com']);
    expect(fetch.sent[0].body.subject).toBe(`Bài ${CODE} chưa được duyệt`);
    expect(fetch.sent[0].body.text).toContain('Trùng tài liệu đã có, xem bảng công thức.');
    expect(await env.QUARANTINE.get(`notify/${CODE}`)).toBeNull();
    // Gọi lại: không còn email, không gửi nữa.
    const again = await run(call(), { fetch, envOver: envMail });
    expect(again.body).toEqual({ ok: true, sent: false });
    expect(fetch.sent).toHaveLength(1);
  });

  it('PR được gộp: email báo đã duyệt, link trang môn', async () => {
    await env.QUARANTINE.put(`notify/${CODE}`, JSON.stringify({ email: 'an@example.com', course: 'MT1005' }));
    const fetch = notifyFetch({ merged: true });
    await run(call(), { fetch, envOver: envMail });
    expect(fetch.sent[0].body.subject).toBe(`Bài ${CODE} đã được duyệt`);
    expect(fetch.sent[0].body.text).toContain('https://lib.example/course/MT1005/');
  });

  it('PR còn mở hay mã sai: không gửi, giữ email', async () => {
    await env.QUARANTINE.put(`notify/${CODE}`, JSON.stringify({ email: 'an@example.com', course: 'MT1005' }));
    const fetch = notifyFetch({ state: 'open' });
    const { body } = await run(call(), { fetch, envOver: envMail });
    expect(body).toEqual({ ok: true, sent: false });
    expect(fetch.sent).toHaveLength(0);
    expect(await env.QUARANTINE.get(`notify/${CODE}`)).not.toBeNull();
    const bad = await run(call('../x'), { fetch, envOver: envMail });
    expect(bad.res.status).toBe(400);
  });
});

describe('đợt gửi nhiều file', () => {
  function batchForm(n, over = {}) {
    const fd = form({ title: undefined, ...over }, null);
    for (let i = 0; i < n; i += 1) {
      fd.append('file', new File([pdfBytes(900 + i * 10, i + 7)], `bai-${i}.pdf`, { type: 'application/pdf' }));
      fd.set(`title-${i}`, `Slide chương ${i + 1}`);
      fd.set(`type-${i}`, i === 0 ? 'lecture-slides' : 'summary');
    }
    return fd;
  }

  it('ba file: ba mục cùng môn trong một branch, một PR liệt kê từng file', async () => {
    const { res, body, fetch } = await run(post(batchForm(3)));
    expect(res.status).toBe(201);
    const puts = fetch.find('PUT', '/contents/courses/MT1005/items/');
    expect(puts.map((c) => c.url.split('/items/')[1].split('?')[0])).toEqual(['slide-chuong-1.json', 'slide-chuong-2.json', 'slide-chuong-3.json']);
    const keys = await r2Keys();
    expect(keys.filter((k) => k.startsWith(`pending/${body.code}/`))).toHaveLength(3);
    expect(keys.filter((k) => k.startsWith('sha/'))).toHaveLength(3);
    const pr = JSON.parse(fetch.find('POST', '/pulls')[0].body);
    expect(pr.body).toContain('| Số file | 3 |');
    expect(pr.body).toContain('| 1 | Slide bài giảng | MT1005_lecture-slides_slide-chuong-1.pdf |');
    expect(pr.body).not.toContain('Slide chương');
  });

  it('quá số file, file trùng nhau, tiêu đề lỗi của một file, bản cập nhật trong đợt: báo đúng chỗ', async () => {
    const many = await run(post(batchForm(11)));
    expect(many.res.status).toBe(400);
    expect(many.body.errors.file).toContain('tối đa 10 file');
    const same = form({ title: undefined }, null);
    for (let i = 0; i < 2; i += 1) {
      same.append('file', new File([pdfBytes(1000, 3)], `x-${i}.pdf`, { type: 'application/pdf' }));
      same.set(`title-${i}`, `Tài liệu ${i}`);
    }
    const dup = await run(post(same));
    expect(dup.res.status).toBe(400);
    expect(dup.body.errors.file).toContain('giống hệt nhau');
    const bad = batchForm(2);
    bad.set('title-1', '');
    const r = await run(post(bad));
    expect(r.res.status).toBe(400);
    expect(Object.keys(r.body.errors)).toEqual(['title-1']);
    const upd = await run(post(batchForm(2, { replaces: 'MT1005/bang-cong-thuc' })));
    expect(upd.body.errors).toHaveProperty('replaces');
    expect(await r2Keys()).toEqual([]);
  });

  // Mục ghi lên branch, đọc lại từ lời gọi PUT.
  const itemsOf = (fetch) =>
    fetch.find('PUT', '/contents/courses/').map((c) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(JSON.parse(c.body).content), (x) => x.charCodeAt(0)))));

  function examForm(over = {}) {
    const fd = form({ title: undefined, type: 'exam-past', examKind: 'ck', ...over }, null);
    for (let i = 0; i < 3; i += 1) {
      fd.append('file', new File([pdfBytes(700 + i * 10, i + 11)], `de-${i}.pdf`, { type: 'application/pdf' }));
      fd.set(`title-${i}`, `Đề cuối kỳ ${i}`);
      fd.set(`type-${i}`, 'exam-past');
    }
    return fd;
  }

  it('học kỳ, loại kiểm tra, chương ghi riêng từng file; để trống thì theo ô chung', async () => {
    const fd = examForm({ term: 'HK251' });
    fd.set('term-0', 'HK222');
    fd.set('term-1', '  ');
    fd.set('examKind-2', 'gk');
    const { res, fetch } = await run(post(fd));
    expect(res.status).toBe(201);
    const items = itemsOf(fetch);
    expect(items.map((x) => [x.term, x.examKind])).toEqual([
      ['HK222', 'ck'],
      ['HK251', 'ck'],
      ['HK251', 'gk'],
    ]);
    // Tên file theo học kỳ của từng file.
    expect((await r2Keys()).filter((k) => k.startsWith('pending/')).some((k) => k.endsWith('_HK222.pdf'))).toBe(true);
  });

  it('học kỳ riêng sai dạng: lỗi ở dòng của file đó; thiếu học kỳ chung: lỗi ở ô chung', async () => {
    const bad = examForm({ term: 'HK251' });
    bad.set('term-1', 'K21');
    const r = await run(post(bad));
    expect(r.res.status).toBe(400);
    expect(Object.keys(r.body.errors)).toEqual(['term-1']);
    const none = examForm();
    none.set('term-0', 'HK222');
    const r2 = await run(post(none));
    expect(r2.res.status).toBe(400);
    expect(Object.keys(r2.body.errors)).toEqual(['term']);
    expect(await r2Keys()).toEqual([]);
  });

  it('đề tổng hợp, không rõ học kỳ (termUnknown): nhận bài, mục không có term; file có học kỳ riêng vẫn giữ', async () => {
    const fd = examForm({ termUnknown: 'on' });
    fd.set('term-2', 'HK231');
    const { res, fetch } = await run(post(fd));
    expect(res.status).toBe(201);
    const items = itemsOf(fetch);
    expect(items.map((x) => x.term)).toEqual([undefined, undefined, 'HK231']);
    for (const x of items) expect(x).not.toHaveProperty('termUnknown');
  });

  it('file trùng trong đợt: báo mọi file trùng ở đúng dòng, không lưu gì', async () => {
    const fd = batchForm(3);
    const files = fd.getAll('file');
    const shas = await Promise.all(files.map(async (f) => sha256Hex(new Uint8Array(await f.arrayBuffer()))));
    const item = index.faculties[0].courses[0].items[0].files[0];
    const removed = index.faculties[0].courses[0].items[2].files[0];
    const saved = [item.sha256, removed.sha256];
    item.sha256 = shas[0];
    removed.sha256 = shas[2];
    try {
      const { res, body } = await run(post(fd));
      expect(res.status).toBe(409);
      expect(Object.keys(body.errors)).toEqual(['file-0', 'file-2']);
      expect(body.errors['file-0']).toContain('đã có trong thư viện');
      expect(body.errors['file-2']).toContain('đã bị gỡ');
      expect(body.errors['file-0']).toContain('Bỏ file này');
      expect(await r2Keys()).toEqual([]);
    } finally {
      [item.sha256, removed.sha256] = saved;
    }
  });

  it('đợt gửi có file đang chờ duyệt ở bài khác: 409 ở dòng file đó', async () => {
    const fetch = fakeFetch();
    const single = form({}, pdfBytes(900 + 10, 8));
    expect((await run(post(single), { fetch })).res.status).toBe(201);
    const { res, body } = await run(post(batchForm(2)), { fetch });
    expect(res.status).toBe(409);
    expect(Object.keys(body.errors)).toEqual(['file-1']);
    expect(body.errors['file-1']).toContain('đang chờ duyệt');
  });
});

describe('tải file lớn theo phần', () => {
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
  async function start(file, over = {}) {
    const fd = form({ upload: 'chunked', 'file-count': '1', 'file-name-0': UPLOAD_NAME, 'file-size-0': String(file.length), 'file-sha256-0': await sha256Hex(file), 'file-head-0': b64(file.subarray(0, 16)), ...over }, null);
    return run(post(fd));
  }
  const put = (code, k, part, bytes) =>
    new Request(`https://worker.example/submit/${code}/0/${part}?k=${k}`, { method: 'PUT', body: bytes, headers: { Origin: SITE, 'Content-Length': String(bytes.length) } });
  const done = (code, k, parts) =>
    new Request(`https://worker.example/submit/${code}/xong?k=${k}`, { method: 'POST', body: JSON.stringify({ parts: [parts] }), headers: { Origin: SITE, 'Content-Type': 'application/json' } });

  it('bắt đầu, gửi phần, xong: file trong kho đúng từng byte, mở PR, xóa phiên', async () => {
    const file = pdfBytes(5000);
    const { res, body } = await start(file);
    expect(res.status).toBe(200);
    const { code, upload } = body;
    expect(upload.files).toEqual([{ index: 0, parts: 1 }]);
    const fetch = fakeFetch();
    const handler = createHandler({ fetch });
    const p = await (await handler.fetch(put(code, upload.token, 1, file), makeEnv(), ctx())).json();
    expect(p.ok).toBe(true);
    const fin = await handler.fetch(done(code, upload.token, [{ partNumber: p.partNumber, etag: p.etag }]), makeEnv(), ctx());
    expect(fin.status).toBe(201);
    expect((await fin.json()).code).toBe(code);
    const keys = await r2Keys();
    const fileKey = keys.find((k) => k.startsWith(`pending/${code}/`));
    expect(new Uint8Array(await (await env.QUARANTINE.get(fileKey)).arrayBuffer())).toEqual(file);
    expect(keys).toContain(`sha/${await sha256Hex(file)}`);
    expect(keys.some((k) => k.startsWith('upload/'))).toBe(false);
  });

  it('mã bí mật sai: 404; cỡ phần sai: 400; thiếu phần khi xong: 400 và dọn file', async () => {
    const file = pdfBytes(5000, 3);
    const { body } = await start(file);
    const { code, upload } = body;
    const handler = createHandler({ fetch: fakeFetch() });
    const wrong = 'A'.repeat(43);
    expect((await handler.fetch(put(code, wrong, 1, file), makeEnv(), ctx())).status).toBe(404);
    expect((await handler.fetch(put(code, upload.token, 1, file.subarray(0, 100)), makeEnv(), ctx())).status).toBe(400);
    const fin = await handler.fetch(done(code, upload.token, []), makeEnv(), ctx());
    expect(fin.status).toBe(400);
    expect((await r2Keys()).some((k) => k.startsWith('pending/'))).toBe(false);
  });

  it('sha256 sai dạng: 400, không tạo phiên', async () => {
    const file = pdfBytes(5000, 5);
    expect((await start(file, { 'file-sha256-0': 'xyz' })).res.status).toBe(400);
    expect((await r2Keys()).some((k) => k.startsWith('upload/'))).toBe(false);
  });
});

