/* =========================================================================
   Đổi đuôi ảnh & video — toàn bộ xử lý chạy trong tab trình duyệt.

   Hai đường xử lý song song:
     · Canvas   — ảnh tĩnh sang PNG/JPG/WEBP/ICO. Gần như tức thì, không cần
                  đụng tới FFmpeg nên đỡ phải tải 32 MB wasm.
     · FFmpeg   — video, âm thanh, GIF động, BMP/TIFF. Nạp lười (lazy) đúng
                  lúc cần dùng lần đầu.
   ========================================================================= */

/* ===================== Tiện ích chung ===================== */

const $  = (id) => document.getElementById(id);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}
function baseOf(name) {
  const i = name.lastIndexOf('.');
  return i <= 0 ? name : name.slice(0, i);
}
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
function fmtDur(sec) {
  if (!isFinite(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* Đuôi file mà trình duyệt không đoán ra MIME (mkv, m4v…) nên phải tự nhận diện. */
const IMG_EXT = ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'ico', 'avif', 'svg', 'heic', 'heif'];
const VID_EXT = ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'flv', 'wmv', '3gp', 'mpg', 'mpeg', 'ts', 'ogv'];
const AUD_EXT = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'amr'];

function kindOf(file) {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  const e = extOf(file.name);
  if (IMG_EXT.includes(e)) return 'image';
  if (VID_EXT.includes(e)) return 'video';
  if (AUD_EXT.includes(e)) return 'audio';
  return 'other';
}

/* ===================== Bảng định dạng đích ===================== */

const TARGETS = {
  png:  { ext: 'png',  mime: 'image/png' },
  jpg:  { ext: 'jpg',  mime: 'image/jpeg' },
  webp: { ext: 'webp', mime: 'image/webp' },
  gif:  { ext: 'gif',  mime: 'image/gif' },
  bmp:  { ext: 'bmp',  mime: 'image/bmp' },
  tiff: { ext: 'tiff', mime: 'image/tiff' },
  ico:  { ext: 'ico',  mime: 'image/x-icon' },
  mp4:  { ext: 'mp4',  mime: 'video/mp4' },
  webm: { ext: 'webm', mime: 'video/webm' },
  mkv:  { ext: 'mkv',  mime: 'video/x-matroska' },
  mov:  { ext: 'mov',  mime: 'video/quicktime' },
  avi:  { ext: 'avi',  mime: 'video/x-msvideo' },
  mp3:  { ext: 'mp3',  mime: 'audio/mpeg' },
  m4a:  { ext: 'm4a',  mime: 'audio/mp4' },
  wav:  { ext: 'wav',  mime: 'audio/wav' },
  flac: { ext: 'flac', mime: 'audio/flac' },
  ogg:  { ext: 'ogg',  mime: 'audio/ogg' },
};

const IMG_HINTS = {
  png:  'Nén không mất chất, giữ được nền trong suốt. File to hơn JPG nhiều nếu là ảnh chụp.',
  jpg:  'Nhẹ nhất cho ảnh chụp. Không có nền trong suốt — vùng trong sẽ được tô màu nền bên dưới.',
  webp: 'Nhẹ hơn JPG khoảng 25–30% ở cùng chất lượng, vẫn giữ được nền trong. Mọi trình duyệt hiện nay đều mở được.',
  gif:  'Tối đa 256 màu nên ảnh chụp sẽ bị loang. Chọn GIF khi cần ảnh động — ảnh động thả vào đây vẫn giữ được chuyển động.',
  bmp:  'Không nén chút nào, file rất to. Chỉ dùng khi phần mềm bên nhận bắt buộc.',
  tiff: 'Dành cho nhà in và quét tài liệu. File to, bù lại không mất chất.',
  ico:  'Icon cho Windows và favicon website. Sẽ được thu về tối đa 256×256px.',
};
const VID_HINTS = {
  mp4:  'H.264 + AAC — điện thoại, TV, Zalo, Messenger đều mở được. Cứ chọn cái này nếu chưa biết chọn gì.',
  webm: 'VP8 + Vorbis, nhẹ và nhúng thẳng vào website được. Máy Apple đời cũ có thể không mở.',
  mkv:  'Cùng H.264 như MP4 nhưng đựng trong hộp Matroska — hợp với máy tính, kén thiết bị di động.',
  mov:  'H.264 trong hộp QuickTime, hợp khi đưa vào Final Cut hay iMovie.',
  avi:  'MPEG-4 kiểu cũ, dành cho máy hoặc đầu đĩa đời cũ. File to hơn MP4 đáng kể.',
  gif:  'Không có tiếng và chỉ 256 màu, file lại rất nặng. Nên hạ độ phân giải xuống 480p và cắt lấy vài giây thôi.',
};
const AUD_HINTS = {
  mp3:  'Mở được ở mọi nơi, kể cả đầu đĩa và ô tô đời cũ.',
  m4a:  'AAC — cùng bitrate thì nghe hay hơn MP3. Máy Apple ưa dùng.',
  wav:  'Không nén, chuẩn để đưa vào phần mềm dựng. File to gấp khoảng 10 lần MP3.',
  flac: 'Nén lại nhưng không mất một chút chất nào. Còn khoảng một nửa so với WAV.',
  ogg:  'Vorbis — mã nguồn mở, nhẹ. Một số thiết bị cũ không đọc được.',
};

/* ===================== Nạp FFmpeg ===================== */

const CORE_URL = new URL('vendor/ffmpeg-core/ffmpeg-core.js', location.href).href;
const WASM_URL = new URL('vendor/ffmpeg-core/ffmpeg-core.wasm', location.href).href;

let ffmpeg = null;
let ffmpegPending = null;
let logSink = null;     // hàm nhận từng dòng log của lần exec đang chạy
let ffFileSeq = 0;      // để tên file trong MEMFS không đụng nhau

async function fetchWasmBlob(onProgress) {
  const res = await fetch(WASM_URL);
  if (!res.ok) throw new Error('Không tải được bộ giải mã (HTTP ' + res.status + ').');

  // Content-Length là kích thước sau khi nén đường truyền, còn chunk đọc ra đã
  // giải nén — nên tỉ lệ có thể vượt 1. Chặn lại ở 1 cho thanh tiến trình khỏi tràn.
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) {
    onProgress(-1);
    return URL.createObjectURL(await res.blob());
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  onProgress(1);
  return URL.createObjectURL(new Blob(chunks, { type: 'application/wasm' }));
}

async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (ffmpegPending) return ffmpegPending;

  ffmpegPending = (async () => {
    if (typeof FFmpegWASM === 'undefined') throw new Error('Thiếu tệp vendor/ffmpeg.js.');
    $('loader').hidden = false;
    $('loader-title').textContent = 'Đang tải bộ giải mã…';
    setLoaderBar(0);

    const wasmURL = await fetchWasmBlob((p) => setLoaderBar(p));
    $('loader-title').textContent = 'Đang khởi động bộ giải mã…';

    const ff = new FFmpegWASM.FFmpeg();
    ff.on('log', ({ message }) => { if (logSink) logSink(message); });
    await ff.load({ coreURL: CORE_URL, wasmURL });

    URL.revokeObjectURL(wasmURL);
    $('loader').hidden = true;
    ffmpeg = ff;
    return ff;
  })();

  try {
    return await ffmpegPending;
  } catch (err) {
    ffmpegPending = null;
    $('loader').hidden = true;
    throw err;
  }
}

function setLoaderBar(p) {
  const bar = $('loader-bar'), pct = $('loader-pct');
  if (p < 0) { bar.style.width = '100%'; pct.textContent = '…'; return; }
  bar.style.width = Math.round(p * 100) + '%';
  pct.textContent = Math.round(p * 100) + '%';
}

/* Chạy một lệnh FFmpeg, có bắt tiến trình từ log (`Duration:` và `time=`). */
const RE_DURATION = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const RE_TIME     = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;

async function runFFmpeg(ff, args, knownDuration, onProgress) {
  const tail = [];
  let duration = knownDuration || 0;

  logSink = (line) => {
    tail.push(line);
    if (tail.length > 60) tail.shift();
    if (!duration) {
      const d = RE_DURATION.exec(line);
      if (d) duration = (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]);
    }
    const t = RE_TIME.exec(line);
    if (t && duration > 0 && onProgress) {
      const cur = (+t[1]) * 3600 + (+t[2]) * 60 + parseFloat(t[3]);
      onProgress(clamp(cur / duration, 0, 1));
    }
  };

  try {
    const code = await ff.exec(args);
    if (code !== 0) throw new Error(readableFFmpegError(tail));
  } finally {
    logSink = null;
  }
}

/* Log của FFmpeg dài và khó đọc — lọc lấy dòng đáng kể nhất để hiện cho người dùng. */
function readableFFmpegError(tail) {
  const line = [...tail].reverse().find((l) =>
    /Invalid data|not contain any stream|No such file|Unknown encoder|Decoder .* not found|Error|failed|Unable to/i.test(l)
  );
  if (line && /Invalid data|not contain any stream/i.test(line)) {
    return 'Không đọc được file này — định dạng gốc có thể không được hỗ trợ hoặc file bị hỏng.';
  }
  if (line && /memory|allocat/i.test(line)) {
    return 'Hết bộ nhớ. File quá lớn so với giới hạn của trình duyệt — thử hạ độ phân giải hoặc cắt ngắn lại.';
  }
  return line ? line.trim() : 'FFmpeg dừng giữa chừng mà không nói lý do.';
}

/* ===================== Đọc thông số file bằng thẻ <video> ===================== */

/* Biết trước kích thước và độ dài giúp tính đúng khung hình đích và vẽ được
   thanh tiến trình ngay từ giây đầu. Thẻ <video> chịu thua với mkv/avi thì
   trả về null, lúc đó vẫn còn `Duration:` trong log FFmpeg để dựa vào. */
function probeMedia(file) {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), 8000);
    el.preload = 'metadata';
    el.muted = true;
    el.onloadedmetadata = () => finish({
      width: el.videoWidth || 0,
      height: el.videoHeight || 0,
      duration: isFinite(el.duration) ? el.duration : 0,
    });
    el.onerror = () => finish(null);
    el.src = url;
  });
}

/* ===================== Đường ảnh: canvas ===================== */

let webpOK = null;
function canvasSupportsWebp() {
  if (webpOK === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpOK = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpOK;
}

async function decodeImage(file) {
  const isSvg = /svg/i.test(file.type) || extOf(file.name) === 'svg';
  if (!isSvg && typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file); } catch (_) { /* rơi xuống thẻ <img> */ }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(
        /heic|heif/.test(extOf(file.name))
          ? 'Trình duyệt không giải mã được ảnh HEIC của iPhone. Trong máy iPhone vào Cài đặt › Camera › Định dạng, chọn «Tương thích nhất» rồi chụp lại, hoặc đổi sang JPG trước khi tải lên.'
          : 'Không mở được ảnh này — file có thể hỏng hoặc dùng định dạng trình duyệt không đọc được.'
      ));
    };
    img.src = url;
  });
}

function srcSize(src) {
  return [src.width || src.naturalWidth || 0, src.height || src.naturalHeight || 0];
}

function targetSize(sw, sh, o) {
  if (!sw || !sh) return [sw || 1, sh || 1];
  const W = Math.max(1, o.w | 0), H = Math.max(1, o.h | 0);
  let scale = 1;
  if (o.resize === 'width')       scale = W / sw;
  else if (o.resize === 'height') scale = H / sh;
  else if (o.resize === 'fit')    scale = Math.min(W / sw, H / sh);
  else if (o.resize === 'exact')  return [W, H];
  else return [sw, sh];

  if (o.noUpscale) scale = Math.min(scale, 1);
  return [Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale))];
}

/* Thu nhỏ nhiều lần mỗi lần một nửa: drawImage một phát từ 4000px xuống 300px
   sẽ răng cưa vì trình duyệt chỉ lấy mẫu điểm gần nhất. */
function drawScaled(src, w, h, bg) {
  let [cw, ch] = srcSize(src);
  let cur = src;

  while (cw > w * 2 && ch > h * 2) {
    const nw = Math.max(w, Math.round(cw / 2));
    const nh = Math.max(h, Math.round(ch / 2));
    const step = document.createElement('canvas');
    step.width = nw; step.height = nh;
    const sctx = step.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cur, 0, 0, nw, nh);
    cur = step; cw = nw; ch = nh;
  }

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h);
  return out;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Trình duyệt không xuất được ảnh ' + mime + '.'))),
      mime,
      quality
    );
  });
}

/* ICO chuẩn cho phép nhét thẳng một ảnh PNG vào trong, nên chỉ cần bọc thêm
   14 byte tiêu đề là xong — khỏi phải tự dựng bitmap và mặt nạ AND. */
async function buildIco(canvas) {
  const png = new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());
  const out = new Uint8Array(22 + png.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);            // reserved
  view.setUint16(2, 1, true);            // type = icon
  view.setUint16(4, 1, true);            // số ảnh
  out[6] = canvas.width  >= 256 ? 0 : canvas.width;   // 0 nghĩa là 256
  out[7] = canvas.height >= 256 ? 0 : canvas.height;
  out[8] = 0;                            // số màu bảng màu
  out[9] = 0;                            // reserved
  view.setUint16(10, 1, true);           // color planes
  view.setUint16(12, 32, true);          // bit / điểm ảnh
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);          // vị trí dữ liệu ảnh
  out.set(png, 22);
  return new Blob([out], { type: 'image/x-icon' });
}

/* ===================== Dựng tham số FFmpeg ===================== */

const CRF_X264 = { high: 20, medium: 26, small: 32 };
const CRF_VP8  = { high: 16, medium: 28, small: 40 };
const Q_MPEG4  = { high: 3,  medium: 6,  small: 12 };

/* H.264, VP8 và MPEG-4 đều đòi chiều rộng/cao chẵn. */
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

function videoArgs(inName, outName, o, meta) {
  const args = ['-y', '-hide_banner', '-i', inName];
  if (o.trim > 0) args.push('-t', String(o.trim));

  // Bộ lọc hình: đổi kích thước rồi ép về số chẵn.
  const vf = [];
  if (o.res > 0) {
    if (meta && meta.width && meta.height) {
      // Biết kích thước gốc thì tự tính, nhờ vậy không phóng to video vốn đã nhỏ.
      if (meta.height > o.res) {
        const h = even(o.res);
        vf.push('scale=' + even(meta.width * (o.res / meta.height)) + ':' + h);
      }
    } else {
      vf.push('scale=-2:' + even(o.res));
    }
  }

  if (o.format === 'gif') {
    const fps = o.fps > 0 ? o.fps : 12;
    const chain = [];
    chain.push('fps=' + fps);
    if (vf.length) chain.push(vf[0].replace(/^scale=(-?\d+):(-?\d+)$/, 'scale=$1:$2:flags=lanczos'));
    args.push(
      '-filter_complex',
      chain.join(',') + ',split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5',
      '-loop', '0',
      outName
    );
    return args;
  }

  if (vf.length) args.push('-vf', vf.join(','));
  if (o.fps > 0) args.push('-r', String(o.fps));

  if (o.format === 'webm') {
    // deadline=realtime + cpu-used=8 là mức nhanh nhất của libvpx; wasm một
    // luồng mà để mặc định thì một video 30 giây có thể chạy mất vài phút.
    args.push('-c:v', 'libvpx', '-crf', String(CRF_VP8[o.quality]), '-b:v', '0',
              '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p');
    args.push(...(o.mute ? ['-an'] : ['-c:a', 'libvorbis', '-b:a', '128k']));
  } else if (o.format === 'avi') {
    args.push('-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', String(Q_MPEG4[o.quality]));
    args.push(...(o.mute ? ['-an'] : ['-c:a', 'libmp3lame', '-b:a', '128k']));
  } else {
    args.push('-c:v', 'libx264', '-preset', o.preset, '-crf', String(CRF_X264[o.quality]),
              '-pix_fmt', 'yuv420p');
    args.push(...(o.mute ? ['-an'] : ['-c:a', 'aac', '-b:a', '128k']));
    if (o.format === 'mp4' || o.format === 'mov') args.push('-movflags', '+faststart');
  }

  args.push(outName);
  return args;
}

function audioArgs(inName, outName, o) {
  const args = ['-y', '-hide_banner', '-i', inName, '-vn'];
  const br = o.bitrate + 'k';
  switch (o.format) {
    case 'mp3':  args.push('-c:a', 'libmp3lame', '-b:a', br); break;
    case 'm4a':  args.push('-c:a', 'aac',        '-b:a', br); break;
    case 'ogg':  args.push('-c:a', 'libvorbis',  '-b:a', br); break;
    case 'wav':  args.push('-c:a', 'pcm_s16le'); break;
    case 'flac': args.push('-c:a', 'flac'); break;
  }
  if (o.rate > 0) args.push('-ar', String(o.rate));
  if (o.mono) args.push('-ac', '1');
  args.push(outName);
  return args;
}

/* ===================== Chuyển đổi một file ===================== */

async function withFFmpegFile(file, outExt, buildArgs, duration, onProgress) {
  const ff = await getFFmpeg();
  const stamp = Date.now().toString(36) + (ffFileSeq++).toString(36);
  const inName = 'in_' + stamp + '.' + (extOf(file.name) || 'bin');
  const outName = 'out_' + stamp + '.' + outExt;

  await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
  try {
    await runFFmpeg(ff, buildArgs(inName, outName), duration, onProgress);
    const data = await ff.readFile(outName);
    // Dọn MEMFS ngay, không thì file thứ hai sẽ cộng dồn vào bộ nhớ của tab.
    for (const n of [inName, outName]) {
      try { await ff.deleteFile(n); } catch (_) { /* chưa kịp tạo thì thôi */ }
    }
    return new Blob([data.buffer ? data.buffer : data], { type: TARGETS[outExt] ? TARGETS[outExt].mime : 'application/octet-stream' });
  } catch (err) {
    if (isWasmTrap(err)) {
      // Wasm đã sập thì cả module hỏng theo — dọn file lúc này sẽ treo luôn.
      // Vứt instance đi, file sau sẽ tự dựng lại một bộ mới.
      resetFFmpeg();
      throw new Error('Bộ giải mã gục giữa chừng với file này. Thử đổi sang định dạng khác, hoặc hạ độ phân giải / cắt ngắn video rồi làm lại.');
    }
    for (const n of [inName, outName]) {
      try { await ff.deleteFile(n); } catch (_) { /* kệ */ }
    }
    throw err;
  }
}

/* Wasm gặp lỗi bộ nhớ thì ném RuntimeError chứ không phải mã thoát của FFmpeg. */
function isWasmTrap(err) {
  const m = String((err && err.message) || err);
  return /memory access out of bounds|unreachable|RuntimeError|Aborted|table index is out of bounds|out of memory/i.test(m);
}

function resetFFmpeg() {
  logSink = null;
  try { if (ffmpeg) ffmpeg.terminate(); } catch (_) { /* đã chết sẵn */ }
  ffmpeg = null;
  ffmpegPending = null;
}

async function convertImage(item, o, onProgress) {
  const file = item.file;
  const t = o.format;
  const srcExt = extOf(file.name);
  const srcIsGif = srcExt === 'gif' || /gif/i.test(file.type);

  // GIF động chỉ giữ được chuyển động nếu để FFmpeg xử lý thẳng file gốc.
  const wantsAnimation = t === 'gif' || (t === 'webp' && srcIsGif);
  if (wantsAnimation) {
    try {
      return await withFFmpegFile(file, TARGETS[t].ext, (i, out) => {
        const args = ['-y', '-hide_banner', '-i', i];
        const scale = imgScaleFilter(item, o);
        if (t === 'gif') {
          const chain = (scale ? scale + ',' : '') + 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5';
          args.push('-filter_complex', chain, '-loop', '0');
        } else {
          if (scale) args.push('-vf', scale);
          args.push('-loop', '0');
        }
        args.push(out);
        return args;
      }, 0, onProgress);
    } catch (err) {
      // GIF tĩnh thì quay về đường canvas cho chắc; WEBP động thì chịu.
      if (t !== 'gif') throw err;
    }
  }

  const src = await decodeImage(file);
  const [sw, sh] = srcSize(src);
  if (!sw || !sh) throw new Error('Không đọc được kích thước ảnh.');

  let [w, h] = targetSize(sw, sh, o);
  if (t === 'ico') {
    const s = Math.min(1, 256 / Math.max(w, h));
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }

  const flatten = (t === 'jpg' || t === 'bmp') ? o.bg : null;
  const canvas = drawScaled(src, w, h, flatten);
  if (src.close) src.close();
  item.outDims = w + '×' + h;

  if (t === 'ico') return await buildIco(canvas);
  if (t === 'png')  return await canvasToBlob(canvas, 'image/png');
  if (t === 'jpg')  return await canvasToBlob(canvas, 'image/jpeg', o.quality);
  if (t === 'webp' && canvasSupportsWebp()) return await canvasToBlob(canvas, 'image/webp', o.quality);

  // BMP, TIFF (và WEBP trên trình duyệt cũ): đưa qua FFmpeg dưới dạng PNG đã
  // chỉnh kích thước sẵn, nên FFmpeg chỉ phải giải mã PNG — không kén file gốc.
  const png = await canvasToBlob(canvas, 'image/png');
  const asFile = new File([png], 'step.png', { type: 'image/png' });
  return await withFFmpegFile(asFile, TARGETS[t].ext, (i, out) => {
    const args = ['-y', '-hide_banner', '-i', i, '-frames:v', '1', '-update', '1'];
    if (t === 'bmp') args.push('-pix_fmt', 'bgr24');
    args.push(out);
    return args;
  }, 0, onProgress);
}

/* Bộ lọc scale cho đường FFmpeg của ảnh (chỉ dùng khi bỏ qua canvas). */
function imgScaleFilter(item, o) {
  if (o.resize === 'none') return '';
  const d = item.dims;
  if (d && d.w && d.h) {
    const [w, h] = targetSize(d.w, d.h, o);
    if (w === d.w && h === d.h) return '';
    return 'scale=' + w + ':' + h + ':flags=lanczos';
  }
  if (o.resize === 'height' || o.resize === 'fit') return 'scale=-1:' + Math.max(1, o.h | 0) + ':flags=lanczos';
  if (o.resize === 'exact') return 'scale=' + Math.max(1, o.w | 0) + ':' + Math.max(1, o.h | 0) + ':flags=lanczos';
  return 'scale=' + Math.max(1, o.w | 0) + ':-1:flags=lanczos';
}

async function convertVideo(item, o, onProgress) {
  const meta = item.meta || (item.meta = await probeMedia(item.file));
  return await withFFmpegFile(
    item.file,
    TARGETS[o.format].ext,
    (i, out) => videoArgs(i, out, o, meta),
    meta ? meta.duration : 0,
    onProgress
  );
}

async function convertAudio(item, o, onProgress) {
  const meta = item.meta || (item.meta = await probeMedia(item.file));
  return await withFFmpegFile(
    item.file,
    TARGETS[o.format].ext,
    (i, out) => audioArgs(i, out, o),
    meta ? meta.duration : 0,
    onProgress
  );
}

/* ===================== Trạng thái & giao diện ===================== */

let tab = 'img';
const queues = { img: [], vid: [], aud: [] };
let running = false;
let stopRequested = false;
let seq = 0;

const ACCEPT = { img: 'image/*', vid: 'video/*', aud: 'audio/*,video/*' };
const WANT_KIND = { img: ['image'], vid: ['video'], aud: ['audio', 'video'] };
const DROP_TEXT = {
  img: ['Kéo thả ảnh vào đây', 'hoặc bấm để chọn từ máy — chọn được nhiều ảnh một lúc'],
  vid: ['Kéo thả video vào đây', 'hoặc bấm để chọn từ máy — chọn được nhiều video một lúc'],
  aud: ['Kéo thả video hoặc file nhạc vào đây', 'phần hình sẽ được bỏ đi, chỉ giữ lại tiếng'],
};

function currentOptions() {
  if (tab === 'img') {
    return {
      format: $('img-format').value,
      quality: (+$('img-quality').value) / 100,
      resize: $('img-resize').value,
      w: +$('img-w').value,
      h: +$('img-h').value,
      bg: $('img-bg').value,
      // «tối đa» / «vừa trong khung» mặc định không kéo giãn ảnh nhỏ lên.
      noUpscale: !$('img-upscale').checked,
    };
  }
  if (tab === 'vid') {
    return {
      format: $('vid-format').value,
      quality: $('vid-quality').value,
      res: +$('vid-res').value,
      fps: +$('vid-fps').value,
      preset: $('vid-preset').value,
      trim: Math.max(0, +$('vid-trim').value || 0),
      mute: $('vid-mute').checked,
    };
  }
  return {
    format: $('aud-format').value,
    bitrate: +$('aud-bitrate').value,
    rate: +$('aud-rate').value,
    mono: $('aud-mono').checked,
  };
}

function outNameFor(item, o) {
  return baseOf(item.file.name) + '.' + TARGETS[o.format].ext;
}

const ICON_IMG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 5H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zm-1 12H4v-1.6l4.2-4.2 3.3 3.3 4.3-4.3L20 14.1V17zM8.5 11a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5z"/></svg>';
const ICON_VID = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h11a2 2 0 0 1 2 2v3.2l4-2.7v9l-4-2.7V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>';
const ICON_AUD = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v11.6A4 4 0 1 0 14 18V7h5V3h-7z"/></svg>';
const ICON_DL  = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.6l3.3-3.3 1.4 1.4L12 17.4l-4.7-5.7 1.4-1.4L12 13.6V3zM5 19h14v2H5v-2z"/></svg>';
const ICON_X   = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4L10.6 10.6l6.3-6.3z"/></svg>';

function render() {
  const list = queues[tab];
  const ul = $('files');
  ul.innerHTML = '';
  $('empty').hidden = list.length > 0;

  for (const item of list) {
    const li = document.createElement('li');
    li.className = 'file' + (item.status === 'done' ? ' is-done' : item.status === 'error' ? ' is-error' : '');

    const kind = kindOf(item.file);
    const thumb = item.thumbUrl
      ? '<img src="' + item.thumbUrl + '" alt="">'
      : kind === 'video' ? ICON_VID : kind === 'audio' ? ICON_AUD : ICON_IMG;

    li.innerHTML =
      '<div class="thumb">' + thumb + '</div>' +
      '<div class="body">' +
        '<div class="name">' + escapeHtml(item.file.name) + '</div>' +
        '<div class="sub"></div>' +
        (item.status === 'working' ? '<div class="bar"><i style="width:0%"></i></div>' : '') +
      '</div>' +
      '<div class="tools"></div>';

    li.querySelector('.sub').innerHTML = subLine(item);

    const tools = li.querySelector('.tools');
    if (item.status === 'working') {
      const s = document.createElement('div');
      s.className = 'spinner';
      tools.appendChild(s);
    } else {
      if (item.out) {
        const dl = document.createElement('button');
        dl.className = 'icon-btn primary';
        dl.title = 'Tải về ' + item.outName;
        dl.innerHTML = ICON_DL;
        dl.onclick = () => saveBlob(item.out, item.outName);
        tools.appendChild(dl);
      }
      const rm = document.createElement('button');
      rm.className = 'icon-btn';
      rm.title = 'Bỏ khỏi danh sách';
      rm.innerHTML = ICON_X;
      rm.disabled = running;
      rm.onclick = () => removeItem(item);
      tools.appendChild(rm);
    }

    item.el = li;
    item.barEl = li.querySelector('.bar i');
    ul.appendChild(li);
  }

  const done = list.filter((i) => i.out);
  $('dl-zip').disabled = running || done.length < 1;
  $('clear').disabled = running || list.length < 1;
  $('run').disabled = running || list.length < 1;
  $('run-label').textContent = list.length > 1 ? 'Chuyển đổi ' + list.length + ' file' : 'Chuyển đổi';
}

function subLine(item) {
  if (item.status === 'error') return escapeHtml(item.error);

  const bits = [];
  bits.push(fmtBytes(item.file.size));
  if (item.dims) bits.push(item.dims.w + '×' + item.dims.h);
  if (item.meta && item.meta.duration) bits.push(fmtDur(item.meta.duration));

  if (item.status === 'working') {
    return escapeHtml(bits.join(' · ')) + ' <span class="arrow">→</span> đang xử lý…';
  }
  if (item.out) {
    const delta = item.out.size / item.file.size;
    const pct = Math.round((1 - delta) * 100);
    const tag = pct > 0
      ? '<span class="gain">nhẹ hơn ' + pct + '%</span>'
      : '<span class="grow">nặng hơn ' + Math.abs(pct) + '%</span>';
    const out = [fmtBytes(item.out.size)];
    if (item.outDims) out.push(item.outDims);
    return escapeHtml(bits.join(' · ')) + ' <span class="arrow">→</span> ' +
           escapeHtml(out.join(' · ')) + ' · ' + tag;
  }
  return escapeHtml(bits.join(' · '));
}

function setItemProgress(item, p) {
  if (item.barEl) item.barEl.style.width = Math.round(p * 100) + '%';
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = !msg;
  if (msg) {
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 4000);
  }
}

function showError(msg) {
  const el = $('global-error');
  el.textContent = msg;
  el.hidden = !msg;
}

/* ===================== Thêm / bớt file ===================== */

function addFiles(fileList) {
  const wanted = WANT_KIND[tab];
  const accepted = [], rejected = [];

  for (const f of fileList) {
    (wanted.includes(kindOf(f)) ? accepted : rejected).push(f);
  }

  for (const f of accepted) {
    const item = { id: ++seq, file: f, status: 'idle', out: null, outName: '', error: '', thumbUrl: '', dims: null, meta: null };
    queues[tab].push(item);
    prepareItem(item);
  }

  if (rejected.length) {
    const names = rejected.slice(0, 3).map((f) => f.name).join(', ');
    showError(
      rejected.length + ' file bị bỏ qua vì không hợp với thẻ đang mở (' + escapeHtml(names) +
      (rejected.length > 3 ? '…' : '') + '). Chuyển sang thẻ tương ứng rồi thả lại.'
    );
  } else {
    showError('');
  }
  render();
}

/* Lấy ảnh xem trước và kích thước gốc — chạy nền, xong tới đâu vẽ lại tới đó. */
async function prepareItem(item) {
  const kind = kindOf(item.file);
  try {
    if (kind === 'image') {
      const src = await decodeImage(item.file);
      const [w, h] = srcSize(src);
      item.dims = { w, h };
      const s = Math.min(1, 76 / Math.max(w, h));
      const thumb = drawScaled(src, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), null);
      if (src.close) src.close();
      item.thumbUrl = await new Promise((r) => thumb.toBlob((b) => r(b ? URL.createObjectURL(b) : ''), 'image/png'));
    } else {
      item.meta = await probeMedia(item.file);
      if (item.meta && item.meta.width) item.dims = { w: item.meta.width, h: item.meta.height };
    }
  } catch (_) {
    // Không xem trước được cũng không sao — vẫn chuyển đổi bình thường.
  }
  render();
}

function removeItem(item) {
  const list = queues[tab];
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  render();
}

function clearQueue() {
  for (const item of queues[tab]) if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  queues[tab] = [];
  showError('');
  toast('');
  render();
}

/* ===================== Chạy hàng đợi ===================== */

async function runAll() {
  if (running) return;
  const o = currentOptions();
  const list = queues[tab].filter((i) => !i.out);
  if (!list.length) { toast('Mọi file đều đã chuyển xong rồi.'); return; }

  running = true;
  stopRequested = false;
  showError('');
  toast('');
  $('stop').hidden = false;
  render();

  let ok = 0, failed = 0;
  const t0 = performance.now();

  for (const item of list) {
    if (stopRequested) break;
    item.status = 'working';
    item.error = '';
    render();

    try {
      const onProgress = (p) => setItemProgress(item, p);
      const blob =
        tab === 'img' ? await convertImage(item, o, onProgress) :
        tab === 'vid' ? await convertVideo(item, o, onProgress) :
                        await convertAudio(item, o, onProgress);

      if (!blob || !blob.size) throw new Error('Kết quả rỗng — thử đổi sang định dạng khác xem sao.');
      item.out = blob;
      item.outName = outNameFor(item, o);
      item.status = 'done';
      ok++;
    } catch (err) {
      item.status = 'error';
      item.error = (err && err.message) ? err.message : String(err);
      failed++;
    }
    render();
  }

  running = false;
  $('stop').hidden = true;
  render();

  const secs = Math.round((performance.now() - t0) / 100) / 10;
  if (stopRequested) toast('Đã dừng. Xong ' + ok + ' file.');
  else if (failed) toast('Xong ' + ok + ' file, lỗi ' + failed + ' file — xem chi tiết ở từng dòng.');
  else if (ok) toast('Xong ' + ok + ' file trong ' + secs + ' giây.');
}

async function downloadZip() {
  const done = queues[tab].filter((i) => i.out);
  if (!done.length) return;
  if (done.length === 1) { saveBlob(done[0].out, done[0].outName); return; }

  toast('Đang gói ZIP…');
  const zip = new JSZip();
  const used = new Set();
  for (const item of done) {
    let name = item.outName, n = 2;
    while (used.has(name.toLowerCase())) {
      name = baseOf(item.outName) + ' (' + n++ + ').' + extOf(item.outName);
    }
    used.add(name.toLowerCase());
    // STORE thay vì DEFLATE: ảnh và video đã nén sẵn, nén lại chỉ tốn thời gian.
    zip.file(name, item.out, { compression: 'STORE' });
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  saveBlob(blob, 'da-doi-duoi-' + done.length + '-file.zip');
  toast('Đã tải ZIP gồm ' + done.length + ' file.');
}

/* ===================== Gắn sự kiện ===================== */

function switchTab(name) {
  if (running) return;
  tab = name;
  for (const btn of document.querySelectorAll('.tab')) {
    const on = btn.dataset.panel === name;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  for (const p of document.querySelectorAll('.panel')) {
    p.classList.toggle('is-active', p.id === 'panel-' + name);
  }
  $('picker').accept = ACCEPT[name];
  $('drop-title').textContent = DROP_TEXT[name][0];
  $('drop-sub').textContent = DROP_TEXT[name][1];
  showError('');
  toast('');
  render();
}

const RESIZE_HINTS = {
  none:   '',
  width:  'Ảnh rộng hơn số này sẽ được thu lại, ảnh hẹp hơn giữ nguyên. Chiều cao tự tính theo tỉ lệ.',
  height: 'Ảnh cao hơn số này sẽ được thu lại, ảnh thấp hơn giữ nguyên. Chiều rộng tự tính theo tỉ lệ.',
  fit:    'Thu ảnh cho lọt vào khung rộng × cao, vẫn giữ đúng tỉ lệ nên có thể không chạm hết hai cạnh.',
  exact:  'Ép đúng số này bất kể tỉ lệ gốc — ảnh sẽ bị kéo méo nếu tỉ lệ không khớp.',
};

function syncImgControls() {
  const f = $('img-format').value;
  $('img-format-hint').textContent = IMG_HINTS[f] || '';
  $('img-quality-wrap').hidden = !(f === 'jpg' || f === 'webp');

  const r = $('img-resize').value;
  $('img-resize-hint').textContent = RESIZE_HINTS[r] || '';
  $('img-size-wrap').hidden = r === 'none';
  // «Theo chiều rộng» chỉ dùng ô rộng, «theo chiều cao» chỉ dùng ô cao.
  $('img-w').closest('.field').hidden = r === 'height';
  $('img-h').closest('.field').hidden = r === 'width';
  $('img-size-wrap').classList.toggle('is-single', r === 'width' || r === 'height');
}

function syncVidControls() {
  const f = $('vid-format').value;
  $('vid-format-hint').textContent = VID_HINTS[f] || '';
  const isGif = f === 'gif';
  $('vid-preset').closest('.field').hidden = isGif || f === 'webm' || f === 'avi';
  $('vid-mute').closest('.check').hidden = isGif;
  $('vid-quality').closest('.field').hidden = isGif;
}

function syncAudControls() {
  const f = $('aud-format').value;
  $('aud-format-hint').textContent = AUD_HINTS[f] || '';
  $('aud-bitrate-wrap').hidden = (f === 'wav' || f === 'flac');
}

function init() {
  $('year').textContent = new Date().getFullYear();

  for (const btn of document.querySelectorAll('.tab')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.panel));
  }

  const drop = $('drop'), picker = $('picker');
  drop.addEventListener('click', () => { if (!running) picker.click(); });
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); }
  });
  picker.addEventListener('change', () => {
    if (picker.files.length) addFiles([...picker.files]);
    picker.value = '';
  });

  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); });
  }
  drop.addEventListener('drop', (e) => {
    if (running) return;
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) addFiles(files);
  });
  // Chặn trình duyệt mở file khi lỡ thả ra ngoài ô.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  $('run').addEventListener('click', runAll);
  $('stop').addEventListener('click', () => { stopRequested = true; toast('Sẽ dừng sau khi xong file đang chạy…'); });
  $('dl-zip').addEventListener('click', downloadZip);
  $('clear').addEventListener('click', clearQueue);

  $('img-quality').addEventListener('input', () => { $('img-quality-val').textContent = $('img-quality').value; });
  $('img-format').addEventListener('change', syncImgControls);
  $('img-resize').addEventListener('change', syncImgControls);
  $('vid-format').addEventListener('change', syncVidControls);
  $('aud-format').addEventListener('change', syncAudControls);

  syncImgControls();
  syncVidControls();
  syncAudControls();
  switchTab('img');

  window.addEventListener('beforeunload', (e) => {
    if (running) { e.preventDefault(); e.returnValue = ''; }
  });
}

init();
