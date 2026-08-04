// =============================================================================
// views/settings.js — đồng bộ Shopee, feed công khai, tài khoản
// =============================================================================

import {
  qs, qsa, esc, fmtNum, fmtDateTime, relTime, copyText,
  toastOk, toastErr, confirmDialog, skeletonRows, isoDay,
} from '../ui.js';
import * as db from '../db.js';

export async function render(ctx) {
  ctx.view.innerHTML = `
    <div class="grid grid-2" style="align-items:start">
      <div class="stack">

        <div class="card">
          <div class="card-head">
            <h2>Đồng bộ Shopee</h2>
            <span class="sub" id="s-last">—</span>
          </div>

          <div id="s-status" class="notice info" style="margin-bottom:16px">
            Đang kiểm tra…
          </div>

          <div class="form-grid">
            <label class="field">
              <span>Lấy đơn từ ngày</span>
              <input type="date" id="s-from" value="${esc(isoDay(new Date(Date.now() - 6 * 86400000)))}">
            </label>
            <label class="field">
              <span>Đến ngày</span>
              <input type="date" id="s-to" value="${esc(isoDay())}">
            </label>
          </div>

          <div class="btn-row">
            <button class="btn" id="s-sync">Đồng bộ ngay</button>
            <button class="btn-ghost" id="s-check">Kiểm tra kết nối</button>
          </div>

          <p class="cell-sub" style="margin-top:14px;line-height:1.65">
            Đồng bộ tự động chạy theo lịch Cron đặt trong Supabase (khuyến nghị 6 giờ/lần).
            Việc này cũng giữ cho project Supabase gói free không bị tạm dừng do
            7 ngày không hoạt động.
          </p>
        </div>

        <div class="card">
          <div class="card-head"><h2>Feed công khai</h2></div>
          <p style="color:var(--muted);line-height:1.65;margin-bottom:14px">
            Đưa địa chỉ này cho các agent làm content. Không cần đăng nhập,
            chỉ trả về sản phẩm được bật “xuất ra feed công khai”, và
            <strong>không chứa số liệu hoa hồng</strong>.
          </p>
          ${[
            ['Markdown — tất cả',        { format: 'md' }],
            ['Markdown — chưa làm content', { format: 'md', status: 'todo' }],
            ['JSON — tất cả',            { format: 'json' }],
          ].map(([label, params], i) => `
            <div class="field">
              <span>${esc(label)}</span>
              <div class="copy-row">
                <code id="fu-${i}">${esc(db.feedUrl(params))}</code>
                <button class="btn-ghost btn-sm" data-copy="fu-${i}">Copy</button>
              </div>
            </div>`).join('')}
        </div>

        <div class="card">
          <div class="card-head"><h2>Tài khoản</h2></div>
          <div class="field">
            <span>Email đăng nhập</span>
            <div class="copy-row"><code id="s-email">—</code></div>
          </div>
          <div class="form-grid">
            <label class="field span-2">
              <span>Đổi mật khẩu</span>
              <input type="password" id="s-pw" minlength="8" placeholder="Mật khẩu mới, ít nhất 8 ký tự">
            </label>
          </div>
          <button class="btn-ghost" id="s-pw-save">Cập nhật mật khẩu</button>
        </div>

        <div class="card">
          <div class="card-head"><h2>Import CSV</h2></div>
          <p style="color:var(--muted);line-height:1.65;margin-bottom:14px">
            Cách map cột của lần import gần nhất được lưu lại để dùng cho lần sau.
            Xoá đi nếu Shopee đổi định dạng file báo cáo.
          </p>
          <div id="s-mapping" class="cell-sub" style="margin-bottom:14px">—</div>
          <button class="btn-ghost btn-danger" id="s-map-clear">Xoá mapping đã lưu</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Nhật ký đồng bộ</h2>
          <button class="btn-ghost btn-sm" id="s-log-refresh">Làm mới</button>
        </div>
        <div id="s-log">${skeletonRows(5, 52)}</div>
      </div>
    </div>
  `;

  /* ------------------------------ Tài khoản ------------------------------- */

  qs('#s-email').textContent = db.session.user?.email || '—';

  qs('#s-pw-save').addEventListener('click', async () => {
    const val = qs('#s-pw').value;
    if (val.length < 8) return toastErr('Mật khẩu phải từ 8 ký tự trở lên.');
    try {
      await db.updatePassword(val);
      qs('#s-pw').value = '';
      toastOk('Đã đổi mật khẩu.');
    } catch (err) { toastErr(err.message); }
  });

  /* -------------------------------- Feed ---------------------------------- */

  qsa('[data-copy]', ctx.view).forEach((b) => b.addEventListener('click', () =>
    copyText(qs('#' + b.dataset.copy).textContent, 'Đã copy địa chỉ feed')));

  /* ------------------------------ CSV mapping ----------------------------- */

  async function drawMapping() {
    const saved = await db.getSetting('csv_mapping', null);
    qs('#s-mapping').textContent = saved?.headers
      ? `Đã lưu cho file có ${saved.headers.length} cột: ${saved.headers.slice(0, 4).join(', ')}…`
      : 'Chưa lưu mapping nào.';
  }

  qs('#s-map-clear').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Xoá mapping?',
      message: 'Lần import sau sẽ tự đoán lại cột từ đầu.',
      confirmText: 'Xoá', danger: true,
    });
    if (!ok) return;
    try {
      await db.setSetting('csv_mapping', {});
      toastOk('Đã xoá.');
      drawMapping();
    } catch (err) { toastErr(err.message); }
  });

  /* ------------------------------ Nhật ký --------------------------------- */

  async function drawLog() {
    const box = qs('#s-log');
    try {
      const rows = await db.listSyncLog(25);
      if (!rows.length) {
        box.innerHTML = `<div class="empty" style="padding:36px">
          <p>Chưa có lần đồng bộ nào.</p></div>`;
        qs('#s-last').textContent = 'chưa chạy lần nào';
        return;
      }
      qs('#s-last').textContent = `gần nhất ${relTime(rows[0].ran_at)}`;
      box.innerHTML = rows.map((r) => `
        <div class="pick-row" style="cursor:default;align-items:flex-start">
          <span class="badge ${r.ok ? 'green' : 'red'}" style="margin-top:2px">
            ${r.ok ? 'OK' : 'Lỗi'}
          </span>
          <div class="txt">
            <div class="cell-main" style="font-size:12.5px">
              ${esc(r.kind)} · ${fmtNum(r.upserted)} bản ghi
              ${r.fetched ? ` / ${fmtNum(r.fetched)} lấy về` : ''}
            </div>
            <div class="cell-sub">${esc(fmtDateTime(r.ran_at))}${
              r.message ? ' — ' + esc(r.message) : ''}</div>
          </div>
        </div>`).join('');
    } catch (err) {
      box.innerHTML = `<div class="empty" style="padding:32px"><p>${esc(err.message)}</p></div>`;
    }
  }

  qs('#s-log-refresh').addEventListener('click', drawLog);

  /* --------------------------- Kết nối Shopee ------------------------------ */

  function setStatus(kind, html) {
    const box = qs('#s-status');
    box.className = 'notice' + (kind === 'info' ? ' info' : '');
    box.innerHTML = html;
  }

  async function checkConnection() {
    setStatus('info', 'Đang kiểm tra…');
    const res = await db.callFunction('shopee-sync', { probe: true });
    if (res.ok) {
      setStatus('info', `✅ Kết nối Shopee API bình thường.${
        res.data?.appId ? ` App ID <code class="mono">${esc(res.data.appId)}</code>.` : ''}`);
    } else {
      setStatus('', `
        ⚠️ Chưa dùng được Shopee API: <strong>${esc(res.error)}</strong><br><br>
        Trong lúc chờ, bạn vẫn nhập tay và import CSV bình thường ở màn
        <a href="#/orders">Đơn hàng</a>. Để bật đồng bộ tự động cần:
        <br>1. Xin <code class="mono">appId</code>/<code class="mono">secret</code> tại
        <a href="https://affiliate.shopee.vn/open_api" target="_blank"
           rel="noopener noreferrer">affiliate.shopee.vn/open_api</a>
        <br>2. Deploy Edge Function <code class="mono">shopee-sync</code>
        <br>3. Chạy <code class="mono">supabase secrets set SHOPEE_APP_ID=… SHOPEE_SECRET=…</code>`);
    }
  }

  qs('#s-check').addEventListener('click', checkConnection);

  qs('#s-sync').addEventListener('click', async () => {
    const btn = qs('#s-sync');
    const from = qs('#s-from').value;
    const to   = qs('#s-to').value;
    if (!from || !to) return toastErr('Chọn khoảng ngày trước.');

    btn.disabled = true;
    btn.textContent = 'Đang đồng bộ…';
    const res = await db.callFunction('shopee-sync', { from, to });
    btn.disabled = false;
    btn.textContent = 'Đồng bộ ngay';

    if (res.ok) {
      toastOk(`Đã đồng bộ ${res.data?.upserted ?? 0} đơn.`);
      drawLog();
    } else {
      toastErr(res.error);
      setStatus('', `⚠️ Đồng bộ thất bại: <strong>${esc(res.error)}</strong>`);
    }
  });

  await Promise.all([drawLog(), drawMapping(), checkConnection()]);
}
