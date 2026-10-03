# Tóm tắt: giới hạn và đạo hàm hàm một biến

Tài liệu mẫu của BK Study Library, giấy phép CC BY-SA 4.0. Dùng để ôn nhanh, không thay giáo trình của môn.

## 1. Giới hạn

- Định nghĩa: \( \lim_{x \to a} f(x) = L \) nếu với mọi \( \varepsilon > 0 \) có \( \delta > 0 \) sao cho \( 0 < |x - a| < \delta \) thì \( |f(x) - L| < \varepsilon \).
- Giới hạn tồn tại khi và chỉ khi giới hạn trái bằng giới hạn phải.
- Giới hạn cơ bản:
  - \( \lim_{x \to 0} \dfrac{\sin x}{x} = 1 \)
  - \( \lim_{x \to 0} \dfrac{e^x - 1}{x} = 1 \)
  - \( \lim_{x \to 0} \dfrac{\ln(1 + x)}{x} = 1 \)
  - \( \lim_{x \to \infty} \left(1 + \dfrac{1}{x}\right)^x = e \)

## 2. Vô cùng bé tương đương (khi \( x \to 0 \))

| Hàm | Tương đương |
|---|---|
| \( \sin x \), \( \tan x \), \( \arcsin x \), \( \arctan x \) | \( x \) |
| \( 1 - \cos x \) | \( \dfrac{x^2}{2} \) |
| \( e^x - 1 \), \( \ln(1 + x) \) | \( x \) |
| \( (1 + x)^\alpha - 1 \) | \( \alpha x \) |

Chỉ thay tương đương trong tích và thương, không thay trong tổng hay hiệu.

## 3. Liên tục

- \( f \) liên tục tại \( a \) nếu \( \lim_{x \to a} f(x) = f(a) \).
- Khả vi tại \( a \) thì liên tục tại \( a \). Chiều ngược lại sai: \( f(x) = |x| \) liên tục nhưng không khả vi tại 0.

## 4. Đạo hàm

- \( f'(a) = \lim_{h \to 0} \dfrac{f(a + h) - f(a)}{h} \)
- Quy tắc: \( (uv)' = u'v + uv' \); \( \left(\dfrac{u}{v}\right)' = \dfrac{u'v - uv'}{v^2} \); \( (f(g(x)))' = f'(g(x))\,g'(x) \).
- Bảng đạo hàm: \( (x^n)' = n x^{n-1} \), \( (e^x)' = e^x \), \( (\ln x)' = \dfrac{1}{x} \), \( (\sin x)' = \cos x \), \( (\cos x)' = -\sin x \), \( (\arctan x)' = \dfrac{1}{1 + x^2} \).

## 5. Quy tắc L'Hôpital

Dạng \( \dfrac{0}{0} \) hoặc \( \dfrac{\infty}{\infty} \): \( \lim \dfrac{f}{g} = \lim \dfrac{f'}{g'} \) nếu giới hạn bên phải tồn tại. Dạng \( 0 \cdot \infty \), \( 1^\infty \), \( \infty - \infty \) thì đưa về hai dạng trên trước.

## 6. Khai triển Taylor tại 0 (Maclaurin)

- \( e^x = 1 + x + \dfrac{x^2}{2!} + \dfrac{x^3}{3!} + o(x^3) \)
- \( \sin x = x - \dfrac{x^3}{3!} + o(x^4) \)
- \( \cos x = 1 - \dfrac{x^2}{2!} + \dfrac{x^4}{4!} + o(x^5) \)
- \( \ln(1 + x) = x - \dfrac{x^2}{2} + \dfrac{x^3}{3} + o(x^3) \)
