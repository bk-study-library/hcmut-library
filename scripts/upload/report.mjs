// Đọc kết quả ClamAV và soạn bình luận báo cáo kiểm file. Chỉ dùng JS chuẩn.

export const REPORT_MARKER = '<!-- kiem-file -->';

export function parseClamscan(stdout, exitCode) {
  if (exitCode === 0) return { infected: false };
  if (exitCode === 1) {
    const m = String(stdout).match(/^.*: ([\w.\-/:]+) FOUND\r?$/m);
    if (!m) throw new Error('Không đọc được tên virus từ kết quả ClamAV.');
    return { infected: true, signature: m[1] };
  }
  throw new Error(`ClamAV báo lỗi (mã ${exitCode}).`);
}

// Giữ 2 ký tự đầu và 1 ký tự cuối, che phần giữa; chuỗi ngắn che hết.
function mask(s) {
  const t = String(s);
  if (t.length <= 4) return '*'.repeat(t.length);
  return t.slice(0, 2) + '*'.repeat(t.length - 3) + t.slice(-1);
}

// piiChecked false: loại file này không đọc được chữ nên chưa tìm thông tin cá nhân.
// reviewUrl: link xem file cho người duyệt (sau Cloudflare Access); không có thì bỏ dòng này.
export function renderReport({ code, virus, metadataRemoved = [], hasText, pii = [], url, piiChecked = true, reviewUrl }) {
  const out = [REPORT_MARKER, `## Kết quả kiểm file ${code}`, ''];

  if (virus) {
    out.push(`Có virus: ${virus}. Bài nộp này sẽ bị đóng và file không được dùng. Bạn hãy quét máy, rồi nộp lại bằng file sạch.`);
    return out.join('\n') + '\n';
  }

  out.push('Không phát hiện virus.');
  if (metadataRemoved.length) {
    out.push(`Đã xóa siêu dữ liệu: ${metadataRemoved.join(', ')}.`);
  }
  if (hasText === false) {
    out.push('Cảnh báo: file PDF không có lớp chữ nên không tìm kiếm được. Người duyệt sẽ xem xét.');
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
