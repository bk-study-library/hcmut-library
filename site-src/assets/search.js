// Ô tìm môn trên trang chủ, kèm lọc theo khoa. Tải v1/index.json một lần, tìm bằng search-core.js
// (cùng logic với app BK Study Desk). Chạy hoàn toàn trên máy người xem, không gửi chữ người dùng gõ đi đâu.
(function () {
  'use strict';
  var input = document.getElementById('q');
  var list = document.getElementById('q-results');
  var status = document.getElementById('q-status');
  var facSel = document.getElementById('q-fac');
  if (!input || !list || !window.BkSearch) return;

  var html = document.documentElement;
  var root = html.getAttribute('data-root') || './';
  var prefix = html.getAttribute('data-lang-prefix') || '';
  var strings = JSON.parse(document.getElementById('search-strings').textContent);
  var en = strings.lang === 'en';
  var MAX = 30;
  var idx = null;
  var byId = {};
  var facultyName = {};

  function countText(n) {
    if (n === 0) return strings.results[0];
    if (en) return n + ' matching ' + (n === 1 ? 'course' : 'courses');
    return n + ' môn khớp';
  }

  function moreText(n) {
    return en ? 'Showing the first 30; ' + n + ' more. Type more to narrow down.' : 'Hiện 30 môn đầu, còn ' + n + ' môn nữa. Gõ thêm để thu hẹp.';
  }

  function facultyText(n, key) {
    var name = facultyName[key] || key;
    if (!n) return en ? 'No courses listed for ' + name + ' yet.' : name + ' chưa có môn nào trong danh mục.';
    return en ? n + ' courses in ' + name + ', most materials first.' : name + ' có ' + n + ' môn, môn nhiều tài liệu xếp trước.';
  }

  function load(index) {
    index.faculties.forEach(function (f) {
      facultyName[f.key] = (en ? f.name.en : f.name.vi) || f.name.vi;
    });
    index.courses.forEach(function (c) {
      byId[c.id] = c;
    });
    idx = window.BkSearch.prepare(index);
    input.disabled = false;
    if (input.value || (facSel && facSel.value)) run();
  }

  function run() {
    list.textContent = '';
    var fac = facSel ? facSel.value : '';
    if (!idx || (!input.value.trim() && !fac)) {
      status.textContent = '';
      return;
    }
    var opts = { limit: 10000, faculty: fac || undefined };
    var hits;
    if (input.value.trim()) {
      hits = window.BkSearch.search(idx, input.value, opts);
      status.textContent = countText(hits.length) + (hits.length > MAX ? '. ' + moreText(hits.length - MAX) : '');
    } else {
      hits = window.BkSearch.list(idx, opts);
      status.textContent = facultyText(hits.length, fac) + (hits.length > MAX ? ' ' + (en ? 'Showing the first 30. Type to narrow down.' : 'Hiện 30 môn đầu, gõ tên môn để thu hẹp.') : '');
    }
    hits.slice(0, MAX).forEach(function (h) {
      var c = byId[h.id];
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = root + prefix + 'course/' + encodeURIComponent(c.id) + '/';
      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = c.code;
      var name = document.createElement('span');
      name.textContent = en && c.nameEn ? c.nameEn : c.name;
      var meta = document.createElement('span');
      meta.className = 'muted';
      // Đã lọc theo khoa thì không lặp tên khoa ở từng dòng.
      var parts = fac ? [] : [facultyName[c.faculty] || c.faculty];
      if (c.status === 'retired') parts.push(en ? 'retired' : 'đã ngừng');
      if (c.items) parts.push(en ? c.items + ' items' : c.items + ' tài liệu');
      if (h.teacher) parts.push(strings.teacher + ': ' + h.teacher);
      meta.textContent = parts.join(', ');
      a.appendChild(code);
      a.appendChild(name);
      a.appendChild(meta);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(run, 80);
  });

  // Chỉ tải danh sách môn khi bạn sắp dùng ô tìm (rê chuột, chạm, bấm vào ô), để trang chủ mở nhanh.
  var requested = false;
  function ensureIndex() {
    if (requested) return;
    requested = true;
    if (input.value.trim()) status.textContent = en ? 'Loading the course list.' : 'Đang tải danh sách môn.';
    fetch(root + 'v1/index.json')
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(load)
      .catch(function () {
        requested = false;
        status.textContent = en ? "Couldn't load the course list. Try again in a moment." : 'Không tải được danh sách môn. Thử lại sau ít phút.';
      });
  }
  ['pointerenter', 'touchstart', 'focus', 'keydown', 'input'].forEach(function (ev) {
    input.addEventListener(ev, ensureIndex, { passive: true });
    if (facSel) facSel.addEventListener(ev, ensureIndex, { passive: true });
  });
  if (facSel) facSel.addEventListener('change', function () {
    ensureIndex();
    run();
  });
  if (input.value || (facSel && facSel.value)) ensureIndex();
})();
