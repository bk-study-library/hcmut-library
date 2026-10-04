// Kiểm JWT của Cloudflare Access (header Cf-Access-Jwt-Assertion) bằng WebCrypto.
// Worker tự kiểm chữ ký, aud, iss và thời hạn để không phụ thuộc hoàn toàn vào cấu hình Access,
// nhất là khi Worker vẫn trả lời ở workers.dev (đường đó không đi qua Access).

const LEEWAY_SECONDS = 60;
const CERTS_TTL_SECONDS = 3600;
const B64URL = /^[A-Za-z0-9_-]+$/;
// Tên miền team, ví dụ ten-team.cloudflareaccess.com.
const TEAM_DOMAIN = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

function b64urlBytes(s) {
  if (!B64URL.test(s)) throw new Error('base64url không hợp lệ');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

export const accessConfigured = (env) => Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && TEAM_DOMAIN.test(env.ACCESS_TEAM_DOMAIN));

// Khóa công khai của team, giữ trong Cache API 1 giờ.
async function teamKeys(team, { fetch, cache }) {
  const key = `https://access-certs.internal/${encodeURIComponent(team)}`;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()).keys;
  }
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Không đọc được khóa của Access');
  const data = await res.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  if (cache) {
    await cache.put(
      key,
      new Response(JSON.stringify({ keys }), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CERTS_TTL_SECONDS}` },
      }),
    );
  }
  return keys;
}

// Trả true khi JWT hợp lệ cho team và aud đã cấu hình. Mọi lỗi (kể cả không đọc được khóa) là false.
export async function verifyAccessJwt(jwt, { team, aud, fetch, cache, now }) {
  try {
    if (typeof jwt !== 'string') return false;
    const parts = jwt.split('.');
    if (parts.length !== 3) return false;
    const [h, p, s] = parts;
    const header = b64urlJson(h);
    const payload = b64urlJson(p);
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string') return false;

    const jwk = (await teamKeys(team, { fetch, cache })).find((k) => k && k.kid === header.kid && k.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return false;

    const t = Math.floor(now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return false;
    if (payload.iss !== `https://${team}`) return false;
    if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_SECONDS < t) return false;
    if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf - LEEWAY_SECONDS > t)) return false;
    return true;
  } catch {
    return false;
  }
}

// Email người duyệt trong JWT. Chỉ gọi sau khi verifyAccessJwt đã trả true.
export function accessEmail(jwt) {
  try {
    const email = b64urlJson(String(jwt).split('.')[1]).email;
    return typeof email === 'string' && email.length <= 254 ? email : '';
  } catch {
    return '';
  }
}
