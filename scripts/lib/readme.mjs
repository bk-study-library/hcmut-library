// Sinh courses/<ID>/README.md từ danh mục và items. Giữ nguyên phần "Mẹo học"
// mà người đóng góp tự viết giữa hai dòng đánh dấu.

import fs from 'node:fs';
import path from 'node:path';
import { TYPES, TYPE_ORDER, PARTS, STATUS, SITE_URL, issueUrl, formatSize, formatBook, REPO_URL } from './labels.mjs';

const TIPS_START = '<!-- meo-hoc:start -->';
const TIPS_END = '<!-- meo-hoc:end -->';
const DEFAULT_TIPS = 'Chưa có mẹo. Bạn có kinh nghiệm học môn này? Mở Pull Request sửa đoạn này.';

export function readTips(existing) {
  if (!existing) return DEFAULT_TIPS;
  const a = existing.indexOf(TIPS_START);
  const b = existing.indexOf(TIPS_END);
  if (a < 0 || b < a) return DEFAULT_TIPS;
  return existing.slice(a + TIPS_START.length, b).trim() || DEFAULT_TIPS;
}

function itemLine(it) {
  const meta = [it.term, it.lab != null ? `bài ${it.lab}` : null, it.lang, it.license].filter(Boolean).join(', ');
  const ex = it.example ? ' (ví dụ minh họa)' : '';
  if (it.removed) return `- ~~${it.title}~~ (đã gỡ: ${it.removedReason})`;
  if (it.type === 'book-ref') return `- ${formatBook(it.book)}${ex}`;
  if (it.type === 'link') return `- [${it.title}](${it.url})${ex}: ${it.source ? it.source + ', ' : ''}${meta}`;
  const files = (it.files || [])
    .map((f) => {
      const target = f.path ? f.path : f.url;
      const label = `${f.name}, ${formatSize(f.size)}`;
      return target ? `[${label}](${target})` : `${label} (chờ tải lên Release)`;
    })
    .join('; ');
  const authors = it.authors && it.authors.length ? `, ${it.authors.join(', ')}` : '';
  return `- **${it.title}**${ex} (${meta}${authors}): ${files}`;
}

export function renderCourseReadme(course, items, faculties, courses, existing) {
  const fac = faculties.faculties.find((f) => f.key === course.faculty);
  const rows = [
    ['Mã môn', course.code + (course.code !== course.id ? ` (ID cố định: ${course.id})` : '')],
    ['Tên', course.name + (course.nameEn ? ` / ${course.nameEn}` : '')],
    ['Tín chỉ', String(course.credits)],
    ['Khoa', fac ? fac.name.vi : course.faculty],
    ['Phần', course.parts.length ? course.parts.map((p) => PARTS[p].vi).join(', ') : 'chưa ghi'],
    ['Trạng thái', STATUS[course.status].vi],
  ];
  if (course.aliases.length) rows.push(['Mã, tên cũ', course.aliases.map((a) => `${a.code} ${a.name}`).join('; ')]);
  if (course.replacedBy) rows.push(['Thay bằng', `[${course.replacedBy}](../${course.replacedBy}/README.md)`]);
  if (course.replaces && course.replaces.length) rows.push(['Thay cho', course.replaces.map((r) => `[${r}](../${r}/README.md)`).join(', ')]);
  if (course.related.length) {
    rows.push(['Môn liên quan', course.related.map((r) => `[${r}](../${r}/README.md) ${courses.get(r)?.name ?? ''}`.trim()).join(', ')]);
  }

  const docs = items.filter((i) => i.type !== 'link');
  const links = items.filter((i) => i.type === 'link');
  const docSections = [];
  for (const t of TYPE_ORDER) {
    const list = docs.filter((i) => i.type === t);
    if (!list.length) continue;
    docSections.push(`### ${TYPES[t].vi}\n\n${list.map(itemLine).join('\n')}`);
  }

  const lines = [
    `# ${course.code} ${course.name}`,
    '',
    `<!-- File này do "npm run build" sinh từ catalog/courses/${course.id}.json và items/. Chỉ sửa phần Mẹo học, giữa hai dòng meo-hoc. -->`,
    '',
  ];
  if (course.status === 'retired') {
    lines.push(`> Môn này đã ngừng dạy.${course.replacedBy ? ` Xem môn thay thế: [${course.replacedBy}](../${course.replacedBy}/README.md).` : ''} Tài liệu cũ vẫn giữ để link cũ không hỏng.`, '');
  }
  lines.push(
    '| Mục | Thông tin |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '## Tài liệu',
    '',
    docSections.length ? docSections.join('\n\n') : 'Chưa có tài liệu.',
    '',
    '## Link',
    '',
    links.length ? links.map(itemLine).join('\n') : 'Chưa có link.',
    '',
    '## Mẹo học',
    '',
    TIPS_START,
    readTips(existing),
    TIPS_END,
    '',
    '## Đóng góp',
    '',
    `- Gửi file, không cần tài khoản GitHub: [mở trang Gửi tài liệu](${SITE_URL}gui-tai-lieu/?course=${encodeURIComponent(course.id)}).`,
    `- Thêm link tới tài liệu công khai: [mở form Thêm link](${issueUrl('them-link.yml', { course: course.id })}).`,
    `- Sửa tên, mã môn: [mở form Sửa danh mục môn](${issueUrl('sua-danh-muc.yml', { course: course.id })}).`,
    `- Quy định: [CONTRIBUTING.md](${REPO_URL}/blob/main/CONTRIBUTING.md). Gỡ tài liệu: [TAKEDOWN.md](${REPO_URL}/blob/main/TAKEDOWN.md).`,
    '',
  );
  return lines.join('\n');
}

// Trả về danh sách README khác với bản trên đĩa. write=true thì ghi luôn.
export function syncReadmes(repo, { write = false } = {}) {
  const changed = [];
  for (const c of repo.courses.values()) {
    const p = path.join(repo.root, 'courses', c.id, 'README.md');
    const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    const items = repo.items.filter((i) => i.course === c.id).sort((a, b) => a.id.localeCompare(b.id));
    const next = renderCourseReadme(c, items, repo.faculties, repo.courses, existing);
    if (existing !== next) {
      changed.push(path.relative(repo.root, p).split(path.sep).join('/'));
      if (write) {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, next);
      }
    }
  }
  return changed;
}
