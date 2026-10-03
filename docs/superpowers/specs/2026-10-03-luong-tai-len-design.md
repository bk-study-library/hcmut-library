# Luồng tải tài liệu lên không cần tài khoản GitHub

Ngày: 03/10/2026. Trạng thái: chờ duyệt. Phụ thuộc: PR #1 (dữ liệu công khai v1).

## Mục tiêu

Sinh viên không có tài khoản GitHub gửi được tài liệu từ trang môn. Người duyệt nhận một PR đã được kiểm tự động. Sau khi merge, tài liệu hiện trên web và trong app BK Study Desk qua `v1`, không phải sửa app.

Xong khi: chạy thử trên repo private qua đủ 4 bài ở mục "Chạy thử", và test tự động chạy trong CI.

## Quy định nội dung

Tài liệu là của sinh viên. Mọi loại tài liệu trong hợp đồng v1 đều được nhận, kể cả lời giải, đề cũ, báo cáo tham khảo. `catalog/policy.json` mở cả 13 loại; ràng buộc `gradedAfter` của `prelab-reference` không còn bắt buộc.

Chỉ không nhận:

- Sách, giáo trình có bản quyền (sách thương mại, sách của nhà xuất bản), slide và giáo trình của giảng viên khi chưa có phép.
- File tải từ Scribd, Studocu, Course Hero và trang tương tự.
- File có thông tin cá nhân: MSSV, họ tên, email, số điện thoại, chữ ký, ảnh mặt người.
- File chạy được, file ảnh rời (gộp thành một PDF).

## Hai đường đóng góp

| Đường | Ai dùng | Nhận gì |
|---|---|---|
| Form trên web | mọi người, không cần tài khoản | mọi file trong `policy.json` |
| Pull Request | người dùng Git | thông tin tài liệu (JSON) và file `.md` dưới 1 MB, như CI đang kiểm |

## Cấu hình

Không ghi cứng giá trị có thể đổi.

| Giá trị | Nằm ở | Ai đọc |
|---|---|---|
| Loại tài liệu nhận, đuôi file, kích thước tối đa, dấu nhận dạng đầu file | `catalog/policy.json` | bộ kiểm repo, Worker, form |
| Repo, nhánh, địa chỉ web, giới hạn số lần gửi | `worker/wrangler.jsonc` (`vars`) | Worker |
| Khóa Turnstile, khóa GitHub App, khóa đọc kho cách ly | Worker secrets, GitHub Actions secrets | Worker, workflow |
| Địa chỉ Worker, site key Turnstile | `catalog/site.json` | trang web khi dựng |

`LIMITS` trong `scripts/lib/repo.mjs` chuyển sang đọc từ `policy.json`.

## Thay đổi schema và v1

- `files[]` thêm `quarantine` (khóa trong kho cách ly, chỉ dùng nội bộ, không xuất ra `v1`) và `mime`.
- `v1` thêm `files[].mime`. Đây là trường cộng thêm, không phá hợp đồng v1.

## Thành phần

| Thành phần | Việc |
|---|---|
| Trang "Gửi tài liệu" (`site-src/pages/vi/gui-tai-lieu.html` + `assets/upload.js`) | Form chọn môn (tìm bằng `search-core.js`), loại, tiêu đề, mô tả, chương, học kỳ, loại kiểm tra, giảng viên, tên hiển thị, giấy phép, 3 ô cam kết, file, Turnstile. Nút trên trang môn mở form với môn đã chọn sẵn |
| Worker `upload` (`worker/`) | Nhận form, kiểm, lưu file vào kho cách ly, gọi bot mở PR |
| R2 `bk-lib-quarantine` | Giữ file chờ duyệt. Riêng tư. Luật vòng đời xóa file sau 30 ngày |
| GitHub App `bk-study-library-bot` | Quyền: Contents (đọc, ghi), Pull requests (đọc, ghi), Metadata (đọc). Không webhook. Chỉ cài vào repo thư viện. Không merge được: xem "Bảo vệ nhánh `main`" |
| Workflow `kiem-file` | Chạy khi PR có nhãn `tai-lieu-moi`: tải file từ kho cách ly, kiểm, làm sạch, comment kết quả, ghi link Release vào nhánh của PR |
| Workflow `phat-hanh-file` | Khi PR được merge: đưa file đã làm sạch lên Release, xóa file trong kho |
| Workflow `don-kho` | Khi PR bị đóng mà không merge: xóa file trong kho và xóa nhánh |
| Trang hướng dẫn | Thay `contribute`: cách gửi qua form từng bước, cách gửi qua PR, quy định nội dung, sau khi gửi thì sao |

## Luồng gửi bài

1. Form gửi `multipart/form-data` tới Worker `POST /submit`.
2. Worker kiểm theo thứ tự, gặp lỗi đầu tiên thì dừng và trả lỗi theo từng ô, không lưu gì:
   1. Turnstile.
   2. Số lần gửi (Rate Limiting binding của Cloudflare, khóa theo IP; IP không được lưu).
   3. Môn có trong danh mục, loại có trong `policy.json`.
   4. Đuôi file, kích thước, byte đầu file khớp dấu nhận dạng trong `policy.json`.
   5. Tiêu đề, 3 ô cam kết.
3. Tính `sha256`. Trùng tài liệu đã có hoặc đang chờ duyệt thì trả "Tài liệu này đã có trong thư viện".
4. Lưu file vào R2: `pending/<mã bài>/<tên file>`. Mã bài: 10 ký tự ngẫu nhiên.
5. Bot tạo nhánh `upload/<mã bài>`, commit `courses/<ID>/items/<id>.json`. Trong `files[]` có `quarantine: "pending/<mã bài>/<tên file>"`, chưa có `url`. Mục chưa có link nên không xuất hiện trong `v1`.
6. Bot mở PR, nhãn `tai-lieu-moi`, nội dung sinh từ khuôn cố định (bảng các trường đã điền, mã bài, `sha256`).
7. Worker trả mã bài. Khi repo public thì trả thêm link PR.

Tên file: `<MÃMÔN>_<loại>_<tên-không-dấu>_<HKxxx>.<đuôi>`, bỏ `_<HKxxx>` khi không có học kỳ. `id` của mục là `<tên-không-dấu>`; trùng thì thêm `-2`, `-3`.

## Kiểm file (workflow `kiem-file`)

| Kiểm | Công cụ | Khi phát hiện |
|---|---|---|
| Virus | ClamAV, cập nhật cơ sở dữ liệu mỗi lần chạy | comment, đóng PR, xóa file trong kho |
| Metadata PDF (Author, Creator, Producer, XMP) | `exiftool`, rồi `qpdf --linearize` để bỏ hẳn bản cũ trong file | xóa, ghi bản đã làm sạch về kho cách ly dưới tên `clean/<mã bài>/<tên file>` |
| Lớp chữ của PDF | `pdftotext` | comment "PDF không có lớp chữ", PR vẫn mở |
| MSSV, email, số điện thoại | `scanText` có sẵn trong `repo.mjs`, chạy trên chữ trích từ file | comment kèm số trang, PR vẫn mở |

Kết quả ghi thành một comment duy nhất, sửa lại khi chạy lại. Phần logic viết thành module Node trong `scripts/upload/`, file YAML chỉ gọi lại.

## Ghi link trước khi merge

Không workflow nào commit lên `main`. Link tải của Release biết trước được (`https://github.com/<repo>/releases/download/<tag>/<tên file>`), nên `kiem-file` ghi sẵn vào nhánh của PR, sau khi kiểm xong:

1. Chọn Release `files-HK<xxx>` theo ngày kiểm (HK1: tháng 9 đến tháng 1, HK2: tháng 2 đến tháng 6, HK3: tháng 7 và 8; năm học là hai số cuối của năm bắt đầu). Bảng tháng nằm trong `policy.json`.
2. Release đã có file cùng tên mà khác `sha256` thì thêm `-<6 ký tự đầu sha256>` vào tên.
3. Ghi `url`, `mime`, `sha256` và `size` (sau khi làm sạch) vào `files[]`, giữ `quarantine`. Chạy `npm run build`, commit vào nhánh của PR.

Người duyệt thấy đúng nội dung sẽ lên `v1` ngay trong PR.

## Phát hành (workflow `phat-hanh-file`)

Khi PR được merge:

1. Tạo Release `files-HK<xxx>` nếu chưa có, đánh dấu pre-release.
2. Tải file đã làm sạch từ kho cách ly, kiểm `sha256` khớp với `files[]`, đưa lên Release đúng tên đã ghi. File cùng tên, cùng `sha256` đã có thì bỏ qua.
3. Xóa file trong kho cách ly.

`quarantine` còn lại trong `files[]` sau khi merge không ảnh hưởng gì: `v1` không xuất trường này. Từ lúc merge tới lúc workflow chạy xong (vài phút), link trong `v1` chưa tải được; app thử lại link sau.

Lỗi ở bước nào thì workflow dừng; chạy lại an toàn vì mỗi bước kiểm xem đã làm chưa.

## Bảo vệ nhánh `main`

Repo public: ruleset bắt buộc PR và một lượt duyệt, không ai được bỏ qua, kể cả bot. Repo private trên gói Free không bật được ruleset, nên trong giai đoạn chạy thử chỉ dựa vào việc khóa GitHub App nằm trong Worker secrets.

## Gỡ tài liệu

Giữ quy trình hiện tại. Thêm: khi một mục chuyển sang `removed: true`, workflow xóa file tương ứng trên Release.

## Lỗi

| Tình huống | Xử lý |
|---|---|
| R2 lưu xong nhưng GitHub API lỗi | Worker xóa file vừa lưu, trả "Chưa gửi được. Thử lại sau ít phút." |
| GitHub API trả quá giới hạn | như trên |
| File vượt kích thước | Worker từ chối trước khi đọc hết file, theo `Content-Length` |
| Bài bị bỏ quên | luật vòng đời R2 xóa sau 30 ngày; PR vẫn còn, `kiem-file` báo file không còn |

## Quyền riêng tư

- Không bắt nhập email. Tên hiển thị không bắt buộc; bỏ trống thì `authors` vắng mặt.
- IP chỉ dùng để giới hạn số lần gửi, không ghi log, không lưu.
- PR công khai khi repo public: chỉ chứa những gì sẽ đăng, không chứa gì khác.
- Bổ sung phần thư viện vào chính sách quyền riêng tư của thư viện.

## Test

- Worker: `vitest` với `@cloudflare/vitest-pool-workers` (R2 chạy trên máy), GitHub API giả lập bằng `fetchMock`. Turnstile dùng bộ khóa test của Cloudflare (luôn qua, luôn chặn). Mỗi luật kiểm ở mục "Luồng gửi bài" có test qua và test chặn.
- Module trong `scripts/upload/`: `node --test`, cùng bộ test hiện có. Gồm đặt tên file, chọn Release theo ngày, ghi link, đọc kết quả ClamAV, gộp comment.
- CI chạy cả hai.

## Chạy thử (repo private)

1. Deploy Worker lên `workers.dev`.
2. Gửi 4 bài: một PDF hợp lệ; file EICAR (file test chuẩn của phần mềm diệt virus, vô hại); một PDF có tên trong Author; một file có MSSV giả.
3. Kiểm: mỗi bài một PR, comment kết quả đúng, PDF có Author đã được làm sạch.
4. Đóng một PR: file trong kho bị xóa. Merge một PR: file lên `files-HK251`, link có trong `v1`.

Khi repo còn private, file trên Release chỉ thành viên đăng nhập mới tải được; web và app tải được sau khi repo public.

## Việc chủ repo tự làm

Không ai khác được tạo tài khoản hay nhập khóa bí mật thay chủ repo.

1. Tạo GitHub App với đúng các quyền ở mục "Thành phần", cài vào repo, tạo private key.
2. Bật R2 trên Cloudflare, tạo bucket `bk-lib-quarantine`.
3. Tạo widget Turnstile cho tên miền của web và Worker.
4. Chạy `npx wrangler login`, rồi nhập khóa bằng `npx wrangler secret put`.
5. Thêm các khóa cho workflow trong **Settings** > **Secrets and variables** > **Actions**.

## Ngoài phạm vi

- Gắn tên miền riêng cho Worker và web.
- Bản dự phòng trên Zenodo.
- Bỏ bản tiếng Anh của web.
