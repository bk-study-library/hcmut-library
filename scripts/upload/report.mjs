// Đọc kết quả ClamAV và soạn bình luận báo cáo kiểm file. Chỉ dùng JS chuẩn.

export const REPORT_MARKER = '<!-- kiem-file -->';
// Nhãn gắn vào PR khi máy không kết luận được, người duyệt phải xem tay trước khi gộp.
export const MANUAL_LABEL = 'can-xem-tay';

const SIG = /^.*: ([\w.\-/:]+) FOUND\r?$/gm;
// ClamAV báo các chữ ký này khi không quét được (file mã hóa, vượt giới hạn) chứ không phải virus.
const UNSCANNABLE = /^Heuristics\.(Encrypted|Limits\.Exceeded)(\.|$)/;

// Kết quả clamscan. Có virus thật thì infected; chỉ có cảnh báo không quét được thì unscannable.
export function parseClamscan(stdout, exitCode) {
  if (exitCode === 0) return { infected: false };
  if (exitCode === 1) {
    const sigs = [...String(stdout).matchAll(SIG)].map((m) => m[1]);
    if (!sigs.length) throw new Error('Không đọc được tên virus từ kết quả ClamAV.');
    const virus = sigs.find((s) => !UNSCANNABLE.test(s));
    if (virus) return { infected: true, signature: virus };
    return { infected: false, unscannable: sigs[0] };
  }
  throw new Error(`ClamAV báo lỗi (mã ${exitCode}).`);
}

// Câu cố định cho từng mã cảnh báo của job scan. manual: cần người duyệt xem tay (gắn nhãn).
export const WARNINGS = {
  'pdf-javascript': { manual: true, text: 'PDF có JavaScript. Người duyệt mở xem tay; tài liệu học tập không cần JavaScript, có thể nhờ người gửi xuất lại PDF.' },
  'pdf-launch': { manual: true, text: 'PDF có lệnh mở chương trình khác (Launch). Người duyệt mở xem tay.' },
  'pdf-openaction': { manual: false, text: 'PDF có hành động tự chạy khi mở hoặc khi bấm (OpenAction, AA). Thường chỉ là chọn trang đầu, người duyệt xem qua.' },
  'pdf-embedded': { manual: false, text: 'PDF có file đính kèm bên trong. Người duyệt mở xem file đính kèm là gì.' },
  'office-macro': { manual: true, text: 'File Office có macro (vbaProject.bin). Người duyệt mở xem tay; tài liệu học tập thường không cần macro.' },
  'office-comments': { manual: false, text: 'File có bình luận hoặc sửa đổi có theo dõi. Tên người viết đã được xóa, nội dung bình luận vẫn còn.' },
  'office-external': { manual: true, text: 'File Office trỏ tới tài nguyên bên ngoài (mẫu, đối tượng nhúng, ảnh tải từ mạng). Người duyệt mở xem tay.' },
  'zip-encrypted': { manual: true, text: 'File .zip có mục đặt mật khẩu nên không quét được bên trong. Người duyệt mở xem tay.' },
  'zip-unsafe-path': { manual: true, text: 'File .zip có đường dẫn lạ (tuyệt đối hoặc có ..). Người duyệt mở xem tay.' },
  'zip-symlink': { manual: true, text: 'File .zip có liên kết tượng trưng. Người duyệt mở xem tay.' },
  'zip-nested': { manual: true, text: 'File .zip chứa file nén khác. Người duyệt mở xem tay.' },
  'zip-other-type': { manual: true, text: 'File .zip có file thuộc loại không nhận trong gói quiz (catalog/policy.json, scan.zipAllowedInside). Người duyệt mở xem tay.' },
  'zip-large': { manual: true, text: 'File .zip giải nén ra lớn hơn giới hạn. Người duyệt mở xem tay.' },
  'zip-images': { manual: false, text: 'Ảnh bên trong file .zip chưa được xóa siêu dữ liệu (vị trí GPS, tên máy). Người duyệt mở xem.' },
};

// Có cần người duyệt xem tay không: ClamAV không quét được, hoặc có cảnh báo loại manual.
export function needsManualReview({ unscannable, warnings = [] }) {
  return Boolean(unscannable) || warnings.some((w) => WARNINGS[w]?.manual);
}

// Số tên siêu dữ liệu đã xóa hiện trong comment; phần còn lại chỉ ghi số lượng.
const METADATA_SHOWN = 40;

// Giữ 2 ký tự đầu và 1 ký tự cuối, che phần giữa; chuỗi ngắn che hết.
function mask(s) {
  const t = String(s);
  if (t.length <= 4) return '*'.repeat(t.length);
  return t.slice(0, 2) + '*'.repeat(t.length - 3) + t.slice(-1);
}

// piiChecked false: loại file này không đọc được chữ nên chưa tìm thông tin cá nhân.
// reviewUrl: link xem file cho người duyệt (sau Cloudflare Access); không có thì bỏ dòng này.
// textPages, totalPages: số trang PDF đã đọc chữ và tổng số trang (đọc có giới hạn).
export function renderReport({
  code, virus, metadataRemoved = [], hasText, pii = [], url, piiChecked = true, reviewUrl,
  unscannable = null, warnings = [], textPages = null, totalPages = null,
}) {
  const out = [REPORT_MARKER, `## Kết quả kiểm file ${code}`, ''];

  if (virus) {
    out.push(`Có virus: ${virus}. Bài nộp này sẽ bị đóng và file không được dùng. Bạn hãy quét máy, rồi nộp lại bằng file sạch.`);
    return out.join('\n') + '\n';
  }

  if (unscannable) {
    out.push(`Không quét hết được file: ClamAV báo ${unscannable} (file mã hóa hoặc vượt giới hạn quét). Người duyệt mở xem tay trước khi gộp.`);
  } else {
    out.push('Không phát hiện virus.');
  }
  if (needsManualReview({ unscannable, warnings })) {
    out.push(`Đã gắn nhãn \`${MANUAL_LABEL}\`: máy không kết luận được, người duyệt cần xem tay trước khi gộp.`);
  }
  if (metadataRemoved.length) {
    const shown = metadataRemoved.slice(0, METADATA_SHOWN);
    const more = metadataRemoved.length - shown.length;
    out.push(`Đã xóa siêu dữ liệu: ${shown.join(', ')}${more > 0 ? ` và ${more} mục khác` : ''}.`);
  }
  for (const w of warnings) if (WARNINGS[w]) out.push(`Cảnh báo: ${WARNINGS[w].text}`);
  if (hasText === false) {
    out.push('Cảnh báo: file PDF không có lớp chữ nên không tìm kiếm được. Người duyệt sẽ xem xét.');
  }
  if (Number.isInteger(textPages) && Number.isInteger(totalPages) && textPages < totalPages) {
    out.push(`Chỉ đọc chữ ${textPages} trang đầu trên tổng ${totalPages} trang để tìm thông tin cá nhân. Người duyệt xem các trang còn lại.`);
  }
  if (!piiChecked) {
    out.push('Chưa kiểm thông tin cá nhân và lớp chữ với loại file này. Người duyệt sẽ xem trực tiếp.');
  }
  if (pii.length) {
    out.push('', 'Cảnh báo: có thể có thông tin cá nhân. Người duyệt sẽ kiểm tra lại, chưa có gì bị chặn.', '');
    for (const p of pii) out.push(`- ${p.label}, trang ${p.page}: ${mask(p.match)}`);
  }
  if (reviewUrl) out.push('', `Xem file (người duyệt): ${reviewUrl}`);
  out.push('', 'Sau khi người duyệt gộp bài, file được đăng tại:', url);
  return out.join('\n') + '\n';
}

// Khối code markdown chứa chữ chưa tin (stderr của công cụ, nội dung artifact): rào bằng số dấu `
// nhiều hơn đoạn ` dài nhất trong chữ, nên chữ không thoát ra được; cắt bớt khi quá dài.
export function fenced(text, max = 2000) {
  let body = String(text ?? '');
  if (body.length > max) body = `${body.slice(0, max)}\n(còn nữa, xem nhật ký)`;
  const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${body}\n${fence}`;
}
