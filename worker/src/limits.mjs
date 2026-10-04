// Giới hạn số bài gửi: khóa theo dải địa chỉ (IPv4 /32, IPv6 /64) cho Rate Limiting binding, và
// trần chung mỗi ngày (UTC) đếm bằng một object nhỏ trong R2. Không lưu hay ghi log địa chỉ IP.

const COUNT_PREFIX = 'dem/';
const COUNT_RETRIES = 3;

// Tách IPv6 thành 8 nhóm 16 bit (số). Sai dạng thì null.
function ipv6Groups(text) {
  let s = text.toLowerCase().replace(/%.*$/, '');
  // Đuôi IPv4 (::ffff:1.2.3.4) đổi thành hai nhóm hex.
  const v4 = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const b = v4.slice(2, 6).map(Number);
    if (b.some((x) => x > 255)) return null;
    s = `${v4[1]}${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const part = (h) => (h ? h.split(':') : []);
  const head = part(halves[0]);
  const tail = halves.length === 2 ? part(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

// Khóa giới hạn theo người gửi. IPv6: một máy thường có cả dải /64 nên lấy 64 bit đầu; IPv4 giữ
// nguyên. IPv4 viết dạng IPv6 (::ffff:a.b.c.d) tính như IPv4. Không đọc được thì chung khóa 'unknown'.
export function rateKey(ip) {
  const s = String(ip ?? '').trim();
  if (!s) return 'unknown';
  if (!s.includes(':')) return /^\d{1,3}(\.\d{1,3}){3}$/.test(s) ? s : 'unknown';
  const g = ipv6Groups(s);
  if (!g) return 'unknown';
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.');
  }
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

// Trần mỗi ngày từ biến SUBMIT_DAILY_CAP. Không đặt hoặc không phải số nguyên dương thì không có trần.
export function dailyCap(env) {
  const n = Number(env.SUBMIT_DAILY_CAP);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export const countKey = (nowMs) => `${COUNT_PREFIX}${new Date(nowMs).toISOString().slice(0, 10)}`;

async function readCount(r2, key) {
  const obj = await r2.get(key);
  if (!obj) return { n: 0, etag: null };
  const n = Number((await obj.text()).trim());
  return { n: Number.isInteger(n) && n >= 0 ? n : 0, etag: obj.etag };
}

// Đã chạm trần của ngày chưa (chỉ đọc).
export async function dailyCapReached(r2, cap, nowMs) {
  if (!cap) return false;
  return (await readCount(r2, countKey(nowMs))).n >= cap;
}

// Tính thêm một bài. Trả false khi đã đủ trần. Ghi có điều kiện theo etag để hai lượt cùng lúc
// không ghi đè nhau; tranh chấp quá số lần thử thì vẫn cho qua (trần là giới hạn mềm).
export async function countSubmission(r2, cap, nowMs) {
  if (!cap) return true;
  const key = countKey(nowMs);
  for (let i = 0; i < COUNT_RETRIES; i += 1) {
    const { n, etag } = await readCount(r2, key);
    if (n >= cap) return false;
    const opts = etag ? { onlyIf: { etagMatches: etag } } : {};
    if (await r2.put(key, String(n + 1), opts)) return true;
  }
  return true;
}
