import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  readZip, writeZip, entryBytes, emptyProps, cleanAppProps, scrubPeople, cleanOffice, zipFindings,
  pdfActiveContent, splitPdfText, imageLeftovers,
} from '../scripts/upload/sanitize.mjs';

// Dựng zip trong bộ nhớ: { tên: nội dung } (chuỗi hoặc Buffer). opts[tên] ghi đè thuộc tính mục.
function makeZip(files, opts = {}) {
  const entries = Object.entries(files).map(([name, content]) => {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    return {
      versionMadeBy: 20, versionNeeded: 20, flags: 0x800, method: 8, time: 0x6000, date: 0x5a21,
      crc: 0, size: 0, data: Buffer.alloc(0), internalAttr: 0, externalAttr: 0,
      nameBytes: Buffer.from(name, 'utf8'), replace: data, ...(opts[name] || {}),
    };
  });
  return writeZip(entries);
}

const read = (buf, name) => {
  const e = readZip(buf).entries.find((x) => x.name === name);
  return e ? entryBytes(e).toString('utf8') : null;
};

const CORE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Bai tap</dc:title><dc:creator>Nguyen Van An</dc:creator><cp:lastModifiedBy>2112345</cp:lastModifiedBy><cp:revision>3</cp:revision></cp:coreProperties>';
const APP = '<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Template>C:\\Users\\an\\Normal.dotm</Template><Pages>2</Pages><Company>HCMUT</Company><Manager/></Properties>';

test('zip: ghi rồi đọc lại giữ tên, nội dung, crc', () => {
  const buf = makeZip({ 'a.txt': 'xin chào', 'thư mục/b.json': '{"x":1}' });
  const z = readZip(buf);
  assert.deepEqual(z.entries.map((e) => e.name), ['a.txt', 'thư mục/b.json']);
  assert.equal(read(buf, 'a.txt'), 'xin chào');
  for (const e of z.entries) assert.equal(zlib.crc32(entryBytes(e)) >>> 0, e.crc);
});

test('zip: file hỏng, ZIP64, quá ngắn thì báo lỗi rõ', () => {
  assert.throws(() => readZip(Buffer.from('PK')), /zip hỏng/);
  assert.throws(() => readZip(Buffer.alloc(100)), /thư mục trung tâm/);
  const buf = makeZip({ 'a.txt': 'x' });
  const z64 = Buffer.from(buf);
  z64.writeUInt16LE(0xffff, z64.length - 22 + 10);
  assert.throws(() => readZip(z64), /ZIP64|hỏng/);
  const cut = buf.subarray(0, 40);
  assert.throws(() => readZip(cut), /zip hỏng|thư mục trung tâm/);
});

test('emptyProps: bỏ mọi thẻ con, giữ thẻ gốc và namespace, nêu tên thẻ đã bỏ', () => {
  const r = emptyProps(CORE);
  assert.deepEqual(r.removed, ['title', 'creator', 'lastModifiedBy', 'revision']);
  assert.ok(r.xml.startsWith('<?xml'));
  assert.match(r.xml, /<cp:coreProperties xmlns:cp="[^"]+" xmlns:dc="[^"]+"\/>$/);
  assert.ok(!r.xml.includes('Nguyen'));
  // Đã rỗng thì không đổi.
  assert.deepEqual(emptyProps(r.xml), { xml: r.xml, removed: [] });
});

test('cleanAppProps: bỏ Company, Manager, Template; giữ thẻ khác', () => {
  const r = cleanAppProps(APP);
  assert.deepEqual(r.removed, ['Company', 'Manager', 'Template']);
  assert.ok(!r.xml.includes('HCMUT') && !r.xml.includes('Users'));
  assert.match(r.xml, /<Pages>2<\/Pages>/);
});

test('scrubPeople: làm rỗng tên người viết, không đụng w:name của kiểu chữ', () => {
  const doc = '<w:document><w:style w:name="Heading"/><w:ins w:id="1" w:author="Nguyen Van An" w:date="2024-01-01"><w:r/></w:ins></w:document>';
  const r = scrubPeople('word/document.xml', doc);
  assert.deepEqual(r.removed, ['author']);
  assert.match(r.xml, /w:author=""/);
  assert.match(r.xml, /w:name="Heading"/);
  const people = '<w15:people><w15:person w15:author="An"><w15:presenceInfo w15:providerId="AD" w15:userId="S::an@hcmut.edu.vn"/></w15:person></w15:people>';
  const p = scrubPeople('word/people.xml', people);
  assert.ok(!p.xml.includes('hcmut') && !p.xml.includes('"An"'));
  const ppt = scrubPeople('ppt/commentAuthors.xml', '<p:cmAuthor id="0" name="Nguyen" initials="NV" lastIdx="1"/>');
  assert.match(ppt.xml, /name="" initials=""/);
  const xl = scrubPeople('xl/comments1.xml', '<comments><authors><author>Nguyen Van An</author></authors></comments>');
  assert.equal(xl.xml, '<comments><authors><author></author></authors></comments>');
});

test('cleanOffice: xóa docProps, tên người viết; báo macro, bình luận, liên kết ngoài', () => {
  const rels = '<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://a.example" TargetMode="External"/></Relationships>';
  const input = makeZip({
    '[Content_Types].xml': '<Types/>',
    'docProps/core.xml': CORE,
    'docProps/app.xml': APP,
    'word/document.xml': '<w:document><w:ins w:author="An"/></w:document>',
    'word/comments.xml': '<w:comments><w:comment w:author="An" w:initials="A"/></w:comments>',
    'word/_rels/document.xml.rels': rels,
    'word/media/anh.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  const r = cleanOffice(input);
  assert.ok(r.removed.includes('docProps/core.xml:creator'));
  assert.ok(r.removed.includes('docProps/core.xml:lastModifiedBy'));
  assert.ok(r.removed.includes('docProps/app.xml:Company'));
  assert.ok(r.removed.includes('word/comments.xml:author'));
  assert.ok(r.removed.includes('word/document.xml:author'));
  assert.deepEqual(r.warnings.sort(), ['office-comments']);
  assert.ok(!read(r.buf, 'docProps/core.xml').includes('Nguyen'));
  assert.ok(!r.buf.includes(Buffer.from('2112345')));
  // Phần không sửa chép nguyên byte; chạy lại cho cùng kết quả.
  assert.deepEqual(readZip(r.buf).entries.find((e) => e.name === 'word/media/anh.png').data, readZip(input).entries.find((e) => e.name === 'word/media/anh.png').data);
  assert.ok(cleanOffice(input).buf.equals(r.buf));
  // Đã sạch thì không còn gì để xóa.
  assert.deepEqual(cleanOffice(r.buf).removed, []);

  const macro = cleanOffice(makeZip({ 'word/vbaProject.bin': 'x', 'docProps/core.xml': '<cp:coreProperties/>' }));
  assert.deepEqual(macro.warnings, ['office-macro']);
  const ext = '<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://evil.example/t.dotm" TargetMode="External"/></Relationships>';
  assert.deepEqual(cleanOffice(makeZip({ 'word/_rels/settings.xml.rels': ext })).warnings, ['office-external']);
  assert.throws(() => cleanOffice(makeZip({ 'docProps/core.xml': CORE }, { 'docProps/core.xml': { flags: 0x801 } })), /mật khẩu/);
});

test('zipFindings: mật khẩu, đường dẫn lạ, symlink, file nén lồng, loại lạ, quá lớn, ảnh', () => {
  const opts = { allowed: ['.json', '.md', '.png', '.jpg'], maxUncompressed: 1000 };
  const entry = (name, more = {}) => ({ name, size: 10, encrypted: false, symlink: false, ...more });
  assert.deepEqual(zipFindings([entry('pack.json'), entry('bai/1.md'), entry('bai/')], opts), []);
  assert.deepEqual(zipFindings([entry('a.json', { encrypted: true })], opts), ['zip-encrypted']);
  for (const bad of ['../x.json', '/etc/x.json', 'C:/x.json', 'a\\b.json']) assert.ok(zipFindings([entry(bad)], opts).includes('zip-unsafe-path'), bad);
  assert.deepEqual(zipFindings([entry('link.json', { symlink: true })], opts), ['zip-symlink']);
  assert.deepEqual(zipFindings([entry('trong.zip')], opts), ['zip-nested']);
  assert.deepEqual(zipFindings([entry('chay.exe')], opts), ['zip-other-type']);
  assert.deepEqual(zipFindings([entry('a.json', { size: 2000 })], opts), ['zip-large']);
  assert.deepEqual(zipFindings([entry('hinh.png')], opts), ['zip-images']);
  // readZip nhận ra mục có mật khẩu và symlink từ cờ, thuộc tính.
  const z = readZip(makeZip({ 'a.json': '{}', 'l.json': 'x' }, { 'a.json': { flags: 0x801 }, 'l.json': { versionMadeBy: 0x031e, externalAttr: (0o120777 << 16) >>> 0 } }));
  assert.deepEqual(z.entries.map((e) => [e.encrypted, e.symlink]), [[true, false], [false, true]]);
});

test('pdfActiveContent: tìm khóa trong từ điển, bỏ qua stream, giải mã #xx', () => {
  const pdf = [
    '%PDF-1.7',
    '1 0 obj << /Type /Catalog /OpenAction 5 0 R /Names << /EmbeddedFiles 6 0 R >> >> endobj',
    '5 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj',
    '7 0 obj << /Length 20 >> stream\n/Launch /AA trong stream\nendstream endobj',
  ].join('\n');
  assert.deepEqual(pdfActiveContent(pdf), ['pdf-javascript', 'pdf-openaction', 'pdf-embedded']);
  assert.deepEqual(pdfActiveContent('1 0 obj << /S /L#61unch /F (calc.exe) >> endobj'), ['pdf-launch']);
  assert.deepEqual(pdfActiveContent('1 0 obj << /Type /Page /Contents 2 0 R >> endobj\n2 0 obj << >> stream\n/JS /JavaScript\nendstream'), []);
  // Tên dài hơn (JSFoo) không tính.
  assert.deepEqual(pdfActiveContent('<< /JSFoo 1 /AAA 2 >>'), []);
});

test('pdfActiveContent: OpenAction chỉ mở tới một trang thì không cảnh báo', () => {
  const cat = (oa) => `1 0 obj << /Type /Catalog /OpenAction ${oa} >> endobj\n3 0 obj << /Type /Page >> endobj`;
  // File LaTeX của bài tập lớn: hành động /GoTo tới trang đầu.
  assert.deepEqual(pdfActiveContent(`${cat('9 0 R')}\n9 0 obj << /D [ 3 0 R /Fit ] /S /GoTo >> endobj`), []);
  assert.deepEqual(pdfActiveContent(cat('[ 3 0 R /XYZ 0 792 0 ]')), []);
  assert.deepEqual(pdfActiveContent(cat('<< /S /GoTo /D [ 3 0 R /Fit ] >>')), []);
  // Hành động khác, nối /Next, hay không tìm được object: vẫn cảnh báo.
  assert.deepEqual(pdfActiveContent(`${cat('9 0 R')}\n9 0 obj << /S /URI /URI (https://x) >> endobj`), ['pdf-openaction']);
  assert.deepEqual(pdfActiveContent(`${cat('9 0 R')}\n9 0 obj << /S /GoTo /D [ 3 0 R /Fit ] /Next 10 0 R >> endobj`), ['pdf-openaction']);
  assert.deepEqual(pdfActiveContent(cat('9 0 R')), ['pdf-openaction']);
  // AA (hành động theo sự kiện) vẫn cảnh báo dù OpenAction chỉ mở trang.
  assert.deepEqual(pdfActiveContent(`${cat('[ 3 0 R /Fit ]')}\n3 0 obj << /AA << /O 5 0 R >> >> endobj`), ['pdf-openaction']);
});

test('splitPdfText: tách trang theo \\f, cắt theo số trang tối đa', () => {
  assert.deepEqual(splitPdfText('trang 1\ftrang 2\f', 10), ['trang 1', 'trang 2']);
  assert.deepEqual(splitPdfText('a\fb\fc\f', 2), ['a', 'b']);
  assert.deepEqual(splitPdfText('', 5), []);
});

test('imageLeftovers: thẻ cấu trúc và hướng ảnh được giữ; GPS, máy, chữ PNG, chú thích JPEG thì sót', () => {
  const clean = {
    SourceFile: 'a.jpg', 'ExifTool:ExifToolVersion': 12, 'File:FileSize': '1 kB', 'File:ImageWidth': 10,
    'JFIF:JFIFVersion': '1.01', 'EXIF:Orientation': 'Rotate 90 CW', 'EXIF:XResolution': 72, 'PNG:ImageWidth': 10,
    'PNG:BitDepth': 8, 'PNG:ColorType': 'RGB', 'Composite:ImageSize': '10x10',
  };
  assert.deepEqual(imageLeftovers(clean), []);
  const dirty = { ...clean, 'EXIF:GPSLatitude': 10.7, 'EXIF:Model': 'Phone', 'XMP:Creator': 'An', 'PNG:Author': 'An', 'File:Comment': 'An', 'IPTC:Keywords': 'x' };
  assert.deepEqual(imageLeftovers(dirty).sort(), ['EXIF:GPSLatitude', 'EXIF:Model', 'File:Comment', 'IPTC:Keywords', 'PNG:Author', 'XMP:Creator']);
});
