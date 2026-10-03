// Tìm môn trong /v1/index.json. Thuần JS, không DOM, không gửi gì ra mạng:
// chạy được trong trình duyệt, Node (test) và WebView2 của BK Study Desk.
// Mọi thay đổi phải qua bộ câu tìm mẫu test/search-cases.json.
//
//   var idx = BkSearch.prepare(v1Index);
//   BkSearch.search(idx, 'gt2', { limit: 30 })  ->  [{ id, score }, ...] (score nhỏ là khớp hơn)
(function (root) {
  'use strict';

  // Bỏ dấu, đ thành d, chữ thường, ký tự khác chữ số thành khoảng trắng.
  function fold(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Số La Mã đứng riêng thường gặp trong tên môn ("Giải tích II"). Không đổi "vi", "x"
  // vì trùng chữ tiếng Việt không dấu ("vi xu ly", "x").
  var ROMAN = { ii: '2', iii: '3', iv: '4' };

  function words(s) {
    var w = fold(s).split(' ').filter(Boolean);
    for (var i = 0; i < w.length; i++) if (ROMAN[w[i]]) w[i] = ROMAN[w[i]];
    return w;
  }

  // Chữ viết tắt: chữ đầu mỗi từ, giữ nguyên số. "Giải tích 2" -> "gt2", "Đại số tuyến tính" -> "dstt".
  function acronym(ws) {
    var out = '';
    for (var i = 0; i < ws.length; i++) out += /^[0-9]+$/.test(ws[i]) ? ws[i] : ws[i][0];
    return out;
  }

  function compactCode(s) {
    return fold(s).replace(/ /g, '');
  }

  // Khoảng cách sửa chữ, tính cả đảo hai chữ cạnh nhau ("tihn" và "tinh"); dừng sớm khi vượt max.
  function within(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    var pp = null;
    var prev = [];
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      var best = i;
      for (var k = 1; k <= b.length; k++) {
        var v = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
        if (pp && i > 1 && k > 1 && a[i - 1] === b[k - 2] && a[i - 2] === b[k - 1]) v = Math.min(v, pp[k - 2] + 1);
        cur[k] = v;
        if (v < best) best = v;
      }
      if (best > max) return false;
      pp = prev;
      prev = cur;
    }
    return prev[b.length] <= max;
  }

  function prepare(index) {
    var list = [];
    var courses = (index && index.courses) || [];
    for (var i = 0; i < courses.length; i++) {
      var c = courses[i];
      var names = [c.name, c.nameEn].concat(c.oldNames || []).filter(Boolean);
      var nameWords = [];
      var acr = [];
      for (var n = 0; n < names.length; n++) {
        var ws = words(names[n]);
        nameWords.push(ws);
        acr.push(acronym(ws));
      }
      var codes = [c.code, c.id].concat(c.aliases || []).map(compactCode);
      var all = [];
      for (var m = 0; m < nameWords.length; m++) all = all.concat(nameWords[m]);
      list.push({
        id: c.id,
        code: c.code,
        retired: c.status === 'retired',
        items: c.items || 0,
        codes: codes,
        acronyms: acr,
        words: all,
      });
    }
    return { courses: list };
  }

  // Mỗi từ trong câu tìm phải khớp một từ trong tên: đầu từ (0), nằm trong từ (1), gõ sai nhẹ (2).
  function tokenScore(c, t) {
    for (var j = 0; j < c.codes.length; j++) if (c.codes[j].indexOf(t) === 0) return 0;
    var best = -1;
    for (var i = 0; i < c.words.length; i++) {
      var w = c.words[i];
      if (w.indexOf(t) === 0) return 0;
      if (t.length >= 3 && w.indexOf(t) > 0) best = 1;
      else if (best < 0 && t.length >= 4 && (within(t, w, 1) || within(t, w.slice(0, t.length), 1))) best = 2;
    }
    return best;
  }

  // Điểm: mã hiện tại 0, mã cũ 0.25, đầu mã 1, viết tắt 1.5, theo từ 2 đến 4. Môn đã ngừng cộng 0.5.
  function scoreCourse(c, tokens, compact) {
    var s;
    var exact = c.codes.indexOf(compact);
    if (exact >= 0) s = exact < 2 ? 0 : 0.25;
    else if (compact.length >= 3 && c.codes.some(function (x) { return x.indexOf(compact) === 0; })) s = 1;
    else if (tokens.length === 1 && compact.length >= 2 && c.acronyms.indexOf(compact) >= 0) s = 1.5;
    else {
      var worst = 0;
      for (var i = 0; i < tokens.length; i++) {
        var ts = tokenScore(c, tokens[i]);
        if (ts < 0) {
          worst = -1;
          break;
        }
        if (ts > worst) worst = ts;
      }
      if (worst >= 0) s = 2 + worst;
      else if (tokens.length === 1 && compact.length >= 3 && c.acronyms.some(function (a) { return a.indexOf(compact) === 0; })) s = 3.5;
      else return -1;
    }
    return c.retired ? s + 0.5 : s;
  }

  function search(idx, query, opts) {
    var limit = (opts && opts.limit) || 30;
    var tokens = words(query);
    if (!tokens.length) return [];
    var compact = tokens.join('');
    var hits = [];
    for (var i = 0; i < idx.courses.length; i++) {
      var c = idx.courses[i];
      var s = scoreCourse(c, tokens, compact);
      if (s >= 0) hits.push({ id: c.id, score: s, code: c.code, items: c.items });
    }
    hits.sort(function (a, b) {
      return a.score - b.score || b.items - a.items || (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : 1);
    });
    return hits.slice(0, limit).map(function (h) {
      return { id: h.id, score: h.score };
    });
  }

  root.BkSearch = { fold: fold, prepare: prepare, search: search, version: 1 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
