// =============================================================================
// views/products.js — danh sách sản phẩm & link tiếp thị
// =============================================================================

import {
  qs, qsa, esc, safeUrl, fmtVND, fmtNum, fmtPct, fmtDate,
  toastOk, toastErr, copyText, confirmDialog, debounce,
  contentStatusMeta, CONTENT_STATUS, skeletonRows,
} from '../ui.js';
import * as db from '../db.js';
import { openProductForm, openShopeeImport } from '../product-form.js';
import { productBrief, bestLink, priceRange } from '../brief.js';
import { CONFIG } from '../../config.js';

const PAGE_SIZE = 60;

export async function render(ctx) {
  const state = {
    search:   ctx.params.search   || '',
    status:   ctx.params.status   || '',
    category: ctx.params.category || '',
    sort:     ctx.params.sort     || 'created_at.desc',
    mode:     localStorage.getItem('aff.products.mode') || 'grid',
    limit:    PAGE_SIZE,
    rows:     [],
    total:    0,
    perf:     new Map(),
  };

  /* ------------------------------- Khung ---------------------------------- */

  ctx.setActions(`
    <button class="btn-ghost" id="btn-shopee">
      <svg viewBox="0 0 24 24"><path d="M12 2a4 4 0 0 0-4 4v1H4l1.5 13.2A2 2 0 0 0 7.5 22h9a2 2 0 0 0 2-1.8L20 7h-4V6a4 4 0 0 0-4-4Zm0 2a2 2 0 0 1 2 2v1h-4V6a2 2 0 0 1 2-2Zm-5.8 5h11.6l-1.3 11h-9L6.2 9Z"/></svg>
      Dán link Shopee
    </button>
    <button class="btn" id="btn-add">+ Thêm sản phẩm</button>
  `);

  ctx.view.innerHTML = `
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"/></svg>
        <input id="f-search" type="text" placeholder="Tìm theo tên, mô tả, danh mục…"
               value="${esc(state.search)}">
      </div>
      <select id="f-status">
        <option value="">Mọi trạng thái</option>
        ${Object.entries(CONTENT_STATUS).map(([k, v]) =>
          `<option value="${k}" ${state.status === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
      </select>
      <select id="f-category"><option value="">Mọi danh mục</option></select>
      <select id="f-sort">
        <option value="created_at.desc" ${state.sort === 'created_at.desc' ? 'selected' : ''}>Mới nhất</option>
        <option value="created_at.asc"  ${state.sort === 'created_at.asc'  ? 'selected' : ''}>Cũ nhất</option>
        <option value="name.asc"        ${state.sort === 'name.asc'        ? 'selected' : ''}>Tên A→Z</option>
        <option value="commission_rate.desc" ${state.sort === 'commission_rate.desc' ? 'selected' : ''}>Hoa hồng cao nhất</option>
        <option value="price_min.asc"   ${state.sort === 'price_min.asc'   ? 'selected' : ''}>Giá thấp nhất</option>
      </select>
      <div class="seg">
        <button data-mode="grid"  class="${state.mode === 'grid'  ? 'on' : ''}">Lưới</button>
        <button data-mode="table" class="${state.mode === 'table' ? 'on' : ''}">Bảng</button>
      </div>
    </div>
    <div id="p-count" class="cell-sub" style="margin:0 4px 12px"></div>
    <div id="p-body">${skeletonRows(4, 96)}</div>
    <div id="p-more"></div>
  `;

  /* ------------------------------- Nạp dữ liệu ---------------------------- */

  async function load({ keepScroll = false } = {}) {
    const y = window.scrollY;
    try {
      const [{ rows, total }, perf] = await Promise.all([
        db.listProducts({
          search: state.search, status: state.status, category: state.category,
          sort: state.sort, limit: state.limit,
        }),
        state.perf.size ? Promise.resolve(null) : db.productPerformance({ limit: 500 }).catch(() => []),
      ]);
      state.rows = rows;
      state.total = total;
      if (perf) perf.forEach((r) => state.perf.set(r.product_id, r));
    } catch (err) {
      qs('#p-body').innerHTML = `<div class="empty"><div class="ico">⚠️</div>
        <h3>Không tải được danh sách</h3><p>${esc(err.message)}</p></div>`;
      qs('#p-count').textContent = '';
      return;
    }
    draw();
    if (keepScroll) window.scrollTo(0, y);
  }

  function draw() {
    const body  = qs('#p-body');
    const count = qs('#p-count');
    const more  = qs('#p-more');

    count.textContent = state.total
      ? `${fmtNum(state.total)} sản phẩm${state.rows.length < state.total ? ` · đang hiện ${fmtNum(state.rows.length)}` : ''}`
      : '';

    if (!state.rows.length) {
      body.innerHTML = emptyHtml(!!(state.search || state.status || state.category));
      more.innerHTML = '';
      qs('#empty-add', body)?.addEventListener('click', () => openProductForm(null, () => load()));
      qs('#empty-clear', body)?.addEventListener('click', () => {
        state.search = ''; state.status = ''; state.category = '';
        qs('#f-search').value = ''; qs('#f-status').value = ''; qs('#f-category').value = '';
        syncParams(); load();
      });
      return;
    }

    body.innerHTML = state.mode === 'grid'
      ? `<div class="product-grid">${state.rows.map(cardHtml).join('')}</div>`
      : tableHtml(state.rows);

    more.innerHTML = state.rows.length < state.total
      ? `<div class="pager"><button class="btn-ghost" id="btn-more">Tải thêm ${
           fmtNum(Math.min(PAGE_SIZE, state.total - state.rows.length))} sản phẩm</button></div>`
      : '';
    qs('#btn-more', more)?.addEventListener('click', () => {
      state.limit += PAGE_SIZE;
      load({ keepScroll: true });
    });
  }

  /* -------------------------------- Mẫu HTML ------------------------------ */

  function emptyHtml(filtered) {
    if (filtered) return `
      <div class="empty">
        <div class="ico">🔍</div>
        <h3>Không có sản phẩm nào khớp</h3>
        <p>Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm.</p>
        <button class="btn-ghost" id="empty-clear">Xoá bộ lọc</button>
      </div>`;
    return `
      <div class="empty">
        <div class="ico">📦</div>
        <h3>Chưa có sản phẩm nào</h3>
        <p>Thêm sản phẩm đầu tiên kèm mô tả chi tiết và ảnh — sau đó bạn có thể
           xuất brief để agent làm clip và bài đăng.</p>
        <button class="btn" id="empty-add">+ Thêm sản phẩm</button>
      </div>`;
  }

  function platDots(p) {
    return CONFIG.PLATFORMS.slice(0, 4).map(({ key, label }) => {
      const on = !!(p.platforms?.[key]?.posted || p.platforms?.[key]?.url);
      return `<span class="plat-dot ${on ? 'on' : ''}" title="${esc(label)}${on ? ' — đã đăng' : ''}">${
        esc(label.charAt(0))}</span>`;
    }).join('');
  }

  function cardHtml(p) {
    const st  = contentStatusMeta(p.content_status);
    const img = safeUrl(p.image_url);
    const perf = state.perf.get(p.id);

    return `
    <article class="pcard" data-id="${esc(p.id)}">
      <div class="pcard-img">
        ${img
          ? `<img src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer"
                  onerror="this.remove()">`
          : `<span class="ph">📦</span>`}
        <div class="corner"><span class="badge ${st.cls}">${esc(st.label)}</span></div>
      </div>
      <div class="pcard-body">
        <div class="pcard-name" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="pcard-meta">
          <span class="pcard-price">${esc(priceRange(p))}</span>
          ${p.commission_rate ? `<span class="pcard-rate">HH ${esc(fmtPct(p.commission_rate))}</span>` : ''}
        </div>
        <div class="plat-dots">${platDots(p)}</div>
        <div class="pcard-stats">
          <span>Đơn <b>${fmtNum(perf?.orders || 0)}</b></span>
          <span>HH <b>${esc(fmtVND(perf?.commission || 0))}</b></span>
        </div>
      </div>
      <div class="pcard-actions">
        <button data-act="link"  title="Copy link tiếp thị">🔗 Link</button>
        <button data-act="brief" title="Copy brief cho agent">📋 Brief</button>
        <button data-act="edit"  title="Sửa">✏️ Sửa</button>
        <button data-act="del" class="danger" title="Xoá">🗑</button>
      </div>
    </article>`;
  }

  function tableHtml(rows) {
    return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sản phẩm</th>
            <th>Trạng thái</th>
            <th class="num">Giá</th>
            <th class="num">HH</th>
            <th class="num">Đơn</th>
            <th class="num">Hoa hồng</th>
            <th>Thêm lúc</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((p) => {
            const st = contentStatusMeta(p.content_status);
            const img = safeUrl(p.image_url);
            const perf = state.perf.get(p.id);
            return `
            <tr data-id="${esc(p.id)}">
              <td>
                <div class="cell-product">
                  ${img ? `<img class="thumb" src="${img}" alt="" loading="lazy"
                                referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`
                        : `<div class="thumb"></div>`}
                  <div class="txt">
                    <div class="cell-main">${esc(p.name)}</div>
                    <div class="cell-sub">${esc(p.category || '—')}</div>
                  </div>
                </div>
              </td>
              <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
              <td class="num">${esc(priceRange(p))}</td>
              <td class="num">${esc(fmtPct(p.commission_rate))}</td>
              <td class="num">${fmtNum(perf?.orders || 0)}</td>
              <td class="num">${esc(fmtVND(perf?.commission || 0))}</td>
              <td class="cell-sub">${esc(fmtDate(p.created_at))}</td>
              <td class="num" style="white-space:nowrap">
                <button class="icon-btn" data-act="link"  title="Copy link">🔗</button>
                <button class="icon-btn" data-act="brief" title="Copy brief">📋</button>
                <button class="icon-btn" data-act="edit"  title="Sửa">✏️</button>
                <button class="icon-btn" data-act="del"   title="Xoá">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  /* ------------------------------- Sự kiện -------------------------------- */

  // Uỷ quyền sự kiện: gắn MỘT LẦN vào #p-body, không gắn lại sau mỗi lần vẽ.
  function wireRows(root) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const host = btn.closest('[data-id]');
      const p = state.rows.find((x) => x.id === host?.dataset.id);
      if (!p) return;

      switch (btn.dataset.act) {
        case 'link': {
          const link = bestLink(p);
          if (!link) return toastErr('Sản phẩm này chưa có link tiếp thị.');
          copyText(link, 'Đã copy link tiếp thị');
          break;
        }
        case 'brief':
          copyText(productBrief(p), 'Đã copy brief — dán thẳng vào chat với agent');
          break;
        case 'edit':
          openProductForm(p, () => load({ keepScroll: true }));
          break;
        case 'del': {
          const ok = await confirmDialog({
            title: 'Xoá sản phẩm?',
            message: `Xoá "${p.name}" khỏi danh sách. Không thể hoàn tác.`,
            confirmText: 'Xoá', danger: true,
          });
          if (!ok) return;
          try {
            await db.deleteProduct(p.id);
            toastOk('Đã xoá.');
            load({ keepScroll: true });
          } catch (err) { toastErr(err.message); }
          break;
        }
      }
    });
  }

  function syncParams() {
    ctx.setParams({
      search: state.search, status: state.status,
      category: state.category, sort: state.sort,
    });
  }

  qs('#btn-add').addEventListener('click', () => openProductForm(null, () => load()));
  qs('#btn-shopee').addEventListener('click', () => openShopeeImport(() => load()));

  qs('#f-search').addEventListener('input', debounce((e) => {
    state.search = e.target.value.trim();
    state.limit = PAGE_SIZE;
    syncParams(); load();
  }, 320));

  ['f-status', 'f-category', 'f-sort'].forEach((id) => {
    qs('#' + id).addEventListener('change', (e) => {
      state[id.slice(2)] = e.target.value;     // f-status -> status
      state.limit = PAGE_SIZE;
      syncParams(); load();
    });
  });

  wireRows(qs('#p-body'));

  qsa('.seg button', ctx.view).forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    localStorage.setItem('aff.products.mode', state.mode);
    qsa('.seg button', ctx.view).forEach((x) => x.classList.toggle('on', x === b));
    draw();
  }));

  // Đổ danh mục vào bộ lọc
  db.listCategories().then((cats) => {
    const sel = qs('#f-category');
    sel.innerHTML = '<option value="">Mọi danh mục</option>'
      + cats.map((c) => `<option value="${esc(c)}" ${state.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }).catch(() => {});

  await load();
}
