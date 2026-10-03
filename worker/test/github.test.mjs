import { describe, it, expect } from 'vitest';
import { appJwt, installationToken, GitHub, GitHubError } from '../src/github.mjs';

const b64urlToBytes = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const decodeJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function genKey() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let bin = '';
  for (const b of der) bin += String.fromCharCode(b);
  const lines = btoa(bin).match(/.{1,64}/g).join('\n');
  return { publicKey: pair.publicKey, pem: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n` };
}

// fetch giả: ghi lại request, trả Response theo hàm handler.
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body };
    calls.push(call);
    return handler(call);
  };
  fn.calls = calls;
  return fn;
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

describe('appJwt', () => {
  it('ký RS256 với iat = now - 60, exp = now + 540 và kiểm được bằng khóa công khai', async () => {
    const { publicKey, pem } = await genKey();
    const jwt = await appJwt('12345', pem, 1_000_000);
    const [h, p, s] = jwt.split('.');
    expect(decodeJson(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decodeJson(p)).toEqual({ iat: 1_000_000 - 60, exp: 1_000_000 + 540, iss: '12345' });
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it('báo cách chuyển khi gặp khóa PKCS#1', async () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n';
    await expect(appJwt('1', pem, 0)).rejects.toThrow(/openssl pkcs8 -topk8 -nocrypt/);
  });
});

describe('installationToken', () => {
  it('gọi POST /app/installations/<id>/access_tokens với Bearer JWT', async () => {
    const { publicKey, pem } = await genKey();
    const f = fakeFetch(() => json({ token: 'ghs_abc' }, 201));
    const token = await installationToken({ appId: '7', pkcs8Pem: pem, installationId: '99', fetch: f });
    expect(token).toBe('ghs_abc');
    const c = f.calls[0];
    expect(c.url).toBe('https://api.github.com/app/installations/99/access_tokens');
    expect(c.method).toBe('POST');
    const auth = c.headers.Authorization;
    expect(auth.startsWith('Bearer ')).toBe(true);
    const [h, p, s] = auth.slice(7).split('.');
    expect(decodeJson(p).iss).toBe('7');
    expect(
      await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`)),
    ).toBe(true);
    expect(c.headers['User-Agent']).toBe('bk-study-library-upload');
    expect(c.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('lỗi HTTP ném GitHubError không chứa token', async () => {
    const { pem } = await genKey();
    const f = fakeFetch(() => json({ message: 'Bad credentials' }, 401));
    const err = await installationToken({ appId: '7', pkcs8Pem: pem, installationId: '99', fetch: f }).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(401);
    expect(err.message).not.toMatch(/Bearer|eyJ/);
  });
});

describe('GitHub', () => {
  const make = (handler) => {
    const f = fakeFetch(handler);
    return { gh: new GitHub({ repo: 'own/name', token: 'tok_secret', fetch: f }), f };
  };

  it('putFile gửi base64 đúng UTF-8 của chuỗi có dấu', async () => {
    const { gh, f } = make(() => json({ content: {} }, 201));
    const text = 'Giải tích 1: đạo hàm, tích phân';
    await gh.putFile('catalog/a b/x.json', text, 'upload/x', 'feat: thêm x');
    const c = f.calls[0];
    expect(c.method).toBe('PUT');
    expect(c.url).toBe('https://api.github.com/repos/own/name/contents/catalog/a%20b/x.json');
    expect(c.headers.Authorization).toBe('Bearer tok_secret');
    const body = JSON.parse(c.body);
    expect(body.branch).toBe('upload/x');
    expect(body.message).toBe('feat: thêm x');
    expect(new TextDecoder().decode(Uint8Array.from(atob(body.content), (ch) => ch.charCodeAt(0)))).toBe(text);
  });

  it('getFile trả text và sha, giải mã UTF-8', async () => {
    const text = 'Tiếng Việt';
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const { gh, f } = make(() => json({ content: btoa(bin).replace(/(.{20})/g, '$1\n'), sha: 'abc' }));
    expect(await gh.getFile('a/b.json', 'main')).toEqual({ text, sha: 'abc' });
    expect(f.calls[0].url).toBe('https://api.github.com/repos/own/name/contents/a/b.json?ref=main');
  });

  it('getFile trả null khi 404', async () => {
    const { gh } = make(() => json({ message: 'Not Found' }, 404));
    expect(await gh.getFile('a.json', 'main')).toBeNull();
  });

  it('500 ném GitHubError có status và path, không lộ token', async () => {
    const { gh } = make(() => json({ message: 'boom' }, 500));
    const err = await gh.branchSha('main').catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(500);
    expect(err.path).toBe('/repos/own/name/git/ref/heads/main');
    expect(err.message).not.toContain('tok_secret');
  });

  it('branchSha, createBranch, deleteBranch dùng đúng endpoint', async () => {
    const { gh, f } = make((c) => {
      if (c.method === 'GET') return json({ object: { sha: 'sha1' } });
      if (c.method === 'DELETE') return new Response(null, { status: 204 });
      return json({}, 201);
    });
    expect(await gh.branchSha('main')).toBe('sha1');
    await gh.createBranch('upload/x', 'sha1');
    await gh.deleteBranch('upload/x');
    expect(f.calls[1].url).toBe('https://api.github.com/repos/own/name/git/refs');
    expect(JSON.parse(f.calls[1].body)).toEqual({ ref: 'refs/heads/upload/x', sha: 'sha1' });
    expect(f.calls[2].method).toBe('DELETE');
    expect(f.calls[2].url).toBe('https://api.github.com/repos/own/name/git/refs/heads/upload/x');
  });

  it('openPr và addLabels', async () => {
    const { gh, f } = make((c) =>
      c.url.endsWith('/pulls') ? json({ number: 5, html_url: 'https://x/5', extra: 1 }, 201) : json([]),
    );
    expect(await gh.openPr({ head: 'upload/x', base: 'main', title: 'T', body: 'B' })).toEqual({
      number: 5,
      html_url: 'https://x/5',
    });
    expect(JSON.parse(f.calls[0].body)).toEqual({ head: 'upload/x', base: 'main', title: 'T', body: 'B' });
    await gh.addLabels(5, ['tai-lieu']);
    expect(f.calls[1].url).toBe('https://api.github.com/repos/own/name/issues/5/labels');
    expect(JSON.parse(f.calls[1].body)).toEqual({ labels: ['tai-lieu'] });
  });
});
