# Luồng tải lên không cần tài khoản GitHub: kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sinh viên gửi tài liệu qua form trên web, Worker đưa file vào kho cách ly và mở PR; workflow kiểm, làm sạch, ghi link; khi merge thì file lên GitHub Release và hiện trong `v1`.

**Architecture:** Cấu hình dùng chung ở `catalog/policy.json` và `catalog/site.json`. Logic thuần (đặt tên, chọn học kỳ, dựng mục, báo cáo kiểm) nằm trong `scripts/upload/*.mjs`, không phụ thuộc gì, được cả Worker (đóng gói bằng wrangler) lẫn workflow (Node) dùng lại. Worker trong `worker/` chỉ lo HTTP, Turnstile, R2, GitHub API. Workflow YAML chỉ gọi CLI mỏng trong `scripts/upload/`.

**Tech Stack:** Node 24, `node --test` (repo, không thư viện ngoài); Cloudflare Workers, R2, Turnstile, Rate Limiting binding, `wrangler`, `vitest` + `@cloudflare/vitest-pool-workers` (chỉ trong `worker/`); GitHub App (REST API); GitHub Actions với ClamAV, `exiftool`, `qpdf`, `poppler-utils`, AWS CLI (S3 API của R2).

**Spec:** `docs/superpowers/specs/2026-10-03-luong-tai-len-design.md`

## Global Constraints

- Không ghi cứng giá trị có thể đổi: loại, đuôi file, kích thước, dấu đầu file, bảng tháng học kỳ ở `catalog/policy.json`; địa chỉ Worker và site key Turnstile ở `catalog/site.json`; repo, nhánh, origin được phép ở `worker/wrangler.jsonc` `vars`; khóa ở secrets.
- `scripts/` và `test/` không thêm dependency; dependency của Worker chỉ nằm trong `worker/package.json`.
- Mọi file văn bản qua `test/style.test.mjs` (không gạch dài, mũi tên, chấm giữa, ký tự ba chấm, ngoặc kép cong, dấu tích, emoji).
- Chữ cho người dùng: tiếng Việt, gọi người dùng là "bạn", câu ngắn, lỗi theo mẫu "Không ... được. <việc cần làm>." Không quảng cáo.
- Kích thước tối đa mỗi file: 20 MB (`policy.json`, giá trị hiện có của `LIMITS.maxFileBytes`).
- Chỉ cấm file sách có bản quyền; thông tin cá nhân chỉ cảnh báo, không chặn.
- Hợp đồng v1 chỉ được cộng thêm (`files[].mime`, loại `book-ref`, `book`), không đổi trường cũ. `quarantine` không bao giờ xuất ra `v1`.
- Không workflow nào commit lên `main`.
- Turnstile site key: `0x4AAAAAAFMxSkFCGbs--qcI`.

## Review Focus

1. Tên file gốc có dấu, khoảng trắng, đuôi viết hoa (`Bài 1 GT2.PDF`): vẫn nhận, tên lưu là ASCII, đuôi viết thường. Test ở Task 3 và Task 5.
2. File vượt 20 MB với `Content-Length` nói dối hoặc không có: bị từ chối, không ghi gì vào R2. Test ở Task 7.
3. Người gửi bấm gửi hai lần cùng một file: lần hai nhận "đã có", không ra hai PR. Test ở Task 7.
4. GitHub API lỗi sau khi đã tạo nhánh: xóa object R2 và xóa nhánh, trả lỗi thử lại. Test ở Task 7.
5. Gửi cho môn đã ngừng (`GE1007`) hoặc môn có ID kèm năm (`GE4169-2024`): nhận, đường dẫn mục dùng đúng ID. Test ở Task 5 và Task 7.

---

### Task 1: `policy.json` là nguồn cấu hình chung

**Files:**
- Modify: `catalog/policy.json`, `scripts/lib/repo.mjs` (`LIMITS`, kiểm `prelab-reference`)
- Create: `scripts/lib/policy.mjs`
- Test: `test/policy.test.mjs`; sửa `test/validate.test.mjs` (các test `PRELAB_GRADED`)

**Interfaces:**
- Produces: `loadPolicy(root: string) -> Policy`, `Policy = { openTypes: string[], maxFileBytes: number, maxMdInGitBytes: number, extensions: Record<string, { mime: string, magic?: string }>, quizExtensions: string[], selfMadeLicenses: string[], terms: { HK1: number[], HK2: number[], HK3: number[] } }`. `magic` là chuỗi hex của các byte đầu.

- [ ] **Step 1: Viết test hỏng**

`test/policy.test.mjs`:
- `loadPolicy(TOOL_ROOT).openTypes` có đủ 14 loại (13 loại v1 và `book-ref`).
- `.extensions['.pdf']` bằng `{ mime: 'application/pdf', magic: '25504446' }`; `.extensions['.zip'].magic === '504b0304'`; `.extensions['.md'].mime === 'text/markdown'`.
- `.maxFileBytes === 20 * 1024 * 1024`.
- `.terms` gom đủ 12 tháng, không tháng nào thuộc hai học kỳ.
- Thiếu file `policy.json` thì `loadPolicy` ném lỗi có chữ `catalog/policy.json`.

Sửa `test/validate.test.mjs`: `prelab-reference` không có `gradedAfter` thì không lỗi.

- [ ] **Step 2: Chạy, xác nhận hỏng**

Run: `node --test test/policy.test.mjs` Expected: FAIL (`loadPolicy` chưa có).

- [ ] **Step 3: Viết `scripts/lib/policy.mjs` và dữ liệu**

`policy.json` thêm các khóa trên; `extensions` lấy đúng danh sách `LIMITS.allowedExt` hiện có (`.pdf .md .docx .pptx .xlsx .zip .png .jpg .json`), mime chuẩn IANA, `magic`: PDF `25504446`, zip/docx/pptx/xlsx `504b0304`, PNG `89504e47`, JPG `ffd8ff`. `terms`: `HK1 [9,10,11,12,1]`, `HK2 [2,3,4,5,6]`, `HK3 [7,8]`. `repo.mjs` thay `LIMITS` bằng giá trị từ `loadPolicy(root)` trong `loadRepo`; bỏ khối kiểm `PRELAB_GRADED`. Repo không có `policy.json` (fixture test) thì `loadRepo` dùng `loadPolicy(TOOL_ROOT)`.

- [ ] **Step 4: Chạy toàn bộ**

Run: `npm test && npm run validate` Expected: PASS, `0 lỗi`.

- [ ] **Step 5: Commit** `refactor(policy): gom giới hạn file và loại tài liệu vào policy.json`

### Task 2: Schema và v1: `mime`, `quarantine`, loại `book-ref`

**Files:**
- Modify: `schema/item.schema.json`, `scripts/lib/repo.mjs` (kiểm theo loại), `scripts/lib/v1.mjs`, `scripts/lib/labels.mjs`, `scripts/build-site.mjs` (`renderItem`), `scripts/lib/readme.mjs` (`itemLine`), `docs/v1.md`
- Test: `test/v1.test.mjs`, `test/validate.test.mjs`

**Interfaces:**
- Consumes: `loadPolicy` (Task 1).
- Produces: item có `files[].quarantine?: string` (`^(pending|clean)/[A-Za-z0-9]{10}/[^/]+$`), `files[].mime?: string`, `book?: { title, authors: string[], year?: integer, publisher?: string, isbn?: string }` (`isbn` khớp `^(97[89])?[0-9]{9}[0-9X]$`). v1: `files[].mime` luôn có (lấy từ item, không có thì từ `policy.extensions[đuôi].mime`); mục `book-ref` có `book`, không có `files`, `url`.

- [ ] **Step 1: Viết test hỏng**

- `validate.test.mjs`: `book-ref` thiếu `book` báo `ITEM_BOOK`; `book-ref` có `files` hoặc `url` báo `ITEM_BOOK`; loại khác có `book` báo `ITEM_BOOK`.
- `v1.test.mjs`: mọi file trong `v1/courses/*.json` có `mime`; không chuỗi nào trong `v1/` chứa `"quarantine"`; một fixture `book-ref` ra v1 có `book.title` và không có `files`.
- Mục có `files[0].quarantine` mà không có `url` vẫn bị loại khỏi v1 (giữ test sẵn có).

- [ ] **Step 2: Chạy, xác nhận hỏng** Run: `npm test` Expected: FAIL ở các test mới.

- [ ] **Step 3: Cài đặt**

Thêm `book-ref` vào enum `type` và vào `policy.openTypes`. `v1Item` thêm `mime` và `book`, không bao giờ chép `quarantine`. Nhãn: `book-ref` là "Sách tham khảo (chỉ ghi tên)". Trang môn và README hiện sách dạng "Tên, tác giả, năm, NXB, ISBN". `docs/v1.md` thêm hai dòng mô tả.

- [ ] **Step 4: Chạy** Run: `npm run build && npm test` Expected: PASS.

- [ ] **Step 5: Commit** `feat(v1): thêm files[].mime và loại book-ref`

### Task 3: Module thuần cho tải lên

**Files:**
- Create: `scripts/upload/naming.mjs`, `scripts/upload/term.mjs`, `scripts/upload/item.mjs`
- Test: `test/upload-naming.test.mjs`, `test/upload-item.test.mjs`

**Interfaces:**
- Consumes: `Policy` (Task 1).
- Produces:
  - `slugify(text: string, max = 60) -> string`: bỏ dấu (gồm `đ`), chữ thường, ký tự khác `a-z0-9` thành `-`, gộp `-`, cắt theo ranh giới `-`.
  - `fileName({ code, type, slug, term?, ext }) -> string`: `<CODE>_<type>_<slug>[_<HKxxx>]<ext>`, `ext` viết thường.
  - `uniqueId(slug: string, taken: Set<string>) -> string`: `slug`, rồi `slug-2`, `slug-3`.
  - `termFor(date: Date, terms) -> string`: `HK` + hai số cuối năm bắt đầu năm học + số học kỳ. Tháng 1 thuộc năm học bắt đầu năm trước.
  - `releaseTag(term: string) -> string`: `files-<term>`.
  - `releaseAssetUrl(repo: string, tag: string, name: string) -> string`.
  - `buildItem(form: SubmissionForm, file?: { name, size, sha256, mime, quarantine }, today: string) -> object`: mục đúng `item.schema.json`, `origin: 'self-made'`, `added` là `today`, `authors` chỉ có khi `form.displayName` khác rỗng.
  - `SubmissionForm = { course, type, title, description?, lang, term?, chapter?, examKind?, teacher?, displayName?, license, book? }`.

- [ ] **Step 1: Viết test hỏng**

- `slugify('Bài 1: Giải tích II (đề)') === 'bai-1-giai-tich-ii-de'`; `slugify('   ') === ''`; chuỗi 200 ký tự ra tối đa 60 ký tự, không kết thúc bằng `-`.
- `fileName({ code: 'MT1005', type: 'summary', slug: 'chuong-1', term: 'HK251', ext: '.PDF' }) === 'MT1005_summary_chuong-1_HK251.pdf'`; không `term` thì không có `_HK`.
- `uniqueId('a', new Set(['a', 'a-2'])) === 'a-3'`.
- `termFor(new Date('2025-10-03'), terms) === 'HK251'`; `2026-01-15` ra `HK251`; `2026-03-01` ra `HK252`; `2026-07-20` ra `HK253`; `2026-09-01` ra `HK261`.
- `buildItem` với `displayName: ''` không có `authors`; với file thì `files[0]` có `quarantine`, không có `url`; với `book-ref` thì có `book`, không có `files`. Kết quả qua `validate(itemSchema, ...)` không lỗi.

- [ ] **Step 2: Chạy, xác nhận hỏng** Run: `node --test test/upload-naming.test.mjs test/upload-item.test.mjs` Expected: FAIL.

- [ ] **Step 3: Cài đặt** ba file, chỉ dùng JS chuẩn (để Worker đóng gói được: không `node:` import).

- [ ] **Step 4: Chạy** Expected: PASS.

- [ ] **Step 5: Commit** `feat(upload): module đặt tên, chọn học kỳ, dựng mục tài liệu`

### Task 4: Báo cáo kiểm file

**Files:**
- Create: `scripts/upload/report.mjs`
- Test: `test/upload-report.test.mjs`

**Interfaces:**
- Produces:
  - `parseClamscan(stdout: string, exitCode: number) -> { infected: boolean, signature?: string }` (exit 0 sạch, 1 có virus, khác thì ném lỗi).
  - `renderReport({ code, virus, metadataRemoved: string[], hasText: boolean | null, pii: { label, page, match }[], url }) -> string`: Markdown, dòng đầu `<!-- kiem-file -->`, tiếng Việt, không lặp lại chuỗi `match` đầy đủ (che giữa bằng `*`).
  - `REPORT_MARKER = '<!-- kiem-file -->'`.

- [ ] **Step 1: Viết test hỏng**

- `parseClamscan('x: Eicar-Signature FOUND\n', 1)` ra `{ infected: true, signature: 'Eicar-Signature' }`; `('x: OK\n', 0)` ra `{ infected: false }`; exit 2 thì ném.
- `renderReport` có virus: chứa "Có virus" và tên chữ ký, không chứa link Release. Có PII: có số trang, `match` dạng `21*****5`. `hasText: false`: chứa "không có lớp chữ". Mọi kết quả bắt đầu bằng `REPORT_MARKER` và qua regex `BANNED` của `style.test.mjs`.

- [ ] **Step 2: Chạy, xác nhận hỏng.** **Step 3: Cài đặt.** **Step 4: Chạy, PASS.**

- [ ] **Step 5: Commit** `feat(upload): đọc kết quả ClamAV và soạn báo cáo kiểm file`

### Task 5: Worker: kiểm bài gửi

**Files:**
- Create: `worker/package.json`, `worker/vitest.config.mjs`, `worker/src/validate.mjs`
- Test: `worker/test/validate.test.mjs`
- Modify: `.github/workflows/validate.yml` (thêm job `worker`: `npm ci && npm test` trong `worker/`), `.gitignore` (`worker/node_modules/`, `worker/.wrangler/`)

**Interfaces:**
- Consumes: `Policy` (Task 1), `slugify` (Task 3).
- Produces: `validateSubmission(fields: Record<string,string>, file: { name, size, head: Uint8Array } | null, ctx: { policy, courses: Map<string, { id, status }> }) -> { ok: true, form: SubmissionForm, ext: string } | { ok: false, errors: Record<string, string> }`. Khóa lỗi trùng tên ô của form: `course`, `type`, `title`, `file`, `license`, `confirm`, `book`.

- [ ] **Step 1: Cài công cụ** trong `worker/`: `npm i -D wrangler vitest @cloudflare/vitest-pool-workers` (đọc skill `cloudflare:wrangler` trước). Script `test`: `vitest run`.

- [ ] **Step 2: Viết test hỏng**

- Môn không có: `errors.course === 'Không tìm thấy môn này. Chọn môn trong danh sách.'`.
- Môn `GE1007` (retired) và `GE4169-2024`: hợp lệ.
- Loại không có trong `policy.openTypes`: lỗi `type`.
- Tiêu đề rỗng hoặc trên 200 ký tự: lỗi `title`.
- Thiếu một trong 3 ô `confirm-own`, `confirm-license`, `confirm-not-book`: lỗi `confirm`.
- Đuôi `.exe`: lỗi `file`. `Bai 1.PDF` có `head` bắt đầu `%PDF`: hợp lệ, `ext === '.pdf'`. Đuôi `.pdf` mà `head` là `PK..`: lỗi `file` "Nội dung file không khớp đuôi .pdf.".
- `size` lớn hơn `policy.maxFileBytes`: lỗi `file` có "20 MB" (tính từ policy, không ghi cứng).
- `book-ref` không có file nhưng thiếu `book-title`: lỗi `book`; có `book-title` và không file: hợp lệ. Loại khác mà không có file: lỗi `file`.

- [ ] **Step 3: Chạy, xác nhận hỏng** Run: `cd worker && npm test` Expected: FAIL.

- [ ] **Step 4: Cài đặt `validate.mjs`.** Thông báo lỗi tách thành hằng `MESSAGES` ở đầu file.

- [ ] **Step 5: Chạy, PASS. Commit** `feat(worker): kiểm bài gửi theo policy.json`

### Task 6: Worker: GitHub App client

**Files:**
- Create: `worker/src/github.mjs`
- Test: `worker/test/github.test.mjs`

**Interfaces:**
- Produces:
  - `appJwt(appId: string, pkcs8Pem: string, now: number) -> Promise<string>` (RS256, `iat = now - 60`, `exp = now + 540`).
  - `class GitHub { constructor({ repo, token, fetch }) }` với `getFile(path, ref) -> Promise<{ text, sha } | null>`, `branchSha(branch) -> Promise<string>`, `createBranch(name, fromSha)`, `deleteBranch(name)`, `putFile(path, text, branch, message)`, `openPr({ head, base, title, body }) -> Promise<{ number, html_url }>`, `addLabels(number, labels)`.
  - `installationToken({ appId, pkcs8Pem, installationId, fetch }) -> Promise<string>`.
  - Lỗi HTTP ném `GitHubError { status, path }`.

- [ ] **Step 1: Viết test hỏng** với `fetchMock` của `cloudflare:test`: `installationToken` gọi `POST /app/installations/<id>/access_tokens` với header `Authorization: Bearer <jwt>`; `putFile` gửi base64 đúng UTF-8 của chuỗi có dấu; `getFile` trả `null` khi 404; 500 ném `GitHubError` có `status === 500`. JWT tạo từ khóa test sinh trong test bằng `crypto.subtle.generateKey`, kiểm chữ ký bằng khóa công khai.

- [ ] **Step 2: Chạy, hỏng. Step 3: Cài đặt** bằng WebCrypto (`importKey('pkcs8', ...)`, `RSASSA-PKCS1-v1_5`, `SHA-256`). **Step 4: PASS.**

- [ ] **Step 5: Commit** `feat(worker): client GitHub App`

### Task 7: Worker: `POST /submit`

**Files:**
- Create: `worker/src/index.mjs`, `worker/src/catalog.mjs`, `worker/wrangler.jsonc`
- Test: `worker/test/submit.test.mjs`

**Interfaces:**
- Consumes: `validateSubmission` (Task 5), `GitHub`, `installationToken` (Task 6), `slugify`, `fileName`, `uniqueId`, `buildItem` (Task 3), `loadPolicy`-tương-đương: Worker đọc `catalog/policy.json` và `index.json` qua `GitHub.getFile` trên nhánh `vars.BRANCH`, giữ trong Cache API `vars.CATALOG_TTL_SECONDS` giây.
- Produces: `POST /submit` (`multipart/form-data`) trả JSON `{ ok: true, code: string, pr?: string }` (201) hoặc `{ ok: false, errors }` (400), `{ ok: false, error }` (403 Turnstile, 413 quá lớn, 409 trùng, 429 quá nhiều lần, 502 GitHub lỗi). `OPTIONS` cho CORS theo `vars.ALLOWED_ORIGINS` (danh sách, ngăn bằng dấu phẩy).
- `wrangler.jsonc`: `vars` `REPO`, `BRANCH`, `ALLOWED_ORIGINS`, `CATALOG_TTL_SECONDS`, `PUBLIC_PR_LINKS` (`"false"` khi repo private); binding R2 `QUARANTINE` tới bucket `bk-lib-quarantine`; `ratelimits` binding `SUBMIT_LIMIT` (`limit: 5`, `period: 60`); secrets (không có trong file): `TURNSTILE_SECRET`, `GH_APP_ID`, `GH_APP_PRIVATE_KEY`, `GH_INSTALLATION_ID`.

Thứ tự xử lý đúng như spec mục "Luồng gửi bài". Mã bài: 10 ký tự `[A-Za-z0-9]` từ `crypto.getRandomValues`. R2 key `pending/<code>/<fileName>`, thêm object đánh dấu `sha/<sha256>` (giá trị là `code`) để chặn gửi trùng khi còn chờ duyệt; trùng với tài liệu đã có thì tra `sha256` trong `index.json`.

- [ ] **Step 1: Viết test hỏng** (Turnstile qua `fetchMock` tới `challenges.cloudflare.com`, GitHub qua `fetchMock`, R2 giả lập của pool):
- Bài hợp lệ: 201, có `code`; R2 có `pending/<code>/MT1005_summary_<slug>.pdf` và `sha/<sha>`; GitHub nhận `createBranch('upload/<code>')`, `putFile('courses/MT1005/items/<id>.json')`, `openPr` có nhãn `tai-lieu-moi`; không có `pr` trong kết quả khi `PUBLIC_PR_LINKS` là `"false"`.
- Turnstile trả `success: false`: 403, R2 rỗng.
- `Content-Length` 21 MB: 413, không đọc body. Body thật 21 MB mà `Content-Length` nhỏ hơn: 413, R2 rỗng.
- Gửi hai lần cùng file: lần hai 409 "Tài liệu này đang chờ duyệt.", chỉ một PR.
- File trùng `sha256` của tài liệu trong `index.json`: 409 "Tài liệu này đã có trong thư viện.".
- `openPr` trả 500: 502, R2 không còn `pending/<code>/...` và `sha/<sha>`, `deleteBranch('upload/<code>')` đã được gọi.
- `SUBMIT_LIMIT.limit()` trả `{ success: false }`: 429.
- Môn `GE4169-2024`: mục ghi ở `courses/GE4169-2024/items/`, tên file bắt đầu `GE4169_`.
- Origin không có trong `ALLOWED_ORIGINS`: không có header `Access-Control-Allow-Origin`.
- Không có `console.log` nào in IP, tên hiển thị hay tên file (kiểm bằng spy trên `console`).

- [ ] **Step 2: Chạy, hỏng. Step 3: Cài đặt. Step 4: PASS.**

- [ ] **Step 5: Commit** `feat(worker): nhận bài gửi, cách ly file, mở PR`

### Task 8: Workflow `kiem-file`

**Files:**
- Create: `scripts/upload/check.mjs` (CLI), `.github/workflows/kiem-file.yml`
- Test: `test/upload-check.test.mjs`

**Interfaces:**
- Consumes: `parseClamscan`, `renderReport` (Task 4), `termFor`, `releaseTag`, `releaseAssetUrl`, `fileName` (Task 3), `scanText` (`repo.mjs`), `loadPolicy` (Task 1).
- Produces: `applyCheck(item, { cleanName, size, sha256, mime, term, repo, existingAssets: Map<string,string> }) -> item` (thuần, ghi `url`, `mime`, `size`, `sha256`, `quarantine: 'clean/...'`, xử lý trùng tên Release theo spec). CLI `node scripts/upload/check.mjs --item <path> --dir <thư mục file đã tải> --repo <owner/name>` in JSON `{ report, item }`.

Workflow: `on: pull_request_target` loại `labeled`, `synchronize`, chỉ khi nhánh bắt đầu `upload/` và PR có nhãn `tai-lieu-moi`; bỏ qua khi commit mới nhất của nhánh có thông điệp bắt đầu bằng `kiem-file:` (tránh tự gọi lại); checkout đúng `head.sha` nhưng **không chạy script từ nhánh PR**: script lấy từ `main` (checkout thứ hai). Quyền: `contents: write`, `pull-requests: write`. Bước: cài `clamav exiftool qpdf poppler-utils`, `freshclam`; `aws s3 cp` từ R2 (secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, vars `R2_BUCKET`); `clamscan`; có virus thì comment, đóng PR, xóa object, dừng; PDF thì `exiftool -all:all= -overwrite_original` rồi `qpdf --linearize`; `pdftotext` từng trang để tìm lớp chữ và PII; tải bản sạch lên `clean/<code>/<tên>`; `gh release view` lấy tên asset hiện có; `applyCheck`; `npm run build`; commit `kiem-file: <mã bài>` vào nhánh PR bằng token của GitHub App (`actions/create-github-app-token`, secrets `GH_APP_ID`, `GH_APP_PRIVATE_KEY`) để workflow `validate` chạy lại; commit bằng `GITHUB_TOKEN` thì GitHub không chạy workflow khác. Trước bước này `validate` báo file sinh ra đã cũ trên PR, đó là bình thường; cập nhật comment có `REPORT_MARKER` (sửa, không thêm mới).

- [ ] **Step 1: Viết test hỏng** cho `applyCheck`: ghi đúng `url` = `releaseAssetUrl(repo, 'files-HK251', name)`; asset cùng tên khác `sha256` thì tên có `-<6 ký tự sha>` trước đuôi; cùng tên cùng `sha256` thì giữ tên; kết quả qua schema.
- [ ] **Step 2: Hỏng. Step 3: Cài đặt `check.mjs` và YAML. Step 4: PASS** (`npm test`; YAML kiểm bằng `npx --yes @action-validator/cli .github/workflows/kiem-file.yml`).
- [ ] **Step 5: Commit** `ci: kiểm, làm sạch file tải lên và ghi link Release vào PR`

### Task 9: Workflow `phat-hanh-file`, `don-kho`, gỡ file

**Files:**
- Create: `scripts/upload/publish.mjs`, `.github/workflows/phat-hanh-file.yml`, `.github/workflows/don-kho.yml`
- Test: `test/upload-publish.test.mjs`

**Interfaces:**
- Consumes: `releaseTag` (Task 3), `loadRepo` (`repo.mjs`).
- Produces:
  - `planPublish(itemsChanged: object[], existingAssets: Map<string, Map<string,string>>) -> { tag, name, quarantine, sha256 }[]` (bỏ qua asset cùng tên cùng `sha256`).
  - `planRemovals(itemsBefore, itemsAfter) -> { tag, name }[]` (mục chuyển sang `removed: true` có `url` trỏ Release của repo).
- `phat-hanh-file.yml`: `on: pull_request` `closed` khi `merged` và nhánh `upload/`; dùng `planPublish`, `gh release create --prerelease` nếu thiếu, tải `clean/...` từ R2, kiểm `sha256`, `gh release upload`, xóa `pending/`, `clean/`, `sha/<sha>`.
- `don-kho.yml`: `on: pull_request` `closed` khi không merge và nhánh `upload/`; xóa `pending/<code>/`, `clean/<code>/`, `sha/<sha>`, xóa nhánh.
- Gỡ: thêm job vào `phat-hanh-file.yml` chạy `on: push` vào `main` khi đổi `courses/**/items/*.json`, dùng `planRemovals`, `gh release delete-asset`.

- [ ] **Step 1: Viết test hỏng** cho `planPublish` (asset có sẵn cùng `sha256` thì bỏ qua) và `planRemovals` (chỉ mục vừa chuyển sang `removed`, bỏ qua link ngoài).
- [ ] **Step 2: Hỏng. Step 3: Cài đặt. Step 4: PASS.**
- [ ] **Step 5: Commit** `ci: phát hành file khi merge, dọn kho khi từ chối, xóa file khi gỡ`

### Task 10: Trang "Gửi tài liệu" và hướng dẫn

**Files:**
- Create: `catalog/site.json`, `site-src/pages/vi/gui-tai-lieu.html`, `site-src/assets/upload.js`
- Modify: `site-src/pages/vi/contribute.html` (viết lại thành hướng dẫn), `site-src/pages/en/contribute.html` (một đoạn ngắn trỏ sang bản tiếng Việt), `scripts/build-site.mjs` (trang mới, nút trên trang môn, chèn `site.json` vào `data-` của form), `scripts/lib/strings.mjs`
- Test: `test/site.test.mjs`

**Interfaces:**
- Consumes: `search-core.js`, `v1/index.json`, `policy.json` (danh sách loại và đuôi file cho form, đưa vào trang lúc dựng), `site.json` `{ uploadEndpoint: string, turnstileSiteKey: string }`.
- Produces: trang `gui-tai-lieu/` với `?course=<ID>` chọn sẵn môn; nút **Gửi tài liệu** trên mỗi trang môn trỏ tới đó (thay nút mở Issue).

`upload.js`: ô môn tìm bằng `BkSearch`, chỉ nhận môn chọn từ danh sách; ô loại từ policy; đổi loại sang `book-ref` thì ẩn ô file, hiện ô sách; kiểm đuôi và kích thước trước khi gửi (cùng số với policy); gửi bằng `fetch` tới `uploadEndpoint`; hiện lỗi dưới từng ô theo `errors`; thành công thì hiện mã bài. Turnstile nạp từ `https://challenges.cloudflare.com/turnstile/v0/api.js`.

Hướng dẫn (`contribute.html`): gửi qua form từng bước; gửi qua PR (chỉ `.md` dưới 1 MB và JSON); điều duy nhất bị cấm là file sách có bản quyền, sách thì chọn loại "Sách tham khảo" và ghi tên; máy sẽ cảnh báo nếu thấy MSSV, email, số điện thoại; sau khi gửi: mã bài, thời gian duyệt, cách xin gỡ.

- [ ] **Step 1: Viết test hỏng**: `gui-tai-lieu/index.html` tồn tại, có `data-endpoint` bằng `site.json.uploadEndpoint`, có `data-sitekey="0x4AAAAAAFMxSkFCGbs--qcI"`, có `<option value="book-ref">`; trang `course/MT1005/` có link `gui-tai-lieu/?course=MT1005`; `contribute/index.html` có chữ "sách có bản quyền" và không còn "Bài đang trong hạn nộp".
- [ ] **Step 2: Hỏng. Step 3: Cài đặt. Step 4: PASS** (`npm test`, gồm `style.test.mjs`).
- [ ] **Step 5: Kiểm bằng trình duyệt**: `npm run site -- --out "$TEMP/bk-site"`, mở `gui-tai-lieu/index.html?course=MT1005`, thấy môn đã chọn, đổi loại sang sách thì ô file ẩn.
- [ ] **Step 6: Commit** `feat(site): trang Gửi tài liệu và hướng dẫn đóng góp`

### Task 11: Hướng dẫn cài đặt và chạy thử

**Files:**
- Create: `docs/cai-dat-luong-tai-len.md`, `PRIVACY.md` (quyền riêng tư của thư viện: form không bắt email; tên hiển thị tùy chọn; IP chỉ dùng để giới hạn số lần gửi, không lưu; file chờ duyệt xóa sau 30 ngày; những gì công khai khi repo public)
- Modify: `site-src/pages/vi/contribute.html` (link tới `PRIVACY.md`)

Nội dung, từng bước, đúng tên mục trên giao diện:
1. GitHub App: quyền như spec; tạo private key; đổi sang PKCS#8 bằng `openssl pkcs8 -topk8 -nocrypt -in <file>.pem -out bot-pkcs8.pem`; lấy App ID, Installation ID.
2. R2: bucket `bk-lib-quarantine`; luật vòng đời xóa object sau 30 ngày; API token quyền Object Read & Write chỉ cho bucket này.
3. Turnstile: hostname được phép.
4. `cd worker && npx wrangler login`, rồi `npx wrangler secret put TURNSTILE_SECRET`, `GH_APP_ID`, `GH_APP_PRIVATE_KEY` (dán nội dung `bot-pkcs8.pem`), `GH_INSTALLATION_ID`; `npx wrangler deploy`; ghi địa chỉ `workers.dev` vào `catalog/site.json`.
5. Actions secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `GH_APP_ID`, `GH_APP_PRIVATE_KEY` (file `.pem` gốc); Actions variable `R2_BUCKET`.
6. Nhãn `tai-lieu-moi` trong repo.
7. Chạy thử 4 bài như spec, kèm kết quả mong đợi của từng bài.

- [ ] **Step 1: Viết.** **Step 2:** `npm test` (style) PASS. **Step 3: Commit** `docs: hướng dẫn cài đặt luồng tải lên`
