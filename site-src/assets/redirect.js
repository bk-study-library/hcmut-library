// Trang chuyển hướng (mã môn cũ, mã thuộc môn nhiều mã): chuyển ngay tới địa chỉ trong thẻ meta refresh và giữ
// phần #id của link cũ, để link tới một tài liệu (course/<ID>/#id) vẫn mở đúng tài liệu trên trang mới.
(function () {
  'use strict';
  var meta = document.querySelector('meta[http-equiv="refresh"]');
  if (!meta) return;
  var url = (meta.getAttribute('content') || '').replace(/^\s*\d+\s*;\s*url=/i, '');
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url)) location.replace(url + location.hash);
})();
