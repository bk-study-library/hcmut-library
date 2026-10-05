# Bản đồ code

Đọc file này trước khi sửa. Mỗi việc có một chỗ đúng; tìm chỗ đó ở bảng "Muốn sửa gì, vào đâu" rồi đọc phần đầu file (mỗi file có ghi chú mục đích ở đầu). Nếu việc mới không có chỗ nào hợp thì tách thành file riêng trong đúng thư mục, không nhét vào file đang có.

## Luồng dữ liệu

```
nguồn chính thức (Sổ tay, CTĐT, tuyển sinh; docs/nguon-du-lieu.md)
  scripts/import-research.mjs, import-ctdt.mjs (+ import-sdh.mjs)      nhập, chạy tay
catalog/ (môn, ngành, chương trình, khoa, cấu hình)   courses/<môn>/items/ (tài liệu)
  scripts/validate.mjs --write  (npm run build)                       kiểm và sinh file
index.json, index.min.json, worker-catalog.json, v1/ (API công khai), courses/<môn>/README.md
  scripts/build-site.mjs  (npm run site)                               dựng web
site/ (GitHub Pages, workflow pages.yml)
```

Gửi tài liệu:

```
form web (site-src/assets/upload.js)
  Worker (worker/src/index.mjs, handleSubmit): kiểm, lưu file vào R2 (bucket quarantine), bot mở PR upload/<mã bài>
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
| Một trang web | `scripts/build-site.mjs`, trong `buildSite()` tìm ghi chú `// Trang chủ`, `// Trang khoa`, `// Trang chương trình`, `// Trang ngành`, `// Trang môn theo tên`, `// Trang môn của từng mã`, `// Trang tĩnh` | Phần dựng HTML dùng chung ở `scripts/site/` (bảng dưới) |
| Nhãn, chip loại chương trình, bộ chọn khóa, lộ trình, khối kiến thức, danh sách ngành, ghi chú viết tắt | `scripts/site/programs.mjs` | Tên và mã loại lấy từ `scripts/lib/program-types.mjs` |
| Thẻ tài liệu, file, xem trước, yêu cầu gỡ, tài liệu mới | `scripts/site/items.mjs` (`renderItem`, `recentSection`) | |
| Bảng môn | `scripts/site/courses.mjs` | |
| Dữ liệu cho ô tìm (assets/courses.json, items.json) | `scripts/site/data.mjs` | Chỉ web dùng, không thuộc v1 |
| Trạng thái của một lần dựng (ngày dữ liệu, ảnh chia sẻ, đường dẫn trang môn) | `scripts/site/state.mjs` | `buildSite()` đặt một lần |
| Khung trang, CSP, thẻ meta, trang chuyển hướng, sitemap | `scripts/site/layout.mjs`: `layout`, `headMeta`, `cspFor`, `redirectPage` | |
| Ô tìm trang chủ | `site-src/assets/search.js` (giao diện), `search-core.js` (tìm môn), `search-docs.js` (tìm tài liệu), `subject-core.js` (gộp môn cùng tên) | Thay đổi cách tìm môn phải qua `test/search-cases.json` |
| Form Gửi tài liệu | `site-src/pages/vi/gui-tai-lieu.html`, `site-src/assets/upload.js` (giao diện), `upload-core.js` (logic thuần) | Số liệu lấy từ `#upload-config` do `scripts/site/upload-page.mjs` (`uploadPage`) đổ từ `policy.json` |
| Worker nhận bài | `worker/src/index.mjs`: `handleSubmit`; kiểm phiếu ở `worker/src/validate.mjs` | |
| Trang duyệt, nút Hoàn tất | `worker/src/view.mjs` (`reviewBatchPage`), `worker/src/review.mjs` (quyết định, lý do), `worker/src/index.mjs` (`handleReview`, `handleDecision`, `continueMerge`) | |
| Email kết quả, cron | `worker/src/notify.mjs`; `worker/src/index.mjs`: `notifyCode`, `sweep`; lịch ở `worker/wrangler.jsonc` | Cloudflare chặn runner GitHub gọi Worker nên dùng cron |
| Quét file, sanitize, comment kết quả | `scripts/upload/check.mjs` (lệnh), `sanitize.mjs`, `report.mjs` (bảng comment) | Workflow `kiem-file.yml` |
| Đưa file lên Release, dọn kho | `scripts/upload/publish.mjs` | Workflow `phat-hanh-file.yml`, `don-kho.yml` |
| Nguồn dữ liệu chính thức, thứ tự nhập | `docs/nguon-du-lieu.md` | Chương trình đã gắn ngành thuộc `import-ctdt`, `import-research` không ghi đè |
| Cách ghi file môn, chương trình, ngành khi nhập (thứ tự khóa, ngày cập nhật) | `scripts/lib/catalog-write.mjs`: `courseRecord`, `writeKeepDate`, `*_ORDER` | Dùng chung cho cả ba script nhập |

## File lớn cần tách (chưa làm)

Các file dưới đây gánh nhiều việc; sửa một chỗ phải đọc nhiều. Khi đụng tới, tách theo cột "Hướng tách", mỗi lần một phần, giữ test xanh và web dựng ra giống hệt.

| File | Dòng | Hướng tách |
|---|---|---|
| `scripts/build-site.mjs` | khoảng 800 (`buildSite()` khoảng 730) | Hàm dùng chung đã tách sang `scripts/site/`. Còn lại: mỗi loại trang một file `scripts/site/pages/*.mjs`; `buildSite()` chỉ điều phối |
| `worker/src/index.mjs` | khoảng 750 | `routes/submit.mjs`, `routes/review.mjs`, `notify` và `cron` riêng; `index.mjs` chỉ định tuyến |
| `site-src/assets/upload.js` | khoảng 730 | Tách phần chọn môn, đợt gửi nhiều file, gửi và báo lỗi |
| `scripts/upload/check.mjs` | khoảng 660 | `locate`, `scan`, `apply`, CLI riêng |

## Quy ước

- Không ký tự kiểu AI (gạch dài, mũi tên, emoji) trong code, tài liệu, commit; có test `test/style.test.mjs`.
- Thuật ngữ kỹ thuật giữ nguyên (merge, branch, label, item, metadata, sanitize); tên của trường chép đúng nguồn chính thức.
- Không ghi cứng cấu hình: số liệu ở `catalog/policy.json`, `catalog/site.json`, `worker/wrangler.jsonc`.
- Kiểm trước khi gộp: `npm run build`, `npm test`, `cd worker && npm test`. Đổi phần dựng web thì so `site/` trước và sau.
