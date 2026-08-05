# Trình tạo mã QR & mã vạch — credits

Trang chạy hoàn toàn phía client: không có backend, không gọi API, không gửi nội dung
người dùng nhập đi đâu cả. Hai thư viện dưới đây được đóng gói kèm (vendored) trong
`vendor/` thay vì tải từ CDN, để trang vẫn hoạt động khi mất mạng và không bị lệ thuộc
vào bên thứ ba.

## Thư viện

| Tệp | Thư viện | Phiên bản | Nguồn | Giấy phép |
|---|---|---|---|---|
| `vendor/qrcode.js` | qrcode-generator (Kazuhiko Arase) | 1.4.4 | [github.com/kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | MIT |
| `vendor/JsBarcode.all.min.js` | JsBarcode (Johan Lindell) | 3.11.6 | [github.com/lindell/JsBarcode](https://github.com/lindell/JsBarcode) | MIT |

Cả hai giữ nguyên nội dung gốc như phát hành trên npm, kèm phần header bản quyền.

> "QR Code" là thương hiệu đã đăng ký của DENSO WAVE INCORPORATED.

## Code

`index.html`, `style.css` và `app.js` là code viết riêng cho trang này.

- qrcode-generator chỉ dựng ma trận ô sáng/tối. Toàn bộ phần vẽ SVG và canvas
  (màu, lề, kiểu ô vuông/chấm/bo góc, gộp ô liền nhau thành path) nằm trong `app.js`.
- Các ô định vị, hàng/cột định thì và ô căn chỉnh luôn được vẽ vuông đặc kể cả ở kiểu
  chấm hoặc bo góc — đây là những vùng máy quét dùng để dò và nắn mã, làm vỡ chúng là
  mã hết đọc được. Bảng vị trí ô căn chỉnh trong `app.js` lấy theo chuẩn ISO/IEC 18004.
- JsBarcode lo phần mã vạch (kể cả tính số kiểm tra và kiểm tra tính hợp lệ của nội dung).

## Kiểm thử

Các mã QR sinh ra đã được giải ngược bằng [jsQR](https://github.com/cozmo/jsQR) trong
Chrome headless để chắc chắn máy quét đọc đúng nội dung — bao gồm tiếng Việt có dấu
(UTF-8), cả ba kiểu ô, nền trong suốt, lề bằng 0 và cả bản SVG lẫn PNG. jsQR chỉ dùng
lúc kiểm thử, không đi kèm trang.

Giao diện dùng chung hệ màu và bố cục với phần còn lại của site (`--teal` / `--ink`),
font Inter tải từ Google Fonts như các trang khác.
