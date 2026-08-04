// =============================================================================
// views/orders.js — danh sách đơn hàng, import CSV, nhập tay, xuất CSV
// =============================================================================

import {
  qs, qsa, esc, fmtVND, fmtNum, fmtDateTime, isoDay,
  toastOk, toastErr, confirmDialog, openModal, downloadFile, debounce,
  orderStatusMeta, skeletonRows,
} from '../ui.js';
import * as db from '../db.js';
import { parseCSV, guessMapping, buildRecords, TARGET_FIELDS, toCSV } from '../csv.js';

const PAGE = 50;
const MAPPING_KEY = 'csv_mapping';

export async function render(ctx) {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 89 * 86400000);

  const state = {
    from:   ctx.params.from   || isoDay(monthAgo),
    to:     ctx.params.to     || isoDay(today),
    status: ctx.params.status || '',
    search: ctx.params.search || '',
    page:   0,
    rows:   [],
    total:  0,
  };

  ctx.setActions(`
    <button class="btn-ghost" id="o-export">⬇ Xuất CSV</button>
    <button class="btn-ghost" id="o-import">⬆ Import CSV</button>
    <button class="btn" id="o-add">+ Nhập đơn</button>
  `);

  ctx.view.innerHTML = `
    <div class="toolbar">
      <div class="search">
        <svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z"/></svg>
        <input id="o-search" type="text" placeholder="Tìm mã đơn hoặc subId…" value="${esc(state.search)}">
      </div>
      <input id="o-from" type="date" value="${esc(state.from)}" style="width:auto">
      <span class="cell-sub">→</span>
      <input id="o-to" type="date" value="${esc(state.to)}" style="width:auto">
      <select id="o-status">
        <option value="">Mọi trạng thái</option>
        <option value="COMPLETED" ${state.status === 'COMPLETED' ? 'selected' : ''}>Hoàn thành</option>
        <option value="PENDING"   ${state.status === 'PENDING'   ? 'selected' : ''}>Chờ duyệt</option>
        <option value="CANCELLED" ${state.status === 'CANCELLED' ? 'selected' : ''}>Đã huỷ</option>
        <option value="UNPAID"    ${state.status === 'UNPAID'    ? 'selected' : ''}>Chưa thanh toán</option>
      </select>
    </div>

    <div class="grid grid-4" id="o-sum" style="margin-bottom:16px"></div>
    <div id="o-body">${skeletonRows(6, 48)}</div>
    <div id="o-pager"></div>
  `;

  /* ------------------------------ Nạp dữ liệu ----------------------------- */

  async function load() {
    try {
      const [{ rows, total }, sum] = await Promise.all([
        db.listConversions({
          from: state.from, to: state.to, status: state.status,
          search: state.search, limit: PAGE, offset: state.page * PAGE,
        }),
        db.summarize(state.from, state.to).catch(() => null),
      ]);
      state.rows = rows;
      state.total = total;
      drawSummary(sum);
      drawTable();
    } catch (err) {
      qs('#o-body').innerHTML = `<div class="empty"><div class="ico">⚠️</div>
        <h3>Không tải được đơn hàng</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  function drawSummary(s) {
    if (!s) { qs('#o-sum').innerHTML = ''; return; }
    const tiles = [
      { label: 'Tổng đơn',        value: fmtNum(s.orders),          foot: `${fmtNum(s.completed_orders)} hoàn thành` },
      { label: 'Hoa hồng tạm tính', value: fmtVND(s.commission),    foot: 'theo khoảng đã chọn' },
      { label: 'Chờ duyệt',       value: fmtNum(s.pending_orders),  foot: 'đơn' },
      { label: 'Giá trị đơn',     value: fmtVND(s.gmv),             foot: `${fmtNum(s.items)} sản phẩm` },
    ];
    qs('#o-sum').innerHTML = tiles.map((t) => `
      <div class="kpi">
        <div class="label">${esc(t.label)}</div>
        <div class="value">${esc(t.value)}</div>
        <div class="foot">${esc(t.foot)}</div>
      </div>`).join('');
  }

  function drawTable() {
    const body = qs('#o-body');
    if (!state.rows.length) {
      body.innerHTML = `
        <div class="empty">
          <div class="ico">🧾</div>
          <h3>Chưa có đơn nào trong khoảng này</h3>
          <p>Import file báo cáo từ Shopee Affiliate Center, nhập tay, hoặc bật
             đồng bộ tự động qua Shopee API (xem mục Cài đặt).</p>
          <div class="btn-row" style="justify-content:center">
            <button class="btn-ghost" id="empty-import">⬆ Import CSV</button>
            <button class="btn" id="empty-add">+ Nhập đơn</button>
          </div>
        </div>`;
      qs('#empty-import', body)?.addEventListener('click', openImport);
      qs('#empty-add', body)?.addEventListener('click', () => openManualEntry());
      qs('#o-pager').innerHTML = '';
      return;
    }

    body.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Thời gian đặt</th>
              <th>Trạng thái</th>
              <th>subId</th>
              <th class="num">Giá trị</th>
              <th class="num">Hoa hồng</th>
              <th class="num">Thực nhận</th>
              <th>Nguồn</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.rows.map((c) => {
              const st = orderStatusMeta(c.order_status);
              return `
              <tr data-id="${esc(c.conversion_id)}">
                <td class="mono">${esc(c.conversion_id)}</td>
                <td>${esc(fmtDateTime(c.purchase_time))}</td>
                <td><span class="badge ${st.cls}">${esc(st.label)}</span></td>
                <td class="cell-sub">${esc(c.utm_content || '—')}</td>
                <td class="num">${esc(fmtVND(c.gmv))}</td>
                <td class="num">${esc(fmtVND(c.total_commission))}</td>
                <td class="num">${c.net_commission != null ? esc(fmtVND(c.net_commission)) : '—'}</td>
                <td><span class="chip">${esc(c.source)}</span></td>
                <td class="num"><button class="icon-btn" data-del title="Xoá">🗑</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    const pages = Math.ceil(state.total / PAGE);
    qs('#o-pager').innerHTML = pages > 1 ? `
      <div class="pager">
        <button class="btn-ghost btn-sm" id="prev" ${state.page === 0 ? 'disabled' : ''}>← Trước</button>
        <span>Trang ${state.page + 1} / ${pages} · ${fmtNum(state.total)} đơn</span>
        <button class="btn-ghost btn-sm" id="next" ${state.page >= pages - 1 ? 'disabled' : ''}>Sau →</button>
      </div>` : `<div class="pager">${fmtNum(state.total)} đơn</div>`;

    qs('#prev', qs('#o-pager'))?.addEventListener('click', () => { state.page--; load(); });
    qs('#next', qs('#o-pager'))?.addEventListener('click', () => { state.page++; load(); });
  }

  /* ------------------------------- Sự kiện -------------------------------- */

  qs('#o-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    const ok = await confirmDialog({
      title: 'Xoá đơn?', message: `Xoá bản ghi ${id}.`,
      confirmText: 'Xoá', danger: true,
    });
    if (!ok) return;
    try {
      await db.deleteConversion(id);
      toastOk('Đã xoá.');
      load();
    } catch (err) { toastErr(err.message); }
  });

  const applyFilters = () => {
    state.page = 0;
    ctx.setParams({ from: state.from, to: state.to, status: state.status, search: state.search });
    load();
  };

  qs('#o-from').addEventListener('change', (e) => { state.from = e.target.value; applyFilters(); });
  qs('#o-to').addEventListener('change',   (e) => { state.to   = e.target.value; applyFilters(); });
  qs('#o-status').addEventListener('change', (e) => { state.status = e.target.value; applyFilters(); });
  qs('#o-search').addEventListener('input', debounce((e) => {
    state.search = e.target.value.trim(); applyFilters();
  }, 320));

  qs('#o-add').addEventListener('click', () => openManualEntry());
  qs('#o-import').addEventListener('click', openImport);

  qs('#o-export').addEventListener('click', async () => {
    try {
      const { rows } = await db.listConversions({
        from: state.from, to: state.to, status: state.status,
        search: state.search, limit: 5000,
      });
      if (!rows.length) return toastErr('Không có dữ liệu để xuất.');
      const csv = toCSV(rows, [
        { label: 'Mã đơn',            get: (r) => r.conversion_id },
        { label: 'Thời gian đặt',     get: (r) => r.purchase_time },
        { label: 'Trạng thái',        get: (r) => r.order_status },
        { label: 'subId',             get: (r) => r.utm_content },
        { label: 'Giá trị đơn',       get: (r) => r.gmv },
        { label: 'Tổng hoa hồng',     get: (r) => r.total_commission },
        { label: 'Hoa hồng thực nhận',get: (r) => r.net_commission },
        { label: 'Số sản phẩm',       get: (r) => r.item_count },
        { label: 'Nguồn',             get: (r) => r.source },
      ]);
      downloadFile(`don-hang-${state.from}_${state.to}.csv`, csv, 'text/csv;charset=utf-8');
      toastOk(`Đã xuất ${rows.length} đơn.`);
    } catch (err) { toastErr(err.message); }
  });

  /* --------------------------- Nhập đơn thủ công --------------------------- */

  function openManualEntry() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);

    const m = openModal({
      title: 'Nhập đơn thủ công',
      size: 'md',
      body: `
        <form id="mform">
          <div class="form-grid">
            <label class="field">
              <span>Mã đơn *</span>
              <input name="conversion_id" required placeholder="VD: 250804ABCDEF">
            </label>
            <label class="field">
              <span>Thời gian đặt *</span>
              <input name="purchase_time" type="datetime-local" required value="${local}">
            </label>
            <label class="field">
              <span>Trạng thái</span>
              <select name="order_status">
                <option value="PENDING">Chờ duyệt</option>
                <option value="COMPLETED">Hoàn thành</option>
                <option value="CANCELLED">Đã huỷ</option>
                <option value="UNPAID">Chưa thanh toán</option>
              </select>
            </label>
            <label class="field">
              <span>subId (để quy về sản phẩm)</span>
              <input name="utm_content" list="subid-list" placeholder="dq-tai-nghe-a3f2">
            </label>
            <label class="field">
              <span>Giá trị đơn (₫)</span>
              <input name="gmv" type="number" min="0" step="1000" value="0">
            </label>
            <label class="field">
              <span>Tổng hoa hồng (₫) *</span>
              <input name="total_commission" type="number" min="0" step="100" required value="0">
            </label>
            <label class="field">
              <span>Hoa hồng thực nhận (₫)</span>
              <input name="net_commission" type="number" min="0" step="100" placeholder="để trống nếu chưa chốt">
            </label>
            <label class="field">
              <span>Số sản phẩm</span>
              <input name="item_count" type="number" min="0" value="1">
            </label>
          </div>
          <datalist id="subid-list"></datalist>
        </form>`,
      footer: `
        <button class="btn-ghost" data-modal-close>Huỷ</button>
        <button class="btn" id="m-save">Lưu đơn</button>`,
    });

    // Gợi ý subId từ danh sách sản phẩm
    db.listProducts({ limit: 300 }).then(({ rows }) => {
      const dl = qs('#subid-list', m.root);
      if (dl) dl.innerHTML = rows.filter((p) => p.sub_id)
        .map((p) => `<option value="${esc(p.sub_id)}">${esc(p.name)}</option>`).join('');
    }).catch(() => {});

    qs('#m-save', m.root).addEventListener('click', async () => {
      const f = qs('#mform', m.root);
      if (!f.reportValidity()) return;
      const g = (n) => f.elements[n].value.trim();
      const utm = g('utm_content') || null;

      const btn = qs('#m-save', m.root);
      btn.disabled = true; btn.textContent = 'Đang lưu…';
      try {
        await db.upsertConversions([{
          conversion_id:    g('conversion_id'),
          purchase_time:    new Date(g('purchase_time')).toISOString(),
          order_status:     g('order_status'),
          utm_content:      utm,
          sub_ids:          utm ? [utm] : [],
          gmv:              Number(g('gmv')) || 0,
          total_commission: Number(g('total_commission')) || 0,
          net_commission:   g('net_commission') === '' ? null : Number(g('net_commission')),
          item_count:       Number(g('item_count')) || 0,
          source:           'manual',
        }]);
        m.close();
        toastOk('Đã lưu đơn.');
        load();
      } catch (err) {
        toastErr(err.message);
        btn.disabled = false; btn.textContent = 'Lưu đơn';
      }
    });
  }

  /* ------------------------------ Import CSV ------------------------------- */

  function openImport() {
    const m = openModal({
      title: 'Import báo cáo CSV từ Shopee',
      size: 'lg',
      body: `
        <div id="imp-step1">
          <div class="notice info" style="margin-bottom:16px">
            Vào <strong>Shopee Affiliate Center → Báo cáo</strong>, xuất file đơn hàng
            (CSV hoặc Excel lưu lại thành CSV), rồi chọn file ở đây.
            Bước sau bạn sẽ được chọn cột nào ứng với dữ liệu nào — nên định dạng file
            thế nào cũng import được.
          </div>
          <label class="field">
            <span>Chọn file CSV</span>
            <input type="file" id="imp-file" accept=".csv,text/csv,text/plain">
          </label>
        </div>
        <div id="imp-step2" hidden></div>`,
      footer: `
        <button class="btn-ghost" data-modal-close>Huỷ</button>
        <div class="spacer"></div>
        <button class="btn" id="imp-run" disabled>Import</button>`,
    });

    let parsed = null;
    let mapping = null;
    const runBtn = qs('#imp-run', m.root);

    qs('#imp-file', m.root).addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      parsed = parseCSV(text);

      if (!parsed.headers.length || !parsed.rows.length) {
        toastErr('File rỗng hoặc không đọc được.');
        return;
      }

      const saved = await db.getSetting(MAPPING_KEY, null);
      const savedFits = saved?.headers
        && JSON.stringify(saved.headers) === JSON.stringify(parsed.headers);
      mapping = savedFits ? saved.mapping : guessMapping(parsed.headers);

      drawMapping(savedFits);
      runBtn.disabled = false;
    });

    function drawMapping(usedSaved) {
      const step2 = qs('#imp-step2', m.root);
      const opts = (sel) => '<option value="-1">— không dùng —</option>'
        + parsed.headers.map((h, i) =>
            `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || `Cột ${i + 1}`)}</option>`).join('');

      step2.hidden = false;
      step2.innerHTML = `
        <div class="notice ${usedSaved ? 'info' : ''}" style="margin:18px 0">
          Đọc được <strong>${fmtNum(parsed.rows.length)}</strong> dòng,
          <strong>${parsed.headers.length}</strong> cột.
          ${usedSaved
            ? 'Đã áp dụng lại cách map cột bạn lưu lần trước.'
            : 'Bên dưới là phỏng đoán tự động — kiểm tra lại rồi chỉnh nếu sai.'}
        </div>

        <fieldset>
          <legend>Map cột</legend>
          <div class="form-grid">
            ${TARGET_FIELDS.map((f) => `
              <label class="field">
                <span>${esc(f.label)}${f.required ? ' *' : ''}</span>
                <select data-field="${esc(f.key)}">${opts(mapping[f.key])}</select>
              </label>`).join('')}
          </div>
        </fieldset>

        <fieldset>
          <legend>Xem trước 3 dòng đầu</legend>
          <div id="imp-preview"></div>
        </fieldset>

        <label class="check">
          <input type="checkbox" id="imp-remember" checked>
          <span>Nhớ cách map này cho lần import sau</span>
        </label>`;

      qsa('[data-field]', step2).forEach((sel) => sel.addEventListener('change', () => {
        mapping[sel.dataset.field] = Number(sel.value);
        drawPreview();
      }));
      drawPreview();
    }

    function drawPreview() {
      const { records, errors } = buildRecords(parsed.rows.slice(0, 3), mapping);
      const box = qs('#imp-preview', m.root);

      if (!records.length) {
        box.innerHTML = `<div class="notice">Chưa map đủ cột bắt buộc
          (mã đơn, thời gian đặt, tổng hoa hồng).
          ${errors.length ? esc(errors[0].reason) : ''}</div>`;
        runBtn.disabled = true;
        return;
      }
      runBtn.disabled = false;
      box.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Mã đơn</th><th>Thời gian</th><th>Trạng thái</th>
              <th>subId</th><th class="num">Giá trị</th><th class="num">Hoa hồng</th></tr></thead>
            <tbody>
              ${records.map((r) => `
                <tr>
                  <td class="mono">${esc(r.conversion_id)}</td>
                  <td>${esc(fmtDateTime(r.purchase_time))}</td>
                  <td>${esc(orderStatusMeta(r.order_status).label)}</td>
                  <td class="cell-sub">${esc(r.utm_content || '—')}</td>
                  <td class="num">${esc(fmtVND(r.gmv))}</td>
                  <td class="num">${esc(fmtVND(r.total_commission))}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    runBtn.addEventListener('click', async () => {
      if (!parsed || !mapping) return;
      runBtn.disabled = true;
      runBtn.textContent = 'Đang import…';

      const { records, errors, skipped } = buildRecords(parsed.rows, mapping);
      if (!records.length) {
        toastErr('Không có dòng nào hợp lệ để import.');
        runBtn.disabled = false; runBtn.textContent = 'Import';
        return;
      }

      try {
        // Chia lô để không vượt giới hạn kích thước request
        let done = 0;
        for (let i = 0; i < records.length; i += 500) {
          done += await db.upsertConversions(records.slice(i, i + 500));
        }

        if (qs('#imp-remember', m.root)?.checked) {
          await db.setSetting(MAPPING_KEY, { headers: parsed.headers, mapping })
            .catch(() => {});
        }
        await db.addSyncLog({
          kind: 'csv', ok: true, fetched: parsed.rows.length, upserted: done,
          message: `Import CSV: ${done} đơn, bỏ qua ${skipped} trùng, ${errors.length} lỗi.`,
        });

        m.close();
        toastOk(`Đã import ${done} đơn.` +
          (errors.length ? ` ${errors.length} dòng lỗi bị bỏ qua.` : ''));
        if (errors.length) showErrors(errors);
        load();
      } catch (err) {
        toastErr(err.message);
        runBtn.disabled = false; runBtn.textContent = 'Import';
      }
    });
  }

  function showErrors(errors) {
    openModal({
      title: `${errors.length} dòng không import được`,
      size: 'md',
      body: `<div class="pre">${errors.slice(0, 100)
        .map((e) => `Dòng ${e.line}: ${esc(e.reason)}`).join('\n')}${
        errors.length > 100 ? `\n… và ${errors.length - 100} dòng nữa` : ''}</div>`,
      footer: `<button class="btn" data-modal-close>Đã hiểu</button>`,
    });
  }

  await load();
}
