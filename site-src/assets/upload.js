// Form Gửi tài liệu. Số liệu (đuôi file, kích thước tối đa) và thông báo lấy từ #upload-config,
// do build-site.mjs đổ từ catalog/policy.json, nên file này không giữ số nào.
// Danh sách môn tải từ v1/index.json và tìm bằng search-core.js, cùng logic với ô tìm trên trang chủ.
(function () {
  'use strict';
  var form = document.getElementById('upload-form');
  var cfgNode = document.getElementById('upload-config');
  if (!form || !cfgNode) return;

  var cfg = JSON.parse(cfgNode.textContent);
  var msg = cfg.msg;
  var endpoint = form.getAttribute('data-endpoint') || '';
  var root = document.documentElement.getAttribute('data-root') || './';

  var q = document.getElementById('course-q');
  var courseId = document.getElementById('course-id');
  var list = document.getElementById('course-results');
  var typeSel = document.getElementById('type');
  var fileBox = document.getElementById('file-box');
  var fileInput = document.getElementById('file');
  var bookBox = document.getElementById('book-box');
  var submit = document.getElementById('submit');
  var statusBox = document.getElementById('upload-status');
  var MAX_SHOWN = 8;
  var idx = null;
  var byId = Object.create(null);
  var timer = null;

  // Chỗ hiện lỗi dựng một lần lúc khởi động; khóa lạ từ server không tra được thì rơi về dòng chung.
  var errBoxes = Object.create(null);
  var errOrder = [];
  Array.prototype.forEach.call(form.querySelectorAll('[data-err]'), function (b) {
    errBoxes[b.getAttribute('data-err')] = b;
    errOrder.push(b);
  });

  function errBox(key) {
    return errBoxes[key] || errBoxes.form;
  }

  function clearErrors() {
    errOrder.forEach(function (b) {
      b.textContent = '';
    });
    statusBox.hidden = true;
    statusBox.textContent = '';
  }

  // Lỗi của ô không có chỗ riêng thì hiện ở dòng chung cuối form.
  function showError(key, text) {
    var box = errBox(key);
    if (!box.textContent) box.textContent = text;
  }

  function fieldOf(key) {
    if (key === 'course') return q;
    if (key === 'confirm') return form.querySelector('[name="confirm-own"]');
    if (key === 'book') return document.getElementById('book-title');
    return form.elements[key] || null;
  }

  // Lỗi đầu tiên theo thứ tự trên trang: đưa người dùng tới đúng ô.
  function focusFirstError() {
    for (var i = 0; i < errOrder.length; i++) {
      if (errOrder[i].textContent) {
        var f = fieldOf(errOrder[i].getAttribute('data-err'));
        if (f) f.focus();
        return;
      }
    }
  }

  function extOf(name) {
    var dot = name.lastIndexOf('.');
    return dot < 0 ? '' : name.slice(dot).toLowerCase();
  }

  function isBook() {
    return typeSel.value === 'book-ref';
  }

  // Đuôi nhận cho loại đang chọn; chưa chọn loại thì mọi đuôi trong policy.
  function allowedExts() {
    var byType = cfg.byType || {};
    return (typeSel.value && byType[typeSel.value]) || cfg.extensions;
  }

  function checkLocal() {
    var n = 0;
    function bad(key, text) {
      showError(key, text);
      n++;
    }
    if (!courseId.value) bad('course', msg.course);
    if (!typeSel.value) bad('type', msg.type);
    if (!form.elements.title.value.trim()) bad('title', msg.title);
    if (isBook()) {
      if (!form.elements['book-title'].value.trim() || !form.elements['book-authors'].value.trim()) bad('book', msg.book);
    } else {
      var file = fileInput.files && fileInput.files[0];
      if (!file) bad('file', msg.file);
      else if (cfg.extensions.indexOf(extOf(file.name)) < 0) bad('file', msg.fileExt);
      else if (allowedExts().indexOf(extOf(file.name)) < 0) bad('file', msg.fileExtType + ' ' + allowedExts().join(', ') + '.');
      else if (file.size <= 0) bad('file', msg.fileEmpty);
      else if (file.size > cfg.maxBytes) bad('file', msg.fileSize);
    }
    if (!form.elements['confirm-own'].checked || !form.elements['confirm-license'].checked || !form.elements['confirm-not-book'].checked) bad('confirm', msg.confirm);
    return n === 0;
  }

  // Đổi loại: sách thì ẩn ô file, hiện ô sách. Ô bị ẩn cũng bị vô hiệu để không gửi đi.
  function syncType() {
    var book = isBook();
    fileBox.hidden = book;
    fileInput.disabled = book;
    bookBox.hidden = !book;
    bookBox.disabled = !book;
    fileInput.setAttribute('accept', allowedExts().join(','));
  }

  // Ô môn
  function select(id) {
    var c = byId[id];
    courseId.value = id;
    q.value = c.code + ' ' + c.name + (c.ctx ? ' (' + c.ctx + ')' : '');
    list.textContent = '';
    errBox('course').textContent = '';
    fillTeachers(c.teachers || []);
  }

  // Gợi ý tên giảng viên đã có ở môn này, để cùng một người không thành nhiều cách viết.
  function fillTeachers(names) {
    var dl = document.getElementById('teacher-list');
    if (!dl) return;
    dl.textContent = '';
    names.forEach(function (n) {
      var o = document.createElement('option');
      o.value = n;
      dl.appendChild(o);
    });
  }

  function renderResults() {
    list.textContent = '';
    if (!idx || !q.value.trim() || courseId.value) return;
    var hits = window.BkSearch.search(idx, q.value, { limit: MAX_SHOWN });
    if (!hits.length) {
      var none = document.createElement('li');
      none.className = 'muted';
      none.textContent = msg.noMatch;
      list.appendChild(none);
      return;
    }
    hits.slice(0, MAX_SHOWN).forEach(function (h) {
      var c = byId[h.id];
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = c.code;
      var name = document.createElement('span');
      name.textContent = c.name;
      b.appendChild(code);
      b.appendChild(name);
      // Môn trùng tên (Đồ án tốt nghiệp...): ghi ngành để chọn đúng mã.
      if (c.ctx) {
        var ctx = document.createElement('span');
        ctx.className = 'muted';
        ctx.textContent = c.ctx;
        b.appendChild(ctx);
      }
      b.addEventListener('click', function () {
        select(c.id);
        typeSel.focus();
      });
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  q.addEventListener('input', function () {
    courseId.value = '';
    fillTeachers([]);
    clearTimeout(timer);
    timer = setTimeout(renderResults, 80);
  });
  typeSel.addEventListener('change', syncType);

  function loadCourses(index) {
    index.courses.forEach(function (c) {
      byId[c.id] = c;
    });
    idx = window.BkSearch.prepare(index);
    q.disabled = false;
    var pre = new URLSearchParams(location.search).get('course');
    if (pre && byId[pre]) select(pre);
  }

  // Danh sách môn: bản gọn của web (assets/courses.json, có ngữ cảnh môn trùng tên); thiếu thì dùng v1.
  function getJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }
  if (window.BkSearch) {
    getJson(root + 'assets/courses.json')
      .catch(function () {
        return getJson(root + 'v1/index.json');
      })
      .then(loadCourses)
      .catch(function () {
        showError('course', msg.loadFail);
      });
  }

  // Gửi
  function setBusy(busy) {
    submit.disabled = busy;
    submit.textContent = busy ? msg.busy : msg.send;
  }

  function resetForm() {
    fillTeachers([]);
    form.reset();
    courseId.value = '';
    list.textContent = '';
    syncType();
    if (window.turnstile) window.turnstile.reset();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    if (!endpoint) return;
    if (!checkLocal()) {
      focusFirstError();
      return;
    }
    setBusy(true);
    fetch(endpoint, { method: 'POST', body: new FormData(form) })
      .then(function (r) {
        return r.json().then(
          function (body) {
            return { ok: r.ok, body: body };
          },
          function () {
            return { ok: false, body: null };
          },
        );
      })
      .then(function (res) {
        setBusy(false);
        var body = res.body;
        if (res.ok && body && body.ok && typeof body.code === 'string') {
          statusBox.textContent = msg.done + ' ' + body.code + '. ' + msg.waiting;
          // Link xem bài (có mã bí mật) chỉ hiện một lần; chỉ nhận địa chỉ https.
          if (typeof body.viewUrl === 'string' && /^https:\/\//.test(body.viewUrl)) {
            var view = document.createElement('a');
            view.href = body.viewUrl;
            view.rel = 'noopener noreferrer';
            view.textContent = body.viewUrl;
            statusBox.appendChild(document.createTextNode(' ' + msg.viewLink + ': '));
            statusBox.appendChild(view);
            statusBox.appendChild(document.createTextNode('. ' + msg.viewSave));
          }
          statusBox.hidden = false;
          resetForm();
          statusBox.scrollIntoView({ block: 'nearest' });
          return;
        }
        // Chỉ hiện chữ ở các trường lỗi đã biết của Worker; còn lại dùng câu cố định.
        var shown = false;
        if (body && body.errors && typeof body.errors === 'object') {
          Object.keys(body.errors).forEach(function (k) {
            if (typeof body.errors[k] === 'string') {
              showError(k, body.errors[k]);
              shown = true;
            }
          });
        } else if (body && typeof body.error === 'string') {
          showError('form', body.error);
          shown = true;
        }
        if (!shown) showError('form', msg.failed);
        if (window.turnstile) window.turnstile.reset();
        focusFirstError();
      })
      .catch(function () {
        setBusy(false);
        showError('form', msg.failed);
        if (window.turnstile) window.turnstile.reset();
      });
  });

  syncType();
})();
