# Đổi đuôi ảnh & video — credits

Trang chạy hoàn toàn phía client: không có backend, không gọi API, không tải file
của người dùng lên đâu cả. Các thư viện dưới đây được đóng gói kèm (vendored) trong
`vendor/` thay vì lấy từ CDN, để trang vẫn hoạt động khi mất mạng và không lệ thuộc
vào bên thứ ba.

## Thư viện

| Tệp | Thư viện | Phiên bản | Nguồn | Giấy phép |
|---|---|---|---|---|
| `vendor/ffmpeg.js`, `vendor/814.ffmpeg.js` | @ffmpeg/ffmpeg (ffmpeg.wasm) | 0.12.15 | [github.com/ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | MIT |
| `vendor/ffmpeg-core/ffmpeg-core.js`, `.wasm` | @ffmpeg/core — FFmpeg biên dịch sang WebAssembly | 0.12.10 | [github.com/ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | LGPL-2.1 (kèm libx264/libx265 theo GPL-2.0) |
| `vendor/jszip.min.js` | JSZip (Stuk) | 3.10.1 | [github.com/Stuk/jszip](https://github.com/Stuk/jszip) | MIT hoặc GPL-3.0 |

Tất cả giữ nguyên nội dung như phát hành trên npm.

### Vì sao dùng bản một luồng

`@ffmpeg/core` (bản single-thread) được chọn thay cho `@ffmpeg/core-mt` vì bản đa
luồng cần `SharedArrayBuffer`, mà muốn có `SharedArrayBuffer` thì máy chủ phải gửi
kèm hai header `Cross-Origin-Opener-Policy` và `Cross-Origin-Embedder-Policy` —
GitHub Pages không cho đặt header. Đổi lại là nén video chậm hơn hẳn, nên phần
tuỳ chỉnh để sẵn preset `ultrafast`, và libvpx chạy với `-deadline realtime
-cpu-used 8`.

## Code

`index.html`, `style.css` và `app.js` là code viết riêng cho trang này.

- **Ảnh tĩnh sang PNG / JPG / WEBP / ICO** không đụng tới FFmpeg chút nào: giải mã
  bằng `createImageBitmap`, thu nhỏ bằng canvas rồi xuất qua `canvas.toBlob`. Nhờ
  vậy đổi đuôi ảnh xong ngay mà không phải tải 32 MB wasm về.
- Việc thu nhỏ chia thành **nhiều bước mỗi bước một nửa**; `drawImage` một phát từ
  4000px xuống 300px sẽ răng cưa vì trình duyệt chỉ lấy mẫu điểm gần nhất.
- **ICO** được dựng tay trong `app.js`: chuẩn ICO cho phép nhét thẳng một ảnh PNG
  vào trong, nên chỉ cần bọc thêm 22 byte tiêu đề, khỏi phải dựng bitmap và mặt nạ AND.
- **BMP / TIFF** đi qua FFmpeg nhưng dưới dạng PNG đã chỉnh kích thước sẵn từ canvas,
  nên FFmpeg chỉ phải giải mã PNG — không kén định dạng file gốc.
- **GIF động** thì để FFmpeg xử lý thẳng file gốc (`palettegen` + `paletteuse`), vì
  đi qua canvas sẽ chỉ còn lại khung hình đầu tiên.
- Kích thước và độ dài video được đọc trước bằng thẻ `<video>` ẩn. Biết trước thì mới
  tính đúng khung hình đích (tránh phóng to video vốn đã nhỏ) và vẽ được thanh tiến
  trình ngay từ giây đầu; với mkv/avi mà thẻ `<video>` chịu thua thì rơi về đọc dòng
  `Duration:` trong log FFmpeg.
- Wasm gặp lỗi bộ nhớ sẽ ném `RuntimeError` và làm hỏng cả module — lúc đó `app.js`
  vứt instance đi và dựng lại một bộ mới, để file tiếp theo trong hàng đợi vẫn chạy được.

## Định dạng không hỗ trợ

- **OPUS** đã bị bỏ khỏi danh sách: encoder `libopus` trong `@ffmpeg/core@0.12.10`
  sập với `memory access out of bounds` ở mọi bộ tham số đã thử (`-ar 48000`,
  `-ac 2`, `-application audio`, `-vbr off`, xuất ra cả `.opus` lẫn `.ogg`).
- **HEIC / HEIF** của iPhone: trình duyệt không giải mã được và bản core này cũng
  không có bộ giải mã HEIF, nên trang báo lỗi kèm hướng dẫn đổi cài đặt camera.

## Kiểm thử

Bộ kiểm thử chạy trang thật trong Chrome headless (puppeteer): dựng file mẫu ngay
trong trình duyệt — ảnh PNG 800×600 có kênh trong suốt, và video WebM 2 giây kèm
tiếng thu bằng `MediaRecorder` — rồi chạy qua đúng đường xử lý của trang và kiểm tra
chữ ký byte đầu file của từng định dạng xuất ra. 40 phép thử phủ: 7 đuôi ảnh, 6 đuôi
video, 5 đuôi âm thanh, các chế độ đổi kích thước, gói ZIP không trùng tên, lọc file
thả nhầm thẻ, file hỏng, và khả năng chạy tiếp sau khi wasm sập.

Giao diện dùng chung hệ màu và bố cục với phần còn lại của site (`--teal` / `--ink`),
font Inter tải từ Google Fonts như các trang khác.
