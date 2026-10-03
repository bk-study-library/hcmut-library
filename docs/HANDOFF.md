# Bàn giao (03/10/2026)

Khung repo dựng bởi phiên BK Study Desk, dừng giữa chừng để chuyển sang phiên nghiên cứu thư viện riêng.

## Đã có
- `schema/`: JSON Schema cho course, faculty, program, item.
- `catalog/`, `courses/`: dữ liệu demo 3 môn (chưa phải danh mục thật).
- `scripts/validate.mjs` (kiểm schema, tham chiếu, cỡ file, trùng sha256, thông tin cá nhân; sinh `index.json`), `scripts/build-site.mjs` (sinh trang tĩnh vào `site/`), `scripts/import-seed.mjs`, `test/`.
- `site/`: trang tĩnh GitHub Pages (trang chủ, khoa, ngành, môn, đóng góp, duyệt, gỡ, 404, bản tiếng Anh).

## Còn dở
- Workflow CI (`.github/workflows/validate.yml`, Pages deploy), issue forms, PR template, CODEOWNERS: kiểm lại có đủ chưa.
- Danh mục thật: đã thu thập xong (03/10/2026), lưu cố định ở `D:\LocalCode\bk-study-desk\library-research\catalog-2026-10-03\`
  (`report.md` đọc trước, `faculties.json`, `programs.json`, `courses.json` 736 môn, `lessons-learned.md` 22 quy tắc, `html/conflicts.json`, bản sao PDF nguồn và script tái tạo).
  Mới phủ 3/11 khoa (Cơ khí, Điện - Điện tử, Địa chất và Dầu khí); 8 khoa còn lại web không truy cập được, xem report mục 1 và 5.
- Seed CTĐT Kỹ thuật Điện K2019 (83 môn, không có điểm): `catalog-seed.json` trong cùng thư mục trên.

## Nguyên tắc đã chốt
- Web là chính (GitHub Pages), app BK Study Desk chỉ đọc `index.json`.
- Chỉ nhận nội dung sinh viên tự soạn (CC BY-SA 4.0) và link tới tài liệu công khai; không slide/đề của giảng viên khi chưa xin phép; không lấy từ Scribd/Studocu.
- ID môn cố định (mã môn lúc tạo), đổi tên thêm alias, bỏ môn thì `retired`, có `replacedBy`.
- File lớn không để trong git (GitHub Releases); duyệt qua PR, CODEOWNERS @xeroz369.
- Ý tưởng và nghiên cứu: xem `docs/ideas/thu-vien-tai-lieu.md` trong repo BK Study Desk private.
