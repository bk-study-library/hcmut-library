// Tải file lớn theo phần cho form Gửi tài liệu (Worker: worker/src/routes/upload.mjs). Tính sha256 từng phần (WebCrypto
// không băm theo luồng được, nên dùng bản JS dưới đây), gửi ô chữ và thông tin file, rồi gửi từng phần, cuối cùng báo xong.
// Không DOM; chạy được trong trình duyệt và Node (test/upload-chunks.test.mjs).
(function (root) {
  'use strict';

  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  // sha256 theo luồng: update(Uint8Array) nhiều lần, hex() một lần.
  function Sha256() {
    this.h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    this.buf = new Uint8Array(64);
    this.len = 0;
    this.total = 0;
    this.w = new Uint32Array(64);
  }
  Sha256.prototype.block = function (b, o) {
    var w = this.w;
    var h = this.h;
    for (var i = 0; i < 16; i++) w[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3];
    for (i = 16; i < 64; i++) {
      var x = w[i - 15];
      var y = w[i - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = h[0], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7], bb = h[1];
    for (i = 0; i < 64; i++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += bb; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  };
  Sha256.prototype.update = function (data) {
    var i = 0;
    this.total += data.length;
    if (this.len) {
      while (this.len < 64 && i < data.length) this.buf[this.len++] = data[i++];
      if (this.len < 64) return this;
      this.block(this.buf, 0);
      this.len = 0;
    }
    for (; i + 64 <= data.length; i += 64) this.block(data, i);
    while (i < data.length) this.buf[this.len++] = data[i++];
    return this;
  };
  Sha256.prototype.hex = function () {
    var bits = this.total * 8;
    var pad = new Uint8Array((this.len < 56 ? 56 : 120) - this.len + 8);
    pad[0] = 0x80;
    var hi = Math.floor(bits / 0x100000000);
    for (var i = 0; i < 4; i++) {
      pad[pad.length - 8 + i] = (hi >>> (24 - i * 8)) & 255;
      pad[pad.length - 4 + i] = (bits >>> (24 - i * 8)) & 255;
    }
    this.update(pad);
    var out = '';
    for (i = 0; i < 8; i++) out += ('00000000' + this.h[i].toString(16)).slice(-8);
    return out;
  };

  function readPart(file, start, end) {
    return file.slice(start, end).arrayBuffer().then(function (b) {
      return new Uint8Array(b);
    });
  }

  // sha256 và 16 byte đầu của file, đọc từng phần partSize.
  function digest(file, partSize, onBytes) {
    var hash = new Sha256();
    var head = null;
    var pos = 0;
    function next() {
      if (pos >= file.size) return Promise.resolve({ sha256: hash.hex(), head: head || new Uint8Array(0) });
      var end = Math.min(file.size, pos + partSize);
      return readPart(file, pos, end).then(function (bytes) {
        if (!head) head = bytes.subarray(0, 16);
        hash.update(bytes);
        onBytes(end - pos);
        pos = end;
        return next();
      });
    }
    return next();
  }

  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function json(res) {
    return res.json().then(
      function (body) {
        return { ok: res.ok, status: res.status, body: body };
      },
      function () {
        return { ok: false, status: res.status, body: null };
      },
    );
  }

  // Gửi một phần, thử lại tối đa 3 lần khi lỗi mạng hay 5xx.
  function putPart(url, bytes, tries) {
    return fetch(url, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } })
      .then(json)
      .then(function (r) {
        if (!r.ok && r.status >= 500 && tries > 1) return putPart(url, bytes, tries - 1);
        return r;
      }, function (err) {
        if (tries > 1) return putPart(url, bytes, tries - 1);
        throw err;
      });
  }

  // fields: FormData các ô chữ (không có file). files: [File]. onProgress(0..1): băm chiếm 20%, gửi 80%.
  // opts.headers: header thêm cho request đầu (script nạp riêng gửi service token của Access); opts.uploadBase: gốc của
  // /submit/<mã>/... khi request đầu không gọi /submit (route nạp riêng /xem-duyet/nap).
  // Trả { ok, status, body } như request thường: lỗi kiểm ô ở bước đầu trả về ngay để form hiện đúng chỗ.
  function upload(endpoint, fields, files, partSize, onProgress, opts) {
    opts = opts || {};
    var total = files.reduce(function (n, f) { return n + f.size; }, 0) || 1;
    var hashed = 0;
    var sent = 0;
    var report = function () {
      onProgress(Math.min(1, (hashed / total) * 0.2 + (sent / total) * 0.8));
    };
    var info = [];
    return files
      .reduce(function (p, f) {
        return p.then(function () {
          return digest(f, partSize, function (n) { hashed += n; report(); }).then(function (d) { info.push(d); });
        });
      }, Promise.resolve())
      .then(function () {
        fields.set('upload', 'chunked');
        fields.set('file-count', String(files.length));
        files.forEach(function (f, i) {
          fields.set('file-name-' + i, f.name);
          fields.set('file-size-' + i, String(f.size));
          fields.set('file-sha256-' + i, info[i].sha256);
          fields.set('file-head-' + i, b64(info[i].head));
        });
        return fetch(endpoint, { method: 'POST', body: fields, headers: opts.headers || {} }).then(json);
      })
      .then(function (start) {
        if (!start.ok || !start.body || !start.body.upload) return start;
        var up = start.body.upload;
        var base = (opts.uploadBase || endpoint.replace(/\/submit$/, '')) + '/submit/' + start.body.code;
        var parts = [];
        return up.files
          .reduce(function (p, f) {
            parts[f.index] = [];
            var file = files[f.index];
            var chain = p;
            for (var n = 1; n <= f.parts; n++) {
              (function (n) {
                chain = chain.then(function (r) {
                  if (r && !r.ok) return r;
                  var s = (n - 1) * up.partSize;
                  return readPart(file, s, Math.min(file.size, s + up.partSize)).then(function (bytes) {
                    return putPart(base + '/' + f.index + '/' + n + '?k=' + encodeURIComponent(up.token), bytes, 3).then(function (r) {
                      if (r.ok) {
                        parts[f.index].push({ partNumber: r.body.partNumber, etag: r.body.etag });
                        sent += bytes.length;
                        report();
                      }
                      return r;
                    });
                  });
                });
              })(n);
            }
            return chain;
          }, Promise.resolve(null))
          .then(function (r) {
            if (r && !r.ok) return r;
            return fetch(base + '/xong?k=' + encodeURIComponent(up.token), { method: 'POST', body: JSON.stringify({ parts: parts }), headers: { 'Content-Type': 'application/json' } }).then(json);
          });
      });
  }

  root.BkChunks = { Sha256: Sha256, upload: upload };
})(typeof window !== 'undefined' ? window : globalThis);
