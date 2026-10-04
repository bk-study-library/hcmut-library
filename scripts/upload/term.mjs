// Học kỳ và địa chỉ release. Số tháng của từng học kỳ lấy từ tham số terms, tag thay thế lấy
// từ releaseTagOverrides (đều ở catalog/policy.json), không ghi cứng ở đây.

export function termFor(date, terms) {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const key = Object.keys(terms).find((k) => terms[k].includes(month));
  if (!key) throw new Error(`Không tìm được học kỳ cho tháng ${month}.`);
  // Năm học bắt đầu ở tháng đầu tiên của học kỳ đầu.
  const startMonth = terms[Object.keys(terms)[0]][0];
  const startYear = month >= startMonth ? year : year - 1;
  return `HK${String(startYear % 100).padStart(2, '0')}${key.replace(/^HK/, '')}`;
}

const TERM = /^HK[0-9]{3}$/;

// Lỗi của releaseTagOverrides trong catalog/policy.json (rỗng nếu đúng hoặc không có khóa này).
// Mỗi khóa là một học kỳ HK<3 số>, giá trị là files-<học kỳ> thêm đúng một chữ thường, ví dụ
// "HK261": "files-HK261b". Dạng này khớp TAG của scripts/upload/publish.mjs và RELEASE_TAG của
// scripts/lib/preview.mjs (nút Xem trước), nên file trên tag mới vẫn phát hành và xem trước được.
export function releaseTagOverrideErrors(policy) {
  const map = policy?.releaseTagOverrides;
  if (map === undefined) return [];
  if (map === null || typeof map !== 'object' || Array.isArray(map)) {
    return ['releaseTagOverrides phải là object dạng {"HK<3 số>": "files-HK<3 số><chữ thường>"}'];
  }
  const errors = [];
  for (const [term, tag] of Object.entries(map)) {
    if (!TERM.test(term)) errors.push(`releaseTagOverrides: khóa "${term}" không đúng dạng HK<3 số>`);
    else if (typeof tag !== 'string' || !new RegExp(`^files-${term}[a-z]$`).test(tag)) {
      errors.push(`releaseTagOverrides: ${term} cần tag dạng files-${term} thêm một chữ thường (ví dụ files-${term}b), gặp ${JSON.stringify(tag)}`);
    }
  }
  return errors;
}

// Tag Release của học kỳ: files-<học kỳ>, trừ khi releaseTagOverrides của policy đặt tag khác
// (tag cũ không dùng lại được, ví dụ từng thuộc một immutable release).
export function releaseTag(term, policy) {
  const errors = releaseTagOverrideErrors(policy);
  if (errors.length) throw new Error(`catalog/policy.json: ${errors.join('; ')}`);
  const map = policy?.releaseTagOverrides;
  return map && Object.hasOwn(map, term) ? map[term] : `files-${term}`;
}

export function releaseAssetUrl(repo, tag, name) {
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
}
