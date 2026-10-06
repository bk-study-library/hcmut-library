# Bản đồ code

Đọc file này trước khi sửa. Mỗi việc có một chỗ đúng; tìm chỗ đó ở bảng "Muốn sửa gì, vào đâu" rồi đọc phần đầu file (mỗi file có ghi chú mục đích ở đầu). Nếu việc mới không có chỗ nào hợp thì tách thành file riêng trong đúng thư mục, không nhét vào file đang có.

## Luồng dữ liệu

```
nguồn chính thức (Sổ tay, CTĐT, tuyển sinh; docs/nguon-du-lieu.md)
  scripts/import-research.mjs, import-ctdt.mjs (+ import-sdh.mjs)      nhập, chạy tay
catalog/ (môn, ngành, chương trình, khoa, cấu hình)   courses/<môn>/items/ (tài liệu)
  scripts/validate.mjs --write  (npm run build)                       kiểm và sinh file
index.json, index.min.json, worker-catalog.json, v1/ (API công khai), courses/<môn>/README.md
  scripts/build-site.mjs + scripts/site/  (npm run site)               dựng web
site/ (GitHub Pages, workflow pages.yml)
```

Gửi tài liệu:

```
form web (site-src/assets/upload.js)
  Worker (worker/src/routes/submit.mjs, handleSubmit): kiểm, lưu file vào R2 (bucket quarantine), bot mở PR upload/<mã bài>
  workflow kiem-file (scripts/upload/check.mjs): quét virus, sanitize, ghi link Release vào item, comment kết quả
  người duyệt: trang /xem-duyet/<mã> của Worker (worker/src/view.mjs, review.mjs) hay duyệt tay trên GitHub
  Worker merge (bỏ file không duyệt; cron 5 phút merge bài duyệt một phần, gửi email)
  workflow phat-hanh-file (scripts/upload/publish.mjs): đưa file lên Release; don-kho dọn R2 khi PR đóng
```

## Thư mục

| Thư mục | Nội dung | Ghi chú |
|---|---|---|
| `catalog/` | Dữ liệu gốc: `courses/` (môn), `programs/` (chương trình), `majors.json`, `faculties.json`, `policy.json` (giới hạn file, loại tài liệu, học kỳ), `site.json` (cấu hình web) | Sửa dữ liệu ở đây, không sửa file sinh ra |
| `courses/<môn>/items/` | Tài liệu (item) của từng môn | Bot ghi khi có bài gửi |
| `schema/` | JSON Schema của mọi file dữ liệu | Enum loại chương trình phải khớp `scripts/lib/program-types.mjs` (có test) |
| `scripts/lib/` | Hàm dùng chung, thuần, có test | Xem bảng dưới |
| `scripts/` | Lệnh: nhập dữ liệu, kiểm, dựng web | |
| `scripts/upload/` | Phần chạy trong workflow của luồng gửi bài | Hàm thuần ở trên, CLI ở cuối file |
| `site-src/assets/` | CSS, JS chạy trên trình duyệt | File `*-core.js` thuần, test được bằng Node |
| `site-src/pages/` | Trang tĩnh (đóng góp, duyệt bài, gỡ tài liệu, form gửi) | |
| `worker/` | Cloudflare Worker (upload.xerozsoft.com) | Test riêng: `cd worker && npm test` |
| `.github/workflows/` | validate, pages, kiem-file, phat-hanh-file, don-kho | Luật an toàn có test `test/workflows.test.mjs` |
| `docs/` | Tài liệu cho người duy trì | `v1.md` là hợp đồng API công khai |
| `test/` | Test của site và script (`npm test`) | |

## Muốn sửa gì, vào đâu

| Việc | File, hàm | Lưu ý |
|---|---|---|
| Tên, mã viết tắt, ghi chú của loại chương trình (CQ, CTTA, THCQ...) | `scripts/lib/program-types.mjs`: `PROGRAM_TYPES`, `programTypeInfo` | Mã thư viện (khóa) không đổi tên: nằm trong v1 và id chương trình. Nguồn tên: `docs/ten-chuong-trinh.md` |
| Cách nhận loại khi nhập dữ liệu | cùng file: `researchType` (bản thu thập), `sdhType` (sau đại học), `typeFromVariant` (chương trình cũ) | Sau khi sửa, nhập lại vào thư mục tạm và so với `catalog/` |
| Chữ trên web (vi, en) | `scripts/lib/strings.mjs` | Tiếng Việt là bản chính |
| Nhãn dùng chung (loại tài liệu, kỳ thi, bậc, định dạng file) | `scripts/lib/labels.mjs` | |
| Nhãn chương trình cạnh mã môn ("CTTT, CQ") | `scripts/lib/program-label.mjs` | |
| Giới hạn file, đuôi file, loại tài liệu, học kỳ, tag Release | `catalog/policy.json` | Đọc qua `scripts/lib/policy.mjs`; Worker đọc cùng file |
| Kiểm dữ liệu, sinh index, v1, README môn | `scripts/lib/repo.mjs`, `scripts/lib/v1.mjs`, `scripts/lib/readme.mjs`; lệnh `scripts/validate.mjs` | v1 chỉ được thêm, không đổi nghĩa (`docs/v1.md`) |
| Một trang web | `scripts/site/pages/`: `home.mjs` (trang chủ), `faculty.mjs` (khoa), `program.mjs` (chương trình), `major.mjs` (ngành), `course.mjs` (môn theo tên, trang từng mã, chuyển hướng mã cũ), `static.mjs` (đóng góp, duyệt bài, gỡ tài liệu) | Mỗi file một hàm `write...Pages(ctx, { lang, t, P })`; `ctx` là dữ liệu chung do `buildSite()` tính một lần |
| Thứ tự dựng, dữ liệu chung `ctx`, trang Gửi tài liệu, 404, robots.txt, sitemap | `scripts/build-site.mjs`: `buildSite()` | |
| Nhãn, chip loại chương trình, bộ chọn khóa, lộ trình, khối kiến thức, danh sách ngành, ghi chú viết tắt | `scripts/site/programs.mjs` | Tên và mã loại lấy từ `scripts/lib/program-types.mjs` |
| Thẻ tài liệu, file, xem trước, yêu cầu gỡ, tài liệu mới | `scripts/site/items.mjs` (`renderItem`, `recentSection`) | |
| Bảng môn | `scripts/site/courses.mjs` | |
| Dữ liệu cho ô tìm (assets/courses.json, items.json) | `scripts/site/data.mjs` | Chỉ web dùng, không thuộc v1 |
| Trạng thái của một lần dựng (ngày dữ liệu, ảnh chia sẻ, đường dẫn trang môn) | `scripts/site/state.mjs` | `buildSite()` đặt một lần |
| Khung trang, CSP, thẻ meta, trang chuyển hướng, sitemap | `scripts/site/layout.mjs`: `layout`, `headMeta`, `cspFor`, `redirectPage` | |
| Ô tìm trang chủ | `site-src/assets/search.js` (giao diện), `search-core.js` (tìm môn), `search-docs.js` (tìm tài liệu), `subject-core.js` (gộp môn cùng tên) | Thay đổi cách tìm môn phải qua `test/search-cases.json` |
| Form Gửi tài liệu | `site-src/pages/vi/gui-tai-lieu.html`, `site-src/assets/upload.js` (giao diện), `upload-core.js` (logic thuần) | Số liệu lấy từ `#upload-config` do `scripts/site/upload-page.mjs` (`uploadPage`) đổ từ `policy.json` |
| Worker: định tuyến | `worker/src/index.mjs` (`createHandler`, `handleView`) | Mỗi việc một file trong `worker/src/routes/` |
| Worker nhận bài | `worker/src/routes/submit.mjs`: `handleSubmit` (kiểm, dựng item và PR), `openSubmission` (ghi khóa phụ, mở PR); kiểm phiếu ở `worker/src/validate.mjs` | |
| Nạp riêng cho chủ dự án (sau Cloudflare Access, không Turnstile) | `worker/src/routes/intake.mjs` (`POST /xem-duyet/nap`), gọi `handleSubmit` với `trusted`; script `scripts/upload/nap.mjs` | Cách dùng: `docs/cai-dat-luong-tai-len.md` mục 8.8 |
| Ô theo loại tài liệu trên form (học kỳ, loại kiểm tra, chương; bắt buộc hay tùy chọn) | `catalog/policy.json` (`typeFields`); form `site-src/pages/vi/gui-tai-lieu.html` (`#type-fields`), `site-src/assets/upload.js` (`syncTypeFields`); kiểm ở `worker/src/validate.mjs` | |
| Tải file lớn theo phần (tới 1 GB) | `worker/src/routes/upload.mjs` (phiên, từng phần, xong); `site-src/assets/upload-chunks.js` (sha256 theo luồng, gửi phần); ngưỡng `directMaxBytes`, `uploadPartBytes` ở `catalog/policy.json` | File trong git giới hạn riêng `maxGitFileBytes` |
| Trang duyệt, nút Hoàn tất | `worker/src/routes/review.mjs` (`handleReview`, `handleDecision`, `continueMerge`), `worker/src/view.mjs` (`reviewBatchPage`), `worker/src/review.mjs` (quyết định, lý do: hàm thuần) | |
| Email kết quả, cron | `worker/src/routes/notify.mjs` (`notifyCode`), `worker/src/notify.mjs` (nội dung email), `worker/src/cron.mjs` (`sweep`); lịch ở `worker/wrangler.jsonc` | Cloudflare chặn runner GitHub gọi Worker nên dùng cron |
| Trang người gửi `/xem/<mã>` | `worker/src/routes/owner.mjs`, `worker/src/view.mjs` (`statusPage`) | |
| Phản hồi JSON, CORS, log lỗi; client GitHub App, danh mục | `worker/src/http.mjs`; `worker/src/deps.mjs` | |
| Quét file, sanitize, comment kết quả | `scripts/upload/check.mjs` (lệnh), `sanitize.mjs`, `report.mjs` (bảng comment) | Workflow `kiem-file.yml` |
| Phân loại tự động (đăng, Chưa phân loại, cần người duyệt), tự merge, gọi người duyệt | `scripts/upload/triage.mjs` (quy tắc), ngưỡng ở `catalog/policy.json` (`triage`); `scripts/upload/check.mjs` (`triageItems`); bước `Tự merge khi check qua`, `Gọi người duyệt` trong `kiem-file.yml`; trang `scripts/site/pages/unclassified.mjs` | Người duyệt theo `.github/CODEOWNERS` (`scripts/upload/reviewers.mjs`) |
| Đưa file lên Release, dọn kho | `scripts/upload/publish.mjs` | Workflow `phat-hanh-file.yml`, `don-kho.yml` |
| Nguồn dữ liệu chính thức, thứ tự nhập | `docs/nguon-du-lieu.md` | Chương trình đã gắn ngành thuộc `import-ctdt`, `import-research` không ghi đè |
| Cách ghi file môn, chương trình, ngành khi nhập (thứ tự khóa, ngày cập nhật) | `scripts/lib/catalog-write.mjs`: `courseRecord`, `writeKeepDate`, `*_ORDER` | Dùng chung cho cả ba script nhập |

## File lớn cần tách (chưa làm)

Các file dưới đây gánh nhiều việc; sửa một chỗ phải đọc nhiều. Khi đụng tới, tách theo cột "Hướng tách", mỗi lần một phần, giữ test xanh và web dựng ra giống hệt.

| File | Dòng | Hướng tách |
|---|---|---|
| `site-src/assets/upload.js` | khoảng 730 | Tách phần chọn môn, đợt gửi nhiều file, gửi và báo lỗi |
| `scripts/upload/check.mjs` | khoảng 660 | `locate`, `scan`, `apply`, CLI riêng |

## Quy ước

- Không ký tự kiểu AI (gạch dài, mũi tên, emoji) trong code, tài liệu, commit; có test `test/style.test.mjs`.
- Thuật ngữ kỹ thuật giữ nguyên (merge, branch, label, item, metadata, sanitize); tên của trường chép đúng nguồn chính thức.
- Không ghi cứng cấu hình: số liệu ở `catalog/policy.json`, `catalog/site.json`, `worker/wrangler.jsonc`.
- Kiểm trước khi gộp: `npm run build`, `npm test`, `cd worker && npm test`. Đổi phần dựng web thì so `site/` trước và sau.
