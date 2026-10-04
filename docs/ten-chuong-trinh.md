# Tên chính thức các loại chương trình

Nguồn: bộ chọn chương trình trên Sổ tay HCMUT, https://hcmut.edu.vn/study/handbook (bản tiếng Anh thêm `?lang=en`), đọc ngày 2026-10-05. Mã Sổ tay là giá trị `program=` trong link.

| Mã thư viện | Mã Sổ tay | Tên tiếng Việt | Tên tiếng Anh |
|---|---|---|---|
| CQ | CQ | Chương trình Đại học tiêu chuẩn | Vietnamese-taught Undergraduate Program |
| CTTA | CTTA | Chương trình Đại học Dạy và học bằng tiếng Anh | English-taught Undergraduate Program |
| CNTN | CNTN | Chương trình Đại học tài năng | Honors Undergraduate Program |
| PFIEV | PFIEV | Chương trình Đại học Kỹ sư chất lượng cao tại Việt Nam | Vietnamese-French High-Quality Engineering Program (PFIEV) |
| SN | SN | Chương trình Đại học Song ngành | Dual-degree Undergraduate Program |
| CTTT | CTTT | Chương trình Đại học Tiên tiến | Advanced Undergraduate Program |
| DHNB | DHNB | Chương trình Đại học Định hướng Nhật Bản | Japanese-oriented Undergraduate Program |
| CTQT | CTQT | Chương trình Chuyển tiếp quốc tế | Trans-national Education program |
| VLVH | không có | Hình thức Vừa làm vừa học (hình thức đào tạo, không có trong bộ chọn) | chưa xác minh được |
| CQ (sau đại học) | THCQ | Chương trình Thạc sĩ tiêu chuẩn | Sổ tay để trống |
| UD | UD | Chương trình Thạc sĩ hướng Ứng dụng | Coursework Master Program |
| NC | NC | Chương trình Thạc sĩ hướng Nghiên cứu | Research-oriented Master Program |
| CSAU | CS | Chương trình Thạc sĩ hướng Nghiên cứu chuyên sâu | Research-intensive Master Program |
| TAUD | CTTAUD | Chương trình Thạc sĩ Dạy và học bằng tiếng Anh hướng Ứng dụng | English-taught Coursework Master Program |
| STEM | THTN_STEM | Chương trình Thạc sĩ tài năng STEM | STEM Honors Master's Program |
| PT1 | PT1_1 | Chương trình Tiến sĩ phương thức 1 (đã có bằng thạc sĩ) | Doctoral Program, Mode 1 (with Master's entry) |
| PT2 | PT2_1 | Chương trình Tiến sĩ phương thức 2 (đã có bằng thạc sĩ) | Doctoral Program, Mode 2 (with Master's entry) |
| TAPT1 | CTTATS1_1 | Chương trình Tiến sĩ Dạy và học bằng tiếng Anh phương thức 1 (đã có bằng thạc sĩ) | English-taught Coursework Doctoral Program, Mode 1 (with Master's entry) |

Việc còn lại: `PROGRAM_TYPES[].vi` trong `scripts/lib/labels.mjs` đang vừa là tên hiện trên web vừa là giá trị `variant` ghi trong 477 file `catalog/programs/*.json`, và script nhập CTĐT dùng nó để khớp chương trình cũ. Muốn hiện đúng tên chính thức thì tách tên hiển thị khỏi `variant` trước, rồi mới đổi tên.
