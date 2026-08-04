// =============================================================================
// charts.js — biểu đồ SVG viết tay, không dùng thư viện ngoài
// =============================================================================
// Màu cột dùng --chart-1 (#00959e) chứ không phải --teal (#19c2c2): teal gốc chỉ
// đạt tương phản 2.18:1 trên nền trắng, dưới ngưỡng 3:1 cho thành phần đồ hoạ.
// Cả hai biểu đồ đều chỉ có MỘT chuỗi dữ liệu nên không cần chú giải (legend) —
// tiêu đề thẻ đã nói rõ đang đo cái gì.
// =============================================================================

import { esc, fmtShort, fmtNum } from './ui.js';

const PAD = { top: 12, right: 6, bottom: 22, left: 46 };
const BAR_GAP = 2;          // khe hở giữa các cột, để chúng không dính vào nhau
const BAR_RADIUS = 4;       // bo đầu cột phía trên, chân cột vẫn phẳng trên trục

/** Đường path của một cột bo tròn 2 góc trên. */
function barPath(x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0) return '';
  return `M${x},${y + h}`
       + `L${x},${y + rad}`
       + `Q${x},${y} ${x + rad},${y}`
       + `L${x + w - rad},${y}`
       + `Q${x + w},${y} ${x + w},${y + rad}`
       + `L${x + w},${y + h}Z`;
}

/** Chọn bước chia trục tung "đẹp" (1/2/5 × 10^n). */
function niceStep(max, targetTicks = 4) {
  if (max <= 0) return 1;
  const raw = max / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Biểu đồ cột theo thời gian. Một chuỗi dữ liệu.
 *
 * @param {HTMLElement} host
 * @param {{label:string, value:number, tooltip?:string}[]} data
 * @param {{height?:number, format?:(n:number)=>string, emptyText?:string}} opts
 * @returns {()=>void} hàm dọn dẹp (huỷ ResizeObserver)
 */
export function barChart(host, data, opts = {}) {
  const {
    height = 220,
    format = fmtShort,
    emptyText = 'Chưa có dữ liệu trong khoảng này',
  } = opts;

  if (!data.length || data.every((d) => !d.value)) {
    host.innerHTML = `<div class="chart-empty">${esc(emptyText)}</div>`;
    return () => {};
  }

  host.innerHTML = `<div class="chart-wrap"><div class="chart-tip" hidden></div></div>`;
  const wrap = host.firstElementChild;
  const tip  = wrap.firstElementChild;

  function draw() {
    const W = Math.max(280, wrap.clientWidth);
    const H = height;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const max = Math.max(...data.map((d) => d.value));
    const step = niceStep(max);
    const top = Math.max(step, Math.ceil(max / step) * step);
    const y = (v) => PAD.top + plotH - (v / top) * plotH;

    const slot = plotW / data.length;
    const barW = Math.max(2, slot - BAR_GAP);

    // Nhãn trục hoành: chỉ hiện một số mốc để không chồng chữ lên nhau
    const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 62))));
    const labelled = new Set();
    let lastTick = -Infinity;
    for (let i = 0; i < data.length; i += every) { labelled.add(i); lastTick = i; }
    // Luôn muốn thấy mốc cuối, nhưng bỏ qua nếu nó sát nhãn trước đó quá
    const lastIdx = data.length - 1;
    if (lastIdx - lastTick >= Math.ceil(every / 2)) labelled.add(lastIdx);

    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);

    const svg = `
      <svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
           role="img" aria-label="Biểu đồ cột, ${data.length} mốc thời gian">
        ${ticks.map((v) => `
          <line class="grid-line" x1="${PAD.left}" x2="${W - PAD.right}"
                y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"></line>
          <text class="axis-txt" x="${PAD.left - 8}" y="${(y(v) + 3.5).toFixed(1)}"
                text-anchor="end">${esc(format(v))}</text>`).join('')}

        ${data.map((d, i) => {
          const x = PAD.left + i * slot + BAR_GAP / 2;
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / top) * plotH);
          const yy = PAD.top + plotH - h;
          return h ? `<path class="bar" d="${barPath(x, yy, barW, h, BAR_RADIUS)}"></path>` : '';
        }).join('')}

        ${data.map((d, i) => labelled.has(i) ? `
          <text class="axis-txt" x="${(PAD.left + i * slot + slot / 2).toFixed(1)}"
                y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>` : '').join('')}

        ${data.map((d, i) => `
          <rect class="hit" x="${(PAD.left + i * slot).toFixed(1)}" y="${PAD.top}"
                width="${slot.toFixed(1)}" height="${plotH}" data-i="${i}"></rect>`).join('')}
      </svg>`;

    // Giữ lại tooltip, chỉ thay phần svg
    wrap.querySelector('svg')?.remove();
    wrap.insertAdjacentHTML('beforeend', svg);
  }

  // Tooltip: vùng bắt chuột rộng bằng cả cột nên dễ trỏ trúng
  wrap.addEventListener('mousemove', (e) => {
    const hit = e.target.closest('.hit');
    if (!hit) { tip.hidden = true; return; }
    const d = data[Number(hit.dataset.i)];
    tip.innerHTML = d.tooltip || `<strong>${esc(d.label)}</strong><br>${esc(format(d.value))}`;
    tip.hidden = false;
    const box = wrap.getBoundingClientRect();
    const x = e.clientX - box.left;
    tip.style.left = `${Math.min(Math.max(x, 60), box.width - 60)}px`;
  });
  wrap.addEventListener('mouseleave', () => { tip.hidden = true; });

  draw();
  const ro = new ResizeObserver(draw);
  ro.observe(wrap);
  return () => ro.disconnect();
}

/**
 * Biểu đồ thanh ngang — dùng khi nhãn dài (tên sản phẩm).
 * Mỗi thanh có nhãn và giá trị viết thẳng bên cạnh, không cần tooltip.
 *
 * @param {HTMLElement} host
 * @param {{label:string, value:number, sub?:string}[]} data
 */
export function hBarChart(host, data, opts = {}) {
  const { format = (n) => fmtNum(n), emptyText = 'Chưa có dữ liệu' } = opts;

  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) {
    host.innerHTML = `<div class="chart-empty">${esc(emptyText)}</div>`;
    return;
  }

  const max = Math.max(...rows.map((d) => d.value));
  host.innerHTML = rows.map((d) => `
    <div class="hbar-row">
      <div>
        <div class="hbar-label" title="${esc(d.label)}">${esc(d.label)}</div>
        <div class="hbar-track">
          <div class="hbar-fill" style="width:${Math.max(2, (d.value / max) * 100).toFixed(1)}%"></div>
        </div>
      </div>
      <div class="hbar-val">
        ${esc(format(d.value))}
        ${d.sub ? `<div class="cell-sub" style="font-weight:400;text-align:right">${esc(d.sub)}</div>` : ''}
      </div>
    </div>`).join('');
}

/**
 * Bảng số liệu đi kèm biểu đồ — để người dùng screen reader và người cần con số
 * chính xác vẫn đọc được, không phụ thuộc vào việc nhìn thấy màu.
 */
export function dataTable(host, columns, rows) {
  host.innerHTML = `
    <div class="table-wrap" style="box-shadow:none">
      <table style="min-width:0">
        <thead><tr>${columns.map((c) =>
          `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>${columns.map((c) =>
            `<td class="${c.num ? 'num' : ''}">${esc(c.get(r))}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
