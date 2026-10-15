/*
 * Gerador mínimo de PDF (sem dependências, funciona offline).
 * Texto em Helvetica/Helvetica-Bold com WinAnsiEncoding (acentos do português),
 * retângulos, linhas e uma imagem JPEG (brasão). Quebra de página automática.
 */
(function (root) {
  'use strict';
  var W = 595.28, H = 841.89, M = 42;            // A4 em pontos, margem
  // Larguras Helvetica (AFM) para 32..126; demais caracteres ~ 556.
  var HV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  var CP = { 0x2013: 0x96, 0x2014: 0x97, 0x2022: 0x95, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2026: 0x85, 0x20AC: 0x80 };
  var SUB = { '≥': '>=', '≤': '<=', '→': '->', '×': 'x', '₂': '2', '−': '-', '✓': 'v' };

  function enc(str) { // string JS -> string de bytes WinAnsi
    var o = '';
    String(str).split('').forEach(function (ch) {
      if (SUB[ch]) { o += SUB[ch]; return; }
      var c = ch.charCodeAt(0);
      if (c < 256) o += String.fromCharCode(c); else if (CP[c]) o += String.fromCharCode(CP[c]); else o += '?';
    });
    return o;
  }
  function width(str, size, bold) {
    var t = enc(str), w = 0, tb = bold ? HB : HV;
    for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); w += (c >= 32 && c <= 126) ? tb[c - 32] : 556; }
    return w * size / 1000;
  }
  function wrap(str, size, bold, maxW) {
    var out = [];
    String(str).split('\n').forEach(function (par) {
      var words = par.split(' '), line = '';
      words.forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (width(t, size, bold) <= maxW || !line) line = t; else { out.push(line); line = w; }
      });
      out.push(line);
    });
    return out;
  }
  function esc(t) { return t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(function (v) { return v.toFixed(3); }).join(' '); }

  function Doc(opts) {
    this.pages = []; this.jpeg = opts && opts.jpeg || null; this.footer = opts && opts.footer || '';
    this.newPage();
  }
  Doc.prototype.newPage = function () { this.cur = []; this.pages.push(this.cur); this.y = H - M; };
  Doc.prototype.op = function (s) { this.cur.push(s); };
  Doc.prototype.ensure = function (h) { if (this.y - h < M + 24) this.newPage(); };
  Doc.prototype.text = function (str, x, y, size, bold, color) {
    this.op('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + rgb(color || '#0F172A') + ' rg ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + esc(enc(str)) + ') Tj ET');
  };
  Doc.prototype.rect = function (x, y, w, h, fill) { this.op(rgb(fill) + ' rg ' + [x, y, w, h].map(function (v) { return v.toFixed(2); }).join(' ') + ' re f'); };
  Doc.prototype.line = function (x1, y1, x2, y2, color, wd) { this.op(rgb(color || '#CBD5E1') + ' RG ' + (wd || 0.6) + ' w ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S'); };
  Doc.prototype.image = function (x, y, s) { if (this.jpeg) this.op('q ' + s + ' 0 0 ' + s + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm /Im1 Do Q'); };

  // Blocos de alto nível
  Doc.prototype.para = function (str, o) {
    o = o || {}; var size = o.size || 10, lh = size * 1.35, x = M + (o.indent || 0), maxW = W - 2 * M - (o.indent || 0);
    var self = this;
    wrap(str, size, o.bold, maxW).forEach(function (l) { self.ensure(lh); self.y -= lh; self.text(l, x, self.y + 2, size, o.bold, o.color); });
    this.y -= (o.after == null ? 4 : o.after);
  };
  Doc.prototype.heading = function (str) {
    this.ensure(30); this.y -= 18;
    this.rect(M, this.y - 4, 4, 16, '#B91C1C');
    this.text(str.toUpperCase(), M + 10, this.y, 11, true, '#0F172A');
    this.y -= 8;
  };
  Doc.prototype.kv = function (k, v, note) { // linha rótulo / valor
    var size = 10, lh = 15, vw = 230, kx = M, vx = W - M;
    var lines = wrap(v, size, true, vw), noteL = note ? wrap(note, 7.5, false, W - 2 * M - vw - 10) : [];
    var hgt = Math.max(lines.length * lh, lh + noteL.length * 9) + 4;
    this.ensure(hgt);
    var y0 = this.y;
    this.text(k, kx, y0 - 11, size, false, '#334155');
    var self = this;
    noteL.forEach(function (n, i) { self.text(n, kx, y0 - 21 - i * 9, 7.5, false, '#64748B'); });
    lines.forEach(function (l, i) { self.text(l, vx - width(l, size, true), y0 - 11 - i * lh, size, true, '#0F172A'); });
    this.y = y0 - hgt;
    this.line(M, this.y + 1, W - M, this.y + 1, '#E2E8F0', 0.5);
  };
  Doc.prototype.box = function (title, value, color) { // destaque
    this.ensure(56); this.y -= 6;
    this.rect(M, this.y - 44, W - 2 * M, 44, color || '#0F172A');
    this.text(title.toUpperCase(), M + 12, this.y - 16, 8, true, '#E2E8F0');
    this.text(value, M + 12, this.y - 35, 15, true, '#FFFFFF');
    this.y -= 52;
  };

  Doc.prototype.header = function (title, sub) {
    this.rect(0, H - 92, W, 92, '#B91C1C');
    this.image(M, H - 80, 66);
    this.text(title, M + 80, H - 44, 18, true, '#FFFFFF');
    this.text(sub, M + 80, H - 62, 9, false, '#FEE2E2');
    this.y = H - 104;
  };

  Doc.prototype.build = function () {
    var objs = [], self = this, n = this.pages.length, total = n;
    // numeração e rodapé
    this.pages.forEach(function (p, i) {
      p.push('BT /F1 7.5 Tf ' + rgb('#64748B') + ' rg ' + M + ' 24 Td (' + esc(enc(self.footer)) + ') Tj ET');
      var pg = 'Página ' + (i + 1) + ' de ' + total;
      p.push('BT /F1 7.5 Tf ' + rgb('#64748B') + ' rg ' + (W - M - width(pg, 7.5)).toFixed(2) + ' 24 Td (' + esc(enc(pg)) + ') Tj ET');
    });
    // 1 catálogo, 2 páginas, 3 F1, 4 F2, 5 imagem, depois pares página/conteúdo
    var kids = []; for (var i = 0; i < n; i++) kids.push((6 + i * 2) + ' 0 R');
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    var img = this.jpeg || '';
    objs[5] = img ? '<< /Type /XObject /Subtype /Image /Width ' + this.jpegW + ' /Height ' + this.jpegH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>\nstream\n' + img + '\nendstream' : '<< >>';
    this.pages.forEach(function (p, i) {
      var c = p.join('\n');
      objs[6 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>' + (img ? ' /XObject << /Im1 5 0 R >>' : '') + ' >> /Contents ' + (7 + i * 2) + ' 0 R >>';
      objs[7 + i * 2] = '<< /Length ' + c.length + ' >>\nstream\n' + c + '\nendstream';
    });
    var out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', offs = [];
    for (var k = 1; k < objs.length; k++) { offs[k] = out.length; out += k + ' 0 obj\n' + objs[k] + '\nendobj\n'; }
    var xref = out.length;
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (k = 1; k < objs.length; k++) out += ('0000000000' + offs[k]).slice(-10) + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    var bytes = new Uint8Array(out.length);
    for (k = 0; k < out.length; k++) bytes[k] = out.charCodeAt(k) & 255;
    return bytes;
  };

  var PDF = {
    create: function (opts) {
      var d = new Doc(opts);
      if (opts && opts.jpegB64) {
        var bin = typeof atob === 'function' ? atob(opts.jpegB64) : Buffer.from(opts.jpegB64, 'base64').toString('latin1');
        d.jpeg = bin; d.jpegW = opts.jpegW; d.jpegH = opts.jpegH;
      }
      return d;
    },
    width: width, wrap: wrap
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PDF; else root.MiniPDF = PDF;
})(typeof window !== 'undefined' ? window : this);
