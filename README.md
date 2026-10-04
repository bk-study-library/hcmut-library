# BK Study Library

Thư viện tài liệu học tập do sinh viên Bách Khoa TP.HCM (HCMUT) chia sẻ, xếp theo mã môn. Đọc trên web, không cần cài gì: **https://bk-study-library.github.io/hcmut-library/**

Đây là dự án của sinh viên, không phải trang chính thức của Trường Đại học Bách khoa - ĐHQG-HCM.

## Trạng thái

Bản khung (0.1.0). Danh mục có 2.414 môn, 62 ngành và 547 chương trình đào tạo của đủ 11 khoa, nhập từ CTĐT chính thức của trường (Sổ tay HCMUT, bảng CTĐT từ khóa 2019 và kế hoạch giảng dạy, truy cập 04/10/2026). 498 chương trình gắn ngành có danh sách môn, phần lớn có học kỳ đề xuất; 45 mục tuyển sinh 2026 chưa khớp được ngành nào nên chưa có danh sách môn. Các tài liệu hiện có là dữ liệu mẫu (có đánh dấu "mẫu") để thử giao diện và quy trình.

## Quy định

| Nhận | Không nhận |
|---|---|
| Mọi tài liệu học tập bạn muốn chia sẻ: tóm tắt, ghi chú, lời giải, slide, đề thi, đáp án, báo cáo, gói quiz Study Pack v1 | File sách có bản quyền (sách thương mại, sách của nhà xuất bản). Muốn giới thiệu sách thì ghi tên, loại "Sách tham khảo" |
| Link tới tài liệu công khai khác | File chạy được |
| Đuôi file: .pdf, .md, .docx, .pptx, .xlsx, .png, .jpg, .json; riêng gói quiz nhận thêm .zip | File lớn hơn 20 MB, file .zip cho loại khác gói quiz |

Máy chỉ cảnh báo khi thấy MSSV, email, số điện thoại trong file, người duyệt quyết định. Riêng các ô chữ của form và file `.md` trong git thì bị từ chối nếu có thông tin cá nhân, vì phần này hiện công khai. Quy định đầy đủ: [CONTRIBUTING.md](CONTRIBUTING.md).

## Đóng góp

Có ba cách. Chi tiết từng bước nằm trong [CONTRIBUTING.md](CONTRIBUTING.md).

1. **Gửi file qua trang web, không cần tài khoản GitHub.** Mở [Gửi tài liệu](https://bk-study-library.github.io/hcmut-library/gui-tai-lieu/), điền form, chọn file. Worker kiểm form và cất file vào kho riêng. Một bot mở Pull Request, rồi bài đi qua phần Duyệt bài bên dưới.
2. **Thêm link qua form issue.** Dùng form [Thêm link](https://github.com/bk-study-library/hcmut-library/issues/new?template=them-link.yml). Người duyệt đọc và tự mở Pull Request.
3. **Pull Request, nếu bạn dùng Git.** Thêm `courses/<ID>/items/<id>.json` và file `.md` nhỏ (dưới 1 MB) nếu có. File khác gửi qua cách 1.

Không gửi file qua issue: file đính kèm trên repo công khai thành công khai ngay, trước khi có người duyệt.

## Duyệt bài

Người duyệt là sinh viên đã học qua môn, làm tình nguyện; danh sách ở [.github/CODEOWNERS](.github/CODEOWNERS). Với bài gửi qua trang web:

1. Workflow `kiem-file` quét virus, xóa metadata (PDF, ảnh, file Office), cảnh báo thông tin cá nhân, JavaScript trong PDF, macro trong Office, rồi ghi link Release vào Pull Request. Máy không kết luận được thì gắn label `can-xem-tay`.
2. Người duyệt đọc theo danh sách kiểm và merge.
3. Workflow `phat-hanh-file` đưa file lên GitHub pre-release `files-HKxxx`.
4. Pull Request bị đóng thì `don-kho` dọn file chờ duyệt.

Danh sách kiểm và luồng đầy đủ: [CONTRIBUTING.md](CONTRIBUTING.md). Muốn làm người duyệt: form [Đăng ký duyệt bài](https://github.com/bk-study-library/hcmut-library/issues/new?template=dang-ky-duyet.yml).

## Gỡ tài liệu

Tác giả, chủ bản quyền, người có thông tin cá nhân trong tài liệu hoặc người đã gửi đều có thể yêu cầu gỡ bằng form [Yêu cầu gỡ](https://github.com/bk-study-library/hcmut-library/issues/new?template=yeu-cau-go.yml). Mục tiêu xử lý: 1 ngày làm việc. Mục đã gỡ vẫn giữ `id` và lý do. Xem [TAKEDOWN.md](TAKEDOWN.md).

## Dữ liệu cho app và công cụ khác

Thư viện xuất dữ liệu công khai ở `v1/` (cũng phục vụ tại `<web>/v1/`): `v1/index.json` là danh sách môn, `v1/courses/<ID>.json` là tài liệu của từng môn, `v1/majors.json` là danh sách ngành. Hợp đồng giữ ổn định: đổi tên hay xóa trường thì ra `/v2/`, `/v1/` còn ít nhất 6 tháng. Mô tả đầy đủ: [docs/v1.md](docs/v1.md). `index.json` và `index.min.json` ở gốc repo là chỉ mục đầy đủ (có cả khoa, ngành và chương trình). Môn trong file này không lặp mục `programs`: quan hệ môn và chương trình nằm ở `programs[].blocks[].courses`. File này không thuộc hợp đồng `v1/`.

[BK Study Desk](https://github.com/xeroz369/bk-study-desk) là một app đọc dữ liệu này, không phải nơi duy nhất.

## Cấu trúc

```
catalog/
  faculties.json            khoa và gợi ý tiền tố mã môn
  majors.json               ngành: mã ngành Bộ, tên, khoa, bậc, các loại chương trình, mã phụ, link Sổ tay
  policy.json               quy định chung: loại nhận, dung lượng, đuôi file, học kỳ
  site.json                 địa chỉ Worker nhận bài, khóa công khai Turnstile, host nhận cho link PDF CTĐT, cấu hình ô tìm tài liệu, ảnh xem trước khi chia sẻ link
  courses/<ID>.json         một file mỗi môn; ID cố định, không bao giờ đổi
  programs/<mã CTĐT>.json   chương trình đào tạo (một ngành, một khóa, một loại); khối có thể rỗng khi chưa có danh sách môn
courses/<ID>/
  README.md                 sinh tự động; chỉ sửa phần "Mẹo học"
  items/<item-id>.json      một mục mỗi tài liệu hoặc link
  files/*.md                file .md nhỏ (dưới 1 MB); file khác nằm trên GitHub Release
schema/                     JSON Schema cho course, faculty, major, program, item
scripts/                    kiểm tra, dựng chỉ mục, sinh trang web
scripts/upload/             mã cho các workflow kiem-file, phat-hanh-file, don-kho
worker/                     Cloudflare Worker nhận bài từ trang Gửi tài liệu
site-src/                   CSS, JS, trang tĩnh của web
v1/                         dữ liệu công khai cho app, sinh tự động
index.json, index.min.json  chỉ mục sinh tự động, không sửa tay
worker-catalog.json         danh mục gọn cho Worker nhận bài (môn, id mục, sha256), sinh tự động
```

- **File lớn không vào git.** PDF, .docx, .pptx, ảnh, .zip nằm trên GitHub Release `files-HKxxx`. Item ghi `size`, `sha256` và `url`.
- **ID môn cố định.** Môn đổi tên thì giữ ID và thêm mã, tên cũ vào `aliases`. Môn ngừng dạy thì đặt `status: retired` và vẫn giữ.
- **Gói quiz** theo định dạng Study Pack v1 của BK Study Desk: [đặc tả SPEC.md](https://github.com/xeroz369/bk-study-desk/blob/main/studypack/SPEC.md).

## Lệnh

Cần Node 22 trở lên. Phần chính của repo không có gói npm nào phải cài.

| Lệnh | Làm gì |
|---|---|
| `npm test` | chạy test với dữ liệu mẫu trong `test/fixtures/` |
| `npm run validate` | kiểm schema, tham chiếu, loại file, dung lượng, file trùng, thông tin cá nhân; báo lỗi nếu generated file đã cũ |
| `npm run build` | kiểm rồi ghi lại `index.json`, `index.min.json`, `worker-catalog.json`, `v1/` và README từng môn |
| `npm run site` | sinh trang web vào `site/` |
| `npm run demo` | sinh trang web xem thử với dữ liệu mẫu lớn hơn (không đụng `catalog/`) |
| `node scripts/import-seed.mjs --seed <file>` | nhập một chương trình đào tạo vào danh mục |
| `node scripts/import-research.mjs --research <thư mục>` | nhập môn và chương trình từ bản thu thập nguồn công khai (`courses.json`, `programs.json`); môn đã có thì giữ, chỉ cập nhật chương trình |
| `node scripts/import-ctdt.mjs --data <thư mục> [--sdh <thư mục>] [--date YYYY-MM-DD]` | nhập bộ dữ liệu CTĐT chính thức (`majors.json`, `programs.json`, `courses.json`, `links.json`): ngành, chương trình theo khóa và loại, khối kèm vai trò và học kỳ đề xuất, môn mới; `--sdh` nhập thêm CTĐT thạc sĩ, tiến sĩ (chạy riêng được, không cần `--data`); xem mục Nhập CTĐT chính thức bên dưới |
| `cd worker && npm ci && npm test` | cài và chạy test của Worker (cần Node 24 theo CI) |

## Nhập CTĐT chính thức

`scripts/import-ctdt.mjs` đọc thư mục dữ liệu CTĐT (bản thu thập từ Sổ tay HCMUT, bảng CTĐT từ khóa 2019 và kế hoạch giảng dạy của trường) và ghi vào `catalog/`. Chạy lại bao nhiêu lần cũng cho cùng kết quả: `updated` chỉ đổi khi nội dung đổi.

- **Ngành** vào `catalog/majors.json`: mã ngành Bộ, tên, khoa hiện hành, `level` (bậc, mặc định `dai-hoc`), các loại chương trình, link Sổ tay. Tên, tên tiếng Anh, ghi chú đã có trong file thì giữ (người duyệt sửa tay được).
- **Chương trình** là một ngành, một khóa, một loại (`type`: CQ, CTTA, CNTN, PFIEV, SN, CTTT, DHNB, VLVH, CTQT), có `major`, `level`, `degree`, `totalCredits`, `handbookUrl`, `track` (chuyên ngành, nếu ngành có CTĐT riêng cho từng chuyên ngành). Chương trình đã nhập trước đó giữ mã; chương trình cũ chưa gắn ngành mà cùng khoa, tên ngành, khóa, loại thì nhận dữ liệu mới và giữ mã cũ để link không hỏng. Còn lại có mã mới `<KHOA>_<TÊN NGÀNH>_<KHÓA>[_<LOẠI>]`. Chương trình cũ không khớp giữ nguyên. Giữ khi nhập lại: `listed`, `ctdtUrl`, `planUrl`, `reviewNote` (ghi chú của người duyệt); `note` do script ghi lại.
- **Khối** có `kind` (vai trò chuẩn hóa: toán và khoa học tự nhiên, giáo dục chung, cơ sở ngành, chuyên ngành, tự chọn tự do, tốt nghiệp...), và `semesters` là bảng `{ ID môn: học kỳ đề xuất }` đặt cạnh `courses`, nên `courses` vẫn là mảng ID như cũ. Môn không có trong `semesters` là chưa có học kỳ đề xuất. Nguồn không ghi khối bắt buộc hay tự chọn thì `required: false` kèm `requiredUnknown: true`. Chương trình chỉ có kế hoạch giảng dạy thì mỗi khối là một học kỳ.
- **Môn**: mã mới thì tạo, khoa theo tiền tố. Môn đã có giữ mọi trường do người duyệt ghi (aliases, related, replaces, ghi chú); tên theo Sổ tay thì sửa (khác chỉ ở chữ hoa thì giữ), tên chỉ có trong PDF chỉ thay tên đang có bị vỡ chữ, kèm ghi chú "Chờ người duyệt xác nhận". Tên tiếng Anh của nguồn đáng ngờ (tách ô sai) thì không ghi đè. Tín chỉ và `handbookUrl` chỉ điền khi còn trống. Mã bị dùng lại đã có ID kèm năm (GE4169-2024) thì chương trình từ năm đó trỏ tới ID kèm năm.
- Tiền tố dùng chung cho mọi ngành (MT, PH, SP, LA, PE, MI, SK, SA, ENG_, FRA_, JPN_, và GK của sau đại học) thuộc khóa `sharedFaculty` trong `catalog/site.json` (hiện là `chung`, Môn chung toàn trường), `verified: false`.
- Không nhập gì từ MyBK hay tài khoản cá nhân.

### Sau đại học (thạc sĩ, tiến sĩ)

`--sdh <thư mục>` chạy `scripts/import-sdh.mjs` trên bộ dữ liệu sau đại học (`majors.json`, `programs.json`, `courses.json`; ngày truy cập nguồn lấy từ đuôi `YYYY-MM-DD` của tên thư mục). Cùng một danh mục với đại học, phân biệt bằng bậc:

- **Ngành** có `level` `thac-si` (mã 8xxxxxx) hoặc `tien-si` (mã 9xxxxxx). Nguồn ghi hai mã cho cùng ngành thì người duyệt chọn mã chính trong `catalog/majors.json` và ghi mã phụ vào `aliases`; script gộp chương trình ghi mã phụ vào mã chính, kèm ghi chú. Hiện có 8520202 (mã phụ 85202a1) và 9850101 (mã phụ 9580101), chọn theo Sổ tay HCMUT, chờ Phòng Sau đại học xác nhận.
- **Chương trình** có `level`, `degree`, `orientation` (`ung-dung`, `nghien-cuu`) và loại `type`: `UD` thạc sĩ ứng dụng, `NC` nghiên cứu, `CSAU` nghiên cứu chuyên sâu, `TAUD` ứng dụng dạy bằng tiếng Anh, `STEM` tài năng STEM, `PT1`, `PT2` tiến sĩ phương thức 1, 2, `TAPT1` phương thức 1 dạy bằng tiếng Anh. CTĐT trước khóa 2025 chưa chia hướng ghi `CQ`. Mã mới `<KHOA>_THAC_SI_<TÊN NGÀNH>_<KHÓA>[_<LOẠI>]` (tiến sĩ: `TIEN_SI`). Khoa của chương trình theo khoa của ngành; nguồn ghi khoa khác thì ghi chú để duyệt. Hai bản nguồn cùng ngành, loại, khóa gộp làm một.
- **Khối** tên kèm chữ cái khối của nguồn (A.1, B, C.2), `kind` thêm `chung` (đa ngành tổng quát), `hoc-phan-tien-si`, `tieu-luan-chuyen-de`, `luan-van`, `luan-an`. Khối cha có tín chỉ riêng (khối A gồm A.1, A.2, A.3) ghi ở `groups` của chương trình (`{ name, creditsNeed }`), `name` trùng `group` của khối con. Chưa có học kỳ đề xuất.
- CTĐT khóa 2022 không ghi mã môn: chương trình có `blocks` rỗng và link PDF, web ghi "chưa có danh sách mã môn". Không gắn mã theo tên môn.
- **Môn** có `levels` (bậc có môn trong CTĐT, vắng nghĩa là chỉ đại học). Tiền tố GK (môn chung sau đại học) và ENG_B2 thuộc khoa `chung`. Mã đã có ở đại học: cùng tên thì chỉ thêm bậc; khác môn thì tạo ID kèm năm khóa (`<mã>-<năm>`), không ghi đè. Môn đại học không bao giờ trỏ sang ID kèm năm của sau đại học.

## Trang web

GitHub Pages dựng trang từ `catalog/` và `courses/` mỗi khi `main` thay đổi (workflow `pages.yml`). Trang tĩnh, không đặt cookie, không có công cụ phân tích, không CDN, dùng font của máy. Chỉ trang Gửi tài liệu có widget Turnstile của Cloudflare để chống gửi tự động. Web có trang chủ với ô tìm kiếm (gõ không dấu được, tìm cả mã cũ), trang khoa, trang ngành, trang chương trình, trang môn, và các trang Đóng góp, Duyệt bài, Gỡ tài liệu. Bản tiếng Anh ở `/en/` chỉ có ba trang hướng dẫn ngắn.

Điều hướng đi theo khoa, rồi ngành, rồi khóa, rồi học kỳ. Mục Chương trình đào tạo ở trang chủ gom theo khoa, mỗi ngành một dòng kèm nhãn loại chương trình và các khóa có danh sách môn (mới trước); chương trình chưa có danh sách môn gập lại riêng. Trang ngành (`major/<mã ngành>/`, mã song ngành đổi dấu `+` thành `-`) có bộ chọn loại và khóa, lộ trình theo học kỳ của khóa mới nhất (môn chưa có học kỳ gom theo vai trò khối), nút tới PDF CTĐT, kế hoạch giảng dạy và Sổ tay. Trang chương trình có cùng bộ chọn, phần Lộ trình theo học kỳ rồi Khối kiến thức. Trang khoa liệt kê ngành trước, rồi Môn của khoa và Môn chung khoa dùng. Thứ tự loại chương trình lấy từ `programTypeOrder` trong `catalog/site.json`.

Đại học là mặc định: danh sách ngành, chương trình, môn ở trang chủ và trang khoa chỉ gồm đại học. Sau đại học nằm ở phần riêng bên dưới: trang chủ gập theo bậc (thạc sĩ, tiến sĩ), trang khoa có ngành theo bậc và bảng môn sau đại học gập lại. Trang ngành sau đại học ghi tên kèm bậc ("Thạc sĩ Kỹ thuật cơ khí"), có bộ chọn loại và khóa, và hiện khối kiến thức của chương trình chính vì chưa có học kỳ đề xuất. Trang môn có ở sau đại học có dòng Bậc. Ô tìm ghi bậc cho ngành, chương trình sau đại học (tìm được bằng "thạc sĩ", "tiến sĩ") và nhãn bậc nhỏ cho môn; khi cùng mức khớp, đại học đứng trước.

Ô tìm trang chủ tìm cả môn, chương trình và tài liệu. Tài liệu tìm theo tiêu đề, mô tả, mã và tên môn, loại, học kỳ (`HK241` hay `241`), giữa kỳ, cuối kỳ, tên giảng viên, và lọc được theo loại, học kỳ, kỳ thi, khoa. Câu tìm và bộ lọc nằm trên địa chỉ trang (`?q=`, `?khoa=`, `?loai=`, `?hk=`, `?ky=`) nên chia sẻ link được. Danh sách tài liệu `assets/items.json` sinh lúc dựng web, chỉ web dùng, không thuộc hợp đồng `v1/`.

Ô tìm và form Gửi tài liệu đọc danh sách môn từ `assets/courses.json`: cùng dạng với `v1/index.json` nhưng bỏ trường ô tìm không dùng, nhẹ hơn khoảng một phần tư khi nén. File này chỉ web dùng, không thuộc hợp đồng `v1/`; thiếu file thì web đọc `v1/index.json`. Môn trùng tên (Đồ án tốt nghiệp, Thực tập ngoài trường, các phần luận văn có hàng chục mã) có thêm ngữ cảnh `ctx` (`ctxEn` cho tiếng Anh) tính lúc dựng web (`scripts/lib/course-context.mjs`): ngành có môn đó, hoặc khoa nếu môn chưa thuộc chương trình nào; hai môn cùng tên vẫn trùng ngành thì ghi thêm các khóa. Ngữ cảnh hiện dưới tên ở trang môn (kèm ghi chú số môn cùng tên và link tìm), ở bảng môn của trang khoa, trong form Gửi tài liệu. Ở ô tìm, tên có từ `sameNameGroupMin` môn trong kết quả (`catalog/site.json`, hiện là 3) gộp thành một dòng mở ra được, mỗi mã một dòng con kèm ngành; gõ đúng mã thì môn đó vẫn đứng riêng.

Khoa trong `catalog/faculties.json` có `movedTo` là khóa cũ chỉ giữ cho link (hiện là `flc`, `llct`, `gdtc-qp`, đã gộp vào `chung`): không có trong danh sách khoa, ô lọc, sitemap; trang khoa của khóa đó chuyển ngay tới khoa mới. Kiểm danh mục báo lỗi nếu môn, chương trình, ngành hay tiền tố còn ghi khóa cũ.

Mỗi trang có `canonical`, `hreflang` (khi có cả bản tiếng Việt và tiếng Anh), Open Graph tag và Twitter card với ảnh `site-src/assets/social-preview.png` (`socialImage` trong `catalog/site.json`). Lúc dựng web sinh thêm `sitemap.xml` (không gồm 404, trang chuyển hướng, chương trình `listed: false`) và `robots.txt`. `robots.txt` chỉ có hiệu lực ở gốc tên miền; khi web nằm ở đường dẫn con như hiện nay, khai `sitemap.xml` trực tiếp trong công cụ của máy tìm kiếm.

## Cài đặt luồng gửi tài liệu

Dành cho chủ repo: tạo GitHub App, kho R2, Turnstile, Worker, khóa cho Actions. Xem [docs/cai-dat-luong-tai-len.md](docs/cai-dat-luong-tai-len.md).

## Thảo luận và báo lỗi

- Đề xuất tính năng, hỏi đáp, trao đổi chung: [Thảo luận (Discussions)](https://github.com/bk-study-library/hcmut-library/discussions). Đề xuất được bình chọn để chọn việc làm trước.
- Issue chỉ dùng cho lỗi và việc cần xử lý: báo lỗi, yêu cầu gỡ, sửa danh mục, thêm link, thêm chương trình đào tạo, đăng ký duyệt bài.

## Quyền riêng tư

Thư viện thu thập gì khi bạn gửi bài, giữ ở đâu, bao lâu: [PRIVACY.md](PRIVACY.md).

## Bảo mật và ứng xử

- Tìm thấy lỗ hổng: báo riêng theo [SECURITY.md](SECURITY.md), đừng mở issue công khai.
- Quy tắc ứng xử khi gửi bài, duyệt bài, comment: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Chỉ đọc với hệ thống của trường

Thư viện và các script không đăng nhập, không đọc, không ghi vào BK-LMS, MyBK hay hệ thống nào của trường. Danh mục môn do người nhập từ nguồn công khai và được duyệt qua Pull Request.

## Giấy phép

- **Nội dung** (tài liệu, item, danh mục, README môn, `v1/`): [CC BY-SA 4.0](LICENSES/CC-BY-SA-4.0.txt), trừ khi mục ghi khác. Dùng lại thì ghi tác giả và chia sẻ theo cùng giấy phép.
- **Link** tới tài liệu ngoài giữ giấy phép của nguồn, ghi ở trường `license` (ví dụ OpenStax, MIT OpenCourseWare là CC BY-NC-SA 4.0). Thư viện chỉ lưu link, không lưu bản sao.
- **Mã nguồn** (`scripts/`, `site-src/`, `test/`, `schema/`, `worker/`): [MIT](LICENSES/MIT.txt).

Xem [LICENSE.md](LICENSE.md).
