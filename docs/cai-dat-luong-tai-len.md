# Cài đặt và chạy thử luồng tải lên

Tài liệu này dành cho chủ repo. Chỉ chủ repo được tạo tài khoản và nhập khóa bí mật, nên bạn tự làm các bước dưới đây trên máy và trên giao diện web. Đừng gửi khóa bí mật cho ai, kể cả qua chat hay issue.

Các tên dưới đây khớp với `worker/wrangler.jsonc`, `catalog/site.json` và ba workflow `kiem-file`, `phat-hanh-file`, `don-kho`. Nếu bạn đổi tên repo hay tên bucket, sửa cả `worker/wrangler.jsonc` và biến Actions tương ứng.

Giao diện GitHub và Cloudflare đôi khi đổi nhãn. Nếu một mục không thấy đúng tên, xem tài liệu mới nhất ở https://docs.github.com và https://developers.cloudflare.com.

## Chuẩn bị

- Node 24 và `npm install` đã chạy trong thư mục `worker`.
- `openssl` (có sẵn trong Git Bash trên Windows).
- Tài khoản Cloudflare đã bật R2, và tài khoản GitHub là chủ repo.
- Một thư mục an toàn ngoài repo để cất các file `.pem`. Không bao giờ commit chúng.

## Bước 1. Tạo GitHub App

1. Mở **Settings** của tài khoản (hoặc tổ chức) sở hữu repo, rồi **Developer settings** > **GitHub Apps** > **New GitHub App**.
2. **GitHub App name**: `bk-study-library-bot`. Tên này quyết định `BOT_LOGIN` ở bước 5 (`bk-study-library-bot[bot]`). Nếu tên đã bị dùng, đặt tên khác và dùng tên đó về sau.
3. **Homepage URL**: địa chỉ trang web của thư viện.
4. **Webhook**: bỏ chọn **Active**. App không dùng webhook.
5. Mục **Repository permissions**, chọn đúng ba quyền, không thêm quyền nào khác:
   - **Contents**: **Read and write**
   - **Pull requests**: **Read and write**
   - **Metadata**: **Read-only** (GitHub tự thêm)
6. **Where can this GitHub App be installed?**: **Only on this account**.
7. Bấm **Create GitHub App**.
8. Trên trang của App, mục **About**, ghi lại hai giá trị:
   - **App ID** (một số), dùng cho `GH_APP_ID` của Worker.
   - **Client ID** (dạng `Iv...`), dùng cho `GH_APP_CLIENT_ID` của Actions. Đây không phải App ID.
9. Kéo xuống mục **Private keys**, bấm **Generate a private key**. Trình duyệt tải về một file `.pem`. Cất file này ở nơi an toàn.
10. Ở thanh bên trái, chọn **Install App**, bấm **Install** cạnh tài khoản chủ repo, chọn **Only select repositories**, chọn đúng repo thư viện, rồi **Install**.
11. Sau khi cài, trình duyệt mở trang cài đặt có địa chỉ dạng `https://github.com/settings/installations/12345678` (hoặc `https://github.com/organizations/<tên>/settings/installations/12345678`). Số cuối cùng là **Installation ID**, dùng cho `GH_INSTALLATION_ID`.

Worker cần khóa ở định dạng PKCS#8, còn file `.pem` GitHub cấp thì không phải. Đổi một lần (thay `<file>` bằng tên file bạn tải về):

```bash
openssl pkcs8 -topk8 -nocrypt -in <file>.pem -out bot-pkcs8.pem
```

Bạn có hai file: `<file>.pem` gốc (cho Actions) và `bot-pkcs8.pem` (cho Worker).

## Bước 2. R2: bucket, luật vòng đời, API token

1. Trong Cloudflare dashboard, vào **Storage & databases** > **R2 object storage**, bấm **Create bucket**, đặt tên `bk-lib-quarantine`. Giữ bucket riêng tư: không bật public access, không nối tên miền.
2. Thêm luật vòng đời xóa mọi object sau 30 ngày. Luật phải phủ cả bucket vì kho dùng ba tiền tố `pending/`, `clean/` và `sha/`. Tiền tố bỏ trống (`""`) nghĩa là áp cho cả bucket:

```bash
npx wrangler r2 bucket lifecycle add bk-lib-quarantine delete-after-30-days "" --expire-days 30
```

3. Kiểm lại: phải thấy đúng một luật, không có tiền tố, hết hạn sau 30 ngày.

```bash
npx wrangler r2 bucket lifecycle list bk-lib-quarantine
```

4. Tạo API token cho workflow (Worker không dùng token này, nó dùng binding):
   1. Ở trang **R2 object storage**, bấm **Manage** cạnh **API Tokens**, rồi **Create Account API token**.
   2. **Permissions**: **Object Read & Write**.
   3. Phạm vi bucket: chọn **Apply to specific buckets only** và chọn `bk-lib-quarantine`. Không cấp cho bucket khác.
   4. Bấm **Create**. Trang kết quả hiện **Access Key ID** và **Secret Access Key** một lần duy nhất. Ghi vào nơi an toàn ngay.
5. **Account ID** của Cloudflare nằm ở trang tổng quan R2. Dùng cho `R2_ACCOUNT_ID`.

## Bước 3. Turnstile

Widget đã được tạo, site key nằm trong `catalog/site.json` (`turnstileSiteKey`). Chỉ cần kiểm hostname. Hostname là nơi trang có widget được mở, không phải nơi Worker chạy: Worker không hiện widget nên không cần thêm host `workers.dev`.

1. Trong Cloudflare dashboard, vào **Turnstile**, mở widget của thư viện.
2. Ở **Hostname management**, khi chạy thử trên máy (repo còn private), thêm `localhost`.
3. Khi repo public và web chạy trên GitHub Pages, thêm `bk-study-library.github.io`, rồi gỡ `localhost`.

Worker chỉ nhận token Turnstile có hostname nằm trong `ALLOWED_ORIGINS`, nên danh sách này phải khớp với `ALLOWED_ORIGINS` ở bước 4.

## Bước 4. Đưa Worker lên Cloudflare

Đăng nhập một lần:

```bash
cd worker && npx wrangler login
```

Nhập bốn khóa bí mật, mỗi lệnh một khóa. Mỗi lệnh sẽ hỏi giá trị: dán vào cửa sổ dòng lệnh, không dán vào chat.

```bash
npx wrangler secret put TURNSTILE_SECRET
```

Giá trị: **Secret key** của widget Turnstile (trang **Turnstile**, widget của thư viện).

```bash
npx wrangler secret put GH_APP_ID
```

Giá trị: App ID (số) ở bước 1.

```bash
npx wrangler secret put GH_APP_PRIVATE_KEY
```

Giá trị: toàn bộ nội dung file `bot-pkcs8.pem`, từ dòng `-----BEGIN PRIVATE KEY-----` đến dòng `-----END PRIVATE KEY-----`. Dán nhiều dòng được. Không dùng file `.pem` gốc ở đây.

```bash
npx wrangler secret put GH_INSTALLATION_ID
```

Giá trị: Installation ID (số) ở bước 1.

Mở `worker/wrangler.jsonc`, mục `vars`, kiểm lại:

| Biến | Giá trị |
|---|---|
| `REPO` | `bk-study-library/bk-study-library` (đổi nếu repo ở nơi khác) |
| `BRANCH` | `main` |
| `ALLOWED_ORIGINS` | các nguồn được gọi Worker, cách nhau bằng dấu phẩy. Khi chạy thử trên máy: `http://localhost:8080`. Khi repo public: `https://bk-study-library.github.io`, gỡ nguồn localhost |
| `CATALOG_TTL_SECONDS` | `300` |
| `PUBLIC_PR_LINKS` | `"false"` khi repo còn private (Worker không trả link PR cho người gửi); đổi thành `"true"` sau khi repo public |

Đưa Worker lên:

```bash
npx wrangler deploy
```

Lệnh in ra địa chỉ Worker, dạng `https://bk-study-library-upload.<tên-bạn>.workers.dev`. Lần đầu, wrangler có thể hỏi đặt tên miền con `workers.dev` cho tài khoản. Ghi địa chỉ này vào ô `uploadEndpoint` của `catalog/site.json`, kèm đuôi `/submit` vì Worker chỉ trả lời ở đường dẫn đó. Giữ nguyên `turnstileSiteKey`:

```json
"uploadEndpoint": "https://bk-study-library-upload.<tên-bạn>.workers.dev/submit"
```

Sau đó commit `catalog/site.json`, chạy `npm run build`, rồi dựng lại web để form có địa chỉ mới.

Nhật ký từng lượt gọi của Worker đã tắt có chủ ý (`invocation_logs: false`) để không ghi IP người gửi. Đừng bật lại. Khi cần xem lỗi, chạy `npx wrangler tail`: dòng lỗi chỉ có bước và mã lỗi.

## Bước 5. Khóa cho GitHub Actions

Vào repo trên GitHub, **Settings** > **Secrets and variables** > **Actions**.

Tab **Secrets**, bấm **New repository secret** cho từng khóa:

| Tên | Giá trị |
|---|---|
| `R2_ACCOUNT_ID` | Account ID Cloudflare (bước 2) |
| `R2_ACCESS_KEY_ID` | Access Key ID của API token R2 (bước 2) |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key của API token R2 (bước 2) |
| `GH_APP_CLIENT_ID` | Client ID của GitHub App, dạng `Iv...` (bước 1, không phải App ID) |
| `GH_APP_PRIVATE_KEY` | toàn bộ nội dung file `.pem` gốc tải từ GitHub (không phải `bot-pkcs8.pem`) |

Tab **Variables**, bấm **New repository variable** cho từng biến:

| Tên | Giá trị |
|---|---|
| `R2_BUCKET` | `bk-lib-quarantine` |
| `BOT_LOGIN` | tên bot, ví dụ `bk-study-library-bot[bot]` (tên App, thêm `[bot]`) |

Ba workflow chỉ chạy khi PR do đúng `BOT_LOGIN` mở. Sai tên bot thì workflow bị bỏ qua mà không báo lỗi.

## Bước 6. Nhãn `tai-lieu-moi`

Bot gắn nhãn này khi mở PR, và `kiem-file` chỉ chạy khi PR có nhãn. Repo chưa có nhãn thì việc gửi bài lỗi ở bước gắn nhãn. Tạo nhãn bằng GitHub CLI:

```bash
gh label create tai-lieu-moi --repo bk-study-library/bk-study-library --description "Tài liệu gửi qua form" --color 0E8A16
```

Hoặc trên web: **Issues** > **Labels** > **New label**.

## Bước 7. Bảo vệ nhánh `main`

Ruleset bắt buộc PR và một lượt duyệt chỉ bật được sau khi repo public (gói Free). Trong lúc repo còn private, điều duy nhất ngăn bot tự đưa bài lên `main` là khóa App chỉ nằm trong Worker secrets. Khi repo public, vào **Settings** > **Rules** > **Rulesets** và tạo ruleset cho `main`: yêu cầu Pull request và một lượt duyệt, không ai được bỏ qua, kể cả bot. Cùng lúc đó đổi `PUBLIC_PR_LINKS` thành `"true"` rồi `npx wrangler deploy` lại.

## Chạy thử (repo private)

GitHub Pages không chạy cho repo private ở gói Free, nên khi repo còn private bạn dựng web và mở trên máy:

1. Kiểm `ALLOWED_ORIGINS` có `http://localhost:8080` (bước 4) và widget Turnstile có `localhost` (bước 3).
2. Dựng web từ thư mục gốc của repo, rồi mở bằng một máy chủ tĩnh ở cổng 8080:

```bash
npm run site
npx --yes http-server site -p 8080 -c-1
```

3. Mở http://localhost:8080/gui-tai-lieu/ trên trình duyệt.

Sau khi repo public, web chạy trên GitHub Pages: đổi `ALLOWED_ORIGINS` thành `https://bk-study-library.github.io`, thêm host đó vào Turnstile, gỡ `localhost` ở cả hai nơi, rồi `npx wrangler deploy` lại.

Gửi bốn bài qua trang **Gửi tài liệu**, mỗi bài một lần gửi, và lưu mã bài trang trả về. Vì `PUBLIC_PR_LINKS` là `"false"`, trang không đưa link PR: tìm PR trong tab **Pull requests** của repo, tên dạng `Tài liệu mới: <mã môn> <tiêu đề>`, nhánh `upload/<mã bài>`.

Sau mỗi lần gửi, đợi vài phút cho workflow `kiem-file` chạy xong (xem tab **Actions**).

### Bài 1. PDF hợp lệ

Dùng một PDF nhỏ, không có thông tin cá nhân. Điền đủ form và ba ô cam kết.

Kết quả mong đợi:
- Có một PR mới, nhãn `tai-lieu-moi`, do bot mở.
- Một comment kết quả: không có virus, không có cảnh báo, không báo thiếu lớp chữ (nếu PDF có chữ).
- Nhánh của PR có thêm một commit ghi `url`, `mime`, `sha256`, `size` vào `files[]` của mục tài liệu. `url` trỏ tới Release `files-HK<xxx>` của học kỳ hiện tại, tính theo bảng tháng trong `catalog/policy.json` (ví dụ tháng 10 năm 2026 là `files-HK261`).

### Bài 2. File EICAR

EICAR là file thử chuẩn của phần mềm diệt virus, vô hại. Tải từ trang chính thức https://www.eicar.org (mục file thử). Phần mềm diệt virus trên máy bạn có thể chặn hoặc xóa file này: tạm thời đặt nó vào thư mục được loại trừ. Form chỉ nhận các đuôi trong `catalog/policy.json`, nên nén file EICAR thành `.zip` rồi gửi.

Kết quả mong đợi:
- Có PR mới, rồi `kiem-file` comment báo phát hiện virus.
- PR bị đóng.
- Kho cách ly đã sạch: trong **R2 object storage** > `bk-lib-quarantine` > **Objects** không còn `pending/<mã bài>/` và khóa `sha/...` của bài này.

### Bài 3. PDF có Author trong metadata

Lấy một PDF và đặt tên tác giả (ví dụ `exiftool -Author="Ten Thu" file.pdf`, hoặc điền ở phần thuộc tính tài liệu của trình soạn thảo), rồi gửi.

Kết quả mong đợi:
- PR mở, comment liệt kê các thẻ metadata đã bị xóa, trong đó có `Author`.
- Bản đưa lên Release sau khi merge là bản đã làm sạch: `exiftool` trên file tải về không còn `Author`.

### Bài 4. File có MSSV giả

Tạo một PDF hoặc `.md` có chữ chứa một dãy bảy chữ số bắt đầu bằng 1 hoặc 2, đứng riêng, ví dụ `MSSV: 2112345`. Dùng số bịa, không dùng số thật của ai.

Kết quả mong đợi:
- PR mở, comment có cảnh báo thông tin cá nhân: loại (MSSV 7 chữ số) kèm số trang tìm thấy.
- PR vẫn mở, người duyệt quyết định.

### Đóng một PR

Chọn PR của bài 3 hoặc bài 4, bấm **Close pull request** (không merge). Workflow `don-kho` chạy và:
- xóa `pending/<mã bài>/`, `clean/<mã bài>/` và khóa `sha/...` trong bucket (kiểm trong dashboard R2 như ở bài 2);
- xóa nhánh `upload/<mã bài>` (kiểm ở **Code** > **Branches**).

### Merge một PR

Chọn PR của bài 1, xem lại nội dung, bấm **Merge pull request**. Workflow `phat-hanh-file` chạy và:
- tạo Release `files-HK<xxx>` (đánh dấu pre-release) nếu chưa có, rồi đưa file đã làm sạch lên đúng tên đã ghi trong `files[]`;
- xóa file của bài đó trong kho cách ly.

Kiểm: trong **Releases** có pre-release `files-HK<xxx>` kèm file, và link của tài liệu có trong `v1/` trên `main` (workflow `kiem-file` đã dựng lại `v1/` trong PR).

Khi repo còn private, file trên Release chỉ thành viên đã đăng nhập mới tải được. Web và app BK Study Desk tải được sau khi repo public.

## Duyệt nhiều bài cùng lúc

Mỗi PR gửi bài đều sửa các file sinh ra: `index.json`, `index.min.json`, `v1/` và README của môn. Sau khi merge một PR, các PR khác đang mở sẽ xung đột ở các file này. Với từng PR còn lại:

1. Bấm **Update branch** trên trang PR. Nếu GitHub báo xung đột, bấm **Resolve conflicts**.
2. Với `index.json`, `index.min.json`, các file trong `v1/` và README, giữ bên nào cũng được.
3. Commit. Lần push này làm `kiem-file` chạy lại và dựng lại đúng các file sinh ra trong nhánh PR.
4. Đợi `kiem-file` và `validate` xanh rồi mới merge.

Không sửa tay mục tài liệu `courses/<môn>/items/<id>.json` khi giải xung đột.

### Nếu có gì không chạy

- Gửi xong mà không có PR: chạy `npx wrangler tail` rồi gửi lại; kiểm nhãn `tai-lieu-moi` đã tạo và `ALLOWED_ORIGINS` có đúng nguồn của trang.
- Có PR nhưng workflow không chạy: kiểm biến `BOT_LOGIN` có đúng tên bot, PR có nhãn `tai-lieu-moi`.
- Workflow báo lỗi khóa R2 hoặc khóa App: kiểm lại các secret ở bước 5. `GH_APP_PRIVATE_KEY` của Actions là file `.pem` gốc, của Worker là `bot-pkcs8.pem`.
- Form báo không xác minh được: kiểm hostname trong Turnstile (bước 3) và `turnstileSiteKey` trong `catalog/site.json`.
- PR mở quá 30 ngày, file trong kho đã bị xóa (comment báo không tải được file từ kho cách ly): đóng PR, nhờ người gửi gửi lại.
