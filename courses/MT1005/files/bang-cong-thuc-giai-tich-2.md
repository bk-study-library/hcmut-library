# Bảng công thức Giải tích 2

Tài liệu mẫu của BK Study Library, giấy phép CC BY-SA 4.0. In ra một mặt A4 để ôn.

## Đạo hàm riêng và vi phân

- Vi phân toàn phần: \( df = f_x\,dx + f_y\,dy \).
- Gradient: \( \nabla f = (f_x, f_y, f_z) \). Đạo hàm theo hướng vectơ đơn vị \( \vec u \): \( D_{\vec u} f = \nabla f \cdot \vec u \).
- Đạo hàm hàm hợp: \( z = f(x, y) \), \( x = x(t) \), \( y = y(t) \) thì \( \dfrac{dz}{dt} = f_x \dfrac{dx}{dt} + f_y \dfrac{dy}{dt} \).
- Hàm ẩn \( F(x, y) = 0 \): \( y' = -\dfrac{F_x}{F_y} \).

## Cực trị hàm hai biến

Điểm dừng: \( f_x = f_y = 0 \). Đặt \( A = f_{xx} \), \( B = f_{xy} \), \( C = f_{yy} \), \( \Delta = AC - B^2 \):

| Điều kiện | Kết luận |
|---|---|
| \( \Delta > 0 \), \( A > 0 \) | cực tiểu |
| \( \Delta > 0 \), \( A < 0 \) | cực đại |
| \( \Delta < 0 \) | không có cực trị (điểm yên ngựa) |
| \( \Delta = 0 \) | chưa kết luận được |

Cực trị có điều kiện \( g(x, y) = 0 \): hàm Lagrange \( L = f + \lambda g \), giải \( L_x = L_y = 0 \), \( g = 0 \).

## Tích phân kép

- Tọa độ cực: \( x = r\cos\varphi \), \( y = r\sin\varphi \), \( dx\,dy = r\,dr\,d\varphi \).
- Đổi biến tổng quát: \( dx\,dy = |J|\,du\,dv \), với \( J = \dfrac{\partial(x, y)}{\partial(u, v)} \).
- Diện tích miền \( D \): \( S = \iint_D dx\,dy \).

## Tích phân bội ba

- Tọa độ trụ: \( dx\,dy\,dz = r\,dr\,d\varphi\,dz \).
- Tọa độ cầu: \( x = \rho\sin\theta\cos\varphi \), \( y = \rho\sin\theta\sin\varphi \), \( z = \rho\cos\theta \), \( dV = \rho^2 \sin\theta\,d\rho\,d\theta\,d\varphi \).

## Tích phân đường và mặt

- Green: \( \oint_C P\,dx + Q\,dy = \iint_D (Q_x - P_y)\,dx\,dy \), \( C \) là biên của \( D \), đi ngược chiều kim đồng hồ.
- Gauss - Ostrogradsky: \( \iint_S \vec F \cdot \vec n\,dS = \iiint_V \operatorname{div} \vec F\,dV \), \( S \) là mặt kín, pháp tuyến hướng ra ngoài.
- Stokes: \( \oint_C \vec F \cdot d\vec r = \iint_S (\operatorname{rot} \vec F) \cdot \vec n\,dS \).

## Chuỗi

- Chuỗi hình học \( \sum q^n \) hội tụ khi \( |q| < 1 \). Chuỗi \( \sum \dfrac{1}{n^p} \) hội tụ khi \( p > 1 \).
- Tiêu chuẩn d'Alembert: \( \lim \left|\dfrac{a_{n+1}}{a_n}\right| = D \); Cauchy: \( \lim \sqrt[n]{|a_n|} = C \). Nhỏ hơn 1 thì hội tụ, lớn hơn 1 thì phân kỳ.
- Bán kính hội tụ chuỗi lũy thừa \( \sum a_n x^n \): \( R = \lim \left|\dfrac{a_n}{a_{n+1}}\right| \).
