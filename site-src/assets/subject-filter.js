// Lọc tài liệu trên trang môn theo tên (mon/<slug>/): theo mã môn (#f-course) và loại tài liệu (#f-type).
// Chỉ ẩn, hiện thẻ có sẵn trên trang (data-course, data-type); lựa chọn nằm trên địa chỉ trang (?ma=, ?loai=)
// để link chia sẻ được. Không có JavaScript thì khối lọc vẫn ẩn và mọi tài liệu vẫn hiện.
(function () {
  'use strict';
  var box = document.getElementById('doc-filters');
  if (!box) return;
  var selCourse = document.getElementById('f-course');
  var selType = document.getElementById('f-type');
  var status = document.getElementById('f-status');
  var strings = {};
  try {
    strings = JSON.parse(document.getElementById('filter-strings').textContent);
  } catch (e) {
    // Thiếu chữ: vẫn lọc, chỉ không ghi số.
  }
  var items = Array.prototype.slice.call(document.querySelectorAll('li.item[data-course]'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('section.group'));

  function countText(n) {
    var c = strings.count || [];
    return n === 0 ? c[0] || '' : n === 1 ? c[1] || '' : String(c[2] || '').replace('{n}', n);
  }

  function setIfOption(sel, v) {
    if (!sel || !v) return;
    for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === v) sel.value = v;
  }

  function apply() {
    var course = selCourse ? selCourse.value : '';
    var type = selType ? selType.value : '';
    var shown = 0;
    items.forEach(function (li) {
      var ok = (!course || li.getAttribute('data-course') === course) && (!type || li.getAttribute('data-type') === type);
      li.hidden = !ok;
      if (ok && !li.classList.contains('is-removed')) shown++;
    });
    groups.forEach(function (g) {
      var any = g.querySelector('li.item[data-course]:not([hidden])');
      g.hidden = !any;
      // Đang lọc: mở phần "Xem thêm" để thấy đủ tài liệu khớp.
      Array.prototype.forEach.call(g.querySelectorAll('details.more-items'), function (d) {
        if (course || type) d.open = true;
      });
    });
    if (status) status.textContent = course || type ? countText(shown) : '';
    try {
      var params = new URLSearchParams(location.search);
      if (course) params.set('ma', course);
      else params.delete('ma');
      if (type) params.set('loai', type);
      else params.delete('loai');
      var s = params.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
    } catch (e) {
      // Trình duyệt chặn history: bỏ qua, lọc vẫn chạy.
    }
  }

  try {
    var start = new URLSearchParams(location.search);
    setIfOption(selCourse, start.get('ma'));
    setIfOption(selType, start.get('loai'));
  } catch (e) {
    // Địa chỉ lạ: bỏ qua.
  }
  [selCourse, selType].forEach(function (s) {
    if (s) s.addEventListener('change', apply);
  });
  box.hidden = false;
  if ((selCourse && selCourse.value) || (selType && selType.value)) apply();
})();
