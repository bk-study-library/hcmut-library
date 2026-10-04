// Môn theo tên: các mã cùng một tên môn (mỗi ngành, mỗi khóa một mã) gộp thành một môn, có trang chung
// mon/<slug>/. Một quy tắc dùng chung cho build (scripts/lib/subject.mjs nạp file này) và trình duyệt
// (ô tìm trang chủ, form Gửi tài liệu). Thuần JS, không DOM, không mạng.
//
//   BkSubject.nameKey('Đồ án Tốt nghiệp (Khoa học Máy tính)')  ->  'đồ án tốt nghiệp'
//   BkSubject.groups(courses)  ->  [{ key, slug, ids }] cho tên có từ 2 mã
//   BkSubject.title(['Đồ án tốt nghiệp', 'Đồ án Tốt nghiệp'])  ->  cách viết gặp nhiều nhất
//   BkSubject.pickCode(courses)  ->  mã thuộc nhiều chương trình nhất (mặc định cho form gửi)
(function (root) {
  'use strict';

  // Phần ngoặc cuối tên thường ghi ngành hoặc hệ, ví dụ "Đồ án Tốt nghiệp (Khoa học Máy tính)".
  var TAIL = /\s*\(([^()]*)\)\s*$/;

  function baseName(s) {
    return String(s || '').replace(TAIL, '').replace(/\s+/g, ' ').trim();
  }

  // Khóa so tên: bỏ phần ngoặc cuối, NFC, chữ thường, khoảng trắng gộp một.
  function nameKey(s) {
    return baseName(s).normalize('NFC').toLowerCase();
  }

  var SLUG_MAX = 80;

  // Đoạn đường dẫn ASCII từ khóa tên: bỏ dấu, đ thành d, ký tự khác chữ số thành gạch nối.
  function slugOf(key) {
    var s = String(key || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (s.length > SLUG_MAX) {
      s = s.slice(0, SLUG_MAX);
      var at = s.lastIndexOf('-');
      if (at > SLUG_MAX / 2) s = s.slice(0, at);
    }
    return s || 'mon';
  }

  function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // Nhóm môn cùng tên (từ min mã, mặc định 2), mỗi nhóm một slug cố định. Hai tên khác nhau ra cùng slug
  // (chỉ khác dấu, ví dụ "về" và "vẽ"): tên xếp đầu theo thứ tự mã ký tự giữ slug gốc, tên sau thêm -2, -3,
  // bỏ qua số đã là slug gốc của nhóm khác. Nhóm xếp theo slug, id trong nhóm theo thứ tự chữ.
  function groups(courses, min) {
    min = min || 2;
    var byKey = {};
    var keys = [];
    for (var i = 0; i < courses.length; i++) {
      var k = nameKey(courses[i].name);
      if (!byKey[k]) {
        byKey[k] = [];
        keys.push(k);
      }
      byKey[k].push(courses[i].id);
    }
    var multi = keys.filter(function (k) {
      return byKey[k].length >= min;
    });
    multi.sort(cmp);
    var bySlug = {};
    multi.forEach(function (k) {
      var s = slugOf(k);
      (bySlug[s] = bySlug[s] || []).push(k);
    });
    var used = {};
    Object.keys(bySlug).forEach(function (s) {
      used[s] = true;
    });
    var out = [];
    Object.keys(bySlug)
      .sort(cmp)
      .forEach(function (s) {
        bySlug[s].forEach(function (k, i) {
          var slug = s;
          if (i > 0) {
            var n = 2;
            while (used[s + '-' + n]) n++;
            slug = s + '-' + n;
            used[slug] = true;
          }
          out.push({ key: k, slug: slug, ids: byKey[k].slice().sort(cmp) });
        });
      });
    return out.sort(function (a, b) {
      return cmp(a.slug, b.slug);
    });
  }

  function upperCount(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) if (s[i] !== s[i].toLowerCase()) n++;
    return n;
  }

  // Tên hiện của môn: cách viết (bỏ phần ngoặc cuối) gặp nhiều nhất; bằng nhau thì ít chữ hoa hơn,
  // rồi theo thứ tự mã ký tự, để luôn ra một kết quả.
  function title(names) {
    var count = {};
    var list = [];
    for (var i = 0; i < names.length; i++) {
      var n = baseName(names[i]);
      if (!n) continue;
      if (!count[n]) list.push(n);
      count[n] = (count[n] || 0) + 1;
    }
    list.sort(function (a, b) {
      return count[b] - count[a] || upperCount(a) - upperCount(b) || cmp(a, b);
    });
    return list[0] || '';
  }

  // Mã mặc định khi chọn môn theo tên: thuộc nhiều chương trình nhất (progs), rồi môn còn dạy, nhiều tài
  // liệu, mã nhỏ trước.
  function pickCode(courses) {
    var list = courses.slice().sort(function (a, b) {
      return (
        (b.progs || 0) - (a.progs || 0) ||
        (a.status === 'retired' ? 1 : 0) - (b.status === 'retired' ? 1 : 0) ||
        (b.items || 0) - (a.items || 0) ||
        cmp(a.code, b.code) ||
        cmp(a.id, b.id)
      );
    });
    return list[0] || null;
  }

  // Môn có tài liệu lên trước, môn chưa có xuống sau; trong mỗi phần giữ nguyên thứ tự cũ. Dòng first (khớp
  // đúng mã) luôn đứng đầu. Chỉ đổi thứ tự, không thêm bớt dòng nào.
  function docsFirst(rows, first, hasDocs) {
    var a = [];
    var b = [];
    var c = [];
    for (var i = 0; i < rows.length; i++) {
      if (first(rows[i])) a.push(rows[i]);
      else if (hasDocs(rows[i])) b.push(rows[i]);
      else c.push(rows[i]);
    }
    return a.concat(b, c);
  }

  // Bậc của một mã (levels, không có là đại học) có khớp bậc đang chọn không. level rỗng hoặc "tat-ca": mọi bậc.
  var DEFAULT_LEVEL = 'dai-hoc';
  function inLevel(levels, level) {
    if (!level || level === 'tat-ca') return true;
    var ls = levels && levels.length ? levels : [DEFAULT_LEVEL];
    return ls.indexOf(level) >= 0;
  }

  root.BkSubject = { baseName: baseName, nameKey: nameKey, slugOf: slugOf, groups: groups, title: title, pickCode: pickCode, docsFirst: docsFirst, inLevel: inLevel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
