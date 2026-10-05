// Trang Gửi tài liệu (chỉ tiếng Việt): đổ số liệu từ catalog/policy.json và catalog/site.json vào mẫu.
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_ROOT } from '../lib/repo.mjs';
import { EXAM_KINDS, TYPES, formatSize } from '../lib/labels.mjs';
import { extensionsFor, restrictedExtensions } from '../lib/extensions.mjs';
import { esc, jsonInScript } from './html.mjs';

// Mẫu mã môn hiện tại (code, không có hậu tố năm) trong schema môn: form kiểm mã môn mới theo đúng mẫu này.
export function courseCodePattern() {
  return JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'schema', 'course.schema.json'), 'utf8')).properties.code.pattern;
}

// Trang Gửi tài liệu (chỉ tiếng Việt): đổ số liệu từ policy.json và site.json vào mẫu.
export function uploadPage({ policy, site, root, raw, t }) {
  const opt = (value, label) => `    <option value="${esc(value)}">${esc(label)}</option>`;
  const exts = Object.keys(policy.extensions);
  const open = Boolean(site.uploadEndpoint);
  const msg = t.uploadMsg;
  const formTypes = policy.openTypes.filter((x) => x !== 'link');
  // Đợt gửi nhiều file: thiếu số trong policy thì một file một lần như cũ.
  const batchFiles = Number.isInteger(policy.batchMaxFiles) && policy.batchMaxFiles > 0 ? policy.batchMaxFiles : 1;
  const batchBytes = batchFiles > 1 && Number.isInteger(policy.batchMaxBytes) ? policy.batchMaxBytes : policy.maxFileBytes;
  const config = {
    maxBytes: policy.maxFileBytes,
    batchFiles,
    batchBytes,
    batchSize: formatSize(batchBytes),
    extensions: exts,
    // Đuôi nhận theo từng loại (extensions[].types, quizExtensions): form lọc ô chọn file theo loại.
    byType: Object.fromEntries(formTypes.map((x) => [x, extensionsFor(policy, x)])),
    msg: {
      ...msg,
      fileExt: msg.fileExt(exts.join(', ')),
      fileSize: msg.fileSize(formatSize(policy.maxFileBytes)),
      batchCount: msg.batchCount(batchFiles),
      batchSize: msg.batchSize(formatSize(batchBytes)),
      batchLimit: msg.batchLimit(batchFiles, formatSize(batchBytes)),
      newNameLong: msg.newNameLong(policy.fields.courseNameMax),
    },
    // Môn mới gửi kèm bài: mẫu mã từ schema, giới hạn tên từ policy, khoảng gợi ý mã gần từ site.json.
    newCourse: { codePattern: courseCodePattern(), nameMax: policy.fields.courseNameMax, nearSpan: site.nearCodeSpan },
    // Môn cùng tên gộp thành một dòng, cùng ngưỡng với ô tìm trang chủ.
    sameName: { groupMin: site.sameNameGroupMin, chipsMax: site.sameNameChipsMax },
  };
  // api.js của Cloudflare Turnstile là script ngoài duy nhất của site: chống bot gửi tự động vào form,
  // nên chỉ nạp ở trang này và chỉ khi form đã mở.
  const scripts = [
    `<script type="application/json" id="upload-config">${jsonInScript(config)}</script>`,
    `<script src="${root}assets/search-core.js" defer></script>`,
    `<script src="${root}assets/subject-core.js" defer></script>`,
    `<script src="${root}assets/upload-core.js" defer></script>`,
    `<script src="${root}assets/upload.js" defer></script>`,
    open ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : '',
  ]
    .filter(Boolean)
    .join('\n');
  const parts = {
    closed: open ? '' : `<p class="note warn" role="note">${esc(t.uploadClosed)}</p>`,
    disabled: open ? '' : ' disabled',
    endpoint: esc(site.uploadEndpoint),
    sitekey: esc(site.turnstileSiteKey),
    // Loại "link" đi theo form Issue "Thêm link", không qua form này.
    types: formTypes.map((x) => opt(x, TYPES[x].vi)).join('\n'),
    examKinds: policy.fields.examKinds.map((x) => opt(x, EXAM_KINDS[x] || x)).join('\n'),
    ...Object.fromEntries(['titleMax', 'descriptionMax', 'chapterMax', 'teacherMax', 'displayNameMax', 'bookTitleMax', 'bookPublisherMax', 'courseNameMax'].map((k) => [k, String(policy.fields[k])])),
    licenses: policy.selfMadeLicenses.map((x) => opt(x, x)).join('\n'),
    accept: esc(exts.join(',')),
    exts: esc(exts.join(', ')),
    extNote: Object.entries(restrictedExtensions(policy))
      .map(([ext, types]) => ` ${esc(t.uploadExtOnly(ext, types.map((x) => TYPES[x]?.vi ?? x).join(', ')))}`)
      .join(''),
    maxSize: esc(formatSize(policy.maxFileBytes)),
    multiple: batchFiles > 1 ? ' multiple' : '',
    batchNote: batchFiles > 1 ? ` ${esc(msg.batchLimit(batchFiles, formatSize(batchBytes)))} ${esc(msg.batchHint)}` : '',
    teacherPlaceholder: esc(t.uploadTeacherPlaceholder),
    scripts,
  };
  return raw
    .replace(/\{\{upload:([a-zA-Z]+)\}\}/g, (_, k) => {
      if (!(k in parts)) throw new Error(`gui-tai-lieu.html: không có chỗ điền upload:${k}`);
      return parts[k];
    })
    .replace(/\{\{root\}\}/g, root);
}
