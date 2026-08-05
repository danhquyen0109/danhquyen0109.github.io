/* Trình tạo mã QR & mã vạch — chạy hoàn toàn phía client.
   qrcode-generator lo phần ma trận QR, JsBarcode lo phần mã vạch;
   phần vẽ SVG/canvas của mã QR là code riêng ở dưới để kiểm soát màu, lề và kiểu ô. */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };

  // Mặc định của thư viện là latin-1, đổi sang UTF-8 để tiếng Việt không thành ký tự lạ.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

  // Kết quả của lần render gần nhất — các nút tải/in đọc từ đây.
  var current = null; // { svg, toCanvas(), filename, kind }

  /* ============================================================
     Tabs
     ============================================================ */
  var tabs = document.querySelectorAll('.tab');
  var activePanel = 'qr';

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activePanel = tab.dataset.panel;
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('.panel').forEach(function (p) {
        p.classList.toggle('is-active', p.id === 'panel-' + activePanel);
      });
      render();
    });
  });

  /* ============================================================
     QR — dựng nội dung từ preset
     ============================================================ */
  var qrType = $('qr-type');

  qrType.addEventListener('change', function () {
    document.querySelectorAll('[data-form]').forEach(function (g) {
      g.classList.toggle('is-active', g.dataset.form === qrType.value);
    });
    render();
  });

  function val(id) { return ($(id).value || '').trim(); }

  // Ký tự có nghĩa đặc biệt trong chuỗi WIFI: phải được thoát.
  function escWifi(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }
  function escVcard(s) { return s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n'); }

  function buildQrText() {
    switch (qrType.value) {
      case 'url': {
        var u = val('qr-url');
        if (!u) return '';
        return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u;
      }

      case 'wifi': {
        var ssid = val('wifi-ssid');
        if (!ssid) return '';
        var enc = $('wifi-enc').value;
        var pass = val('wifi-pass');
        var s = 'WIFI:T:' + enc + ';S:' + escWifi(ssid) + ';';
        if (enc !== 'nopass') s += 'P:' + escWifi(pass) + ';';
        if ($('wifi-hidden').checked) s += 'H:true;';
        return s + ';';
      }

      case 'vcard': {
        var first = val('vc-first'), last = val('vc-last');
        var phone = val('vc-phone'), email = val('vc-email');
        var org = val('vc-org'), title = val('vc-title');
        var web = val('vc-web'), addr = val('vc-addr');
        if (!first && !last && !phone && !email) return '';
        var full = (first + ' ' + last).trim();
        var lines = ['BEGIN:VCARD', 'VERSION:3.0',
          'N:' + escVcard(last) + ';' + escVcard(first) + ';;;',
          'FN:' + escVcard(full)];
        if (org) lines.push('ORG:' + escVcard(org));
        if (title) lines.push('TITLE:' + escVcard(title));
        if (phone) lines.push('TEL;TYPE=CELL:' + escVcard(phone));
        if (email) lines.push('EMAIL;TYPE=INTERNET:' + escVcard(email));
        if (web) lines.push('URL:' + escVcard(web));
        if (addr) lines.push('ADR;TYPE=WORK:;;' + escVcard(addr) + ';;;;');
        lines.push('END:VCARD');
        return lines.join('\r\n');
      }

      case 'email': {
        var to = val('em-to');
        if (!to) return '';
        var q = [];
        if (val('em-sub')) q.push('subject=' + encodeURIComponent(val('em-sub')));
        if (val('em-body')) q.push('body=' + encodeURIComponent(val('em-body')));
        return 'mailto:' + to + (q.length ? '?' + q.join('&') : '');
      }

      case 'sms': {
        var num = val('sms-to');
        if (!num) return '';
        var body = val('sms-body');
        return 'SMSTO:' + num + (body ? ':' + body : '');
      }

      case 'tel': {
        var t = val('tel-num');
        return t ? 'tel:' + t.replace(/\s+/g, '') : '';
      }

      case 'geo': {
        var lat = val('geo-lat'), lng = val('geo-lng');
        return (lat && lng) ? 'geo:' + lat + ',' + lng : '';
      }

      default:
        return $('qr-text').value.trim();
    }
  }

  /* ============================================================
     QR — vẽ
     ============================================================ */

  // Vị trí tâm các ô căn chỉnh theo từng phiên bản QR (bảng chuẩn ISO/IEC 18004).
  var ALIGN_POS = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62],
    [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82],
    [6, 30, 58, 86], [6, 34, 62, 90],
    [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106],
    [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
    [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142],
    [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
    [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
  ];

  // Ô định vị ở ba góc, hai hàng/cột định thì và các ô căn chỉnh luôn được vẽ vuông đặc,
  // kể cả khi chọn kiểu chấm hay bo góc: máy quét dựa vào đúng những vùng này để dò mã,
  // đếm số ô và nắn hình. Cắt vụn chúng thành chấm rời là cách nhanh nhất làm mã không quét được.
  function structuralMask(n) {
    var mask = new Uint8Array(n * n);
    var version = (n - 17) / 4;

    function mark(r0, c0, size) {
      for (var r = r0; r < r0 + size; r++) {
        if (r < 0 || r >= n) continue;
        for (var c = c0; c < c0 + size; c++) {
          if (c >= 0 && c < n) mask[r * n + c] = 1;
        }
      }
    }

    mark(0, 0, 8);          // ô định vị góc trên trái + vạch ngăn
    mark(0, n - 8, 8);      // góc trên phải
    mark(n - 8, 0, 8);      // góc dưới trái
    for (var i = 0; i < n; i++) { mask[6 * n + i] = 1; mask[i * n + 6] = 1; } // định thì

    var pos = ALIGN_POS[version - 1] || [];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var r = pos[a], c = pos[b];
        // Ba vị trí trùng ô định vị thì không có ô căn chỉnh.
        if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
        mark(r - 2, c - 2, 5);
      }
    }
    return mask;
  }

  function qrOptions() {
    return {
      ec: $('qr-ec').value,
      margin: clampInt($('qr-margin').value, 0, 16, 4),
      size: clampInt($('qr-size').value, 128, 4096, 1024),
      style: $('qr-style').value,
      fg: $('qr-fg').value,
      bg: $('qr-bg').value,
      transparent: $('qr-transparent').checked
    };
  }

  function clampInt(v, min, max, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  function clampNum(v, min, max, fallback) {
    var n = parseFloat(v);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function qrToSvg(qr, o) {
    var n = qr.getModuleCount();
    var total = n + o.margin * 2;
    var parts = [];
    var px = 8 * total; // kích thước gợi ý khi mở file, viewBox lo phần co giãn

    parts.push('<svg xmlns="' + SVG_NS + '" width="' + px + '" height="' + px +
      '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges">');
    if (!o.transparent) {
      parts.push('<rect width="' + total + '" height="' + total + '" fill="' + o.bg + '"/>');
    }

    if (o.style === 'square') {
      // Gộp các ô liền nhau trong cùng hàng thành một nét path — file nhẹ hơn nhiều.
      var d = '';
      for (var r = 0; r < n; r++) {
        var run = 0;
        for (var c = 0; c <= n; c++) {
          var dark = c < n && qr.isDark(r, c);
          if (dark) { run++; continue; }
          if (run) {
            d += 'M' + (c - run + o.margin) + ' ' + (r + o.margin) + 'h' + run + 'v1h-' + run + 'z';
            run = 0;
          }
        }
      }
      parts.push('<path d="' + d + '" fill="' + o.fg + '"/>');
    } else {
      var mask = structuralMask(n);
      var shapes = '';
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          if (!qr.isDark(y, x)) continue;
          var cx = x + o.margin, cy = y + o.margin;
          if (mask[y * n + x]) {
            shapes += '<rect x="' + cx + '" y="' + cy + '" width="1" height="1"/>';
          } else if (o.style === 'dot') {
            shapes += '<circle cx="' + (cx + 0.5) + '" cy="' + (cy + 0.5) + '" r="0.5"/>';
          } else {
            shapes += '<rect x="' + cx + '" y="' + cy + '" width="1" height="1" rx="0.32"/>';
          }
        }
      }
      parts.push('<g fill="' + o.fg + '" shape-rendering="geometricPrecision">' + shapes + '</g>');
    }

    parts.push('</svg>');
    return parts.join('');
  }

  function qrToCanvas(qr, o) {
    var n = qr.getModuleCount();
    var total = n + o.margin * 2;
    // Làm tròn về bội số của tổng số ô: mọi ô rộng đúng bằng nhau, không bị răng cưa.
    var unit = Math.max(1, Math.round(o.size / total));
    var px = unit * total;

    var cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    var ctx = cv.getContext('2d');

    if (!o.transparent) {
      ctx.fillStyle = o.bg;
      ctx.fillRect(0, 0, px, px);
    }
    ctx.fillStyle = o.fg;
    var mask = o.style === 'square' ? null : structuralMask(n);

    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        var x = (c + o.margin) * unit, y = (r + o.margin) * unit;
        var plain = mask && mask[r * n + c];
        if (o.style === 'dot' && !plain) {
          ctx.beginPath();
          ctx.arc(x + unit / 2, y + unit / 2, unit / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.style === 'rounded' && !plain) {
          roundRect(ctx, x, y, unit, unit, unit * 0.32);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, unit, unit);
        }
      }
    }
    return cv;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderQr() {
    var text = buildQrText();
    var err = $('qr-error');

    if (!text) {
      err.hidden = true;
      return null;
    }

    var o = qrOptions();
    var qr;
    try {
      qr = qrcode(0, o.ec);
      qr.addData(text);
      qr.make();
    } catch (e) {
      err.hidden = false;
      err.textContent = 'Nội dung quá dài cho một mã QR. Hãy rút gọn văn bản, hoặc hạ mức chống lỗi xuống L.';
      return null;
    }
    err.hidden = true;

    var n = qr.getModuleCount();
    var version = (n - 17) / 4;
    var canvas = qrToCanvas(qr, o);

    return {
      svg: qrToSvg(qr, o),
      toCanvas: function () { return canvas; },
      filename: 'qr-' + slug(text),
      meta: 'Phiên bản ' + version + ' · ' + n + '×' + n + ' ô · chống lỗi ' + o.ec +
            ' · PNG ' + canvas.width + '×' + canvas.height + ' px · ' +
            byteLen(text) + ' byte dữ liệu'
    };
  }

  function byteLen(s) {
    return (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(s).length : s.length;
  }

  /* ============================================================
     Mã vạch
     ============================================================ */
  var FORMATS = {
    CODE128:   { hint: 'Nhận mọi ký tự ASCII, độ dài tuỳ ý. Lựa chọn an toàn cho mã nội bộ.', sample: 'DANHQUYEN-0109' },
    CODE128A:  { hint: 'Chữ IN HOA, số và ký tự điều khiển.', sample: 'DANHQUYEN0109' },
    CODE128B:  { hint: 'Chữ thường, chữ hoa và số.', sample: 'DanhQuyen-0109' },
    CODE128C:  { hint: 'Chỉ chữ số, số lượng phải chẵn.', sample: '12345678' },
    EAN13:     { hint: '12 chữ số — số kiểm tra thứ 13 được tính tự động.', sample: '893456789012' },
    EAN8:      { hint: '7 chữ số — số kiểm tra thứ 8 được tính tự động.', sample: '9638527' },
    EAN5:      { hint: '5 chữ số (phụ trợ, in kèm EAN-13).', sample: '54495' },
    EAN2:      { hint: '2 chữ số (phụ trợ, in kèm EAN-13).', sample: '53' },
    UPC:       { hint: '11 chữ số — số kiểm tra thứ 12 được tính tự động.', sample: '01234567890' },
    UPCE:      { hint: '6 chữ số, hoặc 7–8 số nếu kèm hệ thống số và số kiểm tra.', sample: '01234565' },
    CODE39:    { hint: 'Chữ IN HOA, số và các ký tự - . $ / + % cùng dấu cách.', sample: 'DANH QUYEN 0109' },
    ITF:       { hint: 'Chỉ chữ số, số lượng phải chẵn.', sample: '12345678' },
    ITF14:     { hint: '13 chữ số — số kiểm tra thứ 14 được tính tự động.', sample: '1234567890123' },
    MSI:       { hint: 'Chỉ chữ số.', sample: '1234567' },
    MSI10:     { hint: 'Chỉ chữ số, thêm 1 số kiểm tra mod 10.', sample: '1234567' },
    MSI11:     { hint: 'Chỉ chữ số, thêm 1 số kiểm tra mod 11.', sample: '1234567' },
    MSI1010:   { hint: 'Chỉ chữ số, thêm 2 số kiểm tra mod 10.', sample: '1234567' },
    MSI1110:   { hint: 'Chỉ chữ số, thêm số kiểm tra mod 11 rồi mod 10.', sample: '1234567' },
    codabar:   { hint: 'Chữ số và - $ : / . + — có thể bọc giữa hai chữ A–D.', sample: 'A12345B' },
    pharmacode:{ hint: 'Một số nguyên từ 3 đến 131070.', sample: '1234' }
  };

  var bcFormat = $('bc-format');
  var bcValue = $('bc-value');

  function barcodeOptions(scale) {
    var transparent = $('bc-transparent').checked;
    return {
      format: bcFormat.value,
      width: clampNum($('bc-width').value, 1, 8, 2) * scale,
      height: clampInt($('bc-height').value, 20, 300, 100) * scale,
      margin: clampInt($('bc-margin').value, 0, 60, 10) * scale,
      fontSize: clampInt($('bc-fontsize').value, 8, 48, 20) * scale,
      displayValue: $('bc-display').checked,
      textAlign: $('bc-align').value,
      lineColor: $('bc-fg').value,
      background: transparent ? 'transparent' : $('bc-bg').value,
      font: 'Inter, Arial, sans-serif',
      fontOptions: 'bold'
    };
  }

  function tryBarcode(target, value, scale) {
    var ok = false;
    var opts = barcodeOptions(scale);
    opts.valid = function (v) { ok = v; };
    try {
      JsBarcode(target, value, opts);
    } catch (e) {
      ok = false;
    }
    return ok;
  }

  function renderBarcode() {
    var value = bcValue.value.trim();
    var err = $('bc-error');
    var fmt = bcFormat.value;

    if (!value) {
      err.hidden = true;
      return null;
    }

    var svgEl = document.createElementNS(SVG_NS, 'svg');
    if (!tryBarcode(svgEl, value, 1)) {
      err.hidden = false;
      err.textContent = 'Nội dung không hợp lệ cho ' + fmt + '. ' + (FORMATS[fmt] || {}).hint;
      return null;
    }
    err.hidden = true;

    var scale = clampInt($('bc-scale').value, 1, 6, 3);
    var canvas = document.createElement('canvas');
    if (!tryBarcode(canvas, value, scale)) return null;

    return {
      svg: new XMLSerializer().serializeToString(svgEl),
      toCanvas: function () { return canvas; },
      filename: 'barcode-' + fmt.toLowerCase() + '-' + slug(value),
      meta: fmt + ' · ' + value.length + ' ký tự · PNG ' + canvas.width + '×' + canvas.height + ' px'
    };
  }

  // Đổi chuẩn thì nội dung cũ thường không còn hợp lệ — thay bằng ví dụ mẫu cho đỡ phải đoán.
  bcFormat.addEventListener('change', function () {
    var info = FORMATS[bcFormat.value] || {};
    $('bc-format-hint').textContent = info.hint || '';
    var probe = document.createElementNS(SVG_NS, 'svg');
    if (bcValue.value.trim() && !tryBarcode(probe, bcValue.value.trim(), 1)) {
      bcValue.value = info.sample || '';
    }
    render();
  });

  /* ============================================================
     Render + xuất file
     ============================================================ */
  var stage = $('stage');
  var stageBox = $('stage-box');
  var meta = $('meta');
  var exportButtons = ['dl-png', 'dl-svg', 'copy-png', 'do-print'].map($);

  function render() {
    var result = activePanel === 'qr' ? renderQr() : renderBarcode();
    current = result;

    var alpha = activePanel === 'qr' ? $('qr-transparent').checked : $('bc-transparent').checked;
    stage.classList.toggle('is-alpha', !!result && alpha);
    stage.classList.toggle('is-empty', !result);
    stageBox.innerHTML = result ? result.svg : '';
    meta.textContent = result ? result.meta : '';
    exportButtons.forEach(function (b) { b.disabled = !result; });
  }

  var timer = null;
  function scheduleRender() {
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  }

  // Mọi ô nhập đều kích hoạt render — không cần nút "Tạo mã".
  document.querySelectorAll('input, select, textarea').forEach(function (el) {
    el.addEventListener('input', scheduleRender);
    if (el.tagName === 'SELECT' || el.type === 'checkbox') el.addEventListener('change', scheduleRender);
  });

  function slug(s) {
    var out = s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
    out = out.replace(/đ/g, 'd').replace(/Đ/g, 'D')
             .replace(/[^a-zA-Z0-9]+/g, '-')
             .replace(/^-+|-+$/g, '')
             .slice(0, 40)
             .toLowerCase();
    return out || 'ma';
  }

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var toast = $('toast');
  var toastTimer = null;
  function say(msg) {
    toast.hidden = false;
    toast.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2600);
  }

  $('dl-png').addEventListener('click', function () {
    if (!current) return;
    current.toCanvas().toBlob(function (blob) {
      saveBlob(blob, current.filename + '.png');
      say('Đã tải ảnh PNG');
    }, 'image/png');
  });

  $('dl-svg').addEventListener('click', function () {
    if (!current) return;
    saveBlob(new Blob([current.svg], { type: 'image/svg+xml;charset=utf-8' }), current.filename + '.svg');
    say('Đã tải ảnh SVG');
  });

  $('copy-png').addEventListener('click', function () {
    if (!current) return;
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      say('Trình duyệt này không cho sao chép ảnh — hãy tải PNG');
      return;
    }
    current.toCanvas().toBlob(function (blob) {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(function () { say('Đã sao chép vào clipboard'); })
        .catch(function () { say('Không sao chép được — hãy tải PNG'); });
    }, 'image/png');
  });

  $('do-print').addEventListener('click', function () { window.print(); });

  /* ============================================================
     Khởi động
     ============================================================ */
  $('year').textContent = new Date().getFullYear();
  $('bc-format-hint').textContent = FORMATS[bcFormat.value].hint;
  render();
})();
