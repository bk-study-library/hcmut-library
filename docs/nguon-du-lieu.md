# Nguồn dữ liệu chính thức

Danh sách nguồn dùng để dựng và kiểm danh mục chương trình, loại chương trình, tên gọi. Khi trường đổi tên, đổi mã hay ra quy chế mới, kiểm lại theo bảng này rồi cập nhật `scripts/lib/labels.mjs`, `docs/ten-chuong-trinh.md` và dữ liệu. Chỉ dùng nguồn của trường hay của Bộ; trang không chính thức chỉ để tìm manh mối.

## Nguồn

| Nguồn | Địa chỉ | Dùng cho | Kiểm lần cuối | Ghi chú |
|---|---|---|---|---|
| Sổ tay HCMUT, bộ chọn chương trình | https://hcmut.edu.vn/study/handbook (tiếng Anh: thêm `?lang=en`) | Tên chính thức và mã viết tắt các loại chương trình (giá trị `program=` trong link), trang CTĐT từng ngành | 2026-10-05 | Trang dựng bằng JavaScript: mở bằng trình duyệt, đọc nhãn của các link có `?program=`. |
| BKSI, Quy chế - Quy định | https://mybk.hcmut.edu.vn/bksi/public/vi/blog/quy-che---quy-dinh | Dẫn tới thư mục văn bản quy chế của trường | 2026-10-05 | Thư mục văn bản: https://drive.google.com/drive/folders/1cL0f1uaKJ7hF3QXuyZZAiOlzytj6fTbE |
| QĐ 2931/QĐ-ĐHBK (10/9/2021) | trong thư mục trên | Quy định chung về học vụ và đào tạo; tách bậc, hình thức đào tạo, chương trình | 2026-10-05 | |
| Quy định học vụ bậc đại học, bản hợp nhất 285/ĐHBK-ĐT (28/7/2022) | trong thư mục trên | Điều 2: hình thức đào tạo (chính quy, chính quy đại trà, VLVH, bằng hai) khác chương trình; bảng ký hiệu (VLVH), ký hiệu lớp, chữ số trong MSSV | 2026-10-05 | |
| QĐ 1259/QĐ-ĐHBK và QĐ 1260/QĐ-ĐHBK (16/3/2026) | trong thư mục trên | Đổi "Chương trình Chất lượng cao" thành "Chương trình Dạy và Học bằng tiếng Anh"; dùng "chương trình tiêu chuẩn" thay "chính quy đại trà" | 2026-10-05 | |
| QĐ 2749/QĐ-ĐHBK (27/5/2026) | trong thư mục trên | Tên "Chương trình Định hướng Nhật Bản" | 2026-10-05 | |
| BKSI, Chuyển sang Vừa làm vừa học | https://mybk.hcmut.edu.vn/bksi/public/vi/blog/chuyen-sang-vua-lam-vua-hoc | Tên "Vừa làm vừa học", đơn vị phụ trách | 2026-10-05 | |
| Tuyển sinh đại học chính quy | https://hcmut.edu.vn/tuyen-sinh/dai-hoc-chinh-quy | Ngành tuyển sinh và mã tuyển sinh (1xx tiêu chuẩn, 2xx dạy bằng tiếng Anh, tiên tiến, định hướng Nhật Bản, 3xx chuyển tiếp quốc tế, 4xx liên kết) | 2026-10-03 | Nội dung tải bằng JavaScript; ngày 2026-10-05 trang hiện trống. |
| Thông tin tuyển sinh 2023 | https://hcmut.edu.vn/tintuc/thong-tin-tuyen-sinh-dai-hoc-chinh-quy-2023 | Mốc dùng tên mới trong tuyển sinh | 2026-10-05 | |
| Thông tư 08/2021/TT-BGDĐT | https://thuvienphapluat.vn/van-ban/Giao-duc/Thong-tu-08-2021-TT-BGDDT-Quy-che-dao-tao-trinh-do-dai-hoc-470013.aspx | Quy chế đào tạo trình độ đại học của Bộ; thuật ngữ "vừa làm vừa học" | 2026-10-05 | |
| Bản thu thập (research) | thư mục `library-research/` ngoài repo: `catalog-2026-10-03`, `ctdt-2026-10-04`, `sau-dai-hoc-2026-10-04` | Đầu vào của `scripts/import-research.mjs`, `import-ctdt.mjs`, `import-sdh.mjs` | 2026-10-04 | `catalog-2026-10-03/programs.json` có `meta.sources`: 102 nguồn kèm URL, tiêu đề, năm, sha256 file đã lưu; `report.md` mô tả cách thu thập. |

## Chưa xác minh được

- Tên tiếng Anh chính thức của VLVH và của Chương trình Thạc sĩ tiêu chuẩn (THCQ); bản tiếng Anh của Sổ tay để trống.
- Tên chính thức của chương trình tiến sĩ có type CQ (trước khóa 2025, chưa chia phương thức).
- Văn bản ghi thẳng "CQ" là viết tắt của "chính quy" trong link Sổ tay.
- Năm tuyển sinh bắt đầu dùng "Dạy và học bằng tiếng Anh" (2023 ghi "giảng dạy bằng tiếng Anh").
- Loại "Liên kết quốc tế" (mã tuyển sinh 4xx, bằng của UTS): không có trên Sổ tay, chưa có mã viết tắt chính thức; ký hiệu lớp QTxx trong quy chế 2022 là mã lớp, không phải mã chương trình.

## Thứ tự nhập và lưu ý khi cập nhật

1. `scripts/import-research.mjs` (bản thu thập chung, ngành tuyển sinh), rồi `scripts/import-ctdt.mjs` (CTĐT đại học), rồi `scripts/import-sdh.mjs` (sau đại học).
2. `import-ctdt` nhận các ngành tuyển sinh có cùng ngành, khóa và loại làm chương trình của ngành đó (thêm `major`, `level`, link Sổ tay). Chạy lại riêng `import-research` sẽ ghi đè các trường này (29 file ngày 2026-10-05), nên sau đó phải chạy lại `import-ctdt`.
3. Mã loại của thư viện (`type`: CQ, CTTA, CSAU, TAUD, ...) nằm trong hợp đồng v1 và trong id của 395 chương trình: không đổi tên. Tên hiển thị và mã viết tắt Sổ tay ở `PROGRAM_TYPES[].abbr`, `.official` và `programTypeInfo()`.
