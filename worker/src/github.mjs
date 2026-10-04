// Client GitHub App cho Worker: chỉ dùng WebCrypto và fetch được truyền vào, không phụ thuộc gói ngoài.
const API = 'https://api.github.com';
const ACCEPT = 'application/vnd.github+json';
const RAW_ACCEPT = 'application/vnd.github.raw';
const API_VERSION = '2022-11-28';
const USER_AGENT = 'bk-study-library-upload';

export class GitHubError extends Error {
  constructor(status, path, detail) {
    super(`GitHub trả lỗi ${status} tại ${path}${detail ? `: ${detail}` : ''}`);
    this.name = 'GitHubError';
    this.status = status;
    this.path = path;
  }
}

const encoder = new TextEncoder();

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const base64Url = (bytes) => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64UrlJson = (obj) => base64Url(encoder.encode(JSON.stringify(obj)));

// Mã hóa từng đoạn của đường dẫn, giữ nguyên dấu gạch chéo.
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

async function importKey(rawPem) {
  // Secret dán thành một dòng thường chứa chuỗi \n chữ thay cho xuống dòng.
  const pem = rawPem.replace(/\\n/g, '\n');
  if (pem.includes('BEGIN RSA PRIVATE KEY')) {
    throw new Error(
      'Không đọc được khóa GitHub App. Khóa đang ở dạng PKCS#1, chuyển sang PKCS#8 bằng: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem.',
    );
  }
  try {
    const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    throw new Error('Không đọc được khóa GitHub App. Kiểm tra secret là khóa PKCS#8 dạng PEM đầy đủ.');
  }
}

export async function appJwt(appId, pkcs8Pem, now) {
  const key = await importKey(pkcs8Pem);
  const head = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const payload = base64UrlJson({ iat: now - 60, exp: now + 540, iss: appId });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${head}.${payload}`));
  return `${head}.${payload}.${base64Url(new Uint8Array(sig))}`;
}

function headers(bearer) {
  return { Accept: ACCEPT, 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': USER_AGENT, Authorization: `Bearer ${bearer}` };
}

async function failure(res, path) {
  let detail = '';
  try {
    detail = (await res.json()).message ?? '';
  } catch {
    // Thân phản hồi không phải JSON: bỏ qua chi tiết.
  }
  return new GitHubError(res.status, path, detail);
}

export async function installationToken({ appId, pkcs8Pem, installationId, fetch }) {
  const path = `/app/installations/${encodeURIComponent(installationId)}/access_tokens`;
  const jwt = await appJwt(appId, pkcs8Pem, Math.floor(Date.now() / 1000));
  const res = await fetch(API + path, { method: 'POST', headers: headers(jwt) });
  if (!res.ok) throw await failure(res, path);
  return (await res.json()).token;
}

export class GitHub {
  constructor({ repo, token, fetch }) {
    this.repo = repo;
    this.token = token;
    this.#fetch = fetch;
  }

  #fetch;

  // Gửi request tới /repos/<repo><sub>; trả Response (đã kiểm lỗi, trừ các mã trong allow).
  async #call(method, sub, body, allow = [], accept = ACCEPT) {
    const path = `/repos/${this.repo}${sub}`;
    const init = { method, headers: { ...headers(this.token), Accept: accept } };
    if (body !== undefined) {
      init.headers = { ...init.headers, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    // Gọi fetch không gắn this: fetch toàn cục của Workers ném Illegal invocation nếu this là đối tượng khác.
    const doFetch = this.#fetch;
    const res = await doFetch(API + path, init);
    if (!res.ok && !allow.includes(res.status)) throw await failure(res, path);
    return res;
  }

  async getFile(path, ref) {
    const res = await this.#call('GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, undefined, [404]);
    if (res.status === 404) return null;
    const data = await res.json();
    const where = `/repos/${this.repo}/contents/${encodePath(path)}`;
    if (Array.isArray(data)) throw new GitHubError(res.status, where, 'đường dẫn là thư mục, không phải file');
    if (data.encoding !== 'base64') throw new GitHubError(res.status, where, 'file quá lớn để đọc qua API');
    const bin = atob(data.content.replace(/\s+/g, ''));
    const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return { text, sha: data.sha };
  }

  // Đọc nội dung thô (Accept raw): không giới hạn 1 MB như getFile. Trả text, hoặc null khi 404.
  async getRaw(path, ref) {
    const res = await this.#call('GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, undefined, [404], RAW_ACCEPT);
    if (res.status === 404) return null;
    return new TextDecoder().decode(await res.arrayBuffer());
  }

  async branchSha(branch) {
    const res = await this.#call('GET', `/git/ref/heads/${encodePath(branch)}`);
    return (await res.json()).object.sha;
  }

  async createBranch(name, fromSha) {
    await this.#call('POST', '/git/refs', { ref: `refs/heads/${name}`, sha: fromSha });
  }

  async deleteBranch(name) {
    await this.#call('DELETE', `/git/refs/heads/${encodePath(name)}`);
  }

  async putFile(path, text, branch, message) {
    await this.#call('PUT', `/contents/${encodePath(path)}`, {
      message,
      content: bytesToBase64(encoder.encode(text)),
      branch,
    });
  }

  async openPr({ head, base, title, body }) {
    const res = await this.#call('POST', '/pulls', { head, base, title, body });
    const { number, html_url } = await res.json();
    return { number, html_url };
  }

  // PR mới nhất có nhánh head này (mọi trạng thái), hoặc null. Trả state và merged.
  async findPr(head) {
    const owner = this.repo.split('/')[0];
    const q = `state=all&per_page=1&head=${encodeURIComponent(`${owner}:${head}`)}`;
    const res = await this.#call('GET', `/pulls?${q}`);
    const list = await res.json();
    if (!Array.isArray(list) || !list.length) return null;
    return { state: list[0].state, merged: Boolean(list[0].merged_at) };
  }

  async addLabels(number, labels) {
    await this.#call('POST', `/issues/${encodeURIComponent(String(number))}/labels`, { labels });
  }
}
