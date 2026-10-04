// Học kỳ và địa chỉ release. Số tháng của từng học kỳ lấy từ tham số terms
// (catalog/policy.json), không ghi cứng ở đây.

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

export function releaseTag(term) {
  return `files-${term}`;
}

export function releaseAssetUrl(repo, tag, name) {
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
}
