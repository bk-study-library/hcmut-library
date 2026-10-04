# Quyền riêng tư

Tài liệu này nói thư viện và form gửi tài liệu thu thập gì, giữ ở đâu, bao lâu. Nó mô tả đúng cách hệ thống đang chạy.

## Khi bạn đọc và tải tài liệu

Trang web và file `v1` là nội dung công khai, phục vụ qua GitHub Pages và GitHub Releases. Các trang của thư viện không đặt cookie, không có công cụ phân tích, không quảng cáo. Riêng trang Gửi tài liệu có widget Cloudflare Turnstile, do Cloudflare vận hành (xem mục dưới). GitHub, như mọi máy chủ web, có thể thấy địa chỉ IP của bạn khi bạn tải trang hay tải file; chính sách của GitHub áp dụng cho phần đó.

## Khi bạn gửi tài liệu qua form

Form không bắt nhập email. Những gì form gửi đi:

| Thông tin | Ghi chú |
|---|---|
| Môn, loại, tiêu đề, mô tả, chương, học kỳ, loại kiểm tra, giảng viên, giấy phép, ngôn ngữ | Bạn nhập hoặc chọn. Hiện công khai nếu bài được duyệt |
| Tên hiển thị | Không bắt buộc. Bỏ trống thì bài hiện là Ẩn danh. Nếu điền, tên hiện công khai cùng bài |
| Ba ô cam kết | Chỉ để xác nhận bạn có quyền đăng và bài không phải file sách có bản quyền |
| File | Lưu tạm trong kho riêng, xem mục "File chờ duyệt" |
| Mã xác minh của Cloudflare Turnstile | Chống gửi tự động. Turnstile do Cloudflare vận hành, nên Cloudflare xử lý dữ liệu trình duyệt của bạn theo chính sách của họ |

Địa chỉ IP của bạn:

- Worker nhận bài dùng IP chỉ để giới hạn số lần gửi theo IP, qua tính năng Rate Limiting của Cloudflare. Ngưỡng đặt trong cấu hình Worker (`worker/wrangler.jsonc`). Worker không lưu IP vào kho, vào PR hay vào nhật ký, và nhật ký từng lượt gọi của Worker đã tắt.
- Cloudflare, với vai trò nhà cung cấp hạ tầng, vẫn nhìn thấy IP khi xử lý yêu cầu. Chính sách của Cloudflare áp dụng cho phần đó.

## File chờ duyệt

- File bạn gửi nằm trong một kho riêng (Cloudflare R2, không công khai) cho tới khi người duyệt xử lý PR.
- Khi PR được merge, bản đã làm sạch được đưa lên Release công khai và file trong kho bị xóa. Khi PR bị đóng, file trong kho bị xóa.
- Bài bị bỏ quên: luật vòng đời của kho xóa mọi file sau 30 ngày.
- Người duyệt xem file chờ duyệt qua một trang riêng, đăng nhập bằng tài khoản GitHub qua Cloudflare Access. Chỉ thành viên nhóm duyệt bài (org `bk-study-library` trên GitHub) vào được. Cloudflare Access xử lý thông tin đăng nhập của người duyệt theo chính sách của Cloudflare.
- Với PDF, máy xóa siêu dữ liệu (Author, Creator, Producer, XMP) khỏi bản được đăng. Bản gốc chỉ nằm trong kho riêng cho tới khi bị xóa như trên.
- Máy quét virus và quét thông tin cá nhân (MSSV, email, số điện thoại) trong file. Thông tin cá nhân trong file chỉ bị cảnh báo trong PR, không bị chặn: người gửi và người duyệt tự quyết có xóa không. Hãy tự xóa phần này trước khi gửi.
- Các ô chữ của form (tiêu đề, mô tả, chương, giảng viên, tên hiển thị, thông tin sách) hiện công khai, nên form từ chối bài có MSSV, email hay số điện thoại trong các ô này.

## Link xem bài của bạn

Sau khi gửi, trang Gửi tài liệu hiện một link xem bài riêng của bạn. Link cho bạn xem trạng thái bài (đang chờ duyệt, đã đăng, không được nhận) và xem lại file khi file còn trong kho riêng.

- Link chứa một mã bí mật ngẫu nhiên. Chỉ bạn có link: thư viện chỉ lưu giá trị băm `sha256` của mã, không lưu chính mã, nên không gửi lại được và không ai trong nhóm duyệt đọc được mã. Hãy tự lưu link, đừng chia sẻ.
- Ai có link đều xem được bài, nên giữ link như một mật khẩu.
- Link hết hạn khi file chờ duyệt bị xóa: khi người duyệt merge hoặc đóng PR, muộn nhất sau 30 ngày theo luật vòng đời của kho.

## Những gì công khai khi repo public

Mỗi bài gửi tạo một Pull Request. Khi repo public, PR đó công khai, gồm:

- các trường trong bảng thông tin (môn, loại, tiêu đề, mô tả, chương, học kỳ, giảng viên, tên hiển thị nếu có, giấy phép);
- mã bài, giá trị `sha256` và kích thước của file (cả `sha256` của file gốc, dùng để chặn gửi trùng);
- comment kết quả kiểm của máy, có thể gồm loại thông tin cá nhân tìm thấy và số trang;
- người mở PR là bot của thư viện, không phải bạn. Thư viện không ghi tài khoản hay email của bạn vào PR.

PR chỉ chứa những gì sẽ được đăng cùng kết quả kiểm. Sau khi merge, thông tin tài liệu và file nằm trong lịch sử repo và trên Release, và có thể đã được người khác sao chép.

## Gửi bằng Pull Request hoặc issue

Nếu bạn gửi bằng tài khoản GitHub của mình (Pull Request, form Thêm link, form Yêu cầu gỡ), tên tài khoản và nội dung bạn gửi công khai theo quy tắc của GitHub. Vì vậy thư viện không nhận file qua issue, và form Yêu cầu gỡ dặn bạn đừng chép thông tin cá nhân vào issue.

## Gỡ bài

Muốn gỡ tài liệu của bạn hoặc tài liệu bạn có quyền với, làm theo [TAKEDOWN.md](TAKEDOWN.md) (cũng có trang Gỡ tài liệu trên web).
