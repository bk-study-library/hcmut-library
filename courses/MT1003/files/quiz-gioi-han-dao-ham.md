---
mon: MT1003 Giải tích 1
tieu-de: Giới hạn và đạo hàm (gói mẫu)
id: bk-study-library-mt1003-gioi-han-dao-ham
truong: HCMUT
phien-ban: 1.0.0
tac-gia: BK Study Library
giay-phep: CC-BY-SA-4.0
da-kiem: tính lại từng câu bằng tay và bằng SymPy
---

# Giới hạn và đạo hàm

## Giới hạn

Giới hạn cơ bản: \( \lim_{x \to 0} \dfrac{\sin x}{x} = 1 \). Thay vô cùng bé tương đương chỉ trong tích và thương.

### Câu 1
Tính \( \lim_{x \to 0} \dfrac{\sin 3x}{x} \).
= 3
> \( \sin 3x \sim 3x \) khi \( x \to 0 \), nên giới hạn bằng \( \dfrac{3x}{x} = 3 \).

### Câu 2
Tính \( \lim_{x \to 0} \dfrac{1 - \cos x}{x^2} \).
= 0,5 ± 0,001
> \( 1 - \cos x \sim \dfrac{x^2}{2} \), nên giới hạn bằng \( \dfrac{1}{2} \).

## Đạo hàm

### Câu 3
Đạo hàm của \( f(x) = x^2 e^x \) là
- [ ] \( 2x e^x \)
- [x] \( (x^2 + 2x) e^x \)
- [ ] \( x^2 e^x \)
- [ ] \( 2x e^x + x^2 \)
> Quy tắc tích: \( (x^2)' e^x + x^2 (e^x)' = 2x e^x + x^2 e^x \).

### Câu 4
Hàm liên tục tại một điểm thì khả vi tại điểm đó.
= Sai
> Phản ví dụ: \( f(x) = |x| \) liên tục tại 0, nhưng đạo hàm trái là \( -1 \), đạo hàm phải là \( 1 \).
