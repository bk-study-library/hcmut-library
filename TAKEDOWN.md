# Gỡ tài liệu

Nếu một tài liệu trong thư viện vi phạm bản quyền của bạn, lộ thông tin cá nhân của bạn hoặc sai quy định, hãy báo để gỡ. Mục tiêu: xử lý trong **1 ngày làm việc**. Người duy trì repo làm việc tự nguyện, nên đây là mục tiêu, không phải cam kết pháp lý.

## Ai được yêu cầu

- Tác giả hoặc chủ bản quyền (giảng viên, khoa, nhà xuất bản).
- Người có thông tin cá nhân trong tài liệu.
- Người đã gửi tài liệu và muốn rút lại.
- Bất kỳ ai thấy file sách có bản quyền trong thư viện.

## Cách yêu cầu

1. Mở form [Yêu cầu gỡ](https://github.com/bk-study-library/hcmut-library/issues/new?template=yeu-cau-go.yml).
2. Dán link trang môn hoặc tên tài liệu, chọn lý do, ghi bạn là ai với tài liệu này (tác giả, chủ bản quyền, người gửi).
3. **Đừng** chép thông tin cá nhân vào issue. Issue là công khai, chỉ cần link tới tài liệu.
4. Cần trao đổi riêng thì ghi "cần liên hệ riêng". Người duy trì sẽ trả lời cách liên hệ.

Bạn gửi tài liệu và muốn rút lại: ghi mã bài đã nhận khi gửi.

## Người duy trì làm gì

1. Đọc yêu cầu. Yêu cầu có cơ sở thì gỡ ngay, chưa cần chờ trao đổi thêm.
2. Mở form **Gỡ tài liệu** `https://upload.xerozsoft.com/xem-duyet/go` (sau Cloudflare Access), dán tiêu đề issue (dạng `[Gỡ] MT1005 slide-chuong-1`), chọn lý do, xác nhận rồi bấm **Gỡ tài liệu**. Không cần dùng git: bot mở PR `go/<mã>` đặt `removed: true` và `removedReason` (không ghi thông tin cá nhân), giữ nguyên `id` và `files` (workflow đọc `url` trong `files` để biết xóa file nào trên Release), xóa file `.md` nằm trong git nếu có.
3. Bot dựng lại dữ liệu và merge khi check qua (vài phút). Sửa tay vẫn được: sửa item như trên, chạy `npm run build`, mở PR và merge.
4. File trên GitHub Release: khi mục chuyển sang `removed` và merge vào `main`, workflow `phat-hanh-file` (job `go-file`) tự xóa file tương ứng trên Release. Người duy trì kiểm lại rằng file đã mất. Xóa asset trên Release là mất hẳn.
5. Bài còn đang chờ duyệt (PR chưa merge): đóng PR. Workflow `don-kho` xóa file trong kho riêng và branch.
6. Item vẫn còn với nhãn "Đã gỡ", kèm lý do, để link cũ không hỏng và mọi người biết tài liệu đã bị gỡ. Web và `v1/` chỉ còn `id`, loại, lý do và ngày thêm; app xóa bản đã lưu của mục này.
7. Thông tin cá nhân đã nằm trong lịch sử git: người duy trì viết lại lịch sử phần đó và nhờ GitHub xóa bộ nhớ đệm.
8. Trả lời trong issue và đóng issue.

## Điều thư viện không làm được

Sau khi tài liệu được đăng, người khác có thể đã tải hoặc sao chép. Thư viện chỉ gỡ được bản của mình.

Xem thêm: [CONTRIBUTING.md](CONTRIBUTING.md), [PRIVACY.md](PRIVACY.md).
