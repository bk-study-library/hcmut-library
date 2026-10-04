// Danh mục cho Worker: policy.json và index.json đọc qua GitHub, giữ trong Cache API.

// Gọn index.json còn những gì Worker cần: môn, mã môn hiện tại, id đã dùng, sha256 tài liệu đang có
// (cả bản đã làm sạch lẫn file gốc người gửi tải lên), và sha256 tài liệu đã gỡ (blocked): mục gỡ vẫn
// nằm trong index.json, nên file bị gỡ theo yêu cầu không gửi lại được qua form.
export function summarize(policy, index) {
  const courses = [];
  const shas = [];
  const blocked = [];
  for (const faculty of index.faculties ?? []) {
    for (const c of faculty.courses ?? []) {
      const items = c.items ?? [];
      courses.push({ id: c.id, code: c.code, status: c.status, ids: items.map((i) => i.id) });
      for (const it of items) {
        const into = it.removed ? blocked : shas;
        for (const f of it.files ?? []) {
          if (f.sha256) into.push(f.sha256);
          if (f.uploadSha256) into.push(f.uploadSha256);
        }
      }
    }
  }
  return { policy, courses, shas, blocked };
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
  // Đọc thô vì index.json sẽ vượt 1 MB, giới hạn của getFile.
  const [policyText, indexText] = await Promise.all([gh.getRaw('catalog/policy.json', branch), gh.getRaw('index.json', branch)]);
  if (policyText === null || indexText === null) throw new Error('Thiếu catalog/policy.json hoặc index.json trên nhánh');
  return summarize(JSON.parse(policyText), JSON.parse(indexText));
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
