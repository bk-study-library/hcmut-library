// Tìm tài liệu cho ô tìm trang chủ, trong assets/items.json (file riêng của web, không thuộc hợp đồng v1).
// Thuần JS, không DOM, không gửi gì ra mạng. Cần BkSearch.fold của search-core.js (nạp trước file này).
//
//   var d = BkDocs.prepare(items, { types: { summary: ['Tóm tắt', 'Summaries'] }, examKinds: { gk: ['Giữa kỳ', 'Midterm'] } })
//   BkDocs.search(d, 'giua ky hk241', { type: 'exam-past', term: 'HK241', examKind: 'gk', faculty: 'fas', level: 'dai-hoc' })  ->  [mục, ...]
//   BkDocs.list(d, { term: 'HK241' })  ->  mọi mục khớp bộ lọc, mới nhất trước
(function (root) {
  'use strict';

  function fold(s) {
    return root.BkSearch.fold(s);
  }

  function labelsOf(map, key) {
    var v = map && map[key];
    return Array.isArray(v) ? v : v ? [v] : [];
  }

  // Chữ dùng để khớp: tiêu đề, mô tả, mã và tên môn, tên loại, học kỳ (cả "HK241" lẫn "241"),
  // loại kiểm tra (giữa kỳ, cuối kỳ), chương, giảng viên. Bỏ dấu như search-core.
  function prepare(items, labels) {
    var list = [];
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i];
      var parts = [it.title, it.description, it.code, it.course, it.courseName, it.courseNameEn, it.chapter, it.teacher];
      parts = parts.concat(labelsOf(labels && labels.types, it.type), labelsOf(labels && labels.examKinds, it.examKind));
      if (it.term) parts.push(it.term, it.term.replace(/^HK/i, ''));
      var words = fold(parts.filter(Boolean).join(' ')).split(' ').filter(Boolean);
      list.push({ item: it, words: words, title: fold(it.title) });
    }
    return { docs: list };
  }

  function passes(it, f) {
    if (!f) return true;
    if (f.type && it.type !== f.type) return false;
    if (f.term && it.term !== f.term) return false;
    if (f.examKind && it.examKind !== f.examKind) return false;
    if (f.faculty && it.faculty !== f.faculty) return false;
    // Bậc (đại học mặc định, thạc sĩ, tiến sĩ, tất cả) theo levels của môn, cùng cách so với subject-core.js.
    if (f.level && root.BkSubject && !root.BkSubject.inLevel(it.levels, f.level)) return false;
    return true;
  }

  // Mới thêm trước; cùng ngày thì theo tiêu đề rồi id để thứ tự luôn cố định.
  function newer(a, b) {
    return (b.added || '').localeCompare(a.added || '') || a.title.localeCompare(b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  // Mục khớp khi tiêu đề chứa liền cụm đã gõ, hoặc mọi từ gõ là đầu một từ của mục.
  // Thứ tự: tiêu đề chứa cả cụm trước, rồi khớp đủ từ; cùng mức thì mới thêm trước.
  function search(d, query, filters) {
    var tokens = fold(query).split(' ').filter(Boolean);
    if (!tokens.length) return [];
    var phrase = tokens.join(' ');
    var hits = [];
    for (var i = 0; i < d.docs.length; i++) {
      var x = d.docs[i];
      if (!passes(x.item, filters)) continue;
      var inTitle = phrase.length >= 2 && x.title.indexOf(phrase) >= 0;
      var all = true;
      for (var k = 0; k < tokens.length && all; k++) {
        var t = tokens[k];
        all = x.words.some(function (w) { return w.indexOf(t) === 0; });
      }
      if (inTitle || all) hits.push({ tier: inTitle ? 0 : 1, item: x.item });
    }
    hits.sort(function (a, b) {
      return a.tier - b.tier || newer(a.item, b.item);
    });
    return hits.map(function (h) {
      return h.item;
    });
  }

  function list(d, filters) {
    var out = [];
    for (var i = 0; i < d.docs.length; i++) if (passes(d.docs[i].item, filters)) out.push(d.docs[i].item);
    return out.sort(newer);
  }

  root.BkDocs = { prepare: prepare, search: search, list: list };
})(typeof globalThis !== 'undefined' ? globalThis : this);
