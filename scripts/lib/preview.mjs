// Xem trước file đã đăng: danh sách link được phép, dùng chung cho web (có nút Xem trước hay không)
// và Worker (route /xem-truoc). Chỉ hai dạng:
//   https://github.com/<repo>/releases/download/files-HK<3 số>[chữ thường]/<tên an toàn>
//   <site>files/<ID môn>/<tên an toàn>.md
// So khớp trên chuỗi gốc, không giải mã: link có %, .., ? hay # đều bị loại.

// Đuôi xem trước được và kiểu nội dung trả về. Markdown trả dạng chữ thường để trình duyệt không chạy gì.
export const PREVIEW_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  md: 'text/plain; charset=utf-8',
};

export const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(pdf|png|jpg|md)$/;
// Tag theo học kỳ, có thể thêm một chữ thường khi tag cũ không dùng lại được
// (releaseTagOverrides của catalog/policy.json, ví dụ files-HK261b).
const RELEASE_TAG = /^files-HK[0-9]{3}[a-z]?$/;
const COURSE_ID = /^[A-Z0-9_]{3,12}(-[0-9]{4})?$/;

// Trả { url, name, ext, kind } khi link nằm trong danh sách được phép, không thì null.
export function previewTarget(raw, { repo, site }) {
  if (typeof raw !== 'string' || !repo || !site || !site.endsWith('/')) return null;
  if (!URL.canParse(raw) || new URL(raw).href !== raw) return null;
  const release = `https://github.com/${repo}/releases/download/`;
  if (raw.startsWith(release)) {
    const parts = raw.slice(release.length).split('/');
    if (parts.length !== 2 || !RELEASE_TAG.test(parts[0])) return null;
    const m = SAFE_NAME.exec(parts[1]);
    return m ? { url: raw, name: parts[1], ext: m[1], kind: 'release' } : null;
  }
  const files = `${site}files/`;
  if (site.startsWith('https://') && raw.startsWith(files)) {
    const parts = raw.slice(files.length).split('/');
    if (parts.length !== 2 || !COURSE_ID.test(parts[0])) return null;
    const m = SAFE_NAME.exec(parts[1]);
    return m && m[1] === 'md' ? { url: raw, name: parts[1], ext: 'md', kind: 'site' } : null;
  }
  return null;
}
