// Ô tìm trên trang chủ: môn (v1/index.json, search-core.js, cùng logic với app BK Study Desk) và
// chương trình (assets/programs.json), kèm lọc theo khoa. Câu tìm và khoa nằm trên địa chỉ trang
// (?q=, ?khoa=) để link chia sẻ được. Chạy hoàn toàn trên máy người xem, không gửi chữ gõ đi đâu.
(function () {
  'use strict';
  var input = document.getElementById('q');
  var list = document.getElementById('q-results');
  var status = document.getElementById('q-status');
  var facSel = document.getElementById('q-fac');
  var progBox = document.getElementById('q-prog');
  var progList = document.getElementById('q-prog-list');
  var PROG_MAX = 8;
  var programs = null;
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

  function displayName(c) {
    return en && c.nameEn ? c.nameEn : c.name;
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

  // Chương trình khớp khi mọi từ gõ là đầu một từ trong tên, loại, khóa hoặc mã chương trình.
  function matchPrograms(query, fac) {
    if (!programs) return [];
    var tokens = window.BkSearch.fold(query).split(' ').filter(Boolean);
    if (!tokens.length) return [];
    var phrase = tokens.join(' ');
    return programs
      .filter(function (p) {
        if (fac && p.faculty !== fac) return false;
        return tokens.every(function (t) {
          return p.words.some(function (w) { return w.indexOf(t) === 0; });
        });
      })
      .map(function (p) {
        // Thứ tự: tên trùng cụm đã gõ, tên bắt đầu bằng cụm đó, tên chứa liền cụm đó, còn lại.
        // Cùng mức thì chương trình đã có danh sách môn trước, rồi khóa mới trước.
        var at = p.folded.indexOf(phrase);
        return { p: p, head: p.folded === phrase ? 0 : at === 0 ? 1 : at > 0 ? 2 : 3 };
      })
      .sort(function (a, b) {
        return a.head - b.head || (b.p.courses ? 1 : 0) - (a.p.courses ? 1 : 0) || (b.p.year || '').localeCompare(a.p.year || '') || a.p.name.localeCompare(b.p.name);
      })
      .map(function (x) {
        return x.p;
      });
  }

  function renderPrograms(hits) {
    if (!progBox || !progList) return;
    progList.textContent = '';
    progBox.hidden = !hits.length;
    hits.slice(0, PROG_MAX).forEach(function (p) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = root + prefix + 'program/' + encodeURIComponent(p.code) + '/';
      var name = document.createElement('span');
      var label = en && p.nameEn ? p.nameEn : p.name;
      // Tên đã ghi năm khóa thì không ghi lại.
      name.textContent = p.year && label.indexOf(p.year) < 0 ? label + ' (' + p.year + ')' : label;
      var meta = document.createElement('span');
      meta.className = 'muted';
      var parts = [facultyName[p.faculty] || p.faculty];
      if (p.variant) parts.push(p.variant);
      parts.push(p.courses ? (en ? p.courses + ' courses' : p.courses + ' môn') : en ? 'no course list yet' : 'chưa có danh sách môn');
      meta.textContent = parts.join(', ');
      a.appendChild(name);
      a.appendChild(meta);
      li.appendChild(a);
      progList.appendChild(li);
    });
    if (hits.length > PROG_MAX) {
      var more = document.createElement('li');
      more.className = 'muted';
      more.textContent = en ? hits.length - PROG_MAX + ' more programs. Type the intake year to narrow down.' : 'Còn ' + (hits.length - PROG_MAX) + ' chương trình nữa. Gõ thêm năm khóa để thu hẹp.';
      progList.appendChild(more);
    }
  }

  // Ghi câu tìm và khoa lên địa chỉ trang, không thêm mục vào lịch sử trình duyệt.
  function syncUrl() {
    try {
      var params = new URLSearchParams(location.search);
      var q = input.value.trim();
      var fac = facSel ? facSel.value : '';
      if (q) params.set('q', q);
      else params.delete('q');
      if (fac) params.set('khoa', fac);
      else params.delete('khoa');
      var s = params.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
    } catch (e) {
      // Trình duyệt chặn history: bỏ qua, tìm kiếm vẫn chạy.
    }
  }

  function run() {
    list.textContent = '';
    syncUrl();
    var fac = facSel ? facSel.value : '';
    renderPrograms(input.value.trim() ? matchPrograms(input.value, fac) : []);
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
    // Môn trùng tên (Đồ án tốt nghiệp, Thực tập ngoài trường) phân biệt bằng mã môn và tên khoa;
    // v1 không có danh sách chương trình nên chưa hiện được ngành.
    hits.slice(0, MAX).forEach(function (h) {
      var c = byId[h.id];
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = root + prefix + 'course/' + encodeURIComponent(c.id) + '/';
      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = c.code;
      var name = document.createElement('span');
      name.textContent = displayName(c);
      var meta = document.createElement('span');
      meta.className = 'muted';
      // Đã lọc theo khoa thì không lặp tên khoa ở từng dòng.
      var parts = fac ? [] : [facultyName[c.faculty] || c.faculty];
      // Mã bị trường dùng lại cho môn khác: hai môn cùng mã, ID kèm năm khóa phân biệt.
      if (c.id !== c.code) parts.push('ID ' + c.id);
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
    var getJson = function (url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
    };
    // Thiếu danh sách chương trình thì vẫn tìm môn bình thường.
    var progs = getJson(root + 'assets/programs.json').catch(function () {
      return [];
    });
    Promise.all([getJson(root + 'v1/index.json'), progs])
      .then(function (res) {
        programs = (Array.isArray(res[1]) ? res[1] : []).map(function (p) {
          var text = [p.name, p.nameEn, p.variant, p.year, p.code.replace(/_/g, ' ')].filter(Boolean).join(' ');
          return { code: p.code, name: p.name, nameEn: p.nameEn, year: p.year, variant: p.variant, faculty: p.faculty, courses: p.courses, words: window.BkSearch.fold(text).split(' '), folded: window.BkSearch.fold(en && p.nameEn ? p.nameEn : p.name) };
        });
        load(res[0]);
      })
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
  // Link có sẵn câu tìm hoặc khoa (?q=, ?khoa=), ví dụ từ tên giảng viên trên trang môn.
  try {
    var start = new URLSearchParams(location.search);
    if (start.get('q')) input.value = start.get('q');
    if (facSel && start.get('khoa') && facSel.querySelector('option[value="' + start.get('khoa').replace(/[^a-z0-9-]/gi, '') + '"]')) facSel.value = start.get('khoa');
  } catch (e) {
    // Địa chỉ lạ: bỏ qua.
  }
  if (input.value || (facSel && facSel.value)) ensureIndex();
})();
