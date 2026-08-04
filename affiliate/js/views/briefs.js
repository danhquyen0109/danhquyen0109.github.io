// =============================================================================
// views/briefs.js — chọn sản phẩm và xuất brief cho các agent làm content
// =============================================================================

import {
  qs, qsa, esc, safeUrl, fmtNum, fmtPct, copyText, downloadFile,
  toastErr, toastOk, contentStatusMeta, CONTENT_STATUS, skeletonRows, isoDay,
} from '../ui.js';
import * as db from '../db.js';
import { productsBrief, productsJson, priceRange } from '../brief.js';

export async function render(ctx) {
  const state = {
    status: ctx.params.status ?? 'todo',
    search: '',
    rows: [],
    picked: new Set(),
    includeTask: true,
  };

  ctx.setActions(`
    <button class="btn-ghost" id="b-copy">📋 Copy Markdown</button>
    <button class="btn" id="b-download">⬇ Tải brief</button>
  `);

  ctx.view.innerHTML = `
    <div class="grid grid-2" style="align-items:start">
      <div class="stack">

        <div class="card">
          <div class="card-head">
            <h2>Chọn sản phẩm</h2>
            <span class="sub" id="b-count">—</span>
          </div>

          <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px">
            <select id="b-status" style="width:auto;min-width:150px">
              <option value="">Mọi trạng thái</option>
              ${Object.entries(CONTENT_STATUS).map(([k, v]) =>
                `<option value="${k}" ${state.status === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
            </select>
            <input id="b-search" type="text" placeholder="Lọc theo tên…" style="flex:1;min-width:150px">
          </div>

          <div class="btn-row" style="margin-bottom:14px">
            <button class="btn-ghost btn-sm" id="b-all">Chọn tất cả</button>
            <button class="btn-ghost btn-sm" id="b-none">Bỏ chọn</button>
          </div>

          <div id="b-list">${skeletonRows(5, 56)}</div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Feed công khai cho agent</h2></div>
          <p style="color:var(--muted);line-height:1.65;margin-bottom:14px">
            Địa chỉ dưới đây trả về dữ liệu sản phẩm mà <strong>không cần đăng nhập</strong> —
            đưa thẳng cho agent khác để nó tự lấy. Feed chỉ chứa thông tin sản phẩm và
            nội dung mô tả, <strong>không có số liệu hoa hồng</strong>.
          </p>

          <div class="field">
            <span>Bản Markdown (dán vào chat)</span>
            <div class="copy-row">
              <code id="feed-md">—</code>
              <button class="btn-ghost btn-sm" data-copy="feed-md">Copy</button>
            </div>
          </div>

          <div class="field">
            <span>Bản JSON (cho agent xử lý bằng code)</span>
            <div class="copy-row">
              <code id="feed-json">—</code>
              <button class="btn-ghost btn-sm" data-copy="feed-json">Copy</button>
            </div>
          </div>

          <p class="cell-sub" style="line-height:1.6">
            Cần deploy Edge Function <code class="mono">feed</code> trước — xem
            <code class="mono">SETUP.md</code>. Chỉ những sản phẩm được bật
            “xuất ra feed công khai” mới xuất hiện.
          </p>
        </div>
      </div>

      <div class="card" style="position:sticky;top:84px">
        <div class="card-head">
          <h2>Xem trước brief</h2>
          <label class="check" style="margin:0">
            <input type="checkbox" id="b-task" checked>
            <span style="font-size:12px">Kèm phần mô tả việc cần làm</span>
          </label>
        </div>
        <div class="pre" id="b-preview" style="max-height:560px">Chọn ít nhất 1 sản phẩm.</div>
      </div>
    </div>
  `;

  /* ------------------------------ Dữ liệu --------------------------------- */

  async function load() {
    try {
      const { rows } = await db.listProducts({
        status: state.status, sort: 'created_at.desc', limit: 300,
      });
      state.rows = rows;
      // Giữ lại lựa chọn cũ nếu sản phẩm vẫn còn trong danh sách
      const ids = new Set(rows.map((r) => r.id));
      state.picked = new Set([...state.picked].filter((id) => ids.has(id)));
      drawList();
    } catch (err) {
      qs('#b-list').innerHTML =
        `<div class="empty" style="padding:32px"><p>${esc(err.message)}</p></div>`;
    }
  }

  const visible = () => {
    const s = state.search.toLowerCase();
    return s ? state.rows.filter((p) => p.name.toLowerCase().includes(s)) : state.rows;
  };

  const pickedProducts = () => state.rows.filter((p) => state.picked.has(p.id));

  function drawList() {
    const list = qs('#b-list');
    const rows = visible();

    if (!rows.length) {
      list.innerHTML = `<div class="empty" style="padding:36px">
        <p>Không có sản phẩm nào ở trạng thái này.</p></div>`;
    } else {
      list.innerHTML = rows.map((p) => {
        const st  = contentStatusMeta(p.content_status);
        const img = safeUrl(p.image_url);
        return `
        <label class="pick-row" data-id="${esc(p.id)}">
          <input type="checkbox" ${state.picked.has(p.id) ? 'checked' : ''}>
          ${img ? `<img class="thumb" src="${img}" alt="" loading="lazy"
                       referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`
                : `<div class="thumb"></div>`}
          <div class="txt">
            <div class="cell-main">${esc(p.name)}</div>
            <div class="cell-sub">
              ${esc(priceRange(p))}
              ${p.commission_rate ? ` · HH ${esc(fmtPct(p.commission_rate))}` : ''}
              ${p.description ? '' : ' · <span style="color:var(--amber)">chưa có mô tả</span>'}
            </div>
          </div>
          <span class="badge ${st.cls}">${esc(st.label)}</span>
        </label>`;
      }).join('');
    }
    updateCount();
  }

  function updateCount() {
    qs('#b-count').textContent =
      `${fmtNum(state.picked.size)} / ${fmtNum(visible().length)} đã chọn`;
    drawPreview();
  }

  function drawPreview() {
    const picked = pickedProducts();
    const pre = qs('#b-preview');
    if (!picked.length) {
      pre.textContent = 'Chọn ít nhất 1 sản phẩm.';
      return;
    }
    const missing = picked.filter((p) => !p.description).length;
    const warn = missing
      ? `⚠️ ${missing} sản phẩm chưa có mô tả chi tiết — brief sẽ thiếu thông tin cho agent.\n\n`
      : '';
    pre.textContent = warn + productsBrief(picked, { includeTask: state.includeTask });
  }

  /* ------------------------------ Sự kiện --------------------------------- */

  qs('#b-list').addEventListener('change', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.checked) state.picked.add(id); else state.picked.delete(id);
    updateCount();
  });

  qs('#b-status').addEventListener('change', (e) => {
    state.status = e.target.value;
    ctx.setParams({ status: state.status });
    load();
  });

  qs('#b-search').addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    drawList();
  });

  qs('#b-all').addEventListener('click', () => {
    visible().forEach((p) => state.picked.add(p.id));
    drawList();
  });

  qs('#b-none').addEventListener('click', () => {
    state.picked.clear();
    drawList();
  });

  qs('#b-task').addEventListener('change', (e) => {
    state.includeTask = e.target.checked;
    drawPreview();
  });

  qs('#b-copy').addEventListener('click', () => {
    const picked = pickedProducts();
    if (!picked.length) return toastErr('Chưa chọn sản phẩm nào.');
    copyText(productsBrief(picked, { includeTask: state.includeTask }),
      `Đã copy brief của ${picked.length} sản phẩm`);
  });

  qs('#b-download').addEventListener('click', () => {
    const picked = pickedProducts();
    if (!picked.length) return toastErr('Chưa chọn sản phẩm nào.');
    const day = isoDay();
    downloadFile(`brief-${day}.md`,
      productsBrief(picked, { includeTask: state.includeTask }), 'text/markdown;charset=utf-8');
    downloadFile(`brief-${day}.json`,
      productsJson(picked), 'application/json;charset=utf-8');
    toastOk('Đã tải cả bản Markdown và JSON.');
  });

  // URL feed công khai
  const mdUrl   = db.feedUrl({ format: 'md',   status: 'todo' });
  const jsonUrl = db.feedUrl({ format: 'json' });
  qs('#feed-md').textContent   = mdUrl;
  qs('#feed-json').textContent = jsonUrl;
  qsa('[data-copy]', ctx.view).forEach((b) => b.addEventListener('click', () =>
    copyText(qs('#' + b.dataset.copy).textContent, 'Đã copy địa chỉ feed')));

  await load();
}
