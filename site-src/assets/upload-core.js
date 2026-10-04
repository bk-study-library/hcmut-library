// Phần thuần của form Gửi tài liệu: chọn môn theo tên (mã mặc định, các mã để đổi, giảng viên của môn), gợi ý
// môn gần mã, môn trùng tên, kiểm
// môn mới. Không DOM, không mạng; chạy được trong trình duyệt và Node (test/upload-core.test.mjs).
// Mẫu mã môn, khoảng lệch mã và giới hạn tên do upload.js truyền vào (lấy từ #upload-config).
(function (root) {
  'use strict';

  // Mã môn người gõ: bỏ khoảng trắng, chữ hoa.
  function normCode(s) {
    return String(s || '').replace(/\s+/g, '').toUpperCase();
  }

  // Trông như mã môn: khớp mẫu mã của schema và có chữ số (để "giai" không bị coi là mã).
  function looksLikeCode(s, pattern) {
    var code = normCode(s);
    return /[0-9]/.test(code) && new RegExp(pattern).test(code);
  }

  // Môn có id, mã hiện tại hoặc mã cũ trùng code.
  function findCourse(courses, code) {
    for (var i = 0; i < courses.length; i++) {
      var c = courses[i];
      if (c.id === code || c.code === code || (c.aliases || []).indexOf(code) >= 0) return c;
    }
    return null;
  }

  // Môn cùng tiền tố chữ, phần số lệch 1 đến span (mã trường thường là số lẻ, mã cũ đôi khi số chẵn),
  // gần trước, bằng nhau thì số nhỏ trước. Không có chính mã đó.
  function nearCodes(courses, code, span) {
    var m = /^([A-Z_]*[A-Z])([0-9]+)$/.exec(normCode(code));
    if (!m) return [];
    var n = Number(m[2]);
    var width = m[2].length;
    var out = [];
    var seen = Object.create(null);
    for (var d = 1; d <= span; d++) {
      [n - d, n + d].forEach(function (k) {
        if (k < 0) return;
        var digits = String(k);
        while (digits.length < width) digits = '0' + digits;
        var c = findCourse(courses, m[1] + digits);
        if (c && !seen[c.id]) {
          seen[c.id] = true;
          out.push(c);
        }
      });
    }
    return out;
  }

  // Môn có tên chứa mọi từ của tên người gõ (bỏ dấu, như ô tìm). Tên quá ngắn thì không gợi ý.
  var NAME_MIN = 4;
  function nameMatches(search, idx, byId, name, limit) {
    var folded = search.fold(name);
    if (folded.replace(/ /g, '').length < NAME_MIN) return [];
    var want = folded.split(' ');
    var out = [];
    var hits = search.search(idx, name, { limit: 30 });
    for (var i = 0; i < hits.length && out.length < limit; i++) {
      var c = byId[hits[i].id];
      if (!c || hits[i].teacher) continue;
      var have = (' ' + [c.name].concat(c.oldNames || []).map(search.fold).join(' ') + ' ');
      if (want.every(function (w) { return have.indexOf(' ' + w + ' ') >= 0; })) out.push(c);
    }
    return out;
  }

  // Kiểm môn mới trước khi gửi. errors: khóa ô (newCourseCode, newCourseName) và mã lỗi để
  // upload.js đổi thành câu. existing: môn đã có trùng mã thì form chọn môn đó thay vì thêm mới.
  function checkNewCourse(input, opts) {
    var code = normCode(input.code);
    var name = String(input.name || '').replace(/\s+/g, ' ').trim();
    var errors = {};
    var existing = null;
    if (!code) errors.newCourseCode = 'codeEmpty';
    else if (!new RegExp(opts.pattern).test(code)) errors.newCourseCode = 'codePattern';
    else existing = findCourse(opts.courses, code);
    if (!name) errors.newCourseName = 'nameEmpty';
    else if (name.length > opts.nameMax) errors.newCourseName = 'nameLong';
    return { code: code, name: name, errors: errors, existing: existing };
  }

  // Môn theo tên cho form: id mã -> slug và slug -> { slug, ids, name }, gộp bằng BkSubject.groups (cùng quy tắc
  // với trang mon/<slug>/ và ô tìm trang chủ).
  function subjectIndex(subject, courses, min) {
    var byId = Object.create(null);
    courses.forEach(function (c) {
      byId[c.id] = c;
    });
    var of = Object.create(null);
    var all = Object.create(null);
    subject.groups(courses, min).forEach(function (g) {
      all[g.slug] = {
        slug: g.slug,
        ids: g.ids,
        name: subject.title(
          g.ids.map(function (id) {
            return byId[id].name;
          }),
        ),
      };
      g.ids.forEach(function (id) {
        of[id] = g.slug;
      });
    });
    return { of: of, all: all };
  }

  // Kết quả tìm thành mỗi môn một dòng { slug, id }: mã cùng tên về một dòng, đặt ở chỗ mã xếp đầu. Gõ đúng mã
  // thì mã đó xếp đầu nên môn chứa nó cũng đứng đầu, id là chính mã đó và exact là true (điểm dưới 1).
  function subjectRows(hits, subjects) {
    var rows = [];
    var seen = Object.create(null);
    hits.forEach(function (h) {
      if (h.teacher) return;
      var slug = subjects.of[h.id] || '';
      var k = slug ? 's:' + slug : 'c:' + h.id;
      if (seen[k]) return;
      seen[k] = true;
      rows.push({ slug: slug, id: h.id, exact: h.score < 1 });
    });
    return rows;
  }

  // Chọn môn: mã nào gửi đi và các mã để đổi. Có preferId (gõ đúng mã, link ?course=) thì dùng mã đó; không
  // thì mã thuộc nhiều chương trình nhất (BkSubject.pickCode). codes xếp theo mã.
  function subjectChoice(subject, subjects, byId, id, preferId) {
    var slug = subjects.of[id];
    if (!slug) return { slug: '', id: id, name: byId[id].name, codes: [] };
    var list = subjects.all[slug].ids.map(function (x) {
      return byId[x];
    });
    var pick = preferId && subjects.of[preferId] === slug ? byId[preferId] : subject.pickCode(list);
    var codes = list
      .slice()
      .sort(function (a, b) {
        return a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : 1;
      })
      .map(function (c) {
        return { id: c.id, code: c.code };
      });
    return { slug: slug, id: pick.id, name: subjects.all[slug].name, codes: codes };
  }

  // Tên giảng viên đã có trên tài liệu của mọi mã trong môn, bỏ trùng, xếp theo chữ.
  function subjectTeachers(courses) {
    var seen = Object.create(null);
    var out = [];
    courses.forEach(function (c) {
      (c.teachers || []).forEach(function (n) {
        if (!seen[n]) {
          seen[n] = true;
          out.push(n);
        }
      });
    });
    return out.sort(function (a, b) {
      return a.localeCompare(b, 'vi');
    });
  }

  // Môn khớp đúng mã hay mã cũ (điểm 0 của search-core) khi chỉ có một môn như vậy; không có thì null.
  function exactCode(hits, byId) {
    var exact = hits.filter(function (h) {
      return h.score === 0;
    });
    return exact.length === 1 ? byId[exact[0].id] : null;
  }

  // Mã hiện trên dòng gộp: tối đa max mã, phần còn lại chỉ ghi số (+N).
  function codeChips(courses, max) {
    return {
      codes: courses.slice(0, max).map(function (c) {
        return c.code;
      }),
      more: Math.max(0, courses.length - max),
    };
  }

  // Tài liệu đã có của các mã trong môn (items.json), mới nhất trước.
  function subjectDocs(items, courseIds) {
    var ids = Object.create(null);
    courseIds.forEach(function (x) {
      ids[x] = true;
    });
    return items
      .filter(function (d) {
        return ids[d.course];
      })
      .sort(function (a, b) {
        return (b.added || '').localeCompare(a.added || '');
      });
  }

  // Tài liệu có tiêu đề gần giống: trùng hẳn sau khi bỏ dấu, chứa nhau, hoặc chung từ 60% số từ trở lên
  // (so với tiêu đề ngắn hơn). fold: hàm bỏ dấu của search-core (BkSearch.fold).
  function similarDocs(title, docs, fold, max) {
    var words = function (s) {
      return fold(s).split(' ').filter(function (w) {
        return w.length > 1;
      });
    };
    var t = fold(title);
    var tw = words(title);
    if (tw.length < 2) return [];
    var out = [];
    docs.forEach(function (d) {
      var dt = fold(d.title);
      var dw = words(d.title);
      if (!dw.length) return;
      var same = 0;
      var set = Object.create(null);
      dw.forEach(function (w) {
        set[w] = true;
      });
      tw.forEach(function (w) {
        if (set[w]) same += 1;
      });
      var ratio = same / Math.min(tw.length, dw.length);
      if (dt === t || dt.indexOf(t) >= 0 || t.indexOf(dt) >= 0 || ratio >= 0.6) out.push({ doc: d, score: dt === t ? 2 : ratio });
    });
    out.sort(function (a, b) {
      return b.score - a.score;
    });
    return out.slice(0, max || 3).map(function (x) {
      return x.doc;
    });
  }

  root.BkUpload = {
    subjectDocs: subjectDocs,
    similarDocs: similarDocs,
    subjectIndex: subjectIndex,
    subjectRows: subjectRows,
    subjectChoice: subjectChoice,
    subjectTeachers: subjectTeachers,
    exactCode: exactCode,
    codeChips: codeChips,
    normCode: normCode,
    looksLikeCode: looksLikeCode,
    findCourse: findCourse,
    nearCodes: nearCodes,
    nameMatches: nameMatches,
    checkNewCourse: checkNewCourse,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
