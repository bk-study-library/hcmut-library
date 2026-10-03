// Danh mục cho Worker: policy.json và index.json đọc qua GitHub, giữ trong Cache API.

// Gọn index.json còn những gì Worker cần: môn, mã môn hiện tại, id đã dùng, sha256 tài liệu đang có.
export function summarize(policy, index) {
  const courses = [];
  const shas = [];
  for (const faculty of index.faculties ?? []) {
    for (const c of faculty.courses ?? []) {
      const items = c.items ?? [];
      courses.push({ id: c.id, code: c.code, status: c.status, ids: items.map((i) => i.id) });
      for (const it of items) {
        if (it.removed) continue;
        for (const f of it.files ?? []) if (f.sha256) shas.push(f.sha256);
      }
    }
  }
  return { policy, courses, shas };
}

function hydrate(data) {
  return {
    policy: data.policy,
    courses: new Map(data.courses.map((c) => [c.id, { ...c, ids: new Set(c.ids) }])),
    shas: new Set(data.shas),
  };
}

async function fetchCatalog(gh, branch) {
  const [policyFile, indexFile] = await Promise.all([gh.getFile('catalog/policy.json', branch), gh.getFile('index.json', branch)]);
  if (!policyFile || !indexFile) throw new Error('Thiếu catalog/policy.json hoặc index.json trên nhánh');
  return summarize(JSON.parse(policyFile.text), JSON.parse(indexFile.text));
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
