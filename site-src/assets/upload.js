// Form Gửi tài liệu. Số liệu (đuôi file, kích thước tối đa) và thông báo lấy từ #upload-config,
// do build-site.mjs đổ từ catalog/policy.json, nên file này không giữ số nào.
// Danh sách môn tải từ assets/courses.json (thiếu thì v1/index.json) và tìm bằng search-core.js, cùng logic với ô tìm trên trang chủ.
// Chọn môn theo tên (subject-core.js): môn nhiều mã tự chọn mã thuộc nhiều chương trình nhất, ô "Mã môn (nếu bạn
// biết)" để đổi. Form vẫn gửi một mã môn như cũ.
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
  // Môn mới (khi tìm không thấy môn): logic thuần ở upload-core.js, số liệu ở cfg.newCourse.
  var offer = document.getElementById('new-course-offer');
  var openNew = document.getElementById('new-course-open');
  var newBox = document.getElementById('new-course-box');
  var newCode = document.getElementById('newCourseCode');
  var newName = document.getElementById('newCourseName');
  var suggest = document.getElementById('new-course-suggest');
  var cancelNew = document.getElementById('new-course-cancel');
  var codeBox = document.getElementById('code-box');
  var codeSel = document.getElementById('course-code');
  // Ô giảng viên: danh sách tên đã có của môn (nếu có) và ô gõ tên khác.
  var teacherPickBox = document.getElementById('teacher-pick-box');
  var teacherPick = document.getElementById('teacher-pick');
  var teacherTextBox = document.getElementById('teacher-text-box');
  var teacherLabel = document.getElementById('teacher-label');
  var teacherInput = document.getElementById('teacher');
  var NEW_TEACHER = '__new';
  var nc = cfg.newCourse || {};
  var core = window.BkUpload;
  // Tài liệu đã có (assets/items.json) để cảnh báo trùng tên và chọn tài liệu được thay.
  var titleInput = document.getElementById('title');
  var dupWarn = document.getElementById('dup-warn');
  var dupList = document.getElementById('dup-list');
  var updateField = document.getElementById('update-field');
  var isUpdate = document.getElementById('is-update');
  var updateBox = document.getElementById('update-box');
  var replacesSel = document.getElementById('replaces');
  var allDocs = [];
  var subjectIds = [];
  var docs = [];
  var sn = cfg.sameName || {};
  var MAX_SHOWN = 8;
  var SEARCH_LIMIT = 500;
  var idx = null;
  var index = null;
  var byId = Object.create(null);
  var subjects = { of: Object.create(null), all: Object.create(null) };
  var timer = null;

  // Đợt gửi nhiều file: mỗi file một dòng có tiêu đề title-<i> và loại type-<i>; ô Tiêu đề chung bị ẩn.
  var titleField = document.getElementById('title-field');
  var batchBox = document.getElementById('batch-box');
  var batchList = document.getElementById('batch-list');
  var batchTotal = document.getElementById('batch-total');
  var batchFiles = cfg.batchFiles || 1;
  var batchBytes = cfg.batchBytes || cfg.maxBytes;

  // Chỗ hiện lỗi theo thứ tự trên trang; dựng lại khi danh sách file của đợt gửi đổi. Khóa lạ từ server
  // không tra được thì rơi về dòng chung.
  var errBoxes = Object.create(null);
  var errOrder = [];
  function collectErrBoxes() {
    errBoxes = Object.create(null);
    errOrder = [];
    Array.prototype.forEach.call(form.querySelectorAll('[data-err]'), function (b) {
      errBoxes[b.getAttribute('data-err')] = b;
      errOrder.push(b);
    });
  }
  collectErrBoxes();

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
    if (key === 'teacher' && teacherTextBox.hidden) return teacherPick;
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
    if (isNew()) {
      var r = core.checkNewCourse({ code: newCode.value, name: newName.value }, { pattern: nc.codePattern, nameMax: nc.nameMax, courses: index ? index.courses : [] });
      newCode.value = r.code;
      if (r.existing) {
        // Mã đã có trong thư viện: chọn môn đó thay vì thêm môn mới, để người gửi xem lại rồi gửi.
        select(r.existing.id, true);
        bad('course', msg.courseExists);
      }
      var NEW_MSG = { codeEmpty: msg.newCodeEmpty, codePattern: msg.newCodePattern, nameEmpty: msg.newNameEmpty, nameLong: msg.newNameLong };
      Object.keys(r.errors).forEach(function (k) {
        if (!r.existing) bad(k, NEW_MSG[r.errors[k]]);
      });
    } else if (!courseId.value) bad('course', msg.course);
    if (!typeSel.value) bad('type', msg.type);
    if (!isBatch() && !form.elements.title.value.trim()) bad('title', msg.title);
    if (isBook()) {
      if (!form.elements['book-title'].value.trim() || !form.elements['book-authors'].value.trim()) bad('book', msg.book);
    } else if (isBatch()) {
      var files = chosenFiles();
      var problem = core.batchProblem(files, batchFiles, batchBytes);
      if (problem) bad('file', msg[problem]);
      files.forEach(function (f, i) {
        var t = form.elements['type-' + i].value;
        var exts = (t && (cfg.byType || {})[t]) || cfg.extensions;
        if (!form.elements['title-' + i].value.trim()) bad('title-' + i, msg.title);
        if (!t) bad('type-' + i, msg.type);
        if (cfg.extensions.indexOf(extOf(f.name)) < 0) bad('file-' + i, msg.fileExt);
        else if (exts.indexOf(extOf(f.name)) < 0) bad('file-' + i, msg.fileExtType + ' ' + exts.join(', ') + '.');
        else if (f.size <= 0) bad('file-' + i, msg.fileEmpty);
        else if (f.size > cfg.maxBytes) bad('file-' + i, msg.fileSize);
      });
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
    // Đợt gửi: mỗi file chọn loại riêng, nên ô chọn file nhận mọi đuôi.
    fileInput.setAttribute('accept', (batchFiles > 1 ? cfg.extensions : allowedExts()).join(','));
    renderBatch();
  }

  function chosenFiles() {
    return fileInput.files ? Array.prototype.slice.call(fileInput.files) : [];
  }

  function isBatch() {
    return !isBook() && chosenFiles().length > 1;
  }

  // Mỗi file một dòng: tên và cỡ, ô tiêu đề (gợi ý từ tên file), ô loại (mặc định là loại chung).
  // Giữ chữ đã gõ của file đã có khi đổi lựa chọn file.
  function renderBatch() {
    var on = isBatch();
    var prev = Object.create(null);
    Array.prototype.forEach.call(batchList.children, function (li) {
      prev[li.getAttribute('data-key')] = { title: li.querySelector('input').value, type: li.querySelector('select').value };
    });
    batchList.textContent = '';
    batchBox.hidden = !on;
    titleField.hidden = on;
    titleInput.disabled = on;
    if (updateField) {
      if (on) setUpdate(false);
      updateField.hidden = on || !docs.length;
    }
    if (on) {
      var files = chosenFiles();
      var total = 0;
      files.forEach(function (f, i) {
        total += f.size;
        var key = f.name + '\u0000' + f.size;
        var old = prev[key];
        var li = document.createElement('li');
        li.setAttribute('data-key', key);
        var head = document.createElement('p');
        head.className = 'batch-file';
        head.textContent = msg.batchFile + ' ' + (i + 1) + '/' + files.length + ': ' + f.name + ' (' + core.formatSize(f.size) + ')';
        li.appendChild(head);
        li.appendChild(errLine('file-' + i));
        var tl = document.createElement('label');
        tl.htmlFor = 'title-' + i;
        tl.textContent = msg.batchTitle;
        var ti = document.createElement('input');
        ti.type = 'text';
        ti.id = 'title-' + i;
        ti.name = 'title-' + i;
        ti.maxLength = titleInput.maxLength;
        ti.autocomplete = 'off';
        ti.value = old ? old.title : core.titleFromName(f.name, titleInput.maxLength > 0 ? titleInput.maxLength : 0);
        li.appendChild(tl);
        li.appendChild(ti);
        li.appendChild(errLine('title-' + i));
        var yl = document.createElement('label');
        yl.htmlFor = 'type-' + i;
        yl.textContent = msg.batchType;
        var ys = document.createElement('select');
        ys.id = 'type-' + i;
        ys.name = 'type-' + i;
        Array.prototype.forEach.call(typeSel.options, function (o) {
          if (o.value !== 'book-ref') ys.appendChild(o.cloneNode(true));
        });
        // Dòng chưa chọn loại riêng theo loại chung.
        ys.value = old && old.type ? old.type : typeSel.value;
        li.appendChild(yl);
        li.appendChild(ys);
        li.appendChild(errLine('type-' + i));
        batchList.appendChild(li);
      });
      batchTotal.textContent = files.length + ' ' + msg.batchSum + ' ' + core.formatSize(total) + '. ' + msg.batchLimit;
    }
    collectErrBoxes();
  }

  function errLine(key) {
    var p = document.createElement('p');
    p.className = 'err';
    p.setAttribute('data-err', key);
    p.setAttribute('role', 'alert');
    return p;
  }

  // Ô môn. Chọn một mã: môn nhiều mã thì ô hiện tên môn, mã gửi đi là exact (gõ đúng mã, link ?course=, gợi ý
  // theo mã) hoặc mã thuộc nhiều chương trình nhất; ô Mã môn để đổi.
  function select(id, exact) {
    var ch = core.subjectChoice(window.BkSubject, subjects, byId, id, exact ? id : '');
    var c = byId[ch.id];
    setNew(false);
    courseId.value = ch.id;
    q.value = ch.slug ? ch.name : c.code + ' ' + c.name;
    codeSel.textContent = '';
    ch.codes.forEach(function (x) {
      var o = document.createElement('option');
      o.value = x.id;
      o.textContent = x.code;
      if (x.id === ch.id) o.selected = true;
      codeSel.appendChild(o);
    });
    codeBox.hidden = ch.codes.length < 2;
    list.textContent = '';
    offer.hidden = true;
    errBox('course').textContent = '';
    var group = ch.slug
      ? subjects.all[ch.slug].ids.map(function (x) {
          return byId[x];
        })
      : [c];
    fillTeachers(core.subjectTeachers(group));
    subjectIds = group.map(function (x) {
      return x.id;
    });
    refreshDocs();
  }

  // Tài liệu của môn đang chọn: điền ô "Tài liệu được thay", rồi kiểm trùng tên.
  function refreshDocs() {
    docs = updateField ? core.subjectDocs(allDocs, subjectIds) : [];
    if (!updateField) return;
    replacesSel.textContent = '';
    docs.forEach(function (d) {
      var o = document.createElement('option');
      o.value = d.course + '/' + d.id;
      o.textContent = d.title + ' (' + d.code + ')';
      replacesSel.appendChild(o);
    });
    updateField.hidden = !docs.length || isBatch();
    if (!docs.length) setUpdate(false);
    checkDup();
  }

  function setUpdate(on) {
    if (!updateField) return;
    isUpdate.checked = on;
    updateBox.hidden = !on;
    replacesSel.disabled = !on;
  }

  function checkDup() {
    if (!dupWarn) return;
    var sims = titleInput.value.trim() && docs.length ? core.similarDocs(titleInput.value, docs, window.BkSearch.fold, 3) : [];
    dupList.textContent = '';
    sims.forEach(function (d) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = root + d.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = d.title + ' (' + d.code + ')';
      li.appendChild(a);
      dupList.appendChild(li);
    });
    dupWarn.hidden = !sims.length;
    // Đã chọn bản cập nhật mà chưa đổi tài liệu được thay: gợi ý sẵn tài liệu giống nhất.
    if (sims.length && isUpdate && !isUpdate.checked) replacesSel.value = sims[0].course + '/' + sims[0].id;
  }

  function clearCourse() {
    subjectIds = [];
    refreshDocs();
    courseId.value = '';
    codeBox.hidden = true;
    codeSel.textContent = '';
    fillTeachers([]);
  }

  // Chọn môn có sẵn và thêm môn mới loại trừ nhau: ô môn mới bị ẩn thì cũng bị tắt để không gửi đi.
  function isNew() {
    return !newBox.disabled;
  }

  function setNew(on) {
    newBox.hidden = !on;
    newBox.disabled = !on;
    openNew.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) {
      clearCourse();
      offer.hidden = true;
      list.textContent = '';
    } else {
      suggest.textContent = '';
      errBox('newCourseCode').textContent = '';
      errBox('newCourseName').textContent = '';
    }
  }

  function chip(code) {
    var s = document.createElement('span');
    s.className = 'code';
    s.textContent = code;
    return s;
  }

  // Một dòng gợi ý theo mã (mã gần, mã trùng): nút mã và tên, bấm là chọn đúng mã đó.
  function courseButton(c) {
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button';
    b.appendChild(chip(c.code));
    var name = document.createElement('span');
    name.textContent = c.name;
    b.appendChild(name);
    b.addEventListener('click', function () {
      select(c.id, true);
      typeSel.focus();
    });
    li.appendChild(b);
    return li;
  }

  // Một môn một dòng: tên môn và các mã (tối đa chipsMax, còn lại +N). Bấm là chọn môn.
  function subjectButton(r) {
    var sub = r.slug ? subjects.all[r.slug] : null;
    if (!sub) return courseButton(byId[r.id]);
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button';
    var title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = sub.name;
    var codes = document.createElement('span');
    codes.className = 'row-codes';
    var courses = sub.ids
      .map(function (id) {
        return byId[id];
      })
      .sort(function (a, b) {
        return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
      });
    // Gõ đúng mã thì mã đó đứng đầu.
    if (r.exact) {
      courses = [byId[r.id]].concat(
        courses.filter(function (c) {
          return c.id !== r.id;
        }),
      );
    }
    var chips = core.codeChips(courses, sn.chipsMax || 4);
    chips.codes.forEach(function (code) {
      codes.appendChild(chip(code));
    });
    if (chips.more) {
      var more = document.createElement('span');
      more.className = 'muted';
      more.textContent = '+' + chips.more;
      codes.appendChild(more);
    }
    b.appendChild(title);
    b.appendChild(codes);
    b.addEventListener('click', function () {
      select(r.id, r.exact);
      typeSel.focus();
    });
    li.appendChild(b);
    return li;
  }

  function noteRow(text) {
    var li = document.createElement('li');
    li.className = 'muted';
    li.textContent = text;
    return li;
  }

  // Gợi ý "Có phải môn này?" khi đang thêm môn mới: môn trùng mã, mã gần, tên trùng.
  function renderSuggest() {
    suggest.textContent = '';
    if (!index) return;
    var code = core.normCode(newCode.value);
    var seen = Object.create(null);
    var out = [];
    function add(c) {
      if (c && !seen[c.id] && out.length < MAX_SHOWN) {
        seen[c.id] = true;
        out.push(c);
      }
    }
    if (code) {
      add(core.findCourse(index.courses, code));
      core.nearCodes(index.courses, code, nc.nearSpan || 0).forEach(add);
    }
    core.nameMatches(window.BkSearch, idx, byId, newName.value, 3).forEach(add);
    if (!out.length) return;
    suggest.appendChild(noteRow(msg.maybe));
    out.forEach(function (c) {
      suggest.appendChild(courseButton(c));
    });
  }

  // Giảng viên: môn đã có tên giảng viên trên tài liệu (mọi mã của môn) thì chọn trong danh sách, có lựa chọn
  // thêm tên khác (mở ô gõ). Chưa có tên nào thì chỉ có ô gõ. Ô gõ (name="teacher") luôn là giá trị gửi đi.
  function fillTeachers(names) {
    var has = names.length > 0;
    teacherPick.textContent = '';
    if (has) {
      [['', msg.teacherNone]]
        .concat(
          names.map(function (n) {
            return [n, n];
          }),
        )
        .concat([[NEW_TEACHER, msg.teacherAdd]])
        .forEach(function (x) {
          var o = document.createElement('option');
          o.value = x[0];
          o.textContent = x[1];
          teacherPick.appendChild(o);
        });
      teacherPick.value = '';
    }
    teacherPickBox.hidden = !has;
    teacherTextBox.hidden = has;
    teacherLabel.textContent = has ? msg.teacherOther : msg.teacherLabel;
    teacherInput.value = '';
  }

  teacherPick.addEventListener('change', function () {
    var v = teacherPick.value;
    var other = v === NEW_TEACHER;
    teacherTextBox.hidden = !other;
    teacherInput.value = other ? '' : v;
    if (other) teacherInput.focus();
  });

  codeSel.addEventListener('change', function () {
    if (byId[codeSel.value]) courseId.value = codeSel.value;
  });

  // Kết quả tìm môn. Không có môn khớp, hay gõ mã môn chưa có: gợi ý môn có mã gần ("Có phải môn
  // này?"), rồi mới mời thêm môn mới.
  function renderResults() {
    list.textContent = '';
    offer.hidden = true;
    if (!idx || !q.value.trim() || courseId.value) return;
    // Tìm rộng rồi gộp môn cùng tên, để số mã của mỗi tên là đủ; chỉ hiện MAX_SHOWN dòng đầu.
    var hits = window.BkSearch.search(idx, q.value, { limit: SEARCH_LIMIT });
    var code = core.looksLikeCode(q.value, nc.codePattern) ? core.normCode(q.value) : '';
    var exact = code ? core.findCourse(index.courses, code) : null;
    if (!hits.length) list.appendChild(noteRow(msg.noMatch));
    if (code && !exact) {
      var near = core.nearCodes(index.courses, code, nc.nearSpan || 0).filter(function (c) {
        return !hits.some(function (h) {
          return h.id === c.id;
        });
      });
      if (near.length) {
        list.appendChild(noteRow(msg.maybe));
        near.forEach(function (c) {
          list.appendChild(courseButton(c));
        });
      }
    }
    core
      .subjectRows(hits, subjects)
      .slice(0, MAX_SHOWN)
      .forEach(function (r) {
        list.appendChild(subjectButton(r));
      });
    offer.hidden = isNew() || !(!hits.length || (code && !exact));
  }

  q.addEventListener('input', function () {
    clearCourse();
    clearTimeout(timer);
    timer = setTimeout(renderResults, 80);
  });
  // Enter trong ô môn không gửi form; gõ đúng mã (hoặc mã cũ) của một môn thì chọn ngay môn đó.
  q.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!idx || courseId.value) return;
    var exact = core.exactCode(window.BkSearch.search(idx, q.value, { limit: SEARCH_LIMIT }), byId);
    if (exact) {
      clearTimeout(timer);
      select(exact.id, true);
      typeSel.focus();
    }
  });
  typeSel.addEventListener('change', syncType);
  fileInput.addEventListener('change', renderBatch);

  openNew.addEventListener('click', function () {
    var code = core.looksLikeCode(q.value, nc.codePattern) ? core.normCode(q.value) : '';
    setNew(true);
    if (code && !newCode.value) newCode.value = code;
    renderSuggest();
    (newCode.value ? newName : newCode).focus();
  });
  cancelNew.addEventListener('click', function () {
    setNew(false);
    renderResults();
    q.focus();
  });
  [newCode, newName].forEach(function (el) {
    el.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(renderSuggest, 120);
    });
  });

  function loadCourses(data) {
    index = data;
    index.courses.forEach(function (c) {
      byId[c.id] = c;
    });
    idx = window.BkSearch.prepare(index);
    if (window.BkSubject) subjects = core.subjectIndex(window.BkSubject, index.courses, sn.groupMin || 2);
    q.disabled = false;
    var pre = new URLSearchParams(location.search).get('course');
    if (pre && byId[pre]) select(pre, true);
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

  if (titleInput) {
    var dupTimer = null;
    titleInput.addEventListener('input', function () {
      clearTimeout(dupTimer);
      dupTimer = setTimeout(checkDup, 200);
    });
  }
  if (isUpdate) {
    isUpdate.addEventListener('change', function () {
      setUpdate(isUpdate.checked);
    });
  }
  // Danh sách tài liệu chỉ để cảnh báo trùng và chọn bản được thay: tải lỗi thì form vẫn gửi được.
  if (updateField) {
    getJson(root + 'assets/items.json')
      .then(function (d) {
        allDocs = Array.isArray(d) ? d : d.items || [];
        refreshDocs();
      })
      .catch(function () {});
  }

  // Gửi
  function setBusy(busy) {
    submit.disabled = busy;
    submit.textContent = busy ? msg.busy : msg.send;
  }

  function resetForm() {
    form.reset();
    setUpdate(false);
    if (dupWarn) dupWarn.hidden = true;
    setNew(false);
    clearCourse();
    list.textContent = '';
    offer.hidden = true;
    syncType();
    if (window.turnstile) window.turnstile.reset();
  }

  // Tổng file tới cfg.directBytes thì gửi một request như cũ; lớn hơn thì tải theo phần (upload-chunks.js), nút gửi
  // hiện phần trăm. Kết quả cùng dạng { ok, body } cho phần xử lý chung bên dưới.
  function send() {
    var files = isBook() ? [] : chosenFiles();
    var total = files.reduce(function (n, f) { return n + f.size; }, 0);
    if (!window.BkChunks || total <= cfg.directBytes) {
      return fetch(endpoint, { method: 'POST', body: new FormData(form) }).then(function (r) {
        return r.json().then(
          function (body) {
            return { ok: r.ok, body: body };
          },
          function () {
            return { ok: false, body: null };
          },
        );
      });
    }
    var fields = new FormData(form);
    fields.delete('file');
    return window.BkChunks.upload(endpoint, fields, files, cfg.partBytes, function (p) {
      submit.textContent = msg.uploading + ' ' + Math.round(p * 100) + '%';
    });
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
    send()
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
