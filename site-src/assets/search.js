// Tìm môn trên trang chủ. Chạy hoàn toàn trên máy người xem: tải index.min.json
// một lần, so khớp không dấu. Không gửi chữ người dùng gõ đi đâu.
(function () {
  'use strict';
  var input = document.getElementById('q');
  var list = document.getElementById('q-results');
  var status = document.getElementById('q-status');
  if (!input || !list) return;

  var html = document.documentElement;
  var root = html.getAttribute('data-root') || './';
  var prefix = html.getAttribute('data-lang-prefix') || '';
  var strings = JSON.parse(document.getElementById('search-strings').textContent);
  var en = strings.lang === 'en';
  var MAX = 30;
  var courses = [];

  function fold(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }

  function countText(n) {
    if (n === 0) return strings.results[0];
    if (en) return n + ' matching ' + (n === 1 ? 'course' : 'courses');
    return n + ' môn khớp';
  }

  function moreText(n) {
    return en ? 'Showing the first 30; ' + n + ' more. Type more to narrow down.' : 'Hiện 30 môn đầu, còn ' + n + ' môn nữa. Gõ thêm để thu hẹp.';
  }

  function load(index) {
    index.faculties.forEach(function (f) {
      var fname = (en ? f.name.en : f.name.vi) || f.name.vi;
      f.courses.forEach(function (c) {
        var codes = [c.code, c.id].concat((c.aliases || []).map(function (a) { return a.code; }));
        var names = [c.name, c.nameEn || ''].concat((c.aliases || []).map(function (a) { return a.name; }));
        courses.push({
          id: c.id,
          code: c.code,
          name: en && c.nameEn ? c.nameEn : c.name,
          faculty: fname,
          retired: c.status === 'retired',
          items: (c.items || []).filter(function (i) { return !i.removed; }).length,
          codes: codes.map(fold),
          hay: fold(codes.concat(names).join(' ')),
        });
      });
    });
    input.disabled = false;
    if (input.value) run();
  }

  function score(c, q, tokens) {
    for (var i = 0; i < tokens.length; i++) if (c.hay.indexOf(tokens[i]) < 0) return -1;
    if (c.codes.indexOf(q) >= 0) return 0;
    for (var j = 0; j < c.codes.length; j++) if (c.codes[j].indexOf(q) === 0) return 1;
    return c.retired ? 3 : 2;
  }

  function run() {
    var q = fold(input.value).trim();
    list.textContent = '';
    if (!q) {
      status.textContent = '';
      return;
    }
    var tokens = q.split(/\s+/);
    var hits = [];
    courses.forEach(function (c) {
      var s = score(c, q, tokens);
      if (s >= 0) hits.push({ c: c, s: s });
    });
    hits.sort(function (a, b) { return a.s - b.s || a.c.code.localeCompare(b.c.code); });
    status.textContent = countText(hits.length) + (hits.length > MAX ? '. ' + moreText(hits.length - MAX) : '');
    hits.slice(0, MAX).forEach(function (h) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = root + prefix + 'course/' + encodeURIComponent(h.c.id) + '/';
      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = h.c.code;
      var name = document.createElement('span');
      name.textContent = h.c.name;
      var meta = document.createElement('span');
      meta.className = 'muted';
      meta.textContent = h.c.faculty + (h.c.items ? (en ? ', ' + h.c.items + ' items' : ', ' + h.c.items + ' tài liệu') : '');
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

  fetch(root + 'index.min.json')
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(load)
    .catch(function () {
      status.textContent = en ? "Couldn't load the course list. Reload the page to try again." : 'Không tải được danh sách môn. Tải lại trang để thử lại.';
    });
})();
