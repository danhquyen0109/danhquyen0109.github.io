// =============================================================================
// views/dashboard.js — tổng quan thu nhập & đơn hàng
// =============================================================================

import {
  qs, qsa, esc, safeUrl, fmtVND, fmtNum, fmtShort, fmtDate, fmtDateTime,
  relTime, isoDay, orderStatusMeta, contentStatusMeta, skeletonRows,
} from '../ui.js';
import * as db from '../db.js';
import { barChart, hBarChart, dataTable } from '../charts.js';
import { navigate } from '../router.js';

const RANGES = [
  { key: '7',   days: 7,   label: '7 ngày'  },
  { key: '30',  days: 30,  label: '30 ngày' },
  { key: '90',  days: 90,  label: '90 ngày' },
];

const dayBefore = (n) => isoDay(new Date(Date.now() - n * 86400000));

export async function render(ctx) {
  const rangeKey = RANGES.some((r) => r.key === ctx.params.range) ? ctx.params.range : '30';
  const days = RANGES.find((r) => r.key === rangeKey).days;

  let disposeChart = () => {};

  ctx.setActions(`
    <div class="seg">
      ${RANGES.map((r) => `<button data-range="${r.key}"
        class="${r.key === rangeKey ? 'on' : ''}">${esc(r.label)}</button>`).join('')}
    </div>
  `);

  ctx.view.innerHTML = `
    <div class="grid grid-4" id="d-kpi" style="margin-bottom:14px">${
      skeletonRows(1, 104).repeat(4)}</div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <h2>Hoa hồng theo ngày</h2>
        <span class="sub" id="d-chart-sub"></span>
        <button class="btn-ghost btn-sm" id="d-toggle-table">Xem số liệu</button>
      </div>
      <div id="d-chart"></div>
      <div id="d-chart-table" hidden style="margin-top:14px"></div>
    </div>

    <div class="grid grid-2" style="align-items:start">
      <div class="card">
        <div class="card-head">
          <h2>Sản phẩm mang lại nhiều hoa hồng nhất</h2>
        </div>
        <div id="d-top"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Đơn gần nhất</h2>
          <a href="#/orders" class="sub" style="text-decoration:underline">Xem tất cả</a>
        </div>
        <div id="d-recent">${skeletonRows(5, 40)}</div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-head">
        <h2>Việc content còn tồn</h2>
        <a href="#/briefs" class="sub" style="text-decoration:underline">Tạo brief</a>
      </div>
      <div id="d-todo"></div>
    </div>

    <p class="cell-sub" id="d-sync" style="margin:18px 4px 0"></p>
  `;

  qsa('[data-range]', ctx.actions).forEach((b) => b.addEventListener('click', () => {
    navigate('dashboard', { range: b.dataset.range });
  }));

  /* ------------------------------- Nạp dữ liệu ---------------------------- */

  const from = dayBefore(days - 1);
  const to   = isoDay();
  const prevFrom = dayBefore(days * 2 - 1);
  const prevTo   = dayBefore(days);

  const [stats, cur, prev, perf, recent, todo, syncLog] = await Promise.all([
    db.dailyStats(from, to).catch(() => []),
    db.summarize(from, to).catch(() => null),
    db.summarize(prevFrom, prevTo).catch(() => null),
    db.productPerformance({ limit: 8 }).catch(() => []),
    db.listConversions({ limit: 6 }).then((r) => r.rows).catch(() => []),
    db.listProducts({ status: 'todo', limit: 6 }).then((r) => r.rows).catch(() => []),
    db.listSyncLog(1).catch(() => []),
  ]);

  /* --------------------------------- KPI ---------------------------------- */

  function deltaHtml(now, before) {
    if (!before) return '<span class="delta flat">—</span>';
    const pct = ((now - before) / before) * 100;
    if (!Number.isFinite(pct)) return '<span class="delta flat">—</span>';
    const cls = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
    const sign = pct > 0 ? '▲' : pct < 0 ? '▼' : '•';
    return `<span class="delta ${cls}">${sign} ${Math.abs(pct).toFixed(0)}%</span>`;
  }

  const s = cur || { orders: 0, commission: 0, net_commission: 0, pending_orders: 0, gmv: 0 };
  const p = prev || { orders: 0, commission: 0 };
  const aov = s.orders ? s.gmv / s.orders : 0;

  qs('#d-kpi').innerHTML = [
    {
      label: `Hoa hồng ${days} ngày`, value: fmtVND(s.commission),
      extra: deltaHtml(s.commission, p.commission),
      foot: `so với ${days} ngày trước đó`,
    },
    {
      label: 'Số đơn', value: fmtNum(s.orders),
      extra: deltaHtml(s.orders, p.orders),
      foot: `${fmtNum(s.completed_orders || 0)} đã hoàn thành`,
    },
    {
      label: 'Chờ duyệt', value: fmtNum(s.pending_orders),
      foot: 'đơn chưa chốt hoa hồng',
    },
    {
      label: 'Giá trị đơn TB', value: fmtVND(aov),
      foot: `tổng GMV ${fmtVND(s.gmv)}`,
    },
  ].map((k) => `
    <div class="kpi">
      <div class="label">${esc(k.label)}</div>
      <div class="value">${esc(k.value)}</div>
      ${k.extra || ''}
      <div class="foot">${esc(k.foot)}</div>
    </div>`).join('');

  /* ------------------------------ Biểu đồ cột ----------------------------- */

  // Bơm đủ mọi ngày trong khoảng, kể cả ngày không có đơn, để trục thời gian
  // không bị co lại đánh lừa mắt.
  const byDay = new Map(stats.map((r) => [r.day, r]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayBefore(i);
    const r = byDay.get(day);
    const commission = Number(r?.commission || 0);
    const orders = r?.orders || 0;
    series.push({
      day,
      label: day.slice(8) + '/' + day.slice(5, 7),
      value: commission,
      orders,
      tooltip: `<strong>${fmtDate(day)}</strong><br>${fmtVND(commission)} · ${fmtNum(orders)} đơn`,
    });
  }

  qs('#d-chart-sub').textContent =
    `${fmtDate(from)} – ${fmtDate(to)}`;

  disposeChart = barChart(qs('#d-chart'), series, {
    height: 240,
    format: fmtShort,
    emptyText: 'Chưa có đơn nào trong khoảng này',
  });

  // Bảng số liệu đi kèm — cho người dùng cần con số chính xác / screen reader
  const tableBox = qs('#d-chart-table');
  qs('#d-toggle-table').addEventListener('click', (e) => {
    const showing = !tableBox.hidden;
    tableBox.hidden = showing;
    e.target.textContent = showing ? 'Xem số liệu' : 'Ẩn số liệu';
    if (!showing) {
      dataTable(tableBox,
        [
          { label: 'Ngày',      get: (r) => fmtDate(r.day) },
          { label: 'Số đơn',    get: (r) => fmtNum(r.orders), num: true },
          { label: 'Hoa hồng',  get: (r) => fmtVND(r.value),  num: true },
        ],
        series.filter((r) => r.orders || r.value).reverse(),
      );
    }
  });

  /* ---------------------------- Top sản phẩm ------------------------------ */

  hBarChart(qs('#d-top'), perf.map((r) => ({
    label: r.name,
    value: Number(r.commission || 0),
    sub: `${fmtNum(r.orders)} đơn`,
  })), {
    format: fmtVND,
    emptyText: 'Chưa quy được đơn nào về sản phẩm. Nhớ gắn subId vào link tiếp thị.',
  });

  /* ------------------------------ Đơn gần nhất ---------------------------- */

  qs('#d-recent').innerHTML = recent.length
    ? recent.map((c) => {
        const st = orderStatusMeta(c.order_status);
        return `
        <div class="pick-row" style="cursor:default">
          <div class="txt">
            <div class="cell-main mono" style="font-size:12.5px">${esc(c.conversion_id)}</div>
            <div class="cell-sub">${esc(fmtDateTime(c.purchase_time))}</div>
          </div>
          <span class="badge ${st.cls}">${esc(st.label)}</span>
          <strong style="font-variant-numeric:tabular-nums;white-space:nowrap">${
            esc(fmtVND(c.total_commission))}</strong>
        </div>`;
      }).join('')
    : `<div class="empty" style="padding:32px">
         <p>Chưa có đơn nào. Import CSV hoặc nhập tay ở màn <a href="#/orders"
            style="text-decoration:underline">Đơn hàng</a>.</p>
       </div>`;

  /* --------------------------- Việc content tồn --------------------------- */

  qs('#d-todo').innerHTML = todo.length
    ? `<div class="product-grid">${todo.map((p) => {
        const img = safeUrl(p.image_url);
        const st = contentStatusMeta(p.content_status);
        return `
        <a class="pcard" href="#/briefs?status=todo" style="text-decoration:none">
          <div class="pcard-img">
            ${img ? `<img src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer"
                         onerror="this.remove()">` : `<span class="ph">📦</span>`}
            <div class="corner"><span class="badge ${st.cls}">${esc(st.label)}</span></div>
          </div>
          <div class="pcard-body">
            <div class="pcard-name">${esc(p.name)}</div>
            <div class="cell-sub">${p.description
              ? 'Đã có mô tả — sẵn sàng làm brief'
              : '<span style="color:var(--amber)">Chưa có mô tả chi tiết</span>'}</div>
          </div>
        </a>`;
      }).join('')}</div>`
    : `<div class="empty" style="padding:32px">
         <p>Không còn sản phẩm nào ở trạng thái “chưa làm”. </p>
       </div>`;

  /* ------------------------------ Trạng thái sync ------------------------- */

  const last = syncLog[0];
  qs('#d-sync').textContent = last
    ? `Đồng bộ gần nhất: ${relTime(last.ran_at)} · ${last.ok ? 'thành công' : 'thất bại'}` +
      ` · ${last.message || `${last.upserted} bản ghi`}`
    : 'Chưa chạy đồng bộ lần nào. Xem mục Cài đặt để bật đồng bộ Shopee.';

  return () => disposeChart();
}
