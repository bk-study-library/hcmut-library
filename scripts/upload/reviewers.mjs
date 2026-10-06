// Người duyệt của một đường dẫn theo .github/CODEOWNERS (cùng file ruleset dùng để đòi code owner duyệt), dòng khớp sau
// cùng thắng như GitHub; dòng không có người là bỏ code owner. scripts/upload/check.mjs (courseReviewers) tra theo thư
// mục môn. Trả tài khoản (user) hay nhóm (org/team), bỏ dấu @.

// Mẫu CODEOWNERS sang RegExp: * khớp trong một đoạn, ** nhiều đoạn; bắt đầu bằng / là từ gốc repo, kết thúc bằng / là thư mục.
function patternRe(p) {
  const anchored = p.startsWith('/');
  const body = p.replace(/^\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  const tail = p.endsWith('/') ? '.*' : '(/.*)?';
  return new RegExp(`${anchored || p.includes('/') ? '^' : '(^|/)'}${body}${tail}$`);
}

export function ownersFor(text, file) {
  let owners = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [p, ...who] = line.split(/\s+/);
    if (p === '*' || patternRe(p).test(file)) owners = who.filter((w) => w.startsWith('@')).map((w) => w.slice(1));
  }
  return owners;
}
