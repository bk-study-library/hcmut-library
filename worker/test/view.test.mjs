import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import policy from '../../catalog/policy.json';
import { createHandler } from '../src/index.mjs';
import { verifyAccessJwt } from '../src/access.mjs';

const REPO = 'own/lib';
const TEAM = 'nhom.cloudflareaccess.com';
const AUD = 'aud-thu-vien';
const CODE = 'Abc123XYZ0';
const NOW = 1_800_000_000_000;
const NAME = 'MT1005_summary_tom-tat.pdf';
const index = { version: 1, faculties: [] };

const enc = new TextEncoder();
const b64url = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64json = (o) => b64url(enc.encode(JSON.stringify(o)));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

let pem;
let accessKey;
let otherKey;
let jwk;
beforeAll(async () => {
  const gen = () =>
    crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
  const app = await gen();
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', app.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  accessKey = await gen();
  otherKey = await gen();
  const pub = await crypto.subtle.exportKey('jwk', accessKey.publicKey);
  jwk = { kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n: pub.n, e: pub.e };
});

async function signJwt(claims, { key = accessKey.privateKey, kid = 'k1', alg = 'RS256' } = {}) {
  const head = b64json({ alg, kid, typ: 'JWT' });
  const body = b64json(claims);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

const t = Math.floor(NOW / 1000);
const goodClaims = (over = {}) => ({ aud: [AUD], iss: `https://${TEAM}`, exp: t + 600, nbf: t - 10, iat: t - 10, email: 'x@y', ...over });

// fetch giả: khóa Access, GitHub (token, danh mục, PR theo nhánh).
const ITEM_PATH = 'courses/MT1005/items/tom-tat.json';
const ITEM = {
  id: 'tom-tat',
  course: 'MT1005',
  type: 'summary',
  title: 'Tóm tắt <script>alert(1)</script>',
  description: 'Dòng 1\nXem https://lua-dao.example',
  lang: 'vi',
  license: 'CC-BY-SA-4.0',
  teacher: 'Thầy "A" & cô B',
  authors: ['Nguyen Van An'],
};

function fakeFetch({ pr = { state: 'open', merged_at: null }, fail = {}, item = ITEM, files = [{ filename: ITEM_PATH, status: 'added' }, { filename: 'index.json', status: 'modified' }], courses = {} } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const u = new URL(String(url));
    calls.push({ url: String(url), method });
    if (u.host === TEAM && u.pathname === '/cdn-cgi/access/certs') return json({ keys: [jwk], public_certs: [] });
    if (u.pathname.startsWith('/app/installations/')) return json({ token: 'ghs_secret' }, 201);
    if (u.pathname === `/repos/${REPO}/contents/catalog/policy.json`) return new Response(JSON.stringify(policy));
    if (u.pathname === `/repos/${REPO}/contents/index.json`) return new Response(JSON.stringify(index));
    if (u.pathname === `/repos/${REPO}/compare/main...upload/${CODE}`) {
      if (fail.compare) return json({ message: 'x' }, fail.compare);
      return json({ files });
    }
    if (u.pathname === `/repos/${REPO}/contents/${ITEM_PATH}`) {
      if (u.searchParams.get('ref') !== `upload/${CODE}`) return json({ message: 'Not Found' }, 404);
      return new Response(typeof item === 'string' ? item : JSON.stringify(item));
    }
    const coursePath = /^\/repos\/[^/]+\/[^/]+\/contents\/(catalog\/courses\/[A-Z0-9_]+\.json)$/.exec(u.pathname);
    if (coursePath && courses[coursePath[1]] !== undefined && u.searchParams.get('ref') === `upload/${CODE}`) {
      const c = courses[coursePath[1]];
      return new Response(typeof c === 'string' ? c : JSON.stringify(c));
    }
    if (u.pathname === `/repos/${REPO}/pulls` && method === 'GET') {
      if (fail.pulls) return json({ message: 'x' }, fail.pulls);
      return json(pr ? [pr] : []);
    }
    return json({ message: 'Not Found' }, 404);
  };
  fn.calls = calls;
  fn.find = (part) => calls.filter((c) => c.url.includes(part));
  return fn;
}

// Cache API giả, riêng cho từng handler.
function memCache() {
  const m = new Map();
  return {
    async match(k) {
      const v = m.get(String(k));
      return v ? new Response(v) : undefined;
    },
    async put(k, res) {
      m.set(String(k), await res.text());
    },
  };
}

function makeEnv(over = {}) {
  return {
    QUARANTINE: env.QUARANTINE,
    REPO,
    BRANCH: 'main',
    CATALOG_TTL_SECONDS: '0',
    GH_APP_ID: '1',
    GH_APP_PRIVATE_KEY: pem,
    GH_INSTALLATION_ID: '2',
    REVIEW_BASE: 'https://up.example',
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ...over,
  };
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });

async function get(path, { headers = {}, fetch = fakeFetch(), envOver = {}, cache = memCache() } = {}) {
  const handler = createHandler({ fetch, now: () => NOW, cache: () => cache });
  const res = await handler.fetch(new Request(`https://up.example${path}`, { headers }), makeEnv(envOver), ctx());
  return { res, fetch };
}

async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);
const K = b64url(new Uint8Array(32).fill(7));

async function putToken(k = K, course = 'MT1005') {
  await env.QUARANTINE.put(`token/${CODE}`, await sha256Hex(k), { customMetadata: { course } });
}

beforeEach(async () => {
  const list = await env.QUARANTINE.list();
  const keys = list.objects.map((o) => o.key);
  if (keys.length) await env.QUARANTINE.delete(keys);
});

const SAFE = {
  'content-security-policy': 'sandbox',
  'x-content-type-options': 'nosniff',
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
};

describe('verifyAccessJwt', () => {
  const opts = () => ({ team: TEAM, aud: AUD, fetch: fakeFetch(), cache: memCache(), now: () => NOW });

  it('JWT hợp lệ', async () => {
    expect(await verifyAccessJwt(await signJwt(goodClaims()), opts())).toBe(true);
    // aud dạng chuỗi cũng được.
    expect(await verifyAccessJwt(await signJwt(goodClaims({ aud: AUD })), opts())).toBe(true);
  });

  it('sai aud, sai iss, hết hạn, chưa tới nbf: từ chối', async () => {
    expect(await verifyAccessJwt(await signJwt(goodClaims({ aud: ['khac'] })), opts())).toBe(false);
    expect(await verifyAccessJwt(await signJwt(goodClaims({ iss: 'https://khac.cloudflareaccess.com' })), opts())).toBe(false);
    expect(await verifyAccessJwt(await signJwt(goodClaims({ exp: t - 61 })), opts())).toBe(false);
    expect(await verifyAccessJwt(await signJwt(goodClaims({ nbf: t + 61 })), opts())).toBe(false);
    expect(await verifyAccessJwt(await signJwt(goodClaims({ exp: undefined })), opts())).toBe(false);
  });

  it('trong khoảng lệch 60 giây vẫn nhận', async () => {
    expect(await verifyAccessJwt(await signJwt(goodClaims({ exp: t - 59, nbf: t + 59 })), opts())).toBe(true);
  });

  it('chữ ký khóa khác, kid lạ, alg khác, chuỗi hỏng: từ chối', async () => {
    expect(await verifyAccessJwt(await signJwt(goodClaims(), { key: otherKey.privateKey }), opts())).toBe(false);
    expect(await verifyAccessJwt(await signJwt(goodClaims(), { kid: 'k9' }), opts())).toBe(false);
    expect(await verifyAccessJwt(await signJwt(goodClaims(), { alg: 'none' }), opts())).toBe(false);
    expect(await verifyAccessJwt('a.b', opts())).toBe(false);
    expect(await verifyAccessJwt(null, opts())).toBe(false);
  });

  it('khóa của team giữ trong cache: chỉ đọc một lần', async () => {
    const o = opts();
    const jwt = await signJwt(goodClaims());
    await verifyAccessJwt(jwt, o);
    await verifyAccessJwt(jwt, o);
    expect(o.fetch.find('/cdn-cgi/access/certs')).toHaveLength(1);
    expect(o.fetch.find('/cdn-cgi/access/certs')[0].url).toBe(`https://${TEAM}/cdn-cgi/access/certs`);
  });
});

describe('GET /xem-duyet/<mã>', () => {
  const auth = async (claims = goodClaims()) => ({ 'Cf-Access-Jwt-Assertion': await signJwt(claims) });

  it('chưa cấu hình ACCESS_TEAM_DOMAIN hay ACCESS_AUD: 503, không đọc kho', async () => {
    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    for (const envOver of [{ ACCESS_TEAM_DOMAIN: '' }, { ACCESS_AUD: '' }]) {
      const { res, fetch } = await get(`/xem-duyet/${CODE}`, { headers: await auth(), envOver });
      expect(res.status).toBe(503);
      expect(await res.text()).toContain('chưa được cài đặt');
      expect(fetch.calls).toEqual([]);
    }
  });

  it('thiếu header: 403', async () => {
    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    const { res } = await get(`/xem-duyet/${CODE}`);
    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('JWT sai aud, sai iss, hết hạn: 403', async () => {
    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    for (const claims of [goodClaims({ aud: ['x'] }), goodClaims({ iss: 'https://x.cloudflareaccess.com' }), goodClaims({ exp: t - 3600 })]) {
      const { res } = await get(`/xem-duyet/${CODE}`, { headers: await auth(claims) });
      expect(res.status).toBe(403);
    }
  });

  it('mã bài sai dạng: chưa đăng nhập thì 403, đã đăng nhập thì 404', async () => {
    expect((await get('/xem-duyet/abc')).res.status).toBe(403);
    expect((await get('/xem-duyet/abc', { headers: await auth() })).res.status).toBe(404);
  });

  it('JWT hợp lệ: /file trả bản đã làm sạch, ưu tiên clean hơn pending, header an toàn', async () => {
    await env.QUARANTINE.put(`pending/${CODE}/${NAME}`, new Uint8Array([9, 9, 9]));
    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    const { res } = await get(`/xem-duyet/${CODE}/file`, { headers: await auth() });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf);
    for (const [h, v] of Object.entries(SAFE)) expect(res.headers.get(h)).toBe(v);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(`inline; filename*=UTF-8''${NAME}`);
    expect(res.headers.get('content-length')).toBe(String(pdf.length));
  });

  it('chỉ có pending: /file là trang cảnh báo chưa quét, nút tải trả file dạng attachment', async () => {
    await env.QUARANTINE.put(`pending/${CODE}/${NAME}`, pdf);
    const { res } = await get(`/xem-duyet/${CODE}/file`, { headers: await auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const html = await res.text();
    expect(html).toContain('File chưa quét virus xong');
    expect(html).toContain(`href="/xem-duyet/${CODE}/file?tai=1"`);

    const dl = await get(`/xem-duyet/${CODE}/file?tai=1`, { headers: await auth() });
    expect(dl.res.status).toBe(200);
    expect(new Uint8Array(await dl.res.arrayBuffer())).toEqual(pdf);
    expect(dl.res.headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''${NAME}`);
    for (const [h, v] of Object.entries(SAFE)) expect(dl.res.headers.get(h)).toBe(v);
  });

  it('Content-Disposition theo loại: pdf, png, jpg inline; loại khác attachment; Content-Type theo policy', async () => {
    const cases = [
      ['a.pdf', 'inline', 'application/pdf'],
      ['a.png', 'inline', 'image/png'],
      ['a.jpg', 'inline', 'image/jpeg'],
      ['a.docx', 'attachment', policy.extensions['.docx'].mime],
      ['a.md', 'attachment', 'text/markdown'],
      ['a.zip', 'attachment', 'application/zip'],
    ];
    for (const [name, disp, mime] of cases) {
      const list = await env.QUARANTINE.list();
      if (list.objects.length) await env.QUARANTINE.delete(list.objects.map((o) => o.key));
      // Content-Type lưu trong R2 bị bỏ qua: chỉ tin policy.
      await env.QUARANTINE.put(`clean/${CODE}/${name}`, pdf, { httpMetadata: { contentType: 'text/html' } });
      const { res } = await get(`/xem-duyet/${CODE}/file`, { headers: await auth() });
      expect(res.headers.get('content-disposition')).toBe(`${disp}; filename*=UTF-8''${name}`);
      expect(res.headers.get('content-type')).toBe(mime);
    }
  });

  it('không có file: /file trả 404', async () => {
    const { res } = await get(`/xem-duyet/${CODE}/file`, { headers: await auth() });
    expect(res.status).toBe(404);
  });

  it('trang duyệt: hiện chữ người gửi đã thoát HTML, rồi nút xem và tải file', async () => {
    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    const { res, fetch } = await get(`/xem-duyet/${CODE}`, { headers: await auth() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const html = await res.text();
    expect(html).toContain(`Duyệt bài ${CODE}`);
    expect(html).toContain('Tóm tắt &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script');
    expect(html).toContain('Thầy &quot;A&quot; &amp; cô B');
    expect(html).toContain('Dòng 1\nXem https://lua-dao.example');
    expect(html).not.toContain('href="https://lua-dao');
    expect(html).toContain('<dt>Loại</dt><dd>Tóm tắt</dd>');
    expect(html).toContain('<dt>Tên hiển thị</dt><dd>Nguyen Van An</dd>');
    // Chữ đứng trước nút file.
    expect(html.indexOf('Tóm tắt &lt;script')).toBeLessThan(html.indexOf(`href="/xem-duyet/${CODE}/file"`));
    expect(html).toContain(`href="/xem-duyet/${CODE}/file?tai=1"`);
    const [cmp] = fetch.find('/compare/');
    expect(cmp.url).toBe(`https://api.github.com/repos/${REPO}/compare/main...upload/${CODE}`);
  });

  it('trang duyệt: file chưa quét thì cảnh báo và chỉ có nút tải', async () => {
    await env.QUARANTINE.put(`pending/${CODE}/${NAME}`, pdf);
    const html = await (await get(`/xem-duyet/${CODE}`, { headers: await auth() })).res.text();
    expect(html).toContain('Máy chưa quét virus xong');
    expect(html).toContain(`href="/xem-duyet/${CODE}/file?tai=1"`);
    expect(html).not.toContain(`href="/xem-duyet/${CODE}/file"`);
  });

  it('trang duyệt: sách tham khảo không file, có thông tin sách', async () => {
    const item = { ...ITEM, type: 'book-ref', book: { title: 'Giải tích 1', authors: ['A', 'B'], year: 2020 } };
    const html = await (await get(`/xem-duyet/${CODE}`, { headers: await auth(), fetch: fakeFetch({ item }) })).res.text();
    expect(html).toContain('<dt>Tên sách</dt><dd>Giải tích 1</dd>');
    expect(html).toContain('<dt>Tác giả</dt><dd>A, B</dd>');
    expect(html).toContain('Bài này là sách tham khảo, không có file.');
  });

  it('trang duyệt: bài có môn mới thì báo môn mới đầu trang, tên môn đã thoát HTML, link Sổ tay', async () => {
    const path = 'catalog/courses/MT1005.json';
    const course = {
      id: 'MT1005', code: 'MT1005', name: 'Siêu cao tần <b>x</b>', faculty: 'dee',
      handbookUrl: 'https://hcmut.edu.vn/study/handbook/subject/MT1005', note: 'Môn mới do người gửi đề xuất, chờ người duyệt xác nhận.',
    };
    const files = [{ filename: ITEM_PATH, status: 'added' }, { filename: path, status: 'added' }];
    const html = await (await get(`/xem-duyet/${CODE}`, { headers: await auth(), fetch: fakeFetch({ files, courses: { [path]: course } }) })).res.text();
    expect(html).toContain('Môn mới: MT1005');
    expect(html).toContain('<dt>Tên môn</dt><dd>Siêu cao tần &lt;b&gt;x&lt;/b&gt;</dd>');
    expect(html).toContain('<dt>Khoa</dt><dd>dee</dd>');
    expect(html).toContain('href="https://hcmut.edu.vn/study/handbook/subject/MT1005"');
    expect(html.indexOf('Môn mới: MT1005')).toBeLessThan(html.indexOf('Chữ dưới đây do người gửi nhập'));

    // Link không phải https thì không thành link; file môn đã có trên main (sửa) không coi là môn mới.
    const bad = { ...course, handbookUrl: 'javascript:alert(1)' };
    const html2 = await (await get(`/xem-duyet/${CODE}`, { headers: await auth(), fetch: fakeFetch({ files, courses: { [path]: bad } }) })).res.text();
    expect(html2).toContain('Môn mới: MT1005');
    expect(html2).not.toContain('javascript:');
    const modified = [{ filename: ITEM_PATH, status: 'added' }, { filename: path, status: 'modified' }];
    const html3 = await (await get(`/xem-duyet/${CODE}`, { headers: await auth(), fetch: fakeFetch({ files: modified, courses: { [path]: course } }) })).res.text();
    expect(html3).not.toContain('Môn mới');
    // Bài thường không có phần môn mới.
    const html4 = await (await get(`/xem-duyet/${CODE}`, { headers: await auth() })).res.text();
    expect(html4).not.toContain('Môn mới');
  });

  it('trang duyệt: không đọc được mục (nhánh mất, JSON hỏng) thì báo; JSON hỏng vẫn hiện file của bài', async () => {
    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    for (const [fetch, hasFile] of [[fakeFetch({ fail: { compare: 404 } }), false], [fakeFetch({ item: '{hỏng' }), true], [fakeFetch({ item: [1] }), true]]) {
      const { res } = await get(`/xem-duyet/${CODE}`, { headers: await auth(), fetch });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Không đọc được mục tài liệu');
      expect(html.includes(`href="/xem-duyet/${CODE}/file"`)).toBe(hasFile);
    }
  });

  it('/file cần đăng nhập như trang duyệt', async () => {
    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    expect((await get(`/xem-duyet/${CODE}/file`)).res.status).toBe(403);
    expect((await get('/xem-duyet/abc/file', { headers: await auth() })).res.status).toBe(404);
  });

  it('chỉ nhận GET', async () => {
    const handler = createHandler({ fetch: fakeFetch(), now: () => NOW, cache: () => memCache() });
    const res = await handler.fetch(new Request(`https://up.example/xem-duyet/${CODE}`, { method: 'POST' }), makeEnv(), ctx());
    expect(res.status).toBe(405);
  });
});

describe('GET /xem/<mã>?k=<mã bí mật>', () => {
  it('mã đúng: trang trạng thái đang chờ duyệt, có nút xem file', async () => {
    await putToken();
    await env.QUARANTINE.put(`pending/${CODE}/${NAME}`, pdf);
    const { res, fetch } = await get(`/xem/${CODE}?k=${K}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const html = await res.text();
    expect(html).toContain('Đang chờ duyệt.');
    expect(html).toContain(`href="/xem/${CODE}/file?k=${K}"`);
    const [pulls] = fetch.find('/pulls');
    expect(new URL(pulls.url).searchParams.get('head')).toBe(`own:upload/${CODE}`);
    expect(new URL(pulls.url).searchParams.get('state')).toBe('all');
  });

  it('mã sai, thiếu, sai dạng hay bài không có mã: 404 giống nhau', async () => {
    await putToken();
    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    const wrong = b64url(new Uint8Array(32).fill(8));
    const pages = [];
    for (const path of [`/xem/${CODE}?k=${wrong}`, `/xem/${CODE}`, `/xem/${CODE}?k=abc`, `/xem/${CODE}/file?k=${wrong}`, `/xem/ZZZZZZZZZZ?k=${K}`, '/xem/abc']) {
      const { res, fetch } = await get(path);
      expect(res.status).toBe(404);
      pages.push(await res.text());
      expect(fetch.calls).toEqual([]);
    }
    expect(new Set(pages).size).toBe(1);
  });

  it('trạng thái theo PR: đã merge có link trang môn, đóng là không được nhận', async () => {
    await putToken(K, 'GE4169-2024');
    let r = await get(`/xem/${CODE}?k=${K}`, { fetch: fakeFetch({ pr: { state: 'closed', merged_at: '2026-10-01T00:00:00Z' } }) });
    let html = await r.res.text();
    expect(html).toContain('Đã đăng.');
    expect(html).toContain('href="https://bk-study-library.github.io/hcmut-library/course/GE4169-2024/"');
    expect(html).toContain('File không còn trong kho chờ duyệt.');

    r = await get(`/xem/${CODE}?k=${K}`, { fetch: fakeFetch({ pr: { state: 'closed', merged_at: null } }) });
    expect(await r.res.text()).toContain('Không được nhận.');

    r = await get(`/xem/${CODE}?k=${K}`, { fetch: fakeFetch({ pr: null }) });
    expect(await r.res.text()).toContain('Chưa đọc được trạng thái bài.');

    r = await get(`/xem/${CODE}?k=${K}`, { fetch: fakeFetch({ fail: { pulls: 500 } }) });
    expect(r.res.status).toBe(200);
    expect(await r.res.text()).toContain('Chưa đọc được trạng thái bài.');
  });

  it('trạng thái giữ trong cache 60 giây', async () => {
    await putToken();
    const cache = memCache();
    const fetch = fakeFetch();
    await get(`/xem/${CODE}?k=${K}`, { fetch, cache });
    await get(`/xem/${CODE}?k=${K}`, { fetch, cache });
    expect(fetch.find('/pulls')).toHaveLength(1);
  });

  it('xem file: cùng luật với người duyệt (clean trước, pending có cảnh báo)', async () => {
    await putToken();
    await env.QUARANTINE.put(`pending/${CODE}/${NAME}`, pdf);
    let r = await get(`/xem/${CODE}/file?k=${K}`);
    const html = await r.res.text();
    expect(html).toContain('File chưa quét virus xong');
    expect(html).toContain(`href="/xem/${CODE}/file?k=${K}&amp;tai=1"`);

    r = await get(`/xem/${CODE}/file?k=${K}&tai=1`);
    expect(r.res.headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''${NAME}`);
    for (const [h, v] of Object.entries(SAFE)) expect(r.res.headers.get(h)).toBe(v);

    await env.QUARANTINE.put(`clean/${CODE}/${NAME}`, pdf);
    r = await get(`/xem/${CODE}/file?k=${K}`);
    expect(r.res.headers.get('content-disposition')).toBe(`inline; filename*=UTF-8''${NAME}`);
    expect(new Uint8Array(await r.res.arrayBuffer())).toEqual(pdf);
  });
});
