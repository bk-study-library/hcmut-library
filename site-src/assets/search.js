// Ô tìm trên trang chủ: môn (assets/courses.json, bản gọn của v1/index.json; search-core.js, cùng logic với app BK Study Desk;
// mã cùng tên gộp thành một môn theo subject-core.js, cùng quy tắc với trang mon/<slug>/),
// chương trình (assets/programs.json) và tài liệu (assets/items.json, search-docs.js), kèm lọc theo
// bậc, khoa, loại tài liệu, học kỳ, kỳ thi. Câu tìm và bộ lọc nằm trên địa chỉ trang (?q=, ?bac=, ?khoa=,
// ?loai=, ?hk=, ?ky=) để link chia sẻ được. Môn có tài liệu xếp trước môn chưa có (chỉ đổi thứ tự). Chạy hoàn toàn trên máy người xem, không gửi chữ gõ đi đâu.
(function () {
  'use strict';
  var input = document.getElementById('q');
  var list = document.getElementById('q-results');
  var status = document.getElementById('q-status');
  var facSel = document.getElementById('q-fac');
  // Bậc: mặc định đại học (không ghi lên địa chỉ trang), Thạc sĩ, Tiến sĩ, Tất cả.
  var levelSel = document.getElementById('q-level');
  var DEFAULT_LEVEL = 'dai-hoc';
  var progBox = document.getElementById('q-prog');
  var progList = document.getElementById('q-prog-list');
  var docBox = document.getElementById('q-docs');
  var docList = document.getElementById('q-docs-list');
  var docStatus = document.getElementById('q-docs-status');
  // Bộ lọc tài liệu: id ô chọn, tên tham số trên địa chỉ trang, khóa trong bộ lọc của BkDocs.
  var DOC_FILTERS = [
    ['q-type', 'loai', 'type'],
    ['q-term', 'hk', 'term'],
    ['q-kind', 'ky', 'examKind'],
  ]
    .map(function (f) {
      return { el: document.getElementById(f[0]), param: f[1], key: f[2] };
    })
    .filter(function (f) {
      return f.el;
    });
  var PROG_MAX = 8;
  var programs = null;
  var docs = null;
  if (!input || !list || !window.BkSearch) return;

  var html = document.documentElement;
  var root = html.getAttribute('data-root') || './';
  var prefix = html.getAttribute('data-lang-prefix') || '';
  var strings = JSON.parse(document.getElementById('search-strings').textContent);
  var en = strings.lang === 'en';
  var ds = strings.docs || {};
  var DOC_MAX = ds.max || 10;
  var MAX = 30;
  // Từ bấy nhiêu mã cùng tên thì là một môn có trang mon/<slug>/ (sameNameGroupMin trong site.json).
  var GROUP_MIN = strings.groupMin || 2;
  // Dòng môn nhiều mã: hiện tối đa bấy nhiêu mã, còn lại ghi +N (sameNameChipsMax).
  var CHIPS_MAX = strings.chipsMax || 4;
  var idx = null;
  var byId = {};
  var facultyName = {};
  // Môn theo tên: id mã -> slug, slug -> { ids, name }. Tính một lần khi nạp bằng BkSubject.groups.
  var subjectOf = {};
  var subjects = {};

  function countText(n) {
    if (n === 0) return strings.results[0];
    if (en) return n + ' matching ' + (n === 1 ? 'course' : 'courses');
    return n + ' môn khớp';
  }

  function moreText(n) {
    return en ? n + ' more not shown. Type more to narrow down.' : 'Còn ' + n + ' môn nữa. Gõ thêm để thu hẹp.';
  }

  function facultyText(n, key) {
    var name = facultyName[key] || key;
    if (!n) return en ? 'No courses listed for ' + name + ' yet.' : name + ' chưa có môn nào trong danh mục.';
    return en ? n + ' courses in ' + name + ', most materials first.' : name + ' có ' + n + ' môn, môn nhiều tài liệu xếp trước.';
  }

  // Nhãn bậc sau đại học theo ngôn ngữ trang (levels trong search-strings: [nhãn hiện, nhãn ngôn ngữ kia]).
  var LEVELS = strings.levels || {};
  function levelText(l) {
    return (LEVELS[l] || [l])[0];
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
    var S = window.BkSubject;
    if (S) {
      S.groups(index.courses, GROUP_MIN).forEach(function (g) {
        var list = g.ids.map(function (id) {
          return byId[id];
        });
        var names = list.map(displayName);
        subjects[g.slug] = { slug: g.slug, ids: g.ids, name: S.title(names) };
        g.ids.forEach(function (id) {
          subjectOf[id] = g.slug;
        });
      });
    }
    idx = window.BkSearch.prepare(index);
    input.disabled = false;
    if (input.value || (facSel && facSel.value) || hasDocFilter()) run();
  }

  // Chương trình khớp khi mọi từ gõ là đầu một từ trong tên, loại, khóa hoặc mã chương trình.
  function level() {
    return levelSel ? levelSel.value : '';
  }

  function inLevel(levels) {
    return !window.BkSubject || window.BkSubject.inLevel(levels, level());
  }

  function matchPrograms(query, fac) {
    if (!programs) return [];
    var tokens = window.BkSearch.fold(query).split(' ').filter(Boolean);
    if (!tokens.length) return [];
    var phrase = tokens.join(' ');
    return programs
      .filter(function (p) {
        if (fac && p.faculty !== fac) return false;
        if (!inLevel(p.level ? [p.level] : null)) return false;
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
        // Cùng mức khớp thì đại học trước sau đại học, ngành đứng trước các chương trình theo khóa của nó.
        var am = a.p.kind === 'major' ? 0 : 1;
        var bm = b.p.kind === 'major' ? 0 : 1;
        var al = a.p.level ? 1 : 0;
        var bl = b.p.level ? 1 : 0;
        return a.head - b.head || al - bl || am - bm || (b.p.courses ? 1 : 0) - (a.p.courses ? 1 : 0) || (b.p.year || '').localeCompare(a.p.year || '') || a.p.name.localeCompare(b.p.name);
      })
      .map(function (x) {
        return x.p;
      });
  }

  // Ngành, chương trình: mỗi dòng một tên (kèm bậc sau đại học, năm khóa), gọn một dòng.
  function renderPrograms(hits) {
    if (!progBox || !progList) return;
    progList.textContent = '';
    progBox.hidden = !hits.length;
    hits.slice(0, PROG_MAX).forEach(function (p) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      var isMajor = p.kind === 'major';
      a.href = root + prefix + (isMajor ? 'major/' + encodeURIComponent(p.key) : 'program/' + encodeURIComponent(p.code)) + '/';
      var label = en && p.nameEn ? p.nameEn : p.name;
      if (p.level && (isMajor || !p.variant)) label = levelText(p.level) + ' ' + label;
      // Tên đã ghi năm khóa thì không ghi lại.
      a.textContent = p.year && label.indexOf(p.year) < 0 ? label + ' (' + p.year + ')' : label;
      li.appendChild(a);
      progList.appendChild(li);
    });
    if (hits.length > PROG_MAX) {
      var more = document.createElement('li');
      more.className = 'muted';
      more.textContent = en ? hits.length - PROG_MAX + ' more. Type the intake year to narrow down.' : 'Còn ' + (hits.length - PROG_MAX) + ' chương trình nữa. Gõ thêm năm khóa để thu hẹp.';
      progList.appendChild(more);
    }
  }

  function docFilters() {
    var f = { faculty: facSel ? facSel.value : '', level: level() };
    DOC_FILTERS.forEach(function (x) {
      f[x.key] = x.el.value;
    });
    return f;
  }

  function hasDocFilter() {
    return DOC_FILTERS.some(function (x) {
      return x.el.value;
    });
  }

  function fill(tpl, n) {
    return String(tpl || '').replace('{n}', n).replace('{max}', DOC_MAX);
  }

  function docCountText(n) {
    var c = ds.count || [];
    return n === 0 ? c[0] : n === 1 ? c[1] : fill(c[2], n);
  }

  // hits null: ẩn khối Tài liệu. Có câu tìm mà không có tài liệu nào khớp thì cũng ẩn cho gọn;
  // đã chọn bộ lọc tài liệu thì luôn hiện, kể cả khi không có mục nào, để bạn biết bộ lọc đã chạy.
  function renderDocs(hits, filtered) {
    if (!docBox || !docList) return;
    docList.textContent = '';
    var show = !!hits && (hits.length > 0 || !!filtered);
    docBox.hidden = !show;
    if (docStatus) docStatus.textContent = show ? docCountText(hits.length) : '';
    if (!show) return;
    hits.slice(0, DOC_MAX).forEach(function (d) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = root + prefix + d.url;
      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = d.code;
      var title = document.createElement('span');
      title.className = 'doc-title';
      title.textContent = d.title;
      var meta = document.createElement('span');
      meta.className = 'muted';
      var parts = [en && d.courseNameEn ? d.courseNameEn : d.courseName];
      var type = (ds.types || {})[d.type];
      parts.push(type ? type[0] : d.type);
      if (d.term) parts.push(d.term);
      if (d.examKind) parts.push(((ds.examKinds || {})[d.examKind] || [d.examKind])[0]);
      if (d.chapter) parts.push(ds.chapter + ' ' + d.chapter);
      if (d.teacher) parts.push(strings.teacher + ': ' + d.teacher);
      meta.textContent = parts.join(', ');
      a.appendChild(code);
      a.appendChild(title);
      a.appendChild(meta);
      if (d.description) {
        var desc = document.createElement('span');
        desc.className = 'doc-desc muted';
        desc.textContent = d.description;
        a.appendChild(desc);
      }
      li.appendChild(a);
      docList.appendChild(li);
    });
    if (hits.length > DOC_MAX) {
      var more = document.createElement('li');
      more.className = 'muted';
      more.textContent = fill(ds.more, hits.length - DOC_MAX);
      docList.appendChild(more);
    }
  }

  // Ghi câu tìm và bộ lọc lên địa chỉ trang, không thêm mục vào lịch sử trình duyệt.
  function syncUrl() {
    try {
      var params = new URLSearchParams(location.search);
      var q = input.value.trim();
      var fac = facSel ? facSel.value : '';
      if (q) params.set('q', q);
      else params.delete('q');
      if (fac) params.set('khoa', fac);
      else params.delete('khoa');
      if (level() && level() !== DEFAULT_LEVEL) params.set('bac', level());
      else params.delete('bac');
      DOC_FILTERS.forEach(function (x) {
        if (x.el.value) params.set(x.param, x.el.value);
        else params.delete(x.param);
      });
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
    var filtered = hasDocFilter();
    if (!docs) renderDocs(null);
    else if (input.value.trim()) renderDocs(window.BkDocs.search(docs, input.value, docFilters()), filtered);
    else renderDocs(filtered ? window.BkDocs.list(docs, docFilters()) : null, filtered);
    if (!idx || (!input.value.trim() && !fac)) {
      status.textContent = '';
      return;
    }
    var opts = { limit: 10000, faculty: fac || undefined };
    var query = input.value.trim();
    var hits = (query ? window.BkSearch.search(idx, input.value, opts) : window.BkSearch.list(idx, opts)).filter(function (h) {
      return inLevel(byId[h.id].levels);
    });
    var rows = orderRows(subjectRows(hits), !!query);
    var shown = rows.slice(0, MAX);
    var hidden = rows.length - shown.length;
    if (query) status.textContent = countText(rows.length) + (hidden > 0 ? '. ' + moreText(hidden) : '');
    else status.textContent = facultyText(rows.length, fac) + (hidden > 0 ? ' ' + (en ? 'Type to narrow down.' : 'Gõ tên môn để thu hẹp.') : '');
    shown.forEach(function (r) {
      list.appendChild(subjectLi(r));
    });
  }

  // Một môn một dòng: mã cùng tên gộp về môn theo tên, đặt ở chỗ mã xếp đầu. Gõ đúng mã thì mã đó (điểm 0)
  // xếp đầu, nên môn chứa mã đó cũng đứng đầu.
  function subjectRows(hits) {
    var rows = [];
    var at = {};
    hits.forEach(function (h) {
      var slug = subjectOf[h.id];
      var k = slug ? 's:' + slug : 'c:' + h.id;
      if (!(k in at)) {
        at[k] = rows.length;
        rows.push({ slug: slug, hit: h, teacher: h.teacher });
      }
    });
    return rows;
  }

  // Môn có tài liệu lên trước (BkSubject.docsFirst); khi gõ, môn khớp đúng mã (điểm dưới 1) vẫn đứng đầu.
  // Chỉ đổi thứ tự, tập kết quả giữ nguyên.
  function rowItems(r) {
    var ids = r.slug ? subjects[r.slug].ids : [r.hit.id];
    return ids.reduce(function (n, id) {
      return n + ((byId[id] && byId[id].items) || 0);
    }, 0);
  }

  function orderRows(rows, typed) {
    if (!window.BkSubject) return rows;
    return window.BkSubject.docsFirst(
      rows,
      function (r) {
        return typed && r.hit.score < 1;
      },
      function (r) {
        return rowItems(r) > 0;
      },
    );
  }

  function chip(code) {
    var s = document.createElement('span');
    s.className = 'code';
    s.textContent = code;
    return s;
  }

  // Một dòng: tên môn, các mã (tối đa CHIPS_MAX, còn lại +N), số tài liệu nếu có. Link tới trang môn theo tên
  // khi có nhiều mã, không thì trang của mã đó.
  function subjectLi(r) {
    var sub = r.slug ? subjects[r.slug] : null;
    var courses = sub
      ? sub.ids.map(function (id) {
          return byId[id];
        })
      : [byId[r.hit.id]];
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = root + prefix + (sub ? 'mon/' + encodeURIComponent(sub.slug) : 'course/' + encodeURIComponent(r.hit.id)) + '/';
    var name = document.createElement('span');
    name.className = 'row-title';
    name.textContent = sub ? sub.name : displayName(courses[0]);
    var codes = document.createElement('span');
    codes.className = 'row-codes';
    var seen = {};
    var list = [];
    // Mã khớp câu tìm đứng đầu, rồi các mã khác theo thứ tự chữ.
    [byId[r.hit.id]]
      .concat(
        courses.slice().sort(function (x, y) {
          return x.code < y.code ? -1 : x.code > y.code ? 1 : 0;
        }),
      )
      .forEach(function (c) {
        if (!seen[c.code]) {
          seen[c.code] = true;
          list.push(c.code);
        }
      });
    list.slice(0, CHIPS_MAX).forEach(function (code) {
      codes.appendChild(chip(code));
    });
    if (list.length > CHIPS_MAX) {
      var more = document.createElement('span');
      more.className = 'muted';
      more.textContent = '+' + (list.length - CHIPS_MAX);
      codes.appendChild(more);
    }
    a.appendChild(name);
    a.appendChild(codes);
    var n = rowItems(r);
    var parts = [];
    if (n) parts.push(en ? n + (n === 1 ? ' item' : ' items') : n + ' tài liệu');
    if (r.teacher) parts.push(strings.teacher + ': ' + r.teacher);
    if (parts.length) {
      var meta = document.createElement('span');
      meta.className = 'muted';
      meta.textContent = parts.join(', ');
      a.appendChild(meta);
    }
    li.appendChild(a);
    return li;
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
    // Thiếu danh sách tài liệu thì vẫn tìm môn và chương trình.
    var items =
      window.BkDocs && docBox
        ? getJson(root + 'assets/items.json').catch(function () {
            return [];
          })
        : Promise.resolve([]);
    // Danh sách môn: bản gọn của web (có ngữ cảnh môn trùng tên); thiếu thì dùng v1/index.json.
    var courses = getJson(root + 'assets/courses.json').catch(function () {
      return getJson(root + 'v1/index.json');
    });
    Promise.all([courses, progs, items])
      .then(function (res) {
        docs = window.BkDocs && docBox && Array.isArray(res[2]) ? window.BkDocs.prepare(res[2], { types: ds.types, examKinds: ds.examKinds }) : null;
        programs = (Array.isArray(res[1]) ? res[1] : []).map(function (p) {
          // Chương trình gắn ngành tìm được theo tên ngành (majorName) và mã ngành (major).
          // Mã loại (type, types của ngành) để nhãn loại bấm được (?q=PFIEV, ?q=CTTA) ra đúng chương trình.
          // Bậc sau đại học tìm được bằng cả hai thứ tiếng ("thac si", "master").
          var text = [p.name, p.nameEn, p.majorName, p.major, p.variant, p.type, (p.types || []).join(' '), p.year, p.code.replace(/[_+]/g, ' '), (LEVELS[p.level] || []).join(' ')].filter(Boolean).join(' ');
          return { kind: p.kind, key: p.key, code: p.code, name: p.name, nameEn: p.nameEn, year: p.year, variant: p.variant, level: p.level, faculty: p.faculty, courses: p.courses, programs: p.programs, words: window.BkSearch.fold(text).split(' '), folded: window.BkSearch.fold(en && p.nameEn ? p.nameEn : p.name) };
        });
        load(res[0]);
      })
      .catch(function () {
        requested = false;
        status.textContent = en ? "Couldn't load the course list. Try again in a moment." : 'Không tải được danh sách môn. Thử lại sau ít phút.';
      });
  }
  var selects = (facSel ? [facSel] : []).concat(
    levelSel ? [levelSel] : [],
    DOC_FILTERS.map(function (x) {
      return x.el;
    }),
  );
  ['pointerenter', 'touchstart', 'focus', 'keydown', 'input'].forEach(function (ev) {
    input.addEventListener(ev, ensureIndex, { passive: true });
    selects.forEach(function (s) {
      s.addEventListener(ev, ensureIndex, { passive: true });
    });
  });
  selects.forEach(function (s) {
    s.addEventListener('change', function () {
      ensureIndex();
      run();
    });
  });

  // Chỉ nhận giá trị có sẵn trong ô chọn; giá trị lạ trên địa chỉ trang thì bỏ qua.
  function setIfOption(sel, v) {
    if (!sel || !v) return;
    var opts = sel.options || [];
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === v) {
        sel.value = v;
        return;
      }
    }
  }

  // Link có sẵn câu tìm hoặc bộ lọc (?q=, ?khoa=, ?loai=, ?hk=, ?ky=), ví dụ từ tên giảng viên trên trang môn.
  try {
    var start = new URLSearchParams(location.search);
    if (start.get('q')) input.value = start.get('q');
    setIfOption(facSel, start.get('khoa'));
    setIfOption(levelSel, start.get('bac'));
    DOC_FILTERS.forEach(function (x) {
      setIfOption(x.el, start.get(x.param));
    });
  } catch (e) {
    // Địa chỉ lạ: bỏ qua.
  }
  if (input.value || (facSel && facSel.value) || hasDocFilter()) {
    // Mở trang với câu tìm sẵn: giữ chỗ cho kết quả (CSS .search.from-url) để phần bên dưới không nhảy khi
    // kết quả hiện ra; bỏ giữ chỗ khi bạn gõ hay đổi bộ lọc.
    var box = input.closest ? input.closest('.search') : null;
    if (box && box.classList) {
      box.classList.add('from-url');
      var release = function () {
        box.classList.remove('from-url');
      };
      input.addEventListener('input', release, { once: true });
      selects.forEach(function (s) {
        s.addEventListener('change', release, { once: true });
      });
    }
    ensureIndex();
  }
})();
