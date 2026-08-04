// =============================================================================
// router.js — điều hướng bằng hash (#/products?status=todo)
// =============================================================================

import { qs, toastErr } from './ui.js';

export const ROUTES = {
  dashboard: { title: 'Tổng quan',       load: () => import('./views/dashboard.js') },
  products:  { title: 'Sản phẩm & Link', load: () => import('./views/products.js')  },
  orders:    { title: 'Đơn hàng',        load: () => import('./views/orders.js')    },
  briefs:    { title: 'Brief cho agent', load: () => import('./views/briefs.js')    },
  settings:  { title: 'Cài đặt',         load: () => import('./views/settings.js')  },
};

export const DEFAULT_ROUTE = 'dashboard';

/** '#/products?status=todo' -> { name:'products', params:{status:'todo'} } */
export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const name = path || DEFAULT_ROUTE;
  return {
    name: ROUTES[name] ? name : DEFAULT_ROUTE,
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}

export function navigate(name, params = {}) {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ).toString();
  location.hash = `#/${name}${q ? '?' + q : ''}`;
}

/** Cập nhật query string mà không nạp lại view (dùng cho bộ lọc). */
export function replaceParams(name, params = {}) {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ).toString();
  history.replaceState(null, '', `#/${name}${q ? '?' + q : ''}`);
}

let disposeCurrent = null;
let renderToken = 0;

async function renderRoute() {
  const token = ++renderToken;
  const { name, params } = parseHash();
  const route = ROUTES[name];

  // Dọn view cũ trước khi vẽ view mới
  try { disposeCurrent?.(); } catch (e) { console.warn('[dispose]', e); }
  disposeCurrent = null;

  const view    = qs('#view');
  const actions = qs('#page-actions');
  qs('#page-title').textContent = route.title;
  document.title = `${route.title} — Affiliate Admin`;
  actions.innerHTML = '';
  view.innerHTML = '<div class="skeleton" style="height:120px;margin-bottom:14px"></div>'
                 + '<div class="skeleton" style="height:280px"></div>';

  // Đánh dấu mục đang chọn ở sidebar
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === name);
  });
  qs('#sidebar')?.classList.remove('open');
  const scrim = qs('#scrim');
  if (scrim) scrim.hidden = true;

  try {
    const mod = await route.load();
    if (token !== renderToken) return;      // đã điều hướng sang chỗ khác

    const ctx = {
      view,
      actions,
      params,
      name,
      navigate,
      setParams: (p) => replaceParams(name, p),
      /** Đặt nút hành động trên thanh tiêu đề; trả về phần tử để gắn sự kiện. */
      setActions(html) { actions.innerHTML = html; return actions; },
    };

    disposeCurrent = (await mod.render(ctx)) || null;
  } catch (err) {
    if (token !== renderToken) return;
    console.error('[route]', err);
    view.innerHTML = `
      <div class="empty">
        <div class="ico">⚠️</div>
        <h3>Không mở được trang này</h3>
        <p>${(err?.message || 'Lỗi không xác định')
              .replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>
        <button class="btn" onclick="location.reload()">Tải lại</button>
      </div>`;
    toastErr(err?.message || 'Lỗi khi tải trang');
  }
}

export function startRouter() {
  if (!location.hash) location.hash = `#/${DEFAULT_ROUTE}`;
  window.addEventListener('hashchange', renderRoute);
  return renderRoute();
}

export function refresh() {
  return renderRoute();
}
