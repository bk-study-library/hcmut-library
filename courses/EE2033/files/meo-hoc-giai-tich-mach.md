# Mẹo học Giải tích mạch

Tài liệu mẫu của BK Study Library, giấy phép CC BY-SA 4.0. Đây là kinh nghiệm chung khi học phân tích mạch, không phải quy định của môn.

1. **Chọn chiều dòng và cực tính trước khi viết phương trình.** Ghi lên hình rồi giữ nguyên tới cuối. Kết quả âm chỉ có nghĩa là chiều thật ngược với chiều đã chọn.
2. **Chọn phương pháp theo số phương trình.** Đếm số nút và số vòng độc lập: ít nút thì dùng thế nút, ít vòng thì dùng dòng mắt lưới.
3. **Kiểm tra cân bằng công suất.** Tổng công suất phát bằng tổng công suất tiêu thụ. Đây là cách tự kiểm đáp án nhanh nhất.
4. **Tương đương Thevenin, Norton:** tính \( V_{th} \) khi hở mạch tải, \( R_{th} \) khi triệt tiêu nguồn độc lập. Mạch có nguồn phụ thuộc thì dùng nguồn thử, không triệt tiêu nguồn phụ thuộc.
5. **Mạch xác lập điều hòa:** đổi sang phức (phasor) ngay từ đầu, \( Z_L = j\omega L \), \( Z_C = \dfrac{1}{j\omega C} \). Chỉ đổi về hàm theo thời gian ở bước cuối.
6. **Quá độ bậc một:** \( x(t) = x(\infty) + [x(0^+) - x(\infty)]e^{-t/\tau} \), với \( \tau = RC \) hoặc \( \tau = L/R \). Điện áp tụ và dòng cuộn cảm không nhảy bậc.
7. **Đơn vị:** viết đơn vị ở mỗi bước. Sai đơn vị là dấu hiệu sai công thức.
8. **Bấm máy tính:** tập chế độ số phức của máy tính trước kỳ thi; thống nhất dạng cực hay dạng đại số để không đổi qua lại nhiều lần.
