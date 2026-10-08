import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:workers';
import policy from '../../catalog/policy.json';
import { createHandler } from '../src/index.mjs';
import { sweep } from '../src/cron.mjs';
import { checksGreen, decisionComment, parseDecisions, REVIEW_MESSAGES, reviewKey } from '../src/review.mjs';
import { notifyMessage, reviewFiles } from '../src/notify.mjs';

const REPO = 'own/lib';
const TEAM = 'nhom.cloudflareaccess.com';
const AUD = 'aud-thu-vien';
const CODE = 'Rev123XYZ0';
const NOW = 1_800_000_000_000;
const ORIGIN = 'https://up.example';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

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
let jwk;
beforeAll(async () => {
  const gen = () =>
    crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const app = await gen();
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', app.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  pem = `-----BEGIN PRIVATE KEY-----\n${btoa(bin).match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  accessKey = await gen();
  const pub = await crypto.subtle.exportKey('jwk', accessKey.publicKey);
  jwk = { kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n: pub.n, e: pub.e };
});

async function auth() {
  const t = Math.floor(NOW / 1000);
  const head = b64json({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64json({ aud: [AUD], iss: `https://${TEAM}`, exp: t + 600, iat: t - 10, email: 'nguoi.duyet@truong.example' });
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', accessKey.privateKey, enc.encode(`${head}.${body}`)));
  return { 'Cf-Access-Jwt-Assertion': `${head}.${body}.${b64url(sig)}` };
}

const item = (id, name, sha) => ({ id, course: 'MT1005', type: 'slides', title: `Slide ${id}`, files: [{ name, sha256: sha, uploadSha256: sha }] });
const PATH_A = 'courses/MT1005/items/chuong-1.json';
const PATH_B = 'courses/MT1005/items/chuong-2.json';

// GitHub giả có trạng thái: PR số 7 của branch upload/<mã> với hai mục; ghi lại mọi lệnh ghi.
function fakeGitHub({ state = 'open', runs = [{ name: 'validate', status: 'completed', conclusion: 'success' }], message = 'kiem-file: MT1005', behind = 0, items = { [PATH_A]: item('chuong-1', 'a.pdf', SHA_A), [PATH_B]: item('chuong-2', 'b.pdf', SHA_B) } } = {}) {
  const files = { ...items };
  const writes = [];
  const fn = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const u = new URL(String(url));
    const p = u.pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (u.host === TEAM && p === '/cdn-cgi/access/certs') return json({ keys: [jwk] });
    if (p.startsWith('/app/installations/')) return json({ token: 'ghs_x' }, 201);
    if (p === `/repos/${REPO}/contents/catalog/policy.json`) return new Response(JSON.stringify(policy));
    if (p === `/repos/${REPO}/contents/worker-catalog.json`) return new Response(JSON.stringify({ courses: [{ id: 'MT1005', code: 'MT1005', status: 'active', ids: [] }], shas: [] }));
    if (p === `/repos/${REPO}/pulls` && method === 'GET') return json([{ number: 7, state, merged_at: null }]);
    if (p === `/repos/${REPO}/pulls/7` && method === 'GET') return json({ number: 7, state, merged_at: null, head: { ref: `upload/${CODE}`, sha: 'head1' } });
    if (p === `/repos/${REPO}/git/ref/heads/main`) return json({ object: { sha: 'base1' } });
    if (p === `/repos/${REPO}/pulls` && method === 'POST') {
      writes.push({ method, path: p, body });
      return json({ number: 9, html_url: '' }, 201);
    }
    if (p === `/repos/${REPO}/commits/head1/check-runs`) return json({ check_runs: runs });
    if (p === `/repos/${REPO}/commits/head1`) return json({ commit: { message } });
    if (p === `/repos/${REPO}/git/commits/head1`) return json({ tree: { sha: "tree1" } });
    if (p === `/repos/${REPO}/compare/main...upload/${CODE}` || p === `/repos/${REPO}/compare/main...phan-loai/${CODE}` || p === `/repos/${REPO}/compare/main...go/${CODE}`) return json({ behind_by: behind, files: Object.keys(files).map((filename) => ({ filename, status: 'added' })) });
    const content = /^\/repos\/own\/lib\/contents\/(courses\/.+)$/.exec(p);
    if (content) {
      const path = decodeURIComponent(content[1]);
      if (!(path in files)) return json({ message: 'Not Found' }, 404);
      if (method === 'DELETE') {
        writes.push({ method, path, body });
        delete files[path];
        return json({});
      }
      if (method === 'PUT') {
        // Như GitHub: sửa file đã có mà thiếu sha thì 422.
        if (body.sha !== `sha-${path}`) return json({ message: '"sha" wasn\'t supplied.' }, 422);
        writes.push({ method, path, body });
        return json({}, 201);
      }
      const text = JSON.stringify(files[path]);
      if (init.headers?.Accept === 'application/vnd.github.raw') return new Response(text);
      return json({ encoding: 'base64', content: btoa(String.fromCharCode(...enc.encode(text))), sha: `sha-${path}` });
    }
    if (method !== 'GET') {
      writes.push({ method, path: p, body });
      return json({});
    }
    return json({ message: 'Not Found' }, 404);
  };
  fn.writes = writes;
  fn.files = files;
  return fn;
}

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
const envFor = () => ({
  QUARANTINE: env.QUARANTINE,
  REPO,
  BRANCH: 'main',
  CATALOG_TTL_SECONDS: '0',
  GH_APP_ID: '1',
  GH_APP_PRIVATE_KEY: pem,
  GH_INSTALLATION_ID: '2',
  REVIEW_BASE: ORIGIN,
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
});
const cacheStub = () => ({ async match() {}, async put() {} });

async function call(path, { fetch, method = 'GET', headers = {}, body } = {}) {
  const handler = createHandler({ fetch, now: () => NOW, cache: cacheStub });
  return handler.fetch(new Request(`${ORIGIN}${path}`, { method, headers, body }), envFor(), ctx());
}

const decide = async (fetch, fields, headers = { Origin: ORIGIN }) =>
  call(`/xem-duyet/${CODE}/duyet`, { fetch, method: 'POST', headers: { ...(await auth()), ...headers }, body: new URLSearchParams(fields) });

const stored = async () => {
  const obj = await env.QUARANTINE.get(reviewKey(CODE));
  return obj ? JSON.parse(await obj.text()) : null;
};

beforeEach(async () => {
  const list = await env.QUARANTINE.list();
  if (list.objects.length) await env.QUARANTINE.delete(list.objects.map((o) => o.key));
  for (const [name, sha] of [['a.pdf', SHA_A], ['b.pdf', SHA_B]]) {
    await env.QUARANTINE.put(`clean/${CODE}/${name}`, 'x');
    await env.QUARANTINE.put(`sha/${sha}`, CODE);
  }
});

describe('review.mjs', () => {
  it('parseDecisions: thiếu quyết định, lý do ngắn hay dài thì lỗi; đủ thì tách keep và drop', () => {
    const ids = ['chuong-1', 'chuong-2'];
    expect(parseDecisions({ 'd-chuong-1': 'keep' }, ids)).toEqual({ ok: false, error: REVIEW_MESSAGES.missing });
    expect(parseDecisions({ 'd-chuong-1': 'keep', 'd-chuong-2': 'drop', 'r-chuong-2': ' mờ ' }, ids)).toEqual({ ok: false, error: REVIEW_MESSAGES.reason });
    expect(parseDecisions({ 'd-chuong-1': 'keep', 'd-chuong-2': 'drop', 'r-chuong-2': 'x'.repeat(501) }, ids).ok).toBe(false);
    expect(parseDecisions({ 'd-chuong-1': 'keep', 'd-chuong-2': 'drop', 'r-chuong-2': '  Trùng   tài liệu\u0007 cũ ' }, ids)).toEqual({
      ok: true,
      keep: ['chuong-1'],
      drop: [{ id: 'chuong-2', reason: 'Trùng tài liệu cũ' }],
    });
  });

  it('checksGreen: rỗng hay còn chạy hay lỗi là chưa qua', () => {
    expect(checksGreen([])).toBe(false);
    expect(checksGreen([{ status: 'in_progress', conclusion: null }])).toBe(false);
    expect(checksGreen([{ status: 'completed', conclusion: 'failure' }])).toBe(false);
    expect(checksGreen([{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'skipped' }])).toBe(true);
  });

  it('decisionComment: lý do không gọi tên người, không chèn link hay bảng', () => {
    const text = decisionComment({ keep: ['a'], drop: [{ id: 'b', reason: '@ai đó #77 <b>|x|</b>' }] });
    expect(text).not.toMatch(/@ai|#77|<b>|\|x\|/);
    expect(text).toContain('`a`');
  });
});

describe('trang duyệt và Hoàn tất duyệt', () => {
  it('PR mở, check đã qua: có form gửi về /duyet, CSP cho form-action self', async () => {
    const res = await call(`/xem-duyet/${CODE}`, { fetch: fakeGitHub(), headers: await auth() });
    const html = await res.text();
    expect(html).toContain(`action="/xem-duyet/${CODE}/duyet"`);
    expect(html).toContain('name="d-chuong-1"');
    expect(html).toContain(`href="/xem-duyet/${CODE}/file/b.pdf"`);
    expect(res.headers.get('Content-Security-Policy')).toContain("form-action 'self'");
  });

  it('check chưa xong: không có form, báo chờ', async () => {
    const res = await call(`/xem-duyet/${CODE}`, { fetch: fakeGitHub({ runs: [{ status: 'in_progress', conclusion: null }] }), headers: await auth() });
    const html = await res.text();
    expect(html).not.toContain('<form');
    expect(res.headers.get('Content-Security-Policy')).toContain("form-action 'none'");
  });

  it('thiếu Origin hay Origin lạ, chưa đăng nhập: 403, không ghi gì', async () => {
    const fetch = fakeGitHub();
    expect((await decide(fetch, { 'd-chuong-1': 'keep', 'd-chuong-2': 'keep' }, {})).status).toBe(403);
    expect((await decide(fetch, { 'd-chuong-1': 'keep', 'd-chuong-2': 'keep' }, { Origin: 'https://la.example' })).status).toBe(403);
    expect((await decide(fetch, { 'd-chuong-1': 'keep', 'd-chuong-2': 'keep' }, { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await decide(fetch, { 'd-chuong-1': 'keep', 'd-chuong-2': 'keep' }, { Origin: 'null' })).status).toBe(403);
    const res = await call(`/xem-duyet/${CODE}/duyet`, { fetch, method: 'POST', headers: { Origin: ORIGIN }, body: new URLSearchParams({}) });
    expect(res.status).toBe(403);
    expect(fetch.writes).toEqual([]);
    expect(await stored()).toBeNull();
  });

  it('duyệt hết: comment, gộp đúng sha, ghi quyết định kèm email người duyệt chỉ trong kho', async () => {
    const fetch = fakeGitHub();
    const res = await decide(fetch, { 'd-chuong-1': 'keep', 'd-chuong-2': 'keep' });
    expect(res.status).toBe(200);
    const merge = fetch.writes.find((w) => w.path.endsWith('/pulls/7/merge'));
    expect(merge.body.sha).toBe('head1');
    const comment = fetch.writes.find((w) => w.path.endsWith('/issues/7/comments'));
    expect(comment.body.body).not.toContain('nguoi.duyet');
    const rec = await stored();
    expect(rec).toMatchObject({ reviewer: 'nguoi.duyet@truong.example', keep: ['chuong-1', 'chuong-2'], drop: [], waiting: false });
  });

  it('không duyệt file nào: đóng PR, không gộp', async () => {
    const fetch = fakeGitHub();
    await decide(fetch, { 'd-chuong-1': 'drop', 'r-chuong-1': 'Sai môn học', 'd-chuong-2': 'drop', 'r-chuong-2': 'File mờ quá' });
    expect(fetch.writes.some((w) => w.method === 'PATCH' && w.path.endsWith('/pulls/7') && w.body.state === 'closed')).toBe(true);
    expect(fetch.writes.some((w) => w.path.endsWith('/merge'))).toBe(false);
  });

  it('duyệt một phần: xóa mục và file không duyệt, chưa gộp, chờ bước kiểm', async () => {
    const fetch = fakeGitHub();
    const res = await decide(fetch, { 'd-chuong-1': 'keep', 'd-chuong-2': 'drop', 'r-chuong-2': 'Trùng tài liệu cũ' });
    expect(await res.text()).toContain(REVIEW_MESSAGES.waiting(1));
    // Một commit bỏ mọi file không duyệt, cha là đúng commit đã kiểm.
    expect(fetch.writes.find((w) => w.path.endsWith('/git/trees')).body).toEqual({ base_tree: 'tree1', tree: [{ path: PATH_B, mode: '100644', type: 'blob', sha: null }] });
    expect(fetch.writes.find((w) => w.path.endsWith('/git/commits')).body.parents).toEqual(['head1']);
    expect(fetch.writes.find((w) => w.method === 'PATCH' && w.path.endsWith(`/git/refs/heads/upload/${CODE}`)).body.force).toBe(false);
    expect(fetch.writes.some((w) => w.path.endsWith('/merge'))).toBe(false);
    expect(await env.QUARANTINE.head(`clean/${CODE}/b.pdf`)).toBeNull();
    expect(await env.QUARANTINE.head(`sha/${SHA_B}`)).toBeNull();
    expect(await env.QUARANTINE.head(`clean/${CODE}/a.pdf`)).not.toBeNull();
    expect(await stored()).toMatchObject({ keep: ['chuong-1'], drop: [{ id: 'chuong-2', reason: 'Trùng tài liệu cũ' }], waiting: true });
  });

  it('check chưa qua, PR đã đóng, thiếu lý do: 409, không ghi gì', async () => {
    for (const [fetch, fields, msg] of [
      [fakeGitHub({ runs: [{ status: 'completed', conclusion: 'failure' }] }), { 'd-chuong-1': 'keep', 'd-chuong-2': 'keep' }, REVIEW_MESSAGES.checks],
      [fakeGitHub({ state: 'closed' }), { 'd-chuong-1': 'keep', 'd-chuong-2': 'keep' }, REVIEW_MESSAGES.closed],
      [fakeGitHub(), { 'd-chuong-1': 'keep', 'd-chuong-2': 'drop' }, REVIEW_MESSAGES.reason],
    ]) {
      const res = await decide(fetch, fields);
      expect(res.status).toBe(409);
      expect(await res.text()).toContain(msg);
      expect(fetch.writes).toEqual([]);
    }
    expect(await stored()).toBeNull();
  });
});

describe('POST /duyet-tiep', () => {
  const cont = (fetch, body, method = 'POST') => call('/duyet-tiep', { fetch, method, body: method === 'POST' ? JSON.stringify(body) : undefined });
  const waiting = () => env.QUARANTINE.put(reviewKey(CODE), JSON.stringify({ keep: ['chuong-1'], drop: [{ id: 'chuong-2', reason: 'Trùng tài liệu cũ' }], waiting: true }));
  const onlyA = { [PATH_A]: item('chuong-1', 'a.pdf', SHA_A) };

  it('chỉ nhận POST, mã sai dạng thì 400', async () => {
    expect((await cont(fakeGitHub(), null, 'GET')).status).toBe(405);
    expect((await cont(fakeGitHub(), { code: '../x' })).status).toBe(400);
  });

  it('chưa có quyết định: không gộp, không gọi GitHub ghi', async () => {
    const fetch = fakeGitHub({ items: onlyA });
    expect(await (await cont(fetch, { code: CODE })).json()).toEqual({ ok: true, merged: false });
    expect(fetch.writes).toEqual([]);
  });

  it('đủ điều kiện: gộp và đánh dấu xong', async () => {
    await waiting();
    const fetch = fakeGitHub({ items: onlyA });
    expect(await (await cont(fetch, { code: CODE })).json()).toEqual({ ok: true, merged: true });
    expect(fetch.writes.find((w) => w.path.endsWith('/pulls/7/merge')).body.sha).toBe('head1');
    expect((await stored()).waiting).toBe(false);
  });

  it('bản ghi của form phân loại: gộp branch phan-loai/<mã> rồi xóa branch', async () => {
    await env.QUARANTINE.put(reviewKey(CODE), JSON.stringify({ keep: ['chuong-1'], drop: [], waiting: true, kind: 'phan-loai', branch: `phan-loai/${CODE}` }));
    const fetch = fakeGitHub({ items: onlyA });
    expect(await (await cont(fetch, { code: CODE })).json()).toEqual({ ok: true, merged: true });
    expect(fetch.writes.find((w) => w.path.endsWith('/pulls/7/merge')).body.commit_title).toBe(`Gộp phân loại ${CODE} (người duyệt)`);
    expect(fetch.writes.some((w) => w.method === 'DELETE' && w.path.endsWith(`/git/refs/heads/phan-loai/${CODE}`))).toBe(true);
  });

  it('commit đầu branch không phải của kiem-file, mục trên branch khác danh sách duyệt, check chưa qua, nhánh chưa gồm main: không gộp', async () => {
    await waiting();
    for (const fetch of [
      fakeGitHub({ items: onlyA, message: 'review: bỏ chuong-2' }),
      fakeGitHub(),
      fakeGitHub({ items: onlyA, runs: [{ status: 'in_progress', conclusion: null }] }),
      fakeGitHub({ items: onlyA, behind: 1 }),
    ]) {
      expect(await (await cont(fetch, { code: CODE })).json()).toEqual({ ok: true, merged: false });
      expect(fetch.writes).toEqual([]);
    }
  });
});

describe('email báo kết quả theo từng file', () => {
  const record = { keep: ['chuong-1'], drop: [{ id: 'chuong-2', reason: 'Trùng tài liệu cũ' }], titles: { 'chuong-1': 'Slide chương 1', 'chuong-2': 'Slide chương 2' } };

  it('gộp một phần: tiêu đề ghi một phần, liệt kê file được duyệt và file không duyệt kèm lý do', () => {
    const msg = notifyMessage({ code: CODE, merged: true, reason: '', siteUrl: 'https://site/', statusUrl: null, files: reviewFiles(record) });
    expect(msg.subject).toBe(`Bài ${CODE} đã được duyệt một phần`);
    expect(msg.text).toContain('- Slide chương 1');
    expect(msg.text).toContain('- Slide chương 2: Trùng tài liệu cũ');
  });

  it('không duyệt file nào: lý do từng file thay cho bình luận PR', () => {
    const files = reviewFiles({ ...record, keep: [], drop: [...record.drop, { id: 'chuong-1', reason: 'Sai môn học' }] });
    const msg = notifyMessage({ code: CODE, merged: false, reason: 'bình luận PR', siteUrl: '', statusUrl: null, files });
    expect(msg.text).toContain('- Slide chương 1: Sai môn học');
    expect(msg.text).not.toContain('bình luận PR');
  });

  it('không có quyết định hay hỏng: như cũ', () => {
    expect(reviewFiles(null)).toBeNull();
    expect(reviewFiles({ keep: 'x' })).toBeNull();
    const msg = notifyMessage({ code: CODE, merged: true, reason: '', siteUrl: 'https://site/', statusUrl: null });
    expect(msg.subject).toBe(`Bài ${CODE} đã được duyệt`);
    expect(msg.text).not.toContain('File được duyệt');
  });
});

describe('cron sweep', () => {
  const deps = (fetch) => ({ fetch, now: () => NOW, cache: cacheStub, random: (n) => new Uint8Array(n) });

  it('merge bài duyệt một phần đã đủ điều kiện, không cần workflow gọi', async () => {
    await env.QUARANTINE.put(reviewKey(CODE), JSON.stringify({ keep: ['chuong-1'], drop: [{ id: 'chuong-2', reason: 'Trùng tài liệu cũ' }], waiting: true }));
    const fetch = fakeGitHub({ items: { [PATH_A]: item('chuong-1', 'a.pdf', SHA_A) } });
    await sweep(envFor(), deps(fetch));
    expect(fetch.writes.find((w) => w.path.endsWith('/pulls/7/merge')).body.sha).toBe('head1');
    expect((await stored()).waiting).toBe(false);
  });

  it('PR đã đóng, không có email: xóa quyết định duyệt; còn mở thì giữ', async () => {
    await env.QUARANTINE.put(reviewKey(CODE), JSON.stringify({ keep: [], drop: [], waiting: false, reviewer: 'a@b' }));
    await sweep(envFor(), deps(fakeGitHub()));
    expect(await stored()).not.toBeNull();
    await sweep(envFor(), deps(fakeGitHub({ state: 'closed' })));
    expect(await stored()).toBeNull();
  });
});

describe('form từ trang duyệt có Referrer-Policy no-referrer', () => {
  it('Origin null kèm Sec-Fetch-Site same-origin: nhận', async () => {
    const fetch = fakeGitHub();
    const res = await decide(fetch, { 'd-chuong-1': 'keep', 'd-chuong-2': 'keep' }, { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' });
    expect(res.status).toBe(200);
    expect(fetch.writes.some((w) => w.path.endsWith('/pulls/7/merge'))).toBe(true);
  });
});

describe('lý do chọn sẵn và Duyệt tất cả', () => {
  const ids = ['chuong-1', 'chuong-2'];
  it('lý do chọn sẵn đủ; ghi thêm thì nối vào; Lý do khác phải ghi; mã lạ như không chọn', () => {
    expect(parseDecisions({ 'd-chuong-1': 'keep', 'd-chuong-2': 'drop', 'p-chuong-2': 'trung' }, ids).drop).toEqual([{ id: 'chuong-2', reason: 'Trùng tài liệu đã có trong thư viện' }]);
    expect(parseDecisions({ 'd-chuong-1': 'keep', 'd-chuong-2': 'drop', 'p-chuong-2': 'chat-luong', 'r-chuong-2': 'Trang 3 bị mờ' }, ids).drop[0].reason).toBe('File mờ, thiếu trang hoặc khó đọc. Trang 3 bị mờ');
    expect(parseDecisions({ 'd-chuong-1': 'keep', 'd-chuong-2': 'drop', 'p-chuong-2': 'khac' }, ids)).toEqual({ ok: false, error: REVIEW_MESSAGES.reason });
    expect(parseDecisions({ 'd-chuong-1': 'keep', 'd-chuong-2': 'drop', 'p-chuong-2': '<x>' }, ids).ok).toBe(false);
  });

  it('all=keep duyệt mọi file, bỏ qua lựa chọn từng file', async () => {
    expect(parseDecisions({ all: 'keep', 'd-chuong-2': 'drop' }, ids)).toEqual({ ok: true, keep: ids, drop: [] });
    const fetch = fakeGitHub();
    const res = await decide(fetch, { all: 'keep' });
    expect(res.status).toBe(200);
    expect(fetch.writes.some((w) => w.path.endsWith('/pulls/7/merge'))).toBe(true);
  });

  it('trang có nút Duyệt cả 2 file, các lý do chọn sẵn và thanh Hoàn tất', async () => {
    const html = await (await call(`/xem-duyet/${CODE}`, { fetch: fakeGitHub(), headers: await auth() })).text();
    expect(html).toContain('name="all" value="keep" formnovalidate>Duyệt cả 2 file');
    expect(html).toContain('name="p-chuong-2" value="trung"');
    expect(html).toContain('<div class="bar">');
  });
});

describe('form phân loại /xem-duyet/phan-loai/<môn>/<id>', () => {
  const PATH = '/xem-duyet/phan-loai/MT1005/chuong-1';
  const unclassified = { ...item('chuong-1', 'MT1005_lecture-slides_chuong-1.pdf', SHA_A), type: 'lecture-slides', teacher: 'Cũ', unclassified: ['no-text'] };
  const gh = (it = unclassified) => fakeGitHub({ items: { [PATH_A]: it } });
  const save = async (fetch, fields, headers = { Origin: ORIGIN }) => call(PATH, { fetch, method: 'POST', headers: { ...(await auth()), ...headers }, body: new URLSearchParams(fields) });

  it('cần đăng nhập Access; GET hiện form với lý do và giá trị hiện có', async () => {
    expect((await call(PATH, { fetch: gh() })).status).toBe(403);
    const res = await call(PATH, { fetch: gh(), headers: await auth() });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('PDF không có lớp chữ');
    expect(html).toContain('value="Slide chuong-1"');
    expect(html).toContain('<option value="lecture-slides" selected>');
    expect(res.headers.get('Content-Security-Policy')).toContain("form-action 'self'");
  });

  it('tài liệu không nằm trong Chưa phân loại: 409, không mở PR', async () => {
    const fetch = gh({ ...unclassified, unclassified: undefined });
    expect((await call(PATH, { fetch, headers: await auth() })).status).toBe(409);
    expect((await save(fetch, { type: 'summary', title: 'Tóm tắt' })).status).toBe(409);
    expect(fetch.writes).toEqual([]);
  });

  it('POST từ trang khác: 403; ô sai: 400 hiện lại form, không ghi gì', async () => {
    const fetch = gh();
    expect((await save(fetch, { type: 'summary', title: 'x' }, { Origin: 'https://la.example' })).status).toBe(403);
    const bad = await save(fetch, { type: 'exam-past', title: 'Đề' });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('Đề thi cần học kỳ');
    expect(fetch.writes).toEqual([]);
  });

  it('lưu: mở PR phan-loai/<mã> sửa đúng item (bỏ unclassified, ô trống bị bỏ), ghi quyết định chờ merge', async () => {
    const fetch = gh();
    const res = await save(fetch, { type: 'summary', title: 'Tóm tắt chương 1', term: 'HK251', teacher: '' });
    expect(res.status).toBe(200);
    const ref = fetch.writes.find((w) => w.path.endsWith('/git/refs'));
    const branch = ref.body.ref.replace('refs/heads/', '');
    expect(branch).toMatch(/^phan-loai\/[A-Za-z0-9]{10}$/);
    const put = fetch.writes.find((w) => w.method === 'PUT' && w.path === PATH_A);
    expect(put.body.branch).toBe(branch);
    const saved = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(put.body.content), (c) => c.charCodeAt(0))));
    expect(saved).toEqual({ id: 'chuong-1', course: 'MT1005', type: 'summary', title: 'Tóm tắt chương 1', files: unclassified.files, term: 'HK251' });
    expect(fetch.writes.find((w) => w.path.endsWith('/issues/9/labels')).body).toEqual({ labels: ['phan-loai'] });
    const code = branch.split('/')[1];
    const record = JSON.parse(await (await env.QUARANTINE.get(reviewKey(code))).text());
    expect(record).toMatchObject({ keep: ['chuong-1'], waiting: true, branch, kind: 'phan-loai', reviewer: 'nguoi.duyet@truong.example' });
    // Lần phân loại thứ hai khi lần trước chưa merge: chặn.
    expect((await call(PATH, { fetch: gh(), headers: await auth() })).status).toBe(409);
  });
});

describe('form gỡ tài liệu /xem-duyet/go', () => {
  const PATH = '/xem-duyet/go/MT1005/chuong-1';
  const published = { ...item('chuong-1', 'MT1005_slides_chuong-1.pdf', SHA_A), removed: false, unclassified: ['no-text'] };
  const gh = (it = published) => fakeGitHub({ items: { [PATH_A]: it } });
  const send = async (fetch, fields, headers = { Origin: ORIGIN }) => call(PATH, { fetch, method: 'POST', headers: { ...(await auth()), ...headers }, body: new URLSearchParams(fields) });

  it('ô tìm: cần Access; dán tiêu đề issue Yêu cầu gỡ thì chuyển tới form của tài liệu', async () => {
    expect((await call('/xem-duyet/go', { fetch: gh() })).status).toBe(403);
    expect((await call('/xem-duyet/go', { fetch: gh(), headers: await auth() })).status).toBe(200);
    const res = await call(`/xem-duyet/go?t=${encodeURIComponent('[Gỡ] MT1005 chuong-1')}`, { fetch: gh(), headers: await auth() });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe(PATH);
    expect((await call('/xem-duyet/go?t=abc', { fetch: gh(), headers: await auth() })).status).toBe(400);
  });

  it('GET hiện lý do chọn sẵn; tài liệu đã gỡ: 409', async () => {
    const html = await (await call(PATH, { fetch: gh(), headers: await auth() })).text();
    expect(html).toContain('value="ban-quyen"');
    expect((await call(PATH, { fetch: gh({ ...published, removed: true, removedReason: 'x' }), headers: await auth() })).status).toBe(409);
  });

  it('thiếu lý do, thiếu xác nhận, ghi thêm có thông tin cá nhân, gửi từ trang khác: không ghi gì', async () => {
    const fetch = gh();
    expect((await send(fetch, { note: 'x' })).status).toBe(400);
    expect((await send(fetch, { reason: 'ban-quyen' })).status).toBe(400);
    expect((await send(fetch, { reason: 'ban-quyen', confirm: 'on', note: 'liên hệ an@hcmut.edu.vn' })).status).toBe(400);
    expect((await send(fetch, { reason: 'ban-quyen', confirm: 'on' }, { Origin: 'https://la.example' })).status).toBe(403);
    expect(fetch.writes).toEqual([]);
  });

  it('gỡ: mở PR go/<mã> đặt removed và lý do, giữ files, ghi quyết định; lần sửa thứ hai bị chặn', async () => {
    const fetch = gh();
    expect((await send(fetch, { reason: 'ban-quyen', note: 'Theo yêu cầu của tác giả', confirm: 'on' })).status).toBe(200);
    const branch = fetch.writes.find((w) => w.path.endsWith('/git/refs')).body.ref.replace('refs/heads/', '');
    expect(branch).toMatch(/^go\/[A-Za-z0-9]{10}$/);
    const put = fetch.writes.find((w) => w.method === 'PUT' && w.path === PATH_A);
    const saved = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(put.body.content), (c) => c.charCodeAt(0))));
    expect(saved).toEqual({ id: 'chuong-1', course: 'MT1005', type: 'slides', title: 'Slide chuong-1', files: published.files, removed: true, removedReason: 'Vi phạm bản quyền. Theo yêu cầu của tác giả' });
    expect(fetch.writes.find((w) => w.path.endsWith('/issues/9/labels')).body).toEqual({ labels: ['go-tai-lieu'] });
    const record = JSON.parse(await (await env.QUARANTINE.get(reviewKey(branch.split('/')[1]))).text());
    expect(record).toMatchObject({ kind: 'go', branch, keep: ['chuong-1'], waiting: true });
    expect((await call(PATH, { fetch: gh(), headers: await auth() })).status).toBe(409);
    expect((await call('/xem-duyet/phan-loai/MT1005/chuong-1', { fetch: gh(), headers: await auth() })).status).toBe(409);
  });

  it('cron gộp bản ghi gỡ tài liệu theo branch go/<mã> rồi xóa branch', async () => {
    await env.QUARANTINE.put(reviewKey(CODE), JSON.stringify({ keep: ['chuong-1'], drop: [], waiting: true, kind: 'go', branch: `go/${CODE}` }));
    const fetch = fakeGitHub({ items: { [PATH_A]: item('chuong-1', 'a.pdf', SHA_A) } });
    expect(await (await call('/duyet-tiep', { fetch, method: 'POST', body: JSON.stringify({ code: CODE }) })).json()).toEqual({ ok: true, merged: true });
    expect(fetch.writes.find((w) => w.path.endsWith('/pulls/7/merge')).body.commit_title).toBe(`Gộp gỡ tài liệu ${CODE} (người duyệt)`);
    expect(fetch.writes.some((w) => w.method === 'DELETE' && w.path.endsWith(`/git/refs/heads/go/${CODE}`))).toBe(true);
  });
});
