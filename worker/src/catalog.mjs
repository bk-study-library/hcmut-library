// Danh mục cho Worker: policy.json và worker-catalog.json đọc qua GitHub, giữ trong Cache API.
// worker-catalog.json do validate.mjs --write sinh (scripts/lib/worker-catalog.mjs), nhỏ hơn index.json
// rất nhiều nên parse nhanh. Nhánh chưa có file này thì đọc index.json rồi gọn lại như cũ.

import { summarizeIndex } from '../../scripts/lib/worker-catalog.mjs';

// Gọn index.json còn những gì Worker cần (cùng logic với worker-catalog.json).
export function summarize(policy, index) {
  return { policy, ...summarizeIndex(index) };
}

function hydrate(data) {
  return {
    policy: data.policy,
    courses: new Map(data.courses.map((c) => [c.id, { ...c, ids: new Set(c.ids) }])),
    shas: new Set(data.shas),
    // Bản cũ trong cache (trước khi có blocked) thì coi như rỗng.
    blocked: new Set(data.blocked ?? []),
  };
}

async function fetchCatalog(gh, branch) {
  // Đọc thô vì file có thể vượt 1 MB, giới hạn của getFile.
  const [policyText, smallText] = await Promise.all([gh.getRaw('catalog/policy.json', branch), gh.getRaw('worker-catalog.json', branch)]);
  if (policyText === null) throw new Error('Thiếu catalog/policy.json trên nhánh');
  const policy = JSON.parse(policyText);
  if (smallText !== null) {
    const c = JSON.parse(smallText);
    return { policy, courses: c.courses, shas: c.shas, blocked: c.blocked ?? [] };
  }
  const indexText = await gh.getRaw('index.json', branch);
  if (indexText === null) throw new Error('Thiếu worker-catalog.json và index.json trên nhánh');
  return summarize(policy, JSON.parse(indexText));
}

// github: hàm trả client GitHub, chỉ gọi khi cache trống. ttl <= 0 thì không dùng cache.
export async function loadCatalog({ repo, branch, ttl, cache, github }) {
  const key = `https://catalog.internal/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}`;
  if (ttl > 0 && cache) {
    const hit = await cache.match(key);
    if (hit) return hydrate(await hit.json());
  }
  const data = await fetchCatalog(await github(), branch);
  if (ttl > 0 && cache) {
    const res = new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` },
    });
    await cache.put(key, res);
  }
  return hydrate(data);
}
