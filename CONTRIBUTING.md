# Đóng góp và duyệt bài

Trang này nói thư viện nhận gì, bạn gửi bài bằng cách nào, và người duyệt làm gì với bài của bạn.

## Quy định

| Nhận | Không nhận |
|---|---|
| Mọi tài liệu học tập bạn muốn chia sẻ: tóm tắt, ghi chú, bảng công thức, lời giải, slide, đề thi, đáp án, mẫu và bài tham khảo cho prelab, báo cáo, bài tập lớn, gói quiz Study Pack v1 | File sách có bản quyền (sách thương mại, sách của nhà xuất bản) |
| Link tới tài liệu công khai khác | File chạy được (exe, bat, sh, apk, jar...) |
| Đuôi file: .pdf, .md, .docx, .pptx, .xlsx, .png, .jpg, .json; riêng gói quiz nhận thêm .zip | File lớn hơn 20 MB, file .zip cho loại khác gói quiz |

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
2. Tìm môn theo tên (mã có thể đổi qua các khóa). Môn có nhiều mã cùng tên (ví dụ Đồ án tốt nghiệp) hiện thành một dòng; bấm vào để chọn đúng mã theo ngành hoặc khóa. Chọn loại tài liệu, nhập tiêu đề, chọn file. File .zip chỉ nhận cho loại Gói quiz; loại khác thì gửi từng file, hoặc gộp thành một file PDF. Có nhiều file của cùng môn (ví dụ cả bộ slide của giảng viên) thì chọn tất cả một lần, tối đa 10 file và tổng 50 MB: mỗi file có tiêu đề (gợi ý từ tên file) và loại riêng, người duyệt xem cả đợt một lần và có thể duyệt từng file.
3. Chọn giấy phép, đánh dấu ba ô cam kết, qua bước xác minh Turnstile của Cloudflare.
4. Bấm **Gửi tài liệu**. Trang hiện mã bài. Hãy lưu mã này để hỏi về bài của bạn.

Không tìm thấy môn: form gợi ý các môn có mã gần (cùng tiền tố, số lệch vài đơn vị, theo `nearCodeSpan` trong `catalog/site.json`) dưới dòng **Có phải môn này?**. Mã trường thường là số lẻ, mã của CTĐT cũ đôi khi là số chẵn, nên hãy xem các gợi ý trước. Không đúng môn nào thì bấm **Thêm môn mới**, ghi mã và tên môn như trên Sổ tay HCMUT. Tên bạn gõ trùng tên môn đã có thì form cũng gợi ý môn đó. Mỗi bài chỉ thêm được một môn mới; mã đã có trong thư viện thì form chọn môn đó thay vì thêm mới.

Điều gì xảy ra tiếp theo:

1. Worker của thư viện kiểm lại form (môn, loại, đuôi file, dung lượng, nội dung file khớp đuôi, thông tin cá nhân trong các ô chữ), rồi cất file vào kho riêng, không công khai.
2. Một bot mở Pull Request mang nhãn `tai-lieu-moi`, nhánh `upload/<mã bài>`. Người mở PR là bot, không phải bạn. Tiêu đề PR chỉ có mã bài và mã môn; chữ bạn nhập nằm trong file mục tài liệu của PR, **công khai ngay** với ai mở PR, kể cả trước khi duyệt (xem [PRIVACY.md](PRIVACY.md)).
3. Workflow `kiem-file` quét virus, xóa siêu dữ liệu (PDF, ảnh, file Office), cảnh báo thông tin cá nhân, JavaScript trong PDF, macro trong Office, rồi ghi link Release vào PR. Có virus thì PR bị đóng. Máy không kết luận được thì PR có nhãn `can-xem-tay`.
4. Người duyệt đọc và merge.
5. Workflow `phat-hanh-file` đưa file lên GitHub Release `files-HKxxx` (pre-release) và xóa file trong kho riêng. PR bị đóng mà không merge thì `don-kho` xóa file và nhánh.

Bạn nhập tên hiển thị thì tên đó hiện công khai cùng bài; bỏ trống thì bài hiện là Ẩn danh. Chi tiết dữ liệu: [PRIVACY.md](PRIVACY.md).

### 2. Thêm link qua form issue (cần tài khoản GitHub)

Chỉ có link, không có file: mở form [Thêm link](https://github.com/bk-study-library/hcmut-library/issues/new?template=them-link.yml) (hoặc bấm **Thêm link** trên trang môn). Ghi mã môn, link, tiêu đề, giấy phép của nguồn. Không thêm link tới file sách có bản quyền. Issue này chưa có tự động hóa: người duyệt đọc rồi tự mở Pull Request thêm mục `link`.

### 3. Pull Request (nếu bạn dùng Git)

1. Fork repo. Thêm `courses/<ID>/items/<id>.json`. Nếu tài liệu là file `.md` nhỏ (dưới 1 MB), đặt nó ở `courses/<ID>/files/<tên>.md` và ghi `name`, `size`, `sha256`, `path` trong mục. Mẫu: `courses/MT1005/items/bang-cong-thuc-giai-tich-2.json`.
2. Trong git chỉ có `README.md`, `items/*.json` và `files/*.md` của từng môn. File khác (PDF, .docx, ảnh, .zip) gửi qua cách 1.
3. Chạy `npm test` rồi `npm run build`. Commit cả file sinh ra (`index.json`, `index.min.json`, `worker-catalog.json`, `v1/`, README môn).
4. Mở Pull Request và đánh dấu danh sách kiểm trong mẫu PR.

## Sửa danh mục môn

Mở form [Sửa danh mục môn](https://github.com/bk-study-library/hcmut-library/issues/new?template=sua-danh-muc.yml) hoặc gửi PR sửa `catalog/courses/<ID>.json`.

- ID của môn không bao giờ đổi.
- Môn đổi tên hoặc đổi mã thì giữ ID, thêm mã và tên cũ vào `aliases`.
- Môn ngừng dạy thì đặt `status: retired` (thêm `replacedBy` nếu có môn thay thế) và vẫn giữ trong danh mục, để link cũ không hỏng.
- Trường dùng lại một mã cho môn khác thì môn sau có ID kèm năm khóa, ví dụ `GE4169-2024`, `GE3239-2024`, `GE4165-2024`. Chương trình từ khóa đó trở đi trỏ tới ID kèm năm; môn cũ giữ ID cũ và ghi chú trỏ sang môn mới.
- Môn và điều kiện tốt nghiệp chung cho mọi ngành (Toán MT, Vật lý PH, ngoại ngữ LA, lý luận chính trị SP, giáo dục thể chất và quốc phòng PE, MI, kỹ năng SK, hoạt động sinh viên SA, điều kiện ngoại ngữ ENG_GC, FRA_GC, JPN_GC, chứng chỉ GDTC) thuộc khóa `chung` (Môn chung toàn trường) trong `catalog/faculties.json`, không gán cho khoa nào. Quy tắc tiền tố chưa có văn bản xác nhận thì giữ `verified: false`.
- Danh mục chỉ lấy từ nguồn công khai. Không ghi điểm, GPA hay số liệu cá nhân.

## Thêm chương trình đào tạo

Khoa của bạn chưa có chương trình, hoặc chương trình chưa có danh sách môn: mở form [Thêm chương trình đào tạo](https://github.com/bk-study-library/hcmut-library/issues/new?template=them-chuong-trinh.yml), hoặc bấm **Thêm chương trình đào tạo** trên trang khoa, trang chương trình hay mục Chương trình đào tạo ở trang chủ để form chọn sẵn khoa.

- Ghi khoa, tên ngành như trong CTĐT, khóa (năm vào trường).
- Gửi link CTĐT chính thức của trường hoặc của khoa. Không có link thì đính kèm file PDF CTĐT; CTĐT là văn bản công khai nên gửi qua issue được.
- Không đính kèm bảng điểm hay ảnh chụp MyBK có MSSV, điểm.
- Người duyệt nhập mã môn, tên, tín chỉ, khối kiến thức vào `catalog/programs/<mã>.json` và mục `programs` của từng môn, rồi mở Pull Request. Thư viện không lưu file CTĐT, chỉ lưu link nguồn.
- Link PDF chính thức của đúng ngành và đúng khóa ghi vào `ctdtUrl` (CTĐT) và `planUrl` (kế hoạch giảng dạy). Chỉ nhận link https tới host trong `programPdfHosts` của `catalog/site.json` (hiện là Google Drive và tên miền hcmut.edu.vn). Chưa kiểm được link đúng ngành, đúng khóa thì để trống; trang chương trình sẽ trỏ về bảng CTĐT của trường (`officialProgramsPage`).
- Không nhập chương trình chép từ MyBK hay tài khoản cá nhân: đó là dữ liệu học tập riêng (môn đã chọn, mã khối nội bộ). Chỉ dùng CTĐT trường công bố. Chương trình cần ẩn khỏi danh sách thì đặt `listed: false`; các script nhập giữ nguyên `listed`, `ctdtUrl`, `planUrl` khi nhập lại.
- Chương trình gắn với một ngành trong `catalog/majors.json` qua `major`, ghi loại (`type`), khóa (`year`). Học kỳ đề xuất ghi ở khối, trong `semesters` (`{ "MT1003": 1 }`), không đổi mảng `courses`. Vai trò khối ghi ở `kind`. Ghi chú của người duyệt cho chương trình nhập từ CTĐT chính thức để ở `reviewNote`: `scripts/import-ctdt.mjs` ghi lại `note` mỗi lần nhập nhưng giữ `reviewNote`.
- Khi trường công bố CTĐT mới, người duyệt chạy lại `node scripts/import-ctdt.mjs --data <thư mục dữ liệu>` rồi `npm run build`, xem các dòng "Tên theo PDF, chờ duyệt", "Giữ tên đang có", "khác khoa, cần duyệt" mà script in ra trước khi mở Pull Request.
- CTĐT thạc sĩ, tiến sĩ nhập bằng `--sdh <thư mục dữ liệu sau đại học>`. Nguồn ghi hai mã cho cùng một ngành thì ghi mã phụ vào `aliases` của ngành có mã chính trong `catalog/majors.json` trước khi nhập. Xem các dòng "Gộp mã ngành", "Trùng mã", "nguồn ghi khoa" mà script in ra.

## Duyệt bài

Người duyệt là sinh viên đã học qua môn, làm tình nguyện. Danh sách người duyệt nằm trong [.github/CODEOWNERS](.github/CODEOWNERS). Hiện tại là người duy trì repo. Muốn tham gia, mở form [Đăng ký duyệt bài](https://github.com/bk-study-library/hcmut-library/issues/new?template=dang-ky-duyet.yml).

### Luồng duyệt

1. Bài tới qua một trong ba cách ở trên.
2. CI `validate` kiểm schema, tham chiếu, loại file, dung lượng, file trùng, thông tin cá nhân trong ô chữ và file `.md`. CI không qua thì sửa trước.
3. Với bài gửi qua trang web, đợi `kiem-file` comment kết quả vào PR. Mở link **Xem file (người duyệt)** trong PR: trang đó hiện mọi ô người gửi nhập (tiêu đề, mô tả, giảng viên, tên hiển thị, thông tin sách) rồi tới nút xem và tải file.
4. Người duyệt đọc theo danh sách kiểm bên dưới. Chữ người gửi đã công khai trong file mục của PR từ lúc gửi: PR có chữ xúc phạm, nói xấu người khác, quảng cáo hay link lạ thì đóng ngay, không cần đợi `kiem-file`. Cần hỏi người gửi thì hỏi trong PR (hoặc issue).
5. Đạt thì merge. Không đạt thì comment lý do rồi đóng PR; file chờ duyệt sẽ được dọn tự động.
6. Mục tiêu: trả lời bài trong 7 ngày. Yêu cầu gỡ được ưu tiên, xem [TAKEDOWN.md](TAKEDOWN.md).

### Danh sách kiểm của người duyệt

- [ ] PR có dòng **Môn mới: <mã>** (bài thêm `catalog/courses/<mã>.json`): mở trang môn trên Sổ tay HCMUT (link trong PR và trang xem bài), kiểm mã, tên, khoa. Sai thì sửa file môn trong PR; trùng môn đã có (ví dụ gõ EE5430 trong khi môn là EE5429) thì đóng PR và nhờ người gửi chọn môn đó. Đã xác nhận thì thay `note` chờ duyệt bằng nguồn đã kiểm trước khi gộp.
- [ ] Không phải file sách có bản quyền. Nếu là sách, đổi sang loại Sách tham khảo và chỉ giữ tên sách.
- [ ] Không có file chạy được. File .zip chỉ có ở gói quiz: mở ra xem. Máy đã báo mục có mật khẩu, đường dẫn lạ, file nén lồng hay loại lạ.
- [ ] PR có nhãn `can-xem-tay`: đọc lý do trong comment của `kiem-file` (ClamAV không quét hết, PDF có JavaScript, Office có macro hay liên kết ngoài, .zip lạ) và mở file trên máy có phần mềm diệt virus trước khi quyết định.
- [ ] Đọc chữ người gửi trên trang xem bài của người duyệt: không xúc phạm, không nêu tên để chê bai ai, không quảng cáo, không link lạ.
- [ ] Đọc cảnh báo thông tin cá nhân của máy trong PR (loại thông tin, số trang) và quyết định: bỏ qua, hoặc yêu cầu người gửi xóa rồi gửi lại. Máy chỉ cảnh báo, không chặn.
- [ ] Báo cáo của `kiem-file`: không có virus, PDF có lớp chữ khi cần, siêu dữ liệu đã được xóa.
- [ ] Giấy phép đúng: tự soạn là CC BY-SA 4.0 (hoặc CC BY 4.0, CC0); link ghi giấy phép của nguồn.
- [ ] Đúng môn, đúng loại, tiêu đề rõ, không quảng cáo, không nhận xét hay chấm điểm giảng viên.
- [ ] Mục tài liệu hợp lệ: `npm run validate` sạch, đã commit file sinh ra.

### Khi nhiều PR mở cùng lúc

Mỗi PR gửi bài sửa các file sinh ra (`index.json`, `index.min.json`, `worker-catalog.json`, `v1/`, README môn), nên sau khi merge một PR, các PR còn lại sẽ xung đột ở những file này. Với từng PR: bấm **Update branch**, giải xung đột ở file sinh ra bằng cách giữ bên nào cũng được, commit để `kiem-file` dựng lại, đợi CI xanh rồi mới merge. Không sửa tay `courses/<ID>/items/<id>.json` khi giải xung đột. Chi tiết: [docs/cai-dat-luong-tai-len.md](docs/cai-dat-luong-tai-len.md).

## Công cụ cho người đóng góp bằng Git

Cần Node 22 trở lên. Không có gói npm nào phải cài cho phần chính của repo.

| Lệnh | Làm gì |
|---|---|
| `npm test` | chạy test với dữ liệu mẫu trong `test/fixtures/` |
| `npm run validate` | kiểm toàn bộ; báo lỗi nếu file sinh ra đã cũ |
| `npm run build` | kiểm rồi ghi lại các file sinh ra |

Danh sách lệnh đầy đủ: [README.md](README.md).
