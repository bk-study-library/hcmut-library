# Đóng góp và duyệt bài

Trang này nói thư viện nhận gì, bạn gửi bài bằng cách nào, và người duyệt làm gì với bài của bạn.

## Quy định

| Nhận | Không nhận |
|---|---|
| Mọi tài liệu học tập bạn muốn chia sẻ: tóm tắt, ghi chú, bảng công thức, lời giải, slide, đề thi, đáp án, mẫu và bài tham khảo cho prelab, báo cáo, bài tập lớn, gói quiz Study Pack v1 | File sách có bản quyền (sách thương mại, sách của nhà xuất bản) |
| Link tới tài liệu công khai khác | File chạy được (exe, bat, sh, apk, jar...) |
| Đuôi file: .pdf, .md, .docx, .pptx, .xlsx, .zip, .png, .jpg, .json | File lớn hơn 20 MB |

Một số điều cần nhớ:

- **Chỉ cấm file sách có bản quyền.** Muốn giới thiệu một cuốn sách, chọn loại **Sách tham khảo** (`book-ref`) và ghi tên sách, tác giả, năm, nhà xuất bản, ISBN. Không đính kèm file.
- **Đề thi, đáp án, slide đã lưu hành** vẫn được nhận. Nếu chủ tài liệu yêu cầu gỡ, thư viện gỡ: xem [TAKEDOWN.md](TAKEDOWN.md).
- **Thông tin cá nhân** (MSSV, email, số điện thoại) trong file chỉ bị máy cảnh báo. Người duyệt quyết định có yêu cầu xóa hay không. Bạn nên tự xóa trước khi gửi.
- **Các ô chữ** (tiêu đề, mô tả, chương, giảng viên, tên hiển thị) hiện công khai, nên form từ chối và CI báo lỗi nếu thấy MSSV, email hay số điện thoại trong các ô này. File `.md` trong git cũng bị kiểm như vậy. Dòng nào chắc chắn không phải thông tin cá nhân thì thêm chú thích `pii-ok` vào dòng đó.
- **Giấy phép.** Tài liệu bạn tự soạn dùng CC BY-SA 4.0 (hoặc CC BY 4.0, CC0). Link ghi giấy phép của nguồn.
- **Link sách** chỉ trỏ tới nguồn hợp pháp: giáo trình mở (OpenStax, LibreTexts, MIT OpenCourseWare, DOAB), Open Library, thư viện trường, trang nhà xuất bản. Không trỏ tới trang chia sẻ tài liệu do người dùng tự tải lên (Studylib, Scribd, Studocu và tương tự), vì sách trên đó thường bị đăng lại khi chưa có phép. Mục Sách tham khảo trên web tự có nút tra sách ở Open Library và thư viện trường.
- **Không chấm điểm hay nhận xét giảng viên.** Trường giảng viên chỉ ghi tên.
- **Hạn mức** nằm trong `catalog/policy.json` (dung lượng, đuôi file, độ dài các ô). Đổi hạn mức là việc của người duy trì.

## Ba cách đóng góp

### 1. Gửi file qua trang web (khuyên dùng, không cần tài khoản GitHub)

1. Mở [Gửi tài liệu](https://bk-study-library.github.io/hcmut-library/gui-tai-lieu/), hoặc bấm **Gửi tài liệu** trên trang môn để form chọn sẵn môn.
2. Chọn môn, loại tài liệu, nhập tiêu đề, chọn file. Nhiều file thì nén thành một file .zip.
3. Chọn giấy phép, đánh dấu ba ô cam kết, qua bước xác minh Turnstile của Cloudflare.
4. Bấm **Gửi tài liệu**. Trang hiện mã bài. Hãy lưu mã này để hỏi về bài của bạn.

Điều gì xảy ra tiếp theo:

1. Worker của thư viện kiểm lại form (môn, loại, đuôi file, dung lượng, nội dung file khớp đuôi, thông tin cá nhân trong các ô chữ), rồi cất file vào kho riêng, không công khai.
2. Một bot mở Pull Request mang nhãn `tai-lieu-moi`, nhánh `upload/<mã bài>`. Người mở PR là bot, không phải bạn.
3. Workflow `kiem-file` quét virus, xóa siêu dữ liệu của PDF, cảnh báo thông tin cá nhân, rồi ghi link Release vào PR. Có virus thì PR bị đóng.
4. Người duyệt đọc và merge.
5. Workflow `phat-hanh-file` đưa file lên GitHub Release `files-HKxxx` (pre-release) và xóa file trong kho riêng. PR bị đóng mà không merge thì `don-kho` xóa file và nhánh.

Bạn nhập tên hiển thị thì tên đó hiện công khai cùng bài; bỏ trống thì bài hiện là Ẩn danh. Chi tiết dữ liệu: [PRIVACY.md](PRIVACY.md).

### 2. Thêm link qua form issue (cần tài khoản GitHub)

Chỉ có link, không có file: mở form [Thêm link](https://github.com/bk-study-library/hcmut-library/issues/new?template=them-link.yml) (hoặc bấm **Thêm link** trên trang môn). Ghi mã môn, link, tiêu đề, giấy phép của nguồn. Không thêm link tới file sách có bản quyền. Issue này chưa có tự động hóa: người duyệt đọc rồi tự mở Pull Request thêm mục `link`.

### 3. Pull Request (nếu bạn dùng Git)

1. Fork repo. Thêm `courses/<ID>/items/<id>.json`. Nếu tài liệu là file `.md` nhỏ (dưới 1 MB), đặt nó ở `courses/<ID>/files/<tên>.md` và ghi `name`, `size`, `sha256`, `path` trong mục. Mẫu: `courses/MT1005/items/bang-cong-thuc-giai-tich-2.json`.
2. Trong git chỉ có `README.md`, `items/*.json` và `files/*.md` của từng môn. File khác (PDF, .docx, ảnh, .zip) gửi qua cách 1.
3. Chạy `npm test` rồi `npm run build`. Commit cả file sinh ra (`index.json`, `index.min.json`, `v1/`, README môn).
4. Mở Pull Request và đánh dấu danh sách kiểm trong mẫu PR.

## Sửa danh mục môn

Mở form [Sửa danh mục môn](https://github.com/bk-study-library/hcmut-library/issues/new?template=sua-danh-muc.yml) hoặc gửi PR sửa `catalog/courses/<ID>.json`.

- ID của môn không bao giờ đổi.
- Môn đổi tên hoặc đổi mã thì giữ ID, thêm mã và tên cũ vào `aliases`.
- Môn ngừng dạy thì đặt `status: retired` (thêm `replacedBy` nếu có môn thay thế) và vẫn giữ trong danh mục, để link cũ không hỏng.
- Trường dùng lại một mã cho môn khác thì môn sau có ID kèm năm khóa, ví dụ `GE4169-2024`.
- Danh mục chỉ lấy từ nguồn công khai. Không ghi điểm, GPA hay số liệu cá nhân.

## Thêm chương trình đào tạo

Khoa của bạn chưa có chương trình, hoặc chương trình chưa có danh sách môn: mở form [Thêm chương trình đào tạo](https://github.com/bk-study-library/hcmut-library/issues/new?template=them-chuong-trinh.yml), hoặc bấm **Thêm chương trình đào tạo** trên trang khoa, trang chương trình hay mục Chương trình đào tạo ở trang chủ để form chọn sẵn khoa.

- Ghi khoa, tên ngành như trong CTĐT, khóa (năm vào trường).
- Gửi link CTĐT chính thức của trường hoặc của khoa. Không có link thì đính kèm file PDF CTĐT; CTĐT là văn bản công khai nên gửi qua issue được.
- Không đính kèm bảng điểm hay ảnh chụp MyBK có MSSV, điểm.
- Người duyệt nhập mã môn, tên, tín chỉ, khối kiến thức vào `catalog/programs/<mã>.json` và mục `programs` của từng môn, rồi mở Pull Request. Thư viện không lưu file CTĐT, chỉ lưu link nguồn.

## Duyệt bài

Người duyệt là sinh viên đã học qua môn, làm tình nguyện. Danh sách người duyệt nằm trong [.github/CODEOWNERS](.github/CODEOWNERS). Hiện tại là người duy trì repo. Muốn tham gia, mở form [Đăng ký duyệt bài](https://github.com/bk-study-library/hcmut-library/issues/new?template=dang-ky-duyet.yml).

### Luồng duyệt

1. Bài tới qua một trong ba cách ở trên.
2. CI `validate` kiểm schema, tham chiếu, loại file, dung lượng, file trùng, thông tin cá nhân trong ô chữ và file `.md`. CI không qua thì sửa trước.
3. Với bài gửi qua trang web, đợi `kiem-file` comment kết quả vào PR.
4. Người duyệt đọc theo danh sách kiểm bên dưới. Cần hỏi người gửi thì hỏi trong PR (hoặc issue).
5. Đạt thì merge. Không đạt thì comment lý do rồi đóng PR; file chờ duyệt sẽ được dọn tự động.
6. Mục tiêu: trả lời bài trong 7 ngày. Yêu cầu gỡ được ưu tiên, xem [TAKEDOWN.md](TAKEDOWN.md).

### Danh sách kiểm của người duyệt

- [ ] Không phải file sách có bản quyền. Nếu là sách, đổi sang loại Sách tham khảo và chỉ giữ tên sách.
- [ ] Không có file chạy được. Với file .zip, mở ra xem. Đuôi file đã bị giới hạn, nhưng .zip có thể chứa file khác bên trong.
- [ ] Đọc cảnh báo thông tin cá nhân của máy trong PR (loại thông tin, số trang) và quyết định: bỏ qua, hoặc yêu cầu người gửi xóa rồi gửi lại. Máy chỉ cảnh báo, không chặn.
- [ ] Báo cáo của `kiem-file`: không có virus, PDF có lớp chữ khi cần, siêu dữ liệu đã được xóa.
- [ ] Giấy phép đúng: tự soạn là CC BY-SA 4.0 (hoặc CC BY 4.0, CC0); link ghi giấy phép của nguồn.
- [ ] Đúng môn, đúng loại, tiêu đề rõ, không quảng cáo, không nhận xét hay chấm điểm giảng viên.
- [ ] Mục tài liệu hợp lệ: `npm run validate` sạch, đã commit file sinh ra.

### Khi nhiều PR mở cùng lúc

Mỗi PR gửi bài sửa các file sinh ra (`index.json`, `index.min.json`, `v1/`, README môn), nên sau khi merge một PR, các PR còn lại sẽ xung đột ở những file này. Với từng PR: bấm **Update branch**, giải xung đột ở file sinh ra bằng cách giữ bên nào cũng được, commit để `kiem-file` dựng lại, đợi CI xanh rồi mới merge. Không sửa tay `courses/<ID>/items/<id>.json` khi giải xung đột. Chi tiết: [docs/cai-dat-luong-tai-len.md](docs/cai-dat-luong-tai-len.md).

## Công cụ cho người đóng góp bằng Git

Cần Node 22 trở lên. Không có gói npm nào phải cài cho phần chính của repo.

| Lệnh | Làm gì |
|---|---|
| `npm test` | chạy test với dữ liệu mẫu trong `test/fixtures/` |
| `npm run validate` | kiểm toàn bộ; báo lỗi nếu file sinh ra đã cũ |
| `npm run build` | kiểm rồi ghi lại các file sinh ra |

Danh sách lệnh đầy đủ: [README.md](README.md).
