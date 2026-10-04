# Báo lỗ hổng bảo mật

Nếu bạn tìm thấy lỗ hổng trong thư viện, hãy báo riêng, **đừng mở issue công khai**.

## Cách báo

1. Vào tab **Security** của repo, chọn **Report a vulnerability** (báo riêng qua GitHub, chỉ người duy trì thấy).
2. Nếu không dùng được GitHub, gửi email tới `bkstudydesk@xerozsoft.com`.

Nên ghi: phần bị ảnh hưởng, cách tái hiện, mức ảnh hưởng bạn đánh giá. Đừng gửi khóa, token hay dữ liệu cá nhân của người khác trong báo cáo.

## Phạm vi

- Cloudflare Worker nhận bài gửi (`worker/`): kiểm form, Turnstile, giới hạn số lần gửi, kho cách ly R2.
- Bot GitHub App và các workflow (`.github/workflows/`): kiểm file, phát hành lên Release, dọn kho, gỡ file.
- Trang web tĩnh (`site-src/`, `scripts/build-site.mjs`) và dữ liệu công khai `v1/`.

Ngoài phạm vi: lỗ hổng của GitHub, Cloudflare hay trình duyệt; tấn công từ chối dịch vụ; báo cáo chỉ dựa trên công cụ quét tự động mà không có cách tái hiện.

## Sau khi báo

Người duy trì sẽ xác nhận đã nhận, cùng bạn đánh giá mức ảnh hưởng, sửa trong nhánh riêng rồi mới công bố. Đây là dự án sinh viên do một người duy trì, nên thời gian trả lời có thể mất vài ngày. Bạn được ghi công trong ghi chú sửa lỗi nếu muốn.

Xin đừng thử tấn công trên dữ liệu thật của người khác, và đừng gửi bài thử quá giới hạn số lần gửi.
