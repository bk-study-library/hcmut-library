# BK Study Library

[![Tiếng Việt](https://img.shields.io/badge/lang-Ti%E1%BA%BFng%20Vi%E1%BB%87t-red.svg)](README.md) [![English](https://img.shields.io/badge/lang-English-blue.svg)](docs/en/README.md)

Thư viện tài liệu học tập do sinh viên Bách Khoa TP.HCM (HCMUT) tự soạn và chia sẻ, xếp theo mã môn. Đọc ngay trên web, không cần cài gì: **https://bk-study-library.github.io/bk-study-library/**

Đây là dự án của sinh viên, không phải trang chính thức của Trường Đại học Bách khoa - ĐHQG-HCM.

> Trạng thái: **bản khung (0.1.0)**. Danh mục môn mới có vài môn để chạy các tài liệu ví dụ; danh mục đầy đủ (mọi khoa, chương trình) đang được thu thập từ nguồn công khai và sẽ nhập sau.

## Mục đích

- Mỗi môn có một trang: thông tin môn, tài liệu sinh viên tự soạn, link tới tài liệu mở, mẹo học.
- Gửi bài dễ: điền form trên GitHub và đính kèm file, không cần biết Git.
- Bài nào cũng có người duyệt trước khi lên thư viện.
- Dữ liệu mở: `index.json` cho app và công cụ khác đọc.

## Được đăng và không được đăng

| Được đăng | Không đăng |
|---|---|
| Tóm tắt, ghi chú, bảng công thức, lời giải **bạn tự soạn** | Slide, giáo trình, đề thi, đáp án của giảng viên hay của trường khi chưa có phép |
| Mẫu prelab: khung báo cáo, câu hỏi chuẩn bị, không có số liệu đã chấm | File chép từ Scribd, Studocu, Course Hero hay trang tương tự |
| Prelab, báo cáo tham khảo **sau khi đã hết hạn nộp và hạn chấm**, ghi rõ là bản tham khảo | Bài còn trong hạn nộp hoặc hạn chấm |
| Gói quiz Study Pack v1 | Bài có MSSV, họ tên, chữ ký, email, số điện thoại, ảnh mặt người |
| Link tới tài liệu công khai, hợp pháp (OpenStax, MIT OpenCourseWare, trang khoa...) | File chạy được, file trên 20 MB |

Lý do: Luật Sở hữu trí tuệ chỉ cho tự sao một bản để học, không cho phân phối lại bài giảng; thư viện vì vậy chỉ nhận nội dung do sinh viên tự làm và link tới nguồn công khai. Quy định đầy đủ: [CONTRIBUTING.md](CONTRIBUTING.md). Gỡ tài liệu: [TAKEDOWN.md](TAKEDOWN.md).

## Đóng góp

### Không cần Git: gửi qua issue

1. Đăng nhập GitHub.
2. Mở form [Đóng góp tài liệu](https://github.com/bk-study-library/bk-study-library/issues/new?template=dong-gop-tai-lieu.yml) (hoặc chọn **Gửi tài liệu** trên trang môn để form điền sẵn mã môn). Chỉ có link thì dùng [Thêm link](https://github.com/bk-study-library/bk-study-library/issues/new?template=them-link.yml).
3. Điền thông tin, đánh dấu các ô cam kết, kéo file vào ô đính kèm. GitHub nhận file đính kèm tới 25 MB cho tài liệu và .zip, 10 MB cho ảnh; thư viện nhận tới 20 MB. File KiCad thì nén thành .zip.
4. Người duyệt trả lời trong issue, rồi đưa bài lên thư viện.

### Có Git: Pull Request

1. Fork, thêm `courses/<ID>/items/<id>.json` (và file .md nhỏ trong `courses/<ID>/files/` nếu có).
2. `npm test` rồi `npm run build`, commit cả file sinh ra.
3. Mở Pull Request, đánh dấu checklist.

### Duyệt bài

Người duyệt là sinh viên đã học qua môn. Hiện tại người duyệt mặc định là [@xeroz369](https://github.com/xeroz369) (file [CODEOWNERS](.github/CODEOWNERS)); khi có thêm người, mỗi khoa hoặc nhóm môn sẽ có người duyệt riêng. Muốn tham gia: mở form [Đăng ký duyệt bài](https://github.com/bk-study-library/bk-study-library/issues/new?template=dang-ky-duyet.yml). Quy trình và danh sách kiểm: [docs/review.md](docs/review.md).

## Cấu trúc

```
catalog/
  faculties.json            khoa/ngành và gợi ý tiền tố mã môn
  courses/<ID>.json         một file mỗi môn; ID cố định, không bao giờ đổi
  programs/<mã CTĐT>.json   chương trình đào tạo: khối kiến thức và ID môn (không có điểm)
  partners.json             đối tác góp chỉ mục link
courses/<ID>/
  README.md                 sinh tự động; chỉ sửa phần "Mẹo học"
  items/<item-id>.json      một mục mỗi tài liệu hoặc link
  files/*.md                file .md nhỏ (dưới 1 MB); file khác nằm trên GitHub Release
schema/                     JSON Schema cho course, faculty, program, item
scripts/                    kiểm tra, dựng index, nhập chương trình, sinh trang web
site-src/                   CSS, JS, trang tĩnh của web
index.json, index.min.json  chỉ mục sinh tự động, không sửa tay
```

- **File lớn không vào git.** PDF, .docx, .pptx, ảnh, .zip được người duyệt tải lên GitHub Release; mục tài liệu ghi `size`, `sha256` và `url`.
- **ID môn cố định.** Môn đổi tên thì giữ ID và thêm mã, tên cũ vào `aliases`; môn ngừng dạy thì đặt `status: retired` và vẫn giữ. Link cũ không hỏng. Chi tiết: [docs/catalog.md](docs/catalog.md).
- **Gói quiz** theo định dạng Study Pack v1 của BK Study Desk: [đặc tả SPEC.md](https://github.com/xeroz369/bk-study-desk/blob/main/studypack/SPEC.md). Kiểm bằng `node studypack/validate.ts <file>` trong repo BK Study Desk.

## Lệnh

Cần Node 22 trở lên. Không có gói npm nào phải cài.

| Lệnh | Làm gì |
|---|---|
| `npm test` | chạy test với dữ liệu mẫu trong `test/fixtures/` |
| `npm run validate` | kiểm schema, tham chiếu, loại file, dung lượng, file trùng, thông tin cá nhân; báo lỗi nếu file sinh ra đã cũ |
| `npm run build` | kiểm rồi ghi lại `index.json`, `index.min.json`, README từng môn |
| `npm run site` | sinh trang web vào `site/` |
| `npm run demo` | sinh trang web xem thử với 83 môn của một chương trình mẫu (không đụng `catalog/`) |
| `node scripts/import-seed.mjs --seed <file>` | nhập một chương trình đào tạo vào danh mục |

## Trang web

GitHub Pages dựng trang từ `catalog/` và `courses/` mỗi khi `main` thay đổi (workflow `pages.yml`). Trang tĩnh, không đặt cookie, không có công cụ phân tích, không CDN, dùng font của máy (riêng trang Gửi tài liệu có widget Turnstile của Cloudflare). Có trang chủ với ô tìm kiếm (gõ không dấu được, tìm cả mã cũ), trang khoa, trang chương trình, trang môn, trang Đóng góp, Duyệt bài, Gỡ tài liệu. Bản tiếng Anh ở `/en/`.

## App BK Study Desk dùng thư viện thế nào

[BK Study Desk](https://github.com/xeroz369/bk-study-desk) là một nơi đọc thư viện, không phải nơi duy nhất. Thiết kế dự kiến:

- Tải `index.json` tối đa mỗi ngày một lần, gửi `If-None-Match` để không tải lại khi không đổi.
- Lọc theo mã các môn bạn đang học (khớp cả `id`, `code` và `aliases`), hiện trong trang Môn học.
- Chỉ tải file khi bạn chọn, kiểm `sha256` trước khi lưu.
- Nút **Đóng góp** mở trình duyệt tới form issue; app không tải file lên.

## Chỉ đọc với hệ thống của trường

Thư viện và các script không đăng nhập, không đọc, không ghi vào BK-LMS, MyBK hay hệ thống nào của trường. Danh mục môn do người nhập từ nguồn công khai và được duyệt qua Pull Request.

## Đối tác

Các nhóm đã có chỉ mục link (ví dụ HCMUT Courseware) có thể góp chỉ mục vào đây, được ghi công trên từng mục. Xem [docs/partners.md](docs/partners.md).

## Giấy phép

- **Nội dung** (tài liệu, mục tài liệu, danh mục, README môn): [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt), trừ khi mục ghi khác. Dùng lại thì ghi tác giả và chia sẻ theo cùng giấy phép.
- **Link** tới tài liệu ngoài giữ giấy phép của nguồn, ghi ở trường `license` (ví dụ OpenStax, MIT OpenCourseWare là CC BY-NC-SA 4.0). Thư viện chỉ lưu link, không lưu bản sao.
- **Mã nguồn** (`scripts/`, `site-src/`, `test/`, `schema/`): [MIT](LICENSES/MIT.txt).

Xem [LICENSE.md](LICENSE.md).
