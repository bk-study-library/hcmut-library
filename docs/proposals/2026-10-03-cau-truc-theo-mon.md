# Đề xuất: cấu trúc thư viện lấy môn làm gốc (03/10/2026)

Từ phiên BK Study Desk, gửi phiên Bk-lib để thống nhất. Đọc kèm `docs/HANDOFF.md` và `D:\LocalCode\bk-study-desk\library-research\catalog-2026-10-03\` (`report.md`, `courses.json` 736 môn, `programs.json`, `faculties.json`, `lessons-learned.md`, `html/conflicts.json`).

## 1. Môn là gốc, CTĐT chỉ là một cách xem
- Tài liệu nằm ở `courses/<ID>/`. ID = `hcmut:<mã lần đầu thấy>`; mã bị dùng lại cho môn khác thì thêm hậu tố khóa, ví dụ `hcmut:GE4169@2024` (gặp 3 trường hợp thật: GE4169, GE3239, GE4165).
- Đổi mã: tạo ID mới, nối bằng cạnh `{from, to, relation: tuong-duong|thay-the|gop|tach, cohorts, source}`. Đổi tên: alias kèm năm. Môn bị bỏ: giữ lại, `status: retired`, có `replacedBy`. Khoa là thuộc tính.
- `programs/<program-id>.json` (`hcmut:<khoa>:<slug ngành>:<khóa>`) chỉ liệt kê ID môn theo khối hoặc học kỳ. Trang web có "duyệt theo ngành" từ đây, nhưng không có file nào nằm dưới ngành.
- Lý do: một môn có trong nhiều ngành, nhiều khóa; môn đổi tên và bị bỏ. Lấy môn làm gốc thì tài liệu không bị xáo trộn.

## 2. Tài liệu là mục có loại và nhãn, không lồng thư mục sâu
Mỗi mục một file metadata trong `courses/<ID>/items/`; file lớn để trên GitHub Releases, không để trong git.

| Loại (`type`) | Điều kiện |
|---|---|
| `summary`, `notes` | Tự soạn |
| `cheatsheet` (tờ A4) | Tự soạn |
| `exercise-solution`, `exam-solution` | Tự giải |
| `exam-past` | Chỉ đề đã công khai hoặc có xin phép |
| `quiz-pack` | Câu hỏi sinh viên tự soạn, định dạng Study Pack v1 |
| `prelab-template` | Tự do |
| `prelab-reference`, `lab-report-reference` | Chỉ sau hạn nộp hoặc sau khi chấm, gắn nhãn "tham khảo" |
| `project-reference` (BTL) | Sau khi chấm, có đồng ý của tác giả |
| `link` | Giáo trình mở, OCW, video, chỉ mục của đối tác |
| `tips` (mẹo học) | Tự do |

Nhãn để lọc: `teacher` (không bắt buộc, tên chính thức như trên TKB; đề và bài thí nghiệm khác nhau theo người dạy; giai đoạn đầu không có chấm điểm hay nhận xét giảng viên), `term` (HK251), `examKind` (GK/CK/quiz/KT), số bài thí nghiệm hoặc chương, `lang`, `origin` (self-made, link, `partner:<tên>`), `license`, `authors` (không bắt buộc, cho phép ẩn danh).

Không bao giờ nhận: slide hoặc giáo trình của giảng viên khi chưa xin phép; đáp án quiz hoặc bài tập LMS đang mở hay đang tính điểm (liêm chính học thuật); bất cứ thứ gì còn MSSV hoặc tên người.

## 3. Trang web
- Trang môn: tài liệu theo loại, lọc theo giảng viên, học kỳ, loại kiểm tra.
- Trang ngành: danh sách môn theo học kỳ hoặc khối, dẫn về trang môn.
- Tìm kiếm toàn trang theo mã, mã cũ, tên (không cần dấu).

## 4. Đóng góp và duyệt
- Qua mẫu Issue (đính kèm file) hoặc PR. CI kiểm schema, loại file, tối đa 20 MB, trùng sha256, quét thông tin cá nhân.
- CODEOWNERS hiện là @xeroz369, sau mời người duyệt theo khoa (tắt quyền tự tạo repo của thành viên trong tổ chức trước).
- Gỡ trong 1 ngày làm việc.
- 8/11 khoa chưa có CTĐT công khai truy cập được: lúc ra mắt kêu gọi cộng đồng gửi CTĐT khóa mình.

## 5. Hợp đồng với app BK Study Desk
App chỉ đọc `index.json` (sau thêm tab Thư viện cho từng môn). Giữ ổn định các trường: ID môn, tên, alias, trạng thái; mục với `type`, nhãn, `files[].url` và `sha256`. Nếu đổi schema, ghi `schemaVersion` và báo trong `docs/`.

## Cần phiên Bk-lib trả lời
- Schema và trạng thái trang hiện tại, chỗ nào khác đề xuất này.
- Có muốn app đọc theo schema hiện tại không.
