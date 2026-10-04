// Phần thuần của form Gửi tài liệu khi chưa tìm thấy môn: gợi ý môn gần mã, môn trùng tên, kiểm
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

  // Khóa so tên: cùng cách với search.js và scripts/lib/course-context.mjs (chữ hoa, khoảng trắng).
  function nameKey(s) {
    return String(s || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Gộp kết quả tìm môn cùng tên (một tên, nhiều mã theo ngành hoặc khóa) như ô tìm trang chủ: tên có từ
  // min môn trong kết quả thành một dòng { group }, đặt ở chỗ môn xếp đầu của nhóm. Môn khớp đúng mã hay
  // mã cũ (điểm dưới 1) luôn đứng riêng { hit }.
  function groupHits(hits, byId, min) {
    var single = function (h) {
      return h.score < 1;
    };
    var count = {};
    hits.forEach(function (h) {
      if (!single(h)) {
        var k = nameKey(byId[h.id].name);
        count[k] = (count[k] || 0) + 1;
      }
    });
    var rows = [];
    var at = {};
    hits.forEach(function (h) {
      var k = nameKey(byId[h.id].name);
      if (single(h) || count[k] < min) {
        rows.push({ hit: h });
        return;
      }
      if (!(k in at)) {
        at[k] = rows.length;
        rows.push({ group: [] });
      }
      rows[at[k]].group.push(h);
    });
    return rows;
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

  root.BkUpload = {
    nameKey: nameKey,
    groupHits: groupHits,
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
