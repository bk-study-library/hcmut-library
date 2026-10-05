// Kết nối dùng chung theo env: client GitHub App (token cài đặt, tạo khi cần), danh mục môn và policy (Cache API),
// địa chỉ trang duyệt.
import { GitHub, installationToken } from './github.mjs';
import { loadCatalog } from './catalog.mjs';

// Client GitHub tạo khi cần lần đầu, dùng lại trong cùng request.
export function githubFactory(env, deps) {
  let ghPromise;
  return () => {
    ghPromise ??= installationToken({
      appId: env.GH_APP_ID,
      pkcs8Pem: env.GH_APP_PRIVATE_KEY,
      installationId: env.GH_INSTALLATION_ID,
      fetch: deps.fetch,
    }).then((token) => new GitHub({ repo: env.REPO, token, fetch: deps.fetch }));
    return ghPromise;
  };
}

export const catalogFor = (env, deps, github) =>
  loadCatalog({
    repo: env.REPO,
    branch: env.BRANCH,
    ttl: Number(env.CATALOG_TTL_SECONDS) || 0,
    cache: deps.cache(),
    github,
  });

// Gốc địa chỉ xem file (không có / cuối), rỗng thì không tạo link xem.
export const reviewBase = (env) => String(env.REVIEW_BASE ?? '').replace(/\/+$/, '');
