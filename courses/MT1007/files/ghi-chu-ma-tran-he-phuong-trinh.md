# Ghi chú: ma trận, định thức, hệ phương trình

Tài liệu mẫu của BK Study Library, giấy phép CC BY-SA 4.0.

## Ma trận

- Nhân ma trận \( A_{m \times n} B_{n \times p} \) cho ma trận \( m \times p \). Nói chung \( AB \ne BA \).
- \( (AB)^T = B^T A^T \); \( (AB)^{-1} = B^{-1} A^{-1} \).
- \( A \) khả nghịch khi và chỉ khi \( \det A \ne 0 \). Khi đó \( A^{-1} = \dfrac{1}{\det A} \operatorname{adj} A \).

## Định thức

- \( \det(AB) = \det A \cdot \det B \); \( \det A^T = \det A \); \( \det(kA) = k^n \det A \) với \( A \) cấp \( n \).
- Đổi chỗ hai hàng: đổi dấu. Nhân một hàng với \( k \): định thức nhân \( k \). Cộng bội của hàng này vào hàng khác: không đổi.
- Ma trận tam giác: định thức bằng tích đường chéo chính. Nên đưa về dạng tam giác bằng biến đổi hàng rồi mới tính.

## Hạng

- Hạng \( r(A) \) là số hàng khác 0 sau khi đưa về dạng bậc thang.
- Biến đổi sơ cấp trên hàng không làm đổi hạng.

## Hệ phương trình tuyến tính \( AX = B \)

Gọi \( \bar A = [A \mid B] \) là ma trận mở rộng, \( n \) là số ẩn (định lý Kronecker - Capelli):

| Điều kiện | Kết luận |
|---|---|
| \( r(A) < r(\bar A) \) | vô nghiệm |
| \( r(A) = r(\bar A) = n \) | nghiệm duy nhất |
| \( r(A) = r(\bar A) < n \) | vô số nghiệm, \( n - r \) ẩn tự do |

Hệ thuần nhất \( AX = 0 \) luôn có nghiệm \( X = 0 \); có nghiệm khác 0 khi và chỉ khi \( r(A) < n \).

## Trị riêng, vectơ riêng

- \( \lambda \) là trị riêng của \( A \) khi \( \det(A - \lambda I) = 0 \). Vectơ riêng là nghiệm khác 0 của \( (A - \lambda I)X = 0 \).
- Tổng các trị riêng bằng vết \( \operatorname{tr} A \); tích các trị riêng bằng \( \det A \).
- \( A \) cấp \( n \) chéo hóa được khi có đủ \( n \) vectơ riêng độc lập tuyến tính; khi đó \( A = P D P^{-1} \).
