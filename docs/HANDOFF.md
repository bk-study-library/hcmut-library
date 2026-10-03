# Bàn giao (03/10/2026)

Khung repo dựng bởi phiên BK Study Desk, dừng giữa chừng để chuyển sang phiên nghiên cứu thư viện riêng.

## Đã có
- `schema/`: JSON Schema cho course, faculty, program, item.
- `catalog/`, `courses/`: dữ liệu demo 3 môn (chưa phải danh mục thật).
- `scripts/validate.mjs` (kiểm schema, tham chiếu, cỡ file, trùng sha256, thông tin cá nhân; sinh `index.json`), `scripts/build-site.mjs` (sinh trang tĩnh vào `site/`), `scripts/import-seed.mjs`, `test/`.
- `site/`: trang tĩnh GitHub Pages (trang chủ, khoa, ngành, môn, đóng góp, duyệt, gỡ, 404, bản tiếng Anh).

## Còn dở
- Workflow CI (`.github/workflows/validate.yml`, Pages deploy), issue forms, PR template, CODEOWNERS: kiểm lại có đủ chưa.
- Danh mục thật: một agent đang thu thập khoa, ngành, môn của HCMUT từ nguồn công khai, kết quả ở
  `C:\Users\PC\AppData\Local\Temp\claude\D--Study\627f507a-9f77-48e2-b99e-4c606ac67736\scratchpad\catalog\`
  (`faculties.json`, `programs.json`, `courses.json`, `lessons-learned.md`, `report.md`).
- Seed CTĐT Kỹ thuật Điện K2019 (83 môn, không có điểm): `...\scratchpad\catalog-seed.json`.

## Nguyên tắc đã chốt
- Web là chính (GitHub Pages), app BK Study Desk chỉ đọc `index.json`.
- Chỉ nhận nội dung sinh viên tự soạn (CC BY-SA 4.0) và link tới tài liệu công khai; không slide/đề của giảng viên khi chưa xin phép; không lấy từ Scribd/Studocu.
- ID môn cố định (mã môn lúc tạo), đổi tên thêm alias, bỏ môn thì `retired`, có `replacedBy`.
- File lớn không để trong git (GitHub Releases); duyệt qua PR, CODEOWNERS @xeroz369.
- Ý tưởng và nghiên cứu: xem `docs/ideas/thu-vien-tai-lieu.md` trong repo BK Study Desk private.
