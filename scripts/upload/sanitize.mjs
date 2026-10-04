// Làm sạch và soi file tải lên trong job scan (kiem-file). Hàm thuần, chỉ dùng node:zlib, để test được
// và chạy được trên file chưa tin: mọi độ dài đọc từ file đều được kiểm trước khi dùng.
//
// - Zip (docx, pptx, xlsx, zip): đọc thư mục trung tâm, ghi lại zip với các phần đã sửa. Phần không
//   sửa được chép nguyên byte nén nên kết quả ổn định giữa các lần chạy.
// - Office: xóa siêu dữ liệu docProps (core, app, custom) và tên người viết trong bình luận, sửa đổi
//   có theo dõi; báo macro, liên kết ra ngoài.
// - Zip của gói quiz: báo mục có mật khẩu, đường dẫn lạ, liên kết tượng trưng, file nén lồng, loại lạ,
//   dung lượng giải nén quá lớn.
// - PDF: tìm JavaScript, Launch, OpenAction, AA, EmbeddedFiles trong từ điển (ngoài stream).
// - Ảnh: siêu dữ liệu còn sót sau exiftool.

import zlib from 'node:zlib';

// ---------- Zip ----------

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const FLAG_ENCRYPTED = 0x1;
const FLAG_DESCRIPTOR = 0x8;
const FLAG_UTF8 = 0x800;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
// Một phần XML giải nén ra tối đa chừng này byte (chặn zip bomb khi đọc docProps, bình luận).
const MAX_PART_BYTES = 32 * 1024 * 1024;

function fail(msg) {
  throw new Error(`File zip hỏng hoặc không đọc được: ${msg}.`);
}

// Đọc zip từ Buffer. Trả { entries, comment }; mỗi entry có tên, cờ, phương thức nén, crc, cỡ, thuộc tính
// và data (byte nén nguyên gốc). Không nhận ZIP64, zip nhiều phần.
export function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) fail('quá ngắn');
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i -= 1) {
    if (buf.readUInt32LE(i) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) fail('không thấy thư mục trung tâm');
  const disk = buf.readUInt16LE(end + 4);
  const count = buf.readUInt16LE(end + 10);
  const cdSize = buf.readUInt32LE(end + 12);
  const cdOffset = buf.readUInt32LE(end + 16);
  const commentLen = buf.readUInt16LE(end + 20);
  if (disk !== 0) fail('zip nhiều phần');
  if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) fail('ZIP64 chưa được hỗ trợ');
  if (cdOffset + cdSize > end) fail('thư mục trung tâm sai chỗ');
  const comment = buf.subarray(end + 22, end + 22 + commentLen);
  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < count; n += 1) {
    if (p + 46 > end || buf.readUInt32LE(p) !== SIG_CENTRAL) fail('mục trong thư mục trung tâm hỏng');
    const e = {
      versionMadeBy: buf.readUInt16LE(p + 4),
      versionNeeded: buf.readUInt16LE(p + 6),
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      time: buf.readUInt16LE(p + 12),
      date: buf.readUInt16LE(p + 14),
      crc: buf.readUInt32LE(p + 16),
      compSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      internalAttr: buf.readUInt16LE(p + 36),
      externalAttr: buf.readUInt32LE(p + 38),
    };
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (e.compSize === 0xffffffff || e.size === 0xffffffff || localOffset === 0xffffffff) fail('ZIP64 chưa được hỗ trợ');
    const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
    e.name = nameBytes.toString(e.flags & FLAG_UTF8 ? 'utf8' : 'latin1');
    e.nameBytes = Buffer.from(nameBytes);
    p += 46 + nameLen + extraLen + cmtLen;
    if (p > end) fail('tên mục vượt thư mục trung tâm');
    if (localOffset + 30 > cdOffset || buf.readUInt32LE(localOffset) !== SIG_LOCAL) fail('đầu mục hỏng');
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    if (dataStart + e.compSize > cdOffset) fail('dữ liệu mục vượt khỏi file');
    e.data = buf.subarray(dataStart, dataStart + e.compSize);
    e.encrypted = Boolean(e.flags & FLAG_ENCRYPTED);
    e.symlink = (e.versionMadeBy >> 8) === 3 && ((e.externalAttr >>> 16) & S_IFMT) === S_IFLNK;
    entries.push(e);
  }
  return { entries, comment };
}

// Giải nén một mục (stored hoặc deflate), có giới hạn cỡ ra.
export function entryBytes(e, max = MAX_PART_BYTES) {
  if (e.encrypted) fail(`mục ${e.name} có mật khẩu`);
  if (e.size > max) fail(`mục ${e.name} quá lớn`);
  if (e.method === 0) return Buffer.from(e.data);
  if (e.method === 8) return zlib.inflateRawSync(e.data, { maxOutputLength: max });
  fail(`mục ${e.name} dùng cách nén ${e.method}`);
}

// Ghi zip mới. Mục có replace (Buffer) được nén lại bằng deflate; mục khác chép nguyên byte nén.
// Không giữ trường extra và chú thích (có thể chứa giờ, uid, đường dẫn máy).
export function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    let { method, crc, size, data } = e;
    if (e.replace) {
      data = zlib.deflateRawSync(e.replace, { level: 9 });
      method = 8;
      crc = zlib.crc32(e.replace) >>> 0;
      size = e.replace.length;
    }
    const flags = (e.flags & ~FLAG_DESCRIPTOR) & 0xffff;
    const name = e.nameBytes;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(e.versionNeeded, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(e.time, 10);
    local.writeUInt16LE(e.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(e.versionMadeBy, 4);
    central.writeUInt16LE(e.versionNeeded, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(e.time, 12);
    central.writeUInt16LE(e.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(e.internalAttr, 36);
    central.writeUInt32LE(e.externalAttr, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const endRec = Buffer.alloc(22);
  endRec.writeUInt32LE(SIG_END, 0);
  endRec.writeUInt16LE(entries.length, 8);
  endRec.writeUInt16LE(entries.length, 10);
  endRec.writeUInt32LE(cd.length, 12);
  endRec.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, endRec]);
}

// ---------- Office ----------

const XML_DECL = /^\s*<\?xml[^>]*\?>/;
// Thẻ gốc và thẻ con trực tiếp của một phần XML đơn giản như docProps.
function rootParts(xml) {
  const decl = (XML_DECL.exec(xml) || [''])[0];
  const rest = xml.slice(decl.length);
  const open = /<([\w.-]+:)?([\w.-]+)\b[^>]*?(\/?)>/.exec(rest);
  if (!open) return null;
  return { decl, open: open[0], qname: `${open[1] || ''}${open[2]}`, selfClosing: open[3] === '/', body: rest.slice(open.index + open[0].length) };
}

// Tên (không tiền tố) các thẻ con có trong thân, theo thứ tự, không trùng.
function childNames(body, rootQname) {
  const names = [];
  for (const m of body.matchAll(/<([\w.-]+:)?([\w.-]+)\b/g)) {
    if (`${m[1] || ''}${m[2]}` === rootQname) continue;
    if (!names.includes(m[2])) names.push(m[2]);
  }
  return names;
}

// docProps/core.xml và custom.xml: bỏ hết thẻ con, giữ thẻ gốc (cùng namespace) để file vẫn hợp lệ.
export function emptyProps(xml) {
  const r = rootParts(xml);
  if (!r) return { xml, removed: [] };
  const removed = r.selfClosing ? [] : childNames(r.body, r.qname);
  if (!removed.length) return { xml, removed };
  const open = r.open.endsWith('/>') ? r.open : `${r.open.slice(0, -1)}/>`;
  return { xml: `${r.decl}${open}`, removed };
}

// docProps/app.xml: chỉ bỏ các thẻ có thể chứa tên người, tổ chức hay đường dẫn trên máy.
const APP_FIELDS = ['Company', 'Manager', 'Template', 'HyperlinkBase'];
export function cleanAppProps(xml) {
  const removed = [];
  let out = xml;
  for (const f of APP_FIELDS) {
    const re = new RegExp(`<([\\w.-]+:)?${f}\\b[^>]*?(?:/>|>[\\s\\S]*?</\\1?${f}>)`, 'g');
    if (re.test(out)) {
      removed.push(f);
      out = out.replace(re, '');
    }
  }
  return { xml: out, removed };
}

// Thuộc tính và thẻ mang tên người trong bình luận, sửa đổi có theo dõi, danh sách người viết
// (Word, PowerPoint, Excel). Giá trị bị làm rỗng, giữ cấu trúc.
const PERSON_ATTRS = /\b((?:w|w15|w16cid|w16du|p|p15|p188|x|x18tc)?:?)(author|initials|userId|providerId|displayName|name)="[^"]*"/g;
const PERSON_PARTS = /^(word\/(comments[^/]*|people|document|footnotes|endnotes|header\d*|footer\d*)\.xml|ppt\/(commentAuthors\.xml|authors\.xml|comments\/[^/]+\.xml)|xl\/(comments\d*\.xml|threadedComments\/[^/]+\.xml|persons\/[^/]+\.xml))$/;
const COMMENT_PARTS = /^(word\/comments[^/]*\.xml|word\/people\.xml|ppt\/commentAuthors\.xml|ppt\/authors\.xml|ppt\/comments\/|xl\/comments\d*\.xml|xl\/threadedComments\/|xl\/persons\/)/;
const TRACKED = /<w:(ins|del|moveFrom|moveTo)\b[^>]*\bw:author=/;

export function scrubPeople(name, xml) {
  // Trong document.xml, w:name là tên kiểu chữ hay trường: chỉ đổi author, initials.
  const re = /^ppt\/(commentAuthors|authors)\.xml$|^xl\/persons\/|^word\/people\.xml$/.test(name) ? PERSON_ATTRS : /\b((?:w|w15)?:?)(author|initials)="[^"]*"/g;
  const found = [];
  let out = xml.replace(re, (m, pre, attr) => {
    if (!m.endsWith('=""') && !found.includes(attr)) found.push(attr);
    return `${pre}${attr}=""`;
  });
  // Excel: <author>Tên</author> trong comments.
  out = out.replace(/<author>([^<]*)<\/author>/g, (m, v) => {
    if (v && !found.includes('author')) found.push('author');
    return '<author></author>';
  });
  return { xml: out, removed: found };
}

// Loại liên kết ngoài đáng ngờ (không phải link thường trong văn bản).
const RISKY_EXTERNAL = /\/(attachedTemplate|oleObject|frame|subDocument|image|package|externalLinkPath|externalLink)"/;

// Làm sạch file Office (Buffer). Trả { buf, removed: ['docProps/core.xml:creator', ...], warnings: [...] }.
export function cleanOffice(input) {
  const zip = readZip(input);
  const removed = [];
  const warnings = new Set();
  for (const e of zip.entries) {
    const name = e.name;
    if (e.encrypted) throw new Error('File Office có phần được đặt mật khẩu.');
    if (/(^|\/)vbaProject\.bin$/i.test(name) || /(^|\/)vbaData\.xml$/i.test(name)) warnings.add('office-macro');
    if (COMMENT_PARTS.test(name)) warnings.add('office-comments');
    if (!/\.(xml|rels)$/i.test(name)) continue;
    let xml = null;
    const text = () => (xml ??= entryBytes(e).toString('utf8'));
    let next = null;
    const note = (list) => {
      for (const f of list) removed.push(`${name}:${f}`);
    };
    if (name === 'docProps/core.xml' || name === 'docProps/custom.xml') {
      const r = emptyProps(text());
      note(r.removed);
      if (r.removed.length) next = r.xml;
    } else if (name === 'docProps/app.xml') {
      const r = cleanAppProps(text());
      note(r.removed);
      if (r.removed.length) next = r.xml;
    } else if (PERSON_PARTS.test(name)) {
      if (name === 'word/document.xml' && TRACKED.test(text())) warnings.add('office-comments');
      const r = scrubPeople(name, text());
      note(r.removed);
      if (r.removed.length) next = r.xml;
    } else if (/\.rels$/i.test(name)) {
      for (const m of text().matchAll(/<Relationship\b[^>]*>/g)) {
        if (/TargetMode="External"/.test(m[0]) && RISKY_EXTERNAL.test(m[0])) warnings.add('office-external');
      }
    }
    if (next !== null) e.replace = Buffer.from(next, 'utf8');
  }
  const changed = zip.entries.some((e) => e.replace);
  return { buf: changed ? writeZip(zip.entries) : input, removed, warnings: [...warnings] };
}

// ---------- Zip của gói quiz ----------

const NESTED = /\.(zip|rar|7z|gz|tgz|bz2|xz|tar|jar|apk|cab|iso)$/i;
const IMAGE = /\.(png|jpe?g)$/i;

// Soi danh sách mục của file .zip (gói quiz). allowed: đuôi được nhận bên trong (chữ thường, có chấm).
export function zipFindings(entries, { allowed, maxUncompressed }) {
  const w = new Set();
  let total = 0;
  for (const e of entries) {
    const name = e.name;
    total += e.size;
    if (e.encrypted) w.add('zip-encrypted');
    if (e.symlink) w.add('zip-symlink');
    if (/^([/\\]|[A-Za-z]:)/.test(name) || name.split(/[/\\]/).includes('..') || name.includes('\\') || name.includes('\0')) w.add('zip-unsafe-path');
    if (name.endsWith('/')) continue;
    if (NESTED.test(name)) w.add('zip-nested');
    else {
      const dot = name.lastIndexOf('.');
      const ext = dot < 0 ? '' : name.slice(dot).toLowerCase();
      if (!allowed.includes(ext)) w.add('zip-other-type');
    }
    if (IMAGE.test(name)) w.add('zip-images');
  }
  if (total > maxUncompressed) w.add('zip-large');
  return [...w];
}

// ---------- PDF ----------

const PDF_KEYS = [
  ['JavaScript', 'pdf-javascript'],
  ['JS', 'pdf-javascript'],
  ['Launch', 'pdf-launch'],
  ['OpenAction', 'pdf-openaction'],
  ['AA', 'pdf-openaction'],
  ['EmbeddedFiles', 'pdf-embedded'],
  ['EmbeddedFile', 'pdf-embedded'],
];

// text: nội dung PDF (latin1) sau khi qpdf viết lại không có object stream. Bỏ phần stream, giải mã
// #xx trong tên, rồi tìm các khóa trên. Trả mã cảnh báo, không trùng.
export function pdfActiveContent(text) {
  const dicts = String(text).replace(/\bstream\r?\n[\s\S]*?\bendstream\b/g, ' ');
  const names = new Set();
  for (const m of dicts.matchAll(/\/([^\s/<>[\]()%{}]+)/g)) {
    let n = m[1];
    if (n.includes('#')) n = n.replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    names.add(n);
  }
  const out = [];
  for (const [key, code] of PDF_KEYS) if (names.has(key) && !out.includes(code)) out.push(code);
  return out;
}

// Chữ từ một lần pdftotext (trang cách nhau bằng \f). Trả chữ từng trang, tối đa maxPages trang.
export function splitPdfText(stdout, maxPages) {
  const parts = String(stdout).split('\f');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.slice(0, maxPages);
}

// ---------- Ảnh ----------

// Nhóm exiftool mô tả chính file hay công cụ, không phải siêu dữ liệu trong file.
const NOT_IN_FILE = new Set(['SourceFile', 'ExifTool', 'File', 'System', 'Composite']);
// Nhóm chỉ chứa siêu dữ liệu: còn thẻ nào là chưa sạch (trừ các thẻ cấu trúc ở EXIF_KEEP).
const META_GROUPS = new Set(['EXIF', 'XMP', 'IPTC', 'MakerNotes', 'Photoshop', 'ICC_Profile', 'GPS', 'APP12', 'APP14', 'FlashPix', 'Comment']);
// Thẻ exiftool giữ lại hoặc tự thêm khi ghi lại hướng ảnh (Orientation): không chứa thông tin người.
const EXIF_KEEP = new Set(['Orientation', 'XResolution', 'YResolution', 'ResolutionUnit', 'YCbCrPositioning', 'ExifByteOrder', 'ExifVersion', 'ComponentsConfiguration', 'FlashpixVersion', 'ColorSpace', 'ExifImageWidth', 'ExifImageHeight']);
// Tên thẻ đáng ngờ ở mọi nhóm (ví dụ chữ trong PNG tEXt).
const SENSITIVE_TAG = /GPS|Serial|Owner|Artist|Author|Creator|Copyright|Make|Model|Software|Date|Time|Comment|Description|Title|Keyword|Location|City|Country|Lens|Camera|Device|User|Name|Email|Address|Phone/i;

// after: kết quả `exiftool -json -G0 -a` sau khi làm sạch. Trả danh sách "Nhóm:Thẻ" còn sót.
export function imageLeftovers(after) {
  const out = [];
  for (const key of Object.keys(after || {})) {
    const [group, tag] = key.includes(':') ? key.split(':', 2) : [key, ''];
    // Chú thích JPEG (đoạn COM) nằm trong file dù exiftool xếp vào nhóm File.
    if (key === 'File:Comment') {
      out.push(key);
      continue;
    }
    if (!tag || NOT_IN_FILE.has(group)) continue;
    const meta = META_GROUPS.has(group) && !(group === 'EXIF' && EXIF_KEEP.has(tag));
    if (meta || SENSITIVE_TAG.test(tag)) out.push(key);
  }
  return out;
}
