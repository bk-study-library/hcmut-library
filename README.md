# BK Study Library

Thư viện tài liệu học tập do sinh viên Bách Khoa TP.HCM (HCMUT) chia sẻ, xếp theo mã môn. Đọc trên web, không cần cài gì: **https://bk-study-library.github.io/hcmut-library/**

Đây là dự án của sinh viên, không phải trang chính thức của Trường Đại học Bách khoa - ĐHQG-HCM.

## Trạng thái

Bản khung (0.1.0). Danh mục có 737 môn và 195 chương trình đào tạo, nhập từ nguồn công khai (truy cập 03/10/2026). Mới có danh sách môn của Khoa Cơ khí, Khoa Điện - Điện tử, Khoa Kỹ thuật Địa chất và Dầu khí; 100 chương trình còn lại chưa có danh sách môn. Các tài liệu hiện có là dữ liệu mẫu (có đánh dấu "mẫu") để thử giao diện và quy trình.

## Quy định

| Nhận | Không nhận |
|---|---|
| Mọi tài liệu học tập bạn muốn chia sẻ: tóm tắt, ghi chú, lời giải, slide, đề thi, đáp án, báo cáo, gói quiz Study Pack v1 | File sách có bản quyền (sách thương mại, sách của nhà xuất bản). Muốn giới thiệu sách thì ghi tên, loại "Sách tham khảo" |
| Link tới tài liệu công khai khác | File chạy được |
| Đuôi file: .pdf, .md, .docx, .pptx, .xlsx, .zip, .png, .jpg, .json | File lớn hơn 20 MB |

Máy chỉ cảnh báo khi thấy MSSV, email, số điện thoại trong file, người duyệt quyết định. Riêng các ô chữ của form và file `.md` trong git thì bị từ chối nếu có thông tin cá nhân, vì phần này hiện công khai. Quy định đầy đủ: [CONTRIBUTING.md](CONTRIBUTING.md).

## Đóng góp

Có ba cách. Chi tiết từng bước nằm trong [CONTRIBUTING.md](CONTRIBUTING.md).

1. **Gửi file qua trang web, không cần tài khoản GitHub.** Mở [Gửi tài liệu](https://bk-study-library.github.io/hcmut-library/gui-tai-lieu/), điền form, chọn file. Worker kiểm form và cất file vào kho riêng. Một bot mở Pull Request, rồi bài đi qua phần Duyệt bài bên dưới.
2. **Thêm link qua form issue.** Dùng form [Thêm link](https://github.com/bk-study-library/hcmut-library/issues/new?template=them-link.yml). Người duyệt đọc và tự mở Pull Request.
3. **Pull Request, nếu bạn dùng Git.** Thêm `courses/<ID>/items/<id>.json` và file `.md` nhỏ (dưới 1 MB) nếu có. File khác gửi qua cách 1.

Không gửi file qua issue: file đính kèm trên repo công khai thành công khai ngay, trước khi có người duyệt.

## Duyệt bài

Người duyệt là sinh viên đã học qua môn, làm tình nguyện; danh sách ở [.github/CODEOWNERS](.github/CODEOWNERS). Với bài gửi qua trang web:

1. Workflow `kiem-file` quét virus, xóa siêu dữ liệu PDF, cảnh báo thông tin cá nhân, rồi ghi link Release vào Pull Request.
2. Người duyệt đọc theo danh sách kiểm và merge.
3. Workflow `phat-hanh-file` đưa file lên GitHub pre-release `files-HKxxx`.
4. Pull Request bị đóng thì `don-kho` dọn file chờ duyệt.

Danh sách kiểm và luồng đầy đủ: [CONTRIBUTING.md](CONTRIBUTING.md). Muốn làm người duyệt: form [Đăng ký duyệt bài](https://github.com/bk-study-library/hcmut-library/issues/new?template=dang-ky-duyet.yml).

## Gỡ tài liệu

Tác giả, chủ bản quyền, người có thông tin cá nhân trong tài liệu hoặc người đã gửi đều có thể yêu cầu gỡ bằng form [Yêu cầu gỡ](https://github.com/bk-study-library/hcmut-library/issues/new?template=yeu-cau-go.yml). Mục tiêu xử lý: 1 ngày làm việc. Mục đã gỡ vẫn giữ `id` và lý do. Xem [TAKEDOWN.md](TAKEDOWN.md).

## Dữ liệu cho app và công cụ khác

Thư viện xuất dữ liệu công khai ở `v1/` (cũng phục vụ tại `<web>/v1/`): `v1/index.json` là danh sách môn, `v1/courses/<ID>.json` là tài liệu của từng môn. Hợp đồng giữ ổn định: đổi tên hay xóa trường thì ra `/v2/`, `/v1/` còn ít nhất 6 tháng. Mô tả đầy đủ: [docs/v1.md](docs/v1.md). `index.json` và `index.min.json` ở gốc repo là chỉ mục đầy đủ (có cả khoa và chương trình).

[BK Study Desk](https://github.com/xeroz369/bk-study-desk) là một app đọc dữ liệu này, không phải nơi duy nhất.

## Cấu trúc

```
catalog/
  faculties.json            khoa và gợi ý tiền tố mã môn
  policy.json               quy định chung: loại nhận, dung lượng, đuôi file, học kỳ
  site.json                 địa chỉ Worker nhận bài và khóa công khai Turnstile
  courses/<ID>.json         một file mỗi môn; ID cố định, không bao giờ đổi
  programs/<mã CTĐT>.json   chương trình đào tạo; khối có thể rỗng khi chưa có danh sách môn
courses/<ID>/
  README.md                 sinh tự động; chỉ sửa phần "Mẹo học"
  items/<item-id>.json      một mục mỗi tài liệu hoặc link
  files/*.md                file .md nhỏ (dưới 1 MB); file khác nằm trên GitHub Release
schema/                     JSON Schema cho course, faculty, program, item
scripts/                    kiểm tra, dựng chỉ mục, sinh trang web
scripts/upload/             mã cho các workflow kiem-file, phat-hanh-file, don-kho
worker/                     Cloudflare Worker nhận bài từ trang Gửi tài liệu
site-src/                   CSS, JS, trang tĩnh của web
v1/                         dữ liệu công khai cho app, sinh tự động
index.json, index.min.json  chỉ mục sinh tự động, không sửa tay
```

- **File lớn không vào git.** PDF, .docx, .pptx, ảnh, .zip nằm trên GitHub Release `files-HKxxx`. Mục tài liệu ghi `size`, `sha256` và `url`.
- **ID môn cố định.** Môn đổi tên thì giữ ID và thêm mã, tên cũ vào `aliases`. Môn ngừng dạy thì đặt `status: retired` và vẫn giữ.
- **Gói quiz** theo định dạng Study Pack v1 của BK Study Desk: [đặc tả SPEC.md](https://github.com/xeroz369/bk-study-desk/blob/main/studypack/SPEC.md).

## Lệnh

Cần Node 22 trở lên. Phần chính của repo không có gói npm nào phải cài.

| Lệnh | Làm gì |
|---|---|
| `npm test` | chạy test với dữ liệu mẫu trong `test/fixtures/` |
| `npm run validate` | kiểm schema, tham chiếu, loại file, dung lượng, file trùng, thông tin cá nhân; báo lỗi nếu file sinh ra đã cũ |
| `npm run build` | kiểm rồi ghi lại `index.json`, `index.min.json`, `v1/` và README từng môn |
| `npm run site` | sinh trang web vào `site/` |
| `npm run demo` | sinh trang web xem thử với dữ liệu mẫu lớn hơn (không đụng `catalog/`) |
| `node scripts/import-seed.mjs --seed <file>` | nhập một chương trình đào tạo vào danh mục |
| `node scripts/import-research.mjs --research <thư mục>` | nhập môn và chương trình từ bản thu thập nguồn công khai (`courses.json`, `programs.json`); môn đã có thì giữ, chỉ cập nhật chương trình |
| `cd worker && npm ci && npm test` | cài và chạy test của Worker (cần Node 24 theo CI) |

## Trang web

GitHub Pages dựng trang từ `catalog/` và `courses/` mỗi khi `main` thay đổi (workflow `pages.yml`). Trang tĩnh, không đặt cookie, không có công cụ phân tích, không CDN, dùng font của máy. Chỉ trang Gửi tài liệu có widget Turnstile của Cloudflare để chống gửi tự động. Web có trang chủ với ô tìm kiếm (gõ không dấu được, tìm cả mã cũ), trang khoa, trang chương trình, trang môn, và các trang Đóng góp, Duyệt bài, Gỡ tài liệu. Bản tiếng Anh ở `/en/` chỉ có ba trang hướng dẫn ngắn.

## Cài đặt luồng gửi tài liệu

Dành cho chủ repo: tạo GitHub App, kho R2, Turnstile, Worker, khóa cho Actions. Xem [docs/cai-dat-luong-tai-len.md](docs/cai-dat-luong-tai-len.md).

## Quyền riêng tư

Thư viện thu thập gì khi bạn gửi bài, giữ ở đâu, bao lâu: [PRIVACY.md](PRIVACY.md).

## Bảo mật và ứng xử

- Tìm thấy lỗ hổng: báo riêng theo [SECURITY.md](SECURITY.md), đừng mở issue công khai.
- Quy tắc ứng xử khi gửi bài, duyệt bài, bình luận: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Chỉ đọc với hệ thống của trường

Thư viện và các script không đăng nhập, không đọc, không ghi vào BK-LMS, MyBK hay hệ thống nào của trường. Danh mục môn do người nhập từ nguồn công khai và được duyệt qua Pull Request.

## Giấy phép

- **Nội dung** (tài liệu, mục tài liệu, danh mục, README môn, `v1/`): [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt), trừ khi mục ghi khác. Dùng lại thì ghi tác giả và chia sẻ theo cùng giấy phép.
- **Link** tới tài liệu ngoài giữ giấy phép của nguồn, ghi ở trường `license` (ví dụ OpenStax, MIT OpenCourseWare là CC BY-NC-SA 4.0). Thư viện chỉ lưu link, không lưu bản sao.
- **Mã nguồn** (`scripts/`, `site-src/`, `test/`, `schema/`, `worker/`): [MIT](LICENSES/MIT.txt).

Xem [LICENSE.md](LICENSE.md).
