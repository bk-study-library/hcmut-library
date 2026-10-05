// Trang của người gửi: GET /xem/<mã>?k=<mã bí mật> (trạng thái bài, xem file). Mã bí mật sai thì 404 như không có bài.
import { checkToken, loadStatus, locateFile, notFoundPage, serveFile, statusPage } from '../view.mjs';
import { githubFactory, catalogFor } from '../deps.mjs';

// Người gửi: mã bí mật sai hay thiếu thì 404 như không có bài.
export async function handleOwner(req, env, deps, code, wantFile) {
  const url = new URL(req.url);
  const k = url.searchParams.get('k');
  const owner = await checkToken(env.QUARANTINE, code, k);
  if (!owner) return notFoundPage();
  const kq = `k=${encodeURIComponent(k)}`;
  const github = githubFactory(env, deps);
  if (wantFile) {
    const { policy } = await catalogFor(env, deps, github);
    return serveFile(env.QUARANTINE, code, {
      policy,
      download: url.searchParams.get('tai') === '1',
      downloadHref: `/xem/${code}/file?${kq}&tai=1`,
    });
  }
  const [status, file] = await Promise.all([
    loadStatus({ repo: env.REPO, code, cache: deps.cache(), github }),
    locateFile(env.QUARANTINE, code),
  ]);
  return statusPage({ code, status, course: owner.course, fileHref: file ? `/xem/${code}/file?${kq}` : null });
}
