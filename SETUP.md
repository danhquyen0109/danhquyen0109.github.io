# Affiliate Admin — Hướng dẫn cài đặt

Bảng điều khiển quản lý tiếp thị liên kết Shopee, chạy tại
`https://danhquyen.io.vn/affiliate/`.

**Kiến trúc:** trang tĩnh trên GitHub Pages (không build step) + Supabase (database,
đăng nhập, Edge Functions). Toàn bộ đều nằm trong gói miễn phí.

Mục đích cuối: quản lý link tiếp thị kèm mô tả chi tiết + ảnh, rồi **xuất brief cho
các agent khác làm clip / bài viết** đăng mạng xã hội.

---

## Phần 1 — Tạo Supabase (bắt buộc, ~10 phút)

### 1.1. Tạo project

1. Vào [supabase.com](https://supabase.com) → đăng nhập bằng GitHub → **New project**
2. Đặt tên (vd `affiliate-admin`), chọn region **Southeast Asia (Singapore)** cho gần Việt Nam
3. Đặt một mật khẩu database mạnh và **lưu lại** (bạn sẽ ít khi cần, nhưng mất thì phiền)
4. Chờ ~2 phút cho project khởi tạo xong

### 1.2. Tạo bảng

1. Sidebar → **SQL Editor** → **New query**
2. Mở file [`supabase/schema.sql`](supabase/schema.sql), copy **toàn bộ**, dán vào, bấm **Run**
3. Phải thấy `Success. No rows returned`

Kiểm tra nhanh — chạy tiếp query này, tất cả phải là `true`:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by 1;
```

### 1.3. Bật đăng nhập, tắt đăng ký công khai

1. Sidebar → **Authentication** → **Sign In / Providers**
2. Bật **Email**, và **TẮT** `Allow new users to sign up`
   → không ai tự đăng ký tài khoản trên hệ thống của bạn được
3. Sang tab **Users** → **Add user** → **Create new user**
   - Email + mật khẩu của bạn
   - Tick **Auto Confirm User** (khỏi phải xác nhận email)
4. Bấm vào user vừa tạo, copy **User UID** — cần ở bước 3.3

### 1.4. Cho phép tên miền truy cập

**Authentication → URL Configuration**:

- **Site URL**: `https://danhquyen.io.vn`
- **Redirect URLs**: thêm cả ba dòng
  ```
  https://danhquyen.io.vn/affiliate/
  https://danhquyen0109.github.io/affiliate/
  http://localhost:8000/affiliate/
  ```

### 1.5. Nối web với Supabase

**Project Settings → Data API**, copy 2 giá trị và điền vào
[`affiliate/config.js`](affiliate/config.js):

```js
export const CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',   // Project URL
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',             // anon public key
  ...
};
```

> Hai giá trị này **công khai theo thiết kế**, không phải bí mật — chúng sinh ra để
> nhúng vào trình duyệt. Dữ liệu được bảo vệ bằng Row Level Security ở tầng database.
> **Tuyệt đối không** dán `service_role` key vào đây.

### 1.6. Đẩy lên và chạy thử

```bash
git add affiliate supabase SETUP.md
git commit -m "feat: add Shopee affiliate admin dashboard"
git push
```

Chờ 1–2 phút rồi mở `https://danhquyen.io.vn/affiliate/` và đăng nhập.

**Đến đây hệ thống đã dùng được**: thêm sản phẩm, viết mô tả, nhập đơn tay,
import CSV, xuất brief cho agent. Phần 2 và 3 chỉ để tự động hoá thêm.

---

## Phần 2 — Feed công khai cho agent (khuyến nghị, ~5 phút)

Feed là một địa chỉ web trả về danh sách sản phẩm + mô tả, **không cần đăng nhập** —
đưa thẳng cho agent khác là nó tự lấy được dữ liệu.

### 2.1. Cài Supabase CLI

```bash
npm install -g supabase
supabase login
```

### 2.2. Nối thư mục với project

Sửa `project_id` trong [`supabase/config.toml`](supabase/config.toml) thành ref
project của bạn (phần `abcdefgh` trong `https://abcdefgh.supabase.co`), rồi:

```bash
cd danhquyen0109.github.io
supabase link --project-ref abcdefgh
```

### 2.3. Deploy

```bash
supabase functions deploy feed
```

### 2.4. Kiểm tra

```bash
curl "https://abcdefgh.supabase.co/functions/v1/feed?format=md"
```

Phải trả về brief dạng Markdown. **Quan trọng**: kiểm tra kết quả **không có số tiền
hoa hồng nào** — feed đọc từ view `public_products` vốn không chứa các cột đó.

Trong app, địa chỉ feed hiện sẵn ở màn **Brief cho agent** và **Cài đặt**, có nút copy.

> Chỉ sản phẩm bật *“Cho phép xuất ra feed công khai”* mới xuất hiện. Sản phẩm nào
> muốn giữ riêng thì bỏ tick trong form.

---

## Phần 3 — Tự động lấy đơn từ Shopee API (tuỳ chọn)

> **Đọc trước:** Shopee Affiliate Open API cần được Shopee **cấp quyền**. Thời gian
> duyệt tới khoảng 2 tuần và **có thể bị từ chối**. Trong lúc chờ (hoặc nếu bị từ
> chối), bạn vẫn nhập tay và import CSV bình thường — không mất tính năng nào ngoài
> việc tự động.

### 3.1. Xin credentials

Vào [affiliate.shopee.vn/open_api](https://affiliate.shopee.vn/open_api), nộp đơn
xin quyền Open API. Shopee sẽ gửi `appId` và `secret` qua email.

### 3.2. Deploy các function

```bash
supabase functions deploy shopee-sync
supabase functions deploy shopee-product
```

### 3.3. Đặt biến bí mật

```bash
supabase secrets set \
  SHOPEE_APP_ID=1234567890 \
  SHOPEE_SECRET=abcdef0123456789 \
  OWNER_UID=<User UID copy ở bước 1.3>
```

`OWNER_UID` để Cron biết ghi dữ liệu vào tài khoản nào (Cron chạy không có phiên
đăng nhập nên không tự suy ra được).

### 3.4. Kiểm tra kết nối

Vào app → **Cài đặt** → **Kiểm tra kết nối**. Nếu thấy ✅ là xong. Sau đó chọn
khoảng ngày và bấm **Đồng bộ ngay**.

### 3.5. Bật chạy tự động

Supabase Dashboard → **Integrations** → **Cron** → **Create job**:

- **Name**: `shopee-sync`
- **Schedule**: `0 */6 * * *` (6 giờ một lần)
- **Type**: `Supabase Edge Function` → chọn `shopee-sync`
- **HTTP Body**: `{}` (mặc định lấy 7 ngày gần nhất, đủ để bắt các đơn cập nhật muộn)

Cron này còn có tác dụng phụ quan trọng: **giữ project Supabase gói free không bị
tạm dừng** do 7 ngày không hoạt động.

### 3.6. Nếu Shopee đổi tên field

Schema GraphQL của Shopee có thay đổi theo thời gian. Nếu sync báo lỗi kiểu
`Cannot query field "..."`, xem phản hồi thô:

```bash
curl -X POST "https://abcdefgh.supabase.co/functions/v1/shopee-sync" \
  -H "Authorization: Bearer <anon key>" \
  -H "Content-Type: application/json" \
  -d '{"debug": true, "from": "2026-08-01", "to": "2026-08-04"}'
```

Rồi sửa lại tên field trong các hàm `conversionReportQuery` / `productOfferQuery`
ở [`supabase/functions/_shared/shopee.ts`](supabase/functions/_shared/shopee.ts) và
deploy lại. Bảng `conversions` luôn lưu payload gốc ở cột `raw` nên dữ liệu không
bị mất kể cả khi mapping sai.

---

## Cách dùng hằng ngày

### Thêm sản phẩm

- **Có Shopee API**: bấm *Dán link Shopee* → dán URL → tự điền tên, ảnh, giá, %hoa
  hồng và sinh link rút gọn kèm subId
- **Chưa có**: bấm *+ Thêm sản phẩm* → dán link vào ô "Link sản phẩm gốc" → hệ thống
  tự tách `item_id`/`shop_id` → điền phần còn lại bằng tay

**Phần quan trọng nhất là mục “Nội dung cho agent”** — mô tả chi tiết, điểm bán hàng,
đối tượng khách, ý tưởng hook. Viết càng kỹ thì clip agent làm ra càng đúng ý.
Sản phẩm chưa có mô tả sẽ bị đánh dấu cảnh báo ở màn Brief.

### Về subId

`subId` là mã gắn vào link tiếp thị để đơn hàng được quy về đúng sản phẩm. Hệ thống
tự sinh khi bạn thêm sản phẩm (dạng `dq-tai-nghe-a3f2`). Nếu tự tạo link tiếp thị
thủ công trên Shopee, nhớ điền đúng subId đó vào — không có nó thì dashboard không
biết đơn nào thuộc sản phẩm nào.

### Import báo cáo CSV

Shopee Affiliate Center → **Báo cáo** → xuất file đơn hàng → trong app vào
**Đơn hàng → Import CSV**.

Bước map cột cho bạn chọn cột nào ứng với dữ liệu nào, nên **định dạng file thế nào
cũng import được**. Hệ thống đoán trước rồi bạn chỉnh lại nếu sai, và ghi nhớ cho
lần sau. Import lại cùng một file **không tạo bản ghi trùng** (khoá theo mã đơn).

### Xuất brief cho agent

Ba cách, chọn cách nào tiện:

1. **Một sản phẩm** — bấm 📋 trên thẻ sản phẩm → dán vào chat với agent
2. **Nhiều sản phẩm** — màn *Brief cho agent* → tick chọn → *Copy Markdown* hoặc
   *Tải brief* (ra cả `.md` và `.json`)
3. **Để agent tự lấy** — đưa nó địa chỉ feed:
   `https://abcdefgh.supabase.co/functions/v1/feed?format=md&status=todo`

Brief đã kèm sẵn phần mô tả việc cần làm (kịch bản clip 30–45s, caption, hashtag,
gợi ý cảnh quay) và các quy tắc bắt buộc (dùng đúng link, không bịa thông số).

Làm xong nhớ đổi **trạng thái content** và tick nền tảng đã đăng — để lần sau lọc
`status=todo` chỉ ra việc chưa làm.

---

## Bảo mật

| | |
|---|---|
| Dữ liệu thu nhập | Nằm sau Row Level Security ở tầng database — chưa đăng nhập thì truy vấn trả về rỗng, kể cả khi gọi thẳng REST API |
| Mã nguồn web | Công khai (repo GitHub Pages), nhưng không chứa secret nào |
| `anon key` trong `config.js` | Công khai theo thiết kế, không phải lỗ hổng |
| `service_role` key | **Không bao giờ** đưa vào code phía trình duyệt — chỉ nằm trong Edge Function |
| `SHOPEE_SECRET` | Chỉ nằm trong Supabase secrets, không bao giờ xuống trình duyệt |
| Feed công khai | Cố ý mở, nhưng chỉ đọc view `public_products` — không có cột hoa hồng nào |

Tự kiểm tra RLS: mở tab ẩn danh và chạy

```bash
curl "https://abcdefgh.supabase.co/rest/v1/conversions?select=*" -H "apikey: <anon key>"
```

Phải trả về `[]`.

---

## Chạy thử ở máy local

```bash
cd danhquyen0109.github.io
python -m http.server 8000
# mở http://localhost:8000/affiliate/
```

Nhớ đã thêm `http://localhost:8000/affiliate/` vào Redirect URLs ở bước 1.4.

---

## Gặp sự cố

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| "Chưa cấu hình Supabase" | Chưa điền `config.js` — xem bước 1.5 |
| "Chưa tạo bảng trong database" | Chưa chạy `schema.sql` — xem bước 1.2 |
| "Sai email hoặc mật khẩu" | Tạo user trong Dashboard, nhớ tick *Auto Confirm User* |
| "Không kết nối được Supabase" | Project free bị pause sau 7 ngày im lặng — vào Dashboard bấm Restore, rồi bật Cron ở bước 3.5 |
| Ảnh sản phẩm không hiện | URL ảnh Shopee hết hạn hoặc sai — thử mở URL đó trực tiếp trên trình duyệt |
| Dashboard hiện 0 đơn cho sản phẩm | Đơn chưa có `subId` khớp. Kiểm tra cột subId của sản phẩm và cột subId trong bảng đơn hàng |
| Sync báo `Cannot query field` | Shopee đổi schema — xem mục 3.6 |
| Sync báo mã `10030` | Bị giới hạn tốc độ gọi, chờ vài phút rồi thử lại |

---

## Cấu trúc mã nguồn

```
affiliate/
├── index.html              khung + màn đăng nhập
├── config.js               ← file duy nhất cần sửa khi cài đặt
├── css/app.css             kế thừa hệ màu của portfolio ở thư mục gốc
└── js/
    ├── app.js              khởi động, cổng đăng nhập
    ├── router.js           điều hướng bằng hash
    ├── db.js               toàn bộ truy vấn Supabase
    ├── ui.js               định dạng, toast, modal
    ├── charts.js           biểu đồ SVG viết tay
    ├── csv.js              đọc CSV + đoán map cột
    ├── brief.js            sinh brief cho agent
    ├── product-form.js     form thêm/sửa sản phẩm
    └── views/              dashboard, products, orders, briefs, settings

supabase/
├── schema.sql              bảng, view, RLS
├── config.toml             cấu hình deploy function
└── functions/
    ├── _shared/            client Shopee (ký SHA256), tiện ích HTTP
    ├── shopee-sync/        cron kéo đơn + hoa hồng
    ├── shopee-product/     dán link → thông tin sản phẩm
    └── feed/               feed công khai cho agent
```
