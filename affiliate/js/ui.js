// =============================================================================
// ui.js — tiện ích dùng chung: định dạng, toast, modal, clipboard
// =============================================================================

/* ------------------------------- Truy vấn DOM ------------------------------ */
export const qs  = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Thoát ký tự HTML — dùng cho MỌI dữ liệu người dùng nhét vào innerHTML. */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Thoát ký tự cho thuộc tính href/src — chặn javascript: và data: */
export function safeUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|\/|#)/i.test(s)) return esc(s);
  return '';
}

/* ------------------------------- Định dạng -------------------------------- */
const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency', currency: 'VND', maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat('vi-VN');

export const fmtVND = (n) => vnd.format(Number(n) || 0);
export const fmtNum = (n) => num.format(Number(n) || 0);

/** Rút gọn tiền: 1.250.000 ₫ -> "1,25 Tr" (dùng cho trục biểu đồ) */
export function fmtShort(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.', ',') + ' Tỷ';
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' Tr';
  if (a >= 1e3) return Math.round(v / 1e3) + 'K';
  return String(Math.round(v));
}

/** commission_rate lưu dạng 0.105 -> "10,5%" */
export function fmtPct(rate) {
  if (rate === null || rate === undefined || rate === '') return '—';
  const p = Number(rate) * 100;
  return (Number.isInteger(p) ? p : p.toFixed(1)).toString().replace('.', ',') + '%';
}

export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(+d)) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function relTime(v) {
  if (!v) return 'chưa bao giờ';
  const diff = (Date.now() - new Date(v)) / 1000;
  if (Number.isNaN(diff)) return '—';
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} ngày trước`;
  return fmtDate(v);
}

/** Ngày dạng YYYY-MM-DD theo giờ địa phương (không lệch múi giờ như toISOString) */
export function isoDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ------------------------------ Nhãn trạng thái ---------------------------- */
export const CONTENT_STATUS = {
  todo:      { label: 'Chưa làm',  cls: ''       },
  scripting: { label: 'Viết kịch bản', cls: 'violet' },
  filmed:    { label: 'Đã quay',   cls: 'amber'  },
  posted:    { label: 'Đã đăng',   cls: 'green'  },
  paused:    { label: 'Tạm dừng',  cls: 'red'    },
};

export const contentStatusMeta = (s) => CONTENT_STATUS[s] || CONTENT_STATUS.todo;

export function orderStatusMeta(s) {
  const k = String(s || '').toUpperCase();
  if (k === 'COMPLETED') return { label: 'Hoàn thành', cls: 'green'  };
  if (k === 'PENDING')   return { label: 'Chờ duyệt',  cls: 'amber'  };
  if (k === 'CANCELLED') return { label: 'Đã huỷ',     cls: 'red'    };
  if (k === 'UNPAID')    return { label: 'Chưa TT',    cls: ''       };
  return { label: s || '—', cls: '' };
}

/* --------------------------------- Toast ---------------------------------- */
export function toast(message, kind = '') {
  const stack = qs('#toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s ease, transform .2s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(16px)';
    setTimeout(() => el.remove(), 220);
  }, kind === 'err' ? 5200 : 2800);
}

export const toastOk  = (m) => toast(m, 'ok');
export const toastErr = (m) => toast(m, 'err');

/* -------------------------------- Clipboard -------------------------------- */
export async function copyText(text, okMessage = 'Đã copy') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback cho http://localhost hoặc trình duyệt cũ
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toastOk(okMessage);
    return true;
  } catch {
    toastErr('Không copy được — hãy chọn và copy thủ công');
    return false;
  }
}

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  // Chỉ thêm BOM cho CSV, để Excel không hiển thị tiếng Việt bị lỗi font.
  const needsBom = /csv/i.test(mime) || /\.csv$/i.test(filename);
  const blob = new Blob([(needsBom ? '﻿' : '') + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------- Modal ---------------------------------- */
let modalStack = [];

/**
 * Mở modal. Trả về { root, close }.
 * body/footer nhận chuỗi HTML (nhớ esc dữ liệu người dùng).
 */
export function openModal({ title = '', body = '', footer = '', size = 'md', onClose } = {}) {
  const root = qs('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = `modal ${size}`;
  wrap.innerHTML = `
    <div class="modal-head">
      <h2>${esc(title)}</h2>
      <button class="icon-btn" data-modal-close aria-label="Đóng">
        <svg viewBox="0 0 24 24"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3 1.4 1.4Z"/></svg>
      </button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  `;

  root.appendChild(wrap);
  root.hidden = false;
  document.body.style.overflow = 'hidden';

  const close = () => {
    wrap.remove();
    modalStack = modalStack.filter((m) => m.wrap !== wrap);
    if (!modalStack.length) {
      root.hidden = true;
      document.body.style.overflow = '';
    }
    onClose?.();
  };

  modalStack.push({ wrap, close });
  qsa('[data-modal-close]', wrap).forEach((b) => b.addEventListener('click', close));
  root.addEventListener('click', onBackdrop);
  function onBackdrop(e) {
    if (e.target === root && modalStack.at(-1)?.wrap === wrap) close();
  }

  // Focus vào ô nhập đầu tiên cho tiện thao tác bàn phím
  setTimeout(() => qs('input,textarea,select,button', wrap)?.focus(), 40);

  return { root: wrap, close };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length) modalStack.at(-1).close();
});

/** Hộp thoại xác nhận. Trả về Promise<boolean>. */
export function confirmDialog({
  title = 'Xác nhận',
  message = '',
  confirmText = 'Đồng ý',
  cancelText = 'Huỷ',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };

    const m = openModal({
      title, size: 'sm',
      body: `<p style="color:var(--muted);line-height:1.65">${esc(message)}</p>`,
      footer: `
        <button class="btn-ghost" data-no>${esc(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : ''}" data-yes>${esc(confirmText)}</button>`,
      onClose: () => finish(false),
    });

    qs('[data-yes]', m.root).addEventListener('click', () => { finish(true); m.close(); });
    qs('[data-no]',  m.root).addEventListener('click', () => { finish(false); m.close(); });
  });
}

/* --------------------------------- Khác ----------------------------------- */
export function debounce(fn, ms = 280) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Bỏ dấu tiếng Việt + kebab-case. */
export function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Đọc số từ chuỗi CSV. Phải xử lý được cả hai quy ước:
 *   "1.234.567"  (VN — chấm là hàng nghìn)   -> 1234567
 *   "1.234,56"   (VN — phẩy là thập phân)    -> 1234.56
 *   "1,234.56"   (US)                        -> 1234.56
 *   "₫ 12.000"                               -> 12000
 *   "0.105"      (tỉ lệ, không phải tiền)    -> 0.105
 *   "(12.000)" hoặc "-12.000"                -> -12000
 */
export function parseNumberLoose(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;

  const raw = String(v ?? '').trim();
  if (!raw) return 0;

  // Số âm: dấu trừ, hoặc kiểu kế toán bọc trong ngoặc đơn
  const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw);

  let s = raw.replace(/[^\d.,]/g, '');
  if (!s) return 0;

  const dots   = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g)  || []).length;

  if (dots && commas) {
    // Dấu xuất hiện SAU CÙNG là dấu thập phân, dấu còn lại là phân cách hàng nghìn
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else                                         s = s.replace(/,/g, '');
  } else if (dots > 1 || commas > 1) {
    // Xuất hiện nhiều lần thì chỉ có thể là phân cách hàng nghìn
    s = s.replace(/[.,]/g, '');
  } else if (dots === 1 || commas === 1) {
    const sep    = dots ? '.' : ',';
    const at     = s.indexOf(sep);
    const before = s.slice(0, at);
    const after  = s.length - at - 1;
    // Đúng 3 chữ số phía sau và phần đầu khác "0" -> phân cách hàng nghìn (12.000 ₫).
    // Điều kiện "khác 0" giữ cho 0.105 vẫn là số thập phân, không thành 105.
    if (after === 3 && before !== '' && before !== '0') s = s.replace(/[.,]/g, '');
    else                                                s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/** Đọc ngày từ CSV: hỗ trợ ISO, dd/mm/yyyy, timestamp giây/mili-giây. */
export function parseDateLoose(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return Number.isNaN(+v) ? null : v.toISOString();

  const s = String(v).trim();
  if (!s) return null;

  if (/^\d{10}$/.test(s))  return new Date(Number(s) * 1000).toISOString();
  if (/^\d{13}$/.test(s))  return new Date(Number(s)).toISOString();

  // dd/mm/yyyy hoặc dd-mm-yyyy, kèm giờ tuỳ chọn
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, hh = 0, mi = 0, ss = 0] = m;
    const dt = new Date(+y, +mo - 1, +d, +hh, +mi, +ss);
    return Number.isNaN(+dt) ? null : dt.toISOString();
  }

  const dt = new Date(s);
  return Number.isNaN(+dt) ? null : dt.toISOString();
}

/** Trích itemId + shopId từ URL sản phẩm Shopee. */
export function parseShopeeUrl(url) {
  const s = String(url || '');
  // .../ten-san-pham-i.<shopId>.<itemId>
  let m = s.match(/-i\.(\d+)\.(\d+)/);
  if (m) return { shopId: Number(m[1]), itemId: Number(m[2]) };
  // /product/<shopId>/<itemId>
  m = s.match(/\/product\/(\d+)\/(\d+)/);
  if (m) return { shopId: Number(m[1]), itemId: Number(m[2]) };
  return { shopId: null, itemId: null };
}

/** Chuỗi ngắn ngẫu nhiên dùng làm hậu tố subId. */
export function randomId(len = 4) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** Khối skeleton khi đang tải. */
export const skeletonRows = (n = 5, h = 52) =>
  Array.from({ length: n }, () =>
    `<div class="skeleton" style="height:${h}px;margin-bottom:8px"></div>`).join('');
