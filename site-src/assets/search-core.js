// Tìm môn trong /v1/index.json. Thuần JS, không DOM, không gửi gì ra mạng:
// chạy được trong trình duyệt, Node (test) và WebView2 của BK Study Desk.
// Mọi thay đổi phải qua bộ câu tìm mẫu test/search-cases.json.
//
//   var idx = BkSearch.prepare(v1Index);
//   BkSearch.search(idx, 'gt2', { limit: 30 })  ->  [{ id, score }, ...] (score nhỏ là khớp hơn)
//   BkSearch.search(idx, 'nguyen van a', { faculty: 'fas' })  ->  chỉ môn của khoa fas; khớp tên giảng viên thì có thêm teacher
//   BkSearch.list(idx, { faculty: 'fas' })  ->  mọi môn của khoa, môn nhiều tài liệu trước
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

  // Từ giữ nguyên dấu (chữ thường, NFC), để phân biệt "vẽ" với "về" khi người dùng gõ có dấu.
  function markedWords(s) {
    var w = String(s || '')
      .normalize('NFC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    for (var i = 0; i < w.length; i++) if (ROMAN[w[i]]) w[i] = ROMAN[w[i]];
    return w;
  }

  // Câu tìm có chữ có dấu (kể cả đ) thì mới so khớp nguyên dấu.
  function hasMarks(s) {
    return /[^\u0000-\u007f]/.test(String(s || '').normalize('NFC'));
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
      var phrases = [];
      var phraseLens = [];
      var marked = [];
      for (var n = 0; n < names.length; n++) {
        var ws = words(names[n]);
        nameWords.push(ws);
        acr.push(acronym(ws));
        phrases.push(ws.join(' '));
        phraseLens.push(ws.length);
        marked = marked.concat(markedWords(names[n]));
      }
      var codes = [c.code, c.id].concat(c.aliases || []).map(compactCode);
      var all = [];
      for (var m = 0; m < nameWords.length; m++) all = all.concat(nameWords[m]);
      var teachers = [];
      for (var t = 0; t < (c.teachers || []).length; t++) teachers.push({ name: c.teachers[t], words: words(c.teachers[t]) });
      list.push({
        id: c.id,
        code: c.code,
        faculty: c.faculty,
        teachers: teachers,
        retired: c.status === 'retired',
        items: c.items || 0,
        codes: codes,
        acronyms: acr,
        words: all,
        phrases: phrases,
        phraseLens: phraseLens,
        marked: marked,
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

  // Điểm thưởng khi khớp theo từ (luôn dưới 0.5 để không vượt nhóm điểm khác):
  // tên đúng bằng câu tìm 0.3; tên bắt đầu bằng cả cụm câu tìm và cụm đó chiếm từ nửa số từ
  // của tên trở lên 0.25 ("ve ky thuat" khớp "Vẽ kỹ thuật cơ khí" hơn "Nhập môn về kỹ thuật");
  // gõ có dấu mà mọi từ khớp nguyên dấu thêm 0.15.
  function phraseBonus(c, tokens, marks) {
    var phrase = tokens.join(' ');
    var b = 0;
    for (var i = 0; i < c.phrases.length; i++) {
      if (c.phrases[i] === phrase) {
        b = 0.3;
        break;
      }
      if (c.phrases[i].indexOf(phrase) === 0 && tokens.length * 2 >= c.phraseLens[i]) b = 0.25;
    }
    if (marks && marks.length) {
      var all = true;
      for (var k = 0; k < marks.length && all; k++) {
        var hit = false;
        for (var j = 0; j < c.marked.length && !hit; j++) hit = c.marked[j].indexOf(marks[k]) === 0;
        all = hit;
      }
      if (all) b += 0.15;
    }
    return b;
  }

  // Điểm: mã hiện tại 0, mã cũ 0.25, đầu mã 1, viết tắt 1.5, theo từ 2 đến 4 (trừ điểm thưởng cụm từ). Môn đã ngừng cộng 0.5.
  function scoreCourse(c, tokens, compact, marks) {
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
      if (worst >= 0) s = Math.round((2 + worst - phraseBonus(c, tokens, marks)) * 100) / 100;
      else if (tokens.length === 1 && compact.length >= 3 && c.acronyms.some(function (a) { return a.indexOf(compact) === 0; })) s = 3.5;
      else return -1;
    }
    return c.retired ? s + 0.5 : s;
  }

  // Tên giảng viên: mọi từ gõ phải là đầu một từ trong tên (2 chữ trở lên, trừ từ cuối gõ dở).
  // Chỉ dùng khi tên môn không khớp, điểm 4 để đứng sau mọi kết quả theo tên môn.
  function teacherMatch(c, tokens) {
    for (var i = 0; i < c.teachers.length; i++) {
      var tw = c.teachers[i].words;
      var ok = true;
      for (var k = 0; k < tokens.length && ok; k++) {
        if (tokens[k].length < 2 && k < tokens.length - 1) ok = false;
        else ok = tw.some(function (w) { return w.indexOf(tokens[k]) === 0; });
      }
      if (ok) return c.teachers[i].name;
    }
    return null;
  }

  function byRank(a, b) {
    return a.score - b.score || b.items - a.items || (a.code < b.code ? -1 : a.code > b.code ? 1 : a.id < b.id ? -1 : 1);
  }

  function inFaculty(c, opts) {
    return !(opts && opts.faculty) || c.faculty === opts.faculty;
  }

  function search(idx, query, opts) {
    var limit = (opts && opts.limit) || 30;
    var tokens = words(query);
    if (!tokens.length) return [];
    var compact = tokens.join('');
    var marks = hasMarks(query) ? markedWords(query) : null;
    var hits = [];
    for (var i = 0; i < idx.courses.length; i++) {
      var c = idx.courses[i];
      if (!inFaculty(c, opts)) continue;
      var s = scoreCourse(c, tokens, compact, marks);
      if (s >= 0) hits.push({ id: c.id, score: s, code: c.code, items: c.items });
      else if (compact.length >= 3) {
        var teacher = teacherMatch(c, tokens);
        if (teacher) hits.push({ id: c.id, score: 4, code: c.code, items: c.items, teacher: teacher });
      }
    }
    hits.sort(byRank);
    return hits.slice(0, limit).map(function (h) {
      return h.teacher ? { id: h.id, score: h.score, teacher: h.teacher } : { id: h.id, score: h.score };
    });
  }

  // Liệt kê môn (thường là của một khoa) khi chưa gõ gì.
  function list(idx, opts) {
    var limit = (opts && opts.limit) || 30;
    var hits = [];
    for (var i = 0; i < idx.courses.length; i++) {
      var c = idx.courses[i];
      if (inFaculty(c, opts)) hits.push({ id: c.id, score: c.retired ? 1 : 0, code: c.code, items: c.items });
    }
    hits.sort(function (a, b) {
      return b.items - a.items || byRank(a, b);
    });
    return hits.slice(0, limit).map(function (h) {
      return { id: h.id, score: h.score };
    });
  }

  root.BkSearch = { fold: fold, prepare: prepare, search: search, list: list, version: 1 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
