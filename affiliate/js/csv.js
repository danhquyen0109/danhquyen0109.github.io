// =============================================================================
// csv.js — đọc file CSV và đoán cách map cột sang bảng conversions
// =============================================================================
// Shopee Affiliate Center xuất báo cáo với tên cột khác nhau tuỳ thời điểm và
// ngôn ngữ, nên ở đây chỉ ĐOÁN rồi để người dùng chỉnh lại, thay vì cố định
// cứng theo một định dạng.
// =============================================================================

import { parseNumberLoose, parseDateLoose } from './ui.js';

/* ------------------------------ Bộ đọc CSV -------------------------------- */

/** Đoán ký tự phân cách dựa trên dòng đầu tiên. */
export function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = [',', ';', '\t', '|'].map((d) => ({
    d, n: (line.match(new RegExp(`\\${d}`, 'g')) || []).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

/**
 * Đọc CSV theo RFC 4180 (hỗ trợ dấu ngoặc kép, xuống dòng trong ô, "" thoát).
 * @returns {{headers:string[], rows:string[][]}}
 */
export function parseCSV(text, delimiter) {
  const src = text.replace(/^﻿/, '');          // bỏ BOM
  const d = delimiter || detectDelimiter(src);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }

    if (c === '"')      { inQuotes = true; }
    else if (c === d)   { row.push(field); field = ''; }
    else if (c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r'){ /* bỏ qua, \n sẽ xử lý */ }
    else                { field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  // Bỏ các dòng rỗng hoàn toàn
  const clean = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!clean.length) return { headers: [], rows: [] };

  const headers = clean[0].map((h) => String(h).trim());
  return { headers, rows: clean.slice(1) };
}

/* --------------------------- Đoán cách map cột ---------------------------- */

/** Các trường đích, kèm từ khoá nhận dạng (tiếng Việt + tiếng Anh). */
export const TARGET_FIELDS = [
  { key: 'conversion_id', label: 'Mã đơn / Conversion ID', required: true, type: 'text',
    hints: ['conversion id', 'conversionid', 'ma don', 'mã đơn', 'order id', 'orderid',
            'ma dat hang', 'mã đặt hàng', 'checkout id', 'order sn'] },
  { key: 'purchase_time', label: 'Thời gian đặt hàng', required: true, type: 'date',
    hints: ['purchase time', 'thoi gian dat', 'thời gian đặt', 'order time', 'ngay dat',
            'ngày đặt', 'thoi gian mua', 'thời gian mua', 'created', 'ngay tao'] },
  { key: 'click_time', label: 'Thời gian click', required: false, type: 'date',
    hints: ['click time', 'thoi gian click', 'thời gian click', 'thoi gian nhap chuot'] },
  { key: 'order_status', label: 'Trạng thái đơn', required: false, type: 'status',
    hints: ['status', 'trang thai', 'trạng thái', 'tinh trang', 'tình trạng'] },
  { key: 'total_commission', label: 'Tổng hoa hồng', required: true, type: 'number',
    hints: ['total commission', 'tong hoa hong', 'tổng hoa hồng', 'hoa hong', 'hoa hồng',
            'commission', 'thu nhap', 'thu nhập'] },
  { key: 'seller_commission', label: 'Hoa hồng người bán', required: false, type: 'number',
    hints: ['seller commission', 'hoa hong nguoi ban', 'hoa hồng người bán', 'shop commission'] },
  { key: 'shopee_commission', label: 'Hoa hồng Shopee', required: false, type: 'number',
    hints: ['shopee commission', 'hoa hong shopee', 'hoa hồng shopee', 'platform commission'] },
  { key: 'net_commission', label: 'Hoa hồng thực nhận', required: false, type: 'number',
    hints: ['net commission', 'thuc nhan', 'thực nhận', 'validated commission', 'final commission'] },
  { key: 'gmv', label: 'Giá trị đơn (GMV)', required: false, type: 'number',
    hints: ['gmv', 'order amount', 'gia tri don', 'giá trị đơn', 'doanh thu', 'total amount',
            'tong tien', 'tổng tiền'] },
  { key: 'item_count', label: 'Số sản phẩm', required: false, type: 'number',
    hints: ['item count', 'so luong', 'số lượng', 'quantity', 'qty', 'so san pham'] },
  { key: 'utm_content', label: 'subId / UTM content', required: false, type: 'text',
    hints: ['utm content', 'utm_content', 'sub id', 'subid', 'sub_id1', 'sub id1', 'sub_id'] },
  { key: 'buyer_type', label: 'Loại người mua', required: false, type: 'text',
    hints: ['buyer type', 'loai nguoi mua', 'loại người mua', 'new buyer'] },
  { key: 'device', label: 'Thiết bị', required: false, type: 'text',
    hints: ['device', 'thiet bi', 'thiết bị', 'platform'] },
];

const norm = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Đoán chỉ số cột cho từng trường đích.
 * @returns {Record<string, number>} key -> index cột (-1 nếu không đoán được)
 */
export function guessMapping(headers) {
  const normalized = headers.map(norm);
  const used = new Set();
  const out = {};

  for (const f of TARGET_FIELDS) {
    let best = -1;
    let bestScore = 0;

    normalized.forEach((h, i) => {
      if (used.has(i) || !h) return;
      for (const hint of f.hints) {
        const n = norm(hint);
        let score = 0;
        if (h === n)            score = 100;
        else if (h.includes(n)) score = 60 + n.length;
        else if (n.includes(h)) score = 40 + h.length;
        if (score > bestScore) { bestScore = score; best = i; }
      }
    });

    out[f.key] = best;
    if (best >= 0) used.add(best);
  }
  return out;
}

/* --------------------------- Chuyển sang bản ghi -------------------------- */

const STATUS_MAP = [
  [/hoan thanh|completed|complete|thanh cong|paid|da duyet/, 'COMPLETED'],
  [/cho duyet|pending|dang xu ly|processing|cho xac nhan/,   'PENDING'],
  [/huy|cancel|refund|tra hang|that bai|failed|invalid/,     'CANCELLED'],
  [/chua thanh toan|unpaid/,                                 'UNPAID'],
];

export function normalizeStatus(v) {
  const n = norm(v);
  if (!n) return null;
  for (const [re, out] of STATUS_MAP) if (re.test(n)) return out;
  return String(v).trim().toUpperCase();
}

/**
 * Áp mapping lên các dòng CSV, trả về bản ghi sẵn sàng upsert vào `conversions`.
 * @returns {{records:object[], errors:{line:number,reason:string}[], skipped:number}}
 */
export function buildRecords(rows, mapping, { source = 'csv' } = {}) {
  const records = [];
  const errors  = [];
  const seen    = new Set();
  let skipped   = 0;

  const at = (row, key) => {
    const i = mapping[key];
    return i >= 0 && i < row.length ? row[i] : '';
  };

  rows.forEach((row, idx) => {
    const line = idx + 2;                       // +1 header, +1 đếm từ 1

    const id = String(at(row, 'conversion_id') || '').trim();
    if (!id) { errors.push({ line, reason: 'Thiếu mã đơn' }); return; }

    if (seen.has(id)) { skipped++; return; }    // trùng ngay trong chính file
    seen.add(id);

    const purchase = parseDateLoose(at(row, 'purchase_time'));
    if (!purchase) {
      errors.push({ line, reason: `Không đọc được thời gian: "${at(row, 'purchase_time')}"` });
      return;
    }

    const numAt = (k) => (mapping[k] >= 0 ? parseNumberLoose(at(row, k)) : 0);
    const strAt = (k) => {
      const v = String(at(row, k) || '').trim();
      return v || null;
    };

    const utm = strAt('utm_content');

    records.push({
      conversion_id:     id,
      purchase_time:     purchase,
      click_time:        mapping.click_time >= 0 ? parseDateLoose(at(row, 'click_time')) : null,
      order_status:      normalizeStatus(at(row, 'order_status')),
      total_commission:  numAt('total_commission'),
      seller_commission: numAt('seller_commission'),
      shopee_commission: numAt('shopee_commission'),
      net_commission:    mapping.net_commission >= 0 ? numAt('net_commission') : null,
      gmv:               numAt('gmv'),
      item_count:        mapping.item_count >= 0 ? Math.round(numAt('item_count')) : 0,
      utm_content:       utm,
      sub_ids:           utm ? [utm] : [],
      buyer_type:        strAt('buyer_type'),
      device:            strAt('device'),
      source,
    });
  });

  return { records, errors, skipped };
}

/* ------------------------------- Xuất CSV --------------------------------- */

export function toCSV(rows, columns) {
  const escCell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => escCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escCell(c.get(r))).join(',')).join('\n');
  return head + '\n' + body;
}
