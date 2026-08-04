// =============================================================================
// product-form.js — modal thêm / sửa sản phẩm, và nhập nhanh từ link Shopee
// =============================================================================

import {
  qs, qsa, esc, safeUrl, openModal, toastOk, toastErr,
  slugify, randomId, parseShopeeUrl, CONTENT_STATUS,
} from './ui.js';
import * as db from './db.js';
import { CONFIG } from '../config.js';

/* ------------------------------- Tiện ích --------------------------------- */

const toLines  = (arr) => (arr || []).join('\n');
const fromLines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const fromCsv   = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** Sinh subId gợi ý từ tên sản phẩm: dq-tai-nghe-x7-a3f2 */
export function suggestSubId(name) {
  const base = slugify(name).split('-').slice(0, 3).join('-');
  return [CONFIG.SUB_ID_PREFIX, base, randomId(4)].filter(Boolean).join('-').slice(0, 50);
}

/* -------------------------------- Form ------------------------------------ */

function formHtml(p) {
  const platformRows = CONFIG.PLATFORMS.map(({ key, label }) => {
    const cur = p.platforms?.[key] || {};
    const on = !!(cur.posted || cur.url);
    return `
      <div class="plat-row" data-plat="${esc(key)}">
        <label class="check" style="margin:0;min-width:112px">
          <input type="checkbox" data-plat-on ${on ? 'checked' : ''}>
          <span>${esc(label)}</span>
        </label>
        <input type="url" data-plat-url placeholder="Link bài đăng (tuỳ chọn)"
               value="${esc(cur.url || '')}">
      </div>`;
  }).join('');

  const statusOptions = Object.entries(CONTENT_STATUS).map(([k, v]) =>
    `<option value="${k}" ${p.content_status === k ? 'selected' : ''}>${esc(v.label)}</option>`,
  ).join('');

  return `
  <form id="pform">
    <fieldset>
      <legend>Thông tin sản phẩm</legend>
      <label class="field">
        <span>Tên sản phẩm *</span>
        <input name="name" required value="${esc(p.name || '')}"
               placeholder="Tai nghe Bluetooth XYZ chống ồn">
      </label>

      <div class="form-grid">
        <label class="field">
          <span>Danh mục</span>
          <input name="category" value="${esc(p.category || '')}"
                 placeholder="Phụ kiện công nghệ" list="cat-list">
        </label>
        <label class="field">
          <span>Tên shop</span>
          <input name="shop_name" value="${esc(p.shop_name || '')}">
        </label>
      </div>

      <label class="field">
        <span>Tags <small class="hint" style="display:inline">(cách nhau bằng dấu phẩy)</small></span>
        <input name="tags" value="${esc((p.tags || []).join(', '))}"
               placeholder="gaming, quà tặng, dưới 500k">
      </label>
    </fieldset>

    <fieldset>
      <legend>Link &amp; định danh</legend>
      <label class="field">
        <span>Link sản phẩm gốc trên Shopee</span>
        <input name="product_link" type="url" value="${esc(p.product_link || '')}"
               placeholder="https://shopee.vn/...-i.123456.7890123">
        <small class="hint">Dán link vào đây rồi bấm “Tách ID” để tự điền item ID / shop ID.</small>
      </label>

      <div class="form-grid">
        <label class="field">
          <span>Item ID</span>
          <input name="item_id" type="number" value="${esc(p.item_id ?? '')}">
        </label>
        <label class="field">
          <span>Shop ID</span>
          <input name="shop_id" type="number" value="${esc(p.shop_id ?? '')}">
        </label>
      </div>

      <label class="field">
        <span>Link tiếp thị đầy đủ</span>
        <input name="offer_link" type="url" value="${esc(p.offer_link || '')}">
      </label>

      <label class="field">
        <span>Link rút gọn</span>
        <input name="short_link" type="url" value="${esc(p.short_link || '')}"
               placeholder="https://s.shopee.vn/xxxxx">
        <small class="hint">Đây là link sẽ được dùng trong brief gửi cho agent.</small>
      </label>

      <label class="field">
        <span>subId</span>
        <div style="display:flex;gap:8px">
          <input name="sub_id" value="${esc(p.sub_id || '')}" placeholder="dq-tai-nghe-a3f2">
          <button type="button" class="btn-ghost" id="gen-subid">Tạo</button>
        </div>
        <small class="hint">
          Gắn subId này vào link tiếp thị để đơn hàng được quy về đúng sản phẩm.
        </small>
      </label>
    </fieldset>

    <fieldset>
      <legend>Giá &amp; hoa hồng</legend>
      <div class="form-grid">
        <label class="field">
          <span>Giá thấp nhất (₫)</span>
          <input name="price_min" type="number" min="0" step="1000" value="${esc(p.price_min ?? '')}">
        </label>
        <label class="field">
          <span>Giá cao nhất (₫)</span>
          <input name="price_max" type="number" min="0" step="1000" value="${esc(p.price_max ?? '')}">
        </label>
        <label class="field">
          <span>Tỉ lệ hoa hồng (%)</span>
          <input name="commission_pct" type="number" min="0" max="100" step="0.1"
                 value="${p.commission_rate != null ? esc((Number(p.commission_rate) * 100).toFixed(2).replace(/\.?0+$/, '')) : ''}"
                 placeholder="10.5">
        </label>
        <label class="field">
          <span>Hoa hồng ước tính (₫)</span>
          <input name="est_commission" type="number" min="0" step="1000" value="${esc(p.est_commission ?? '')}">
        </label>
        <label class="field">
          <span>Đánh giá (0–5)</span>
          <input name="rating" type="number" min="0" max="5" step="0.1" value="${esc(p.rating ?? '')}">
        </label>
        <label class="field">
          <span>Đã bán</span>
          <input name="sales" type="number" min="0" value="${esc(p.sales ?? '')}">
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend>Ảnh</legend>
      <label class="field">
        <span>Ảnh chính (URL)</span>
        <input name="image_url" type="url" value="${esc(p.image_url || '')}"
               placeholder="https://down-vn.img.susercontent.com/file/...">
      </label>
      <label class="field">
        <span>Ảnh phụ <small class="hint" style="display:inline">(mỗi dòng 1 URL)</small></span>
        <textarea name="images" rows="3" placeholder="https://...&#10;https://...">${esc(toLines(p.images))}</textarea>
      </label>
      <div id="img-preview" class="chips" style="gap:8px"></div>
    </fieldset>

    <fieldset>
      <legend>Nội dung cho agent</legend>
      <label class="field">
        <span>Mô tả chi tiết</span>
        <textarea name="description" rows="6"
          placeholder="Mô tả càng kỹ, agent viết bài càng đúng: công dụng, thông số, chất liệu, ưu điểm so với sản phẩm cùng loại…">${esc(p.description || '')}</textarea>
      </label>

      <label class="field">
        <span>Điểm bán hàng chính <small class="hint" style="display:inline">(mỗi dòng 1 ý)</small></span>
        <textarea name="highlights" rows="4"
          placeholder="Chống ồn chủ động 40dB&#10;Pin 30 giờ, sạc nhanh 10 phút dùng 3 giờ&#10;Giá rẻ hơn hàng hãng 60%">${esc(toLines(p.highlights))}</textarea>
      </label>

      <label class="field">
        <span>Đối tượng khách hàng</span>
        <textarea name="target_audience" rows="2"
          placeholder="Sinh viên, nhân viên văn phòng 18–30 tuổi, hay đi xe buýt, ngân sách dưới 500k">${esc(p.target_audience || '')}</textarea>
      </label>

      <label class="field">
        <span>Ý tưởng hook mở đầu clip <small class="hint" style="display:inline">(mỗi dòng 1 ý)</small></span>
        <textarea name="hook_ideas" rows="3"
          placeholder="Tai nghe 300k mà chống ồn ngang hàng 3 triệu?&#10;Mình đã dùng cái này 2 tháng và đây là sự thật">${esc(toLines(p.hook_ideas))}</textarea>
      </label>

      <label class="field">
        <span>Ghi chú riêng</span>
        <textarea name="notes" rows="2"
          placeholder="Ghi chú nội bộ — cũng được đưa vào brief">${esc(p.notes || '')}</textarea>
      </label>
    </fieldset>

    <fieldset>
      <legend>Trạng thái</legend>
      <div class="form-grid">
        <label class="field">
          <span>Trạng thái content</span>
          <select name="content_status">${statusOptions}</select>
        </label>
      </div>

      <div class="plat-list">${platformRows}</div>

      <label class="check" style="margin-top:14px">
        <input type="checkbox" name="is_public" ${p.is_public !== false ? 'checked' : ''}>
        <span>Cho phép xuất ra feed công khai (để agent tự fetch)</span>
      </label>
      <label class="check">
        <input type="checkbox" name="is_active" ${p.is_active !== false ? 'checked' : ''}>
        <span>Đang hoạt động (bỏ chọn để ẩn khỏi danh sách)</span>
      </label>
    </fieldset>

    <datalist id="cat-list"></datalist>
  </form>`;
}

/** Đọc form ra object khớp với bảng products. */
function readForm(root, existing) {
  const f = qs('#pform', root);
  const g = (n) => f.elements[n]?.value?.trim() ?? '';

  const pct = g('commission_pct');
  const platforms = {};
  qsa('.plat-row', root).forEach((row) => {
    const key = row.dataset.plat;
    const on  = qs('[data-plat-on]', row).checked;
    const url = qs('[data-plat-url]', row).value.trim();
    if (on || url) {
      platforms[key] = {
        posted: on,
        url: url || null,
        posted_at: existing?.platforms?.[key]?.posted_at || (on ? new Date().toISOString() : null),
      };
    }
  });

  return {
    ...(existing?.id ? { id: existing.id } : {}),
    name:            g('name'),
    category:        g('category') || null,
    shop_name:       g('shop_name') || null,
    tags:            fromCsv(g('tags')),
    product_link:    g('product_link') || null,
    offer_link:      g('offer_link') || null,
    short_link:      g('short_link') || null,
    sub_id:          g('sub_id') || null,
    item_id:         numOrNull(g('item_id')),
    shop_id:         numOrNull(g('shop_id')),
    price_min:       numOrNull(g('price_min')),
    price_max:       numOrNull(g('price_max')),
    commission_rate: pct === '' ? null : Number(pct) / 100,
    est_commission:  numOrNull(g('est_commission')),
    rating:          numOrNull(g('rating')),
    sales:           numOrNull(g('sales')),
    image_url:       g('image_url') || null,
    images:          fromLines(g('images')),
    description:     g('description') || null,
    highlights:      fromLines(g('highlights')),
    target_audience: g('target_audience') || null,
    hook_ideas:      fromLines(g('hook_ideas')),
    notes:           g('notes') || null,
    content_status:  g('content_status') || 'todo',
    platforms,
    is_public: f.elements.is_public.checked,
    is_active: f.elements.is_active.checked,
  };
}

/**
 * Mở modal thêm/sửa sản phẩm.
 * @param {object|null} product  null = thêm mới
 * @param {(saved:object)=>void} onSaved
 */
export function openProductForm(product, onSaved) {
  const p = product || { content_status: 'todo', is_public: true, is_active: true };
  const editing = !!p.id;

  const m = openModal({
    title: editing ? 'Sửa sản phẩm' : 'Thêm sản phẩm',
    size: 'lg',
    body: formHtml(p),
    footer: `
      <button class="btn-ghost" data-modal-close>Huỷ</button>
      <button class="btn" id="pform-save">${editing ? 'Lưu thay đổi' : 'Thêm sản phẩm'}</button>`,
  });

  const form = qs('#pform', m.root);

  // Gợi ý danh mục đã dùng
  db.listCategories().then((cats) => {
    const dl = qs('#cat-list', m.root);
    if (dl) dl.innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  }).catch(() => {});

  // Tách item_id / shop_id từ link Shopee
  form.elements.product_link.addEventListener('change', () => {
    const { itemId, shopId } = parseShopeeUrl(form.elements.product_link.value);
    if (itemId && !form.elements.item_id.value) form.elements.item_id.value = itemId;
    if (shopId && !form.elements.shop_id.value) form.elements.shop_id.value = shopId;
  });

  // Tạo subId
  qs('#gen-subid', m.root).addEventListener('click', () => {
    form.elements.sub_id.value = suggestSubId(form.elements.name.value || 'sp');
  });

  // Xem trước ảnh
  const preview = qs('#img-preview', m.root);
  const renderPreview = () => {
    const urls = [form.elements.image_url.value, ...fromLines(form.elements.images.value)]
      .map((u) => u.trim()).filter(Boolean).slice(0, 8);
    preview.innerHTML = urls.map((u) => {
      const safe = safeUrl(u);
      return safe
        ? `<img src="${safe}" alt="" class="thumb" style="width:56px;height:56px"
                loading="lazy" referrerpolicy="no-referrer"
                onerror="this.style.opacity=.25;this.title='Ảnh không tải được'">`
        : '';
    }).join('');
  };
  form.elements.image_url.addEventListener('input', renderPreview);
  form.elements.images.addEventListener('input', renderPreview);
  renderPreview();

  // Lưu
  const saveBtn = qs('#pform-save', m.root);
  const save = async () => {
    if (!form.reportValidity()) return;
    const payload = readForm(m.root, p);

    if (!payload.sub_id) payload.sub_id = suggestSubId(payload.name);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang lưu…';
    try {
      const saved = await db.saveProduct(payload);
      toastOk(editing ? 'Đã lưu thay đổi.' : 'Đã thêm sản phẩm.');
      m.close();
      onSaved?.(saved);
    } catch (err) {
      toastErr(err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = editing ? 'Lưu thay đổi' : 'Thêm sản phẩm';
    }
  };

  saveBtn.addEventListener('click', save);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  return m;
}

/* --------------------- Nhập nhanh từ link Shopee -------------------------- */

/**
 * Dán link Shopee → gọi Edge Function `shopee-product` để lấy sẵn tên, ảnh,
 * giá, tỉ lệ hoa hồng và link rút gọn → mở form đã điền sẵn.
 * Nếu chưa deploy function hoặc chưa có credentials thì vẫn mở form với
 * item_id/shop_id tách được từ URL.
 */
export function openShopeeImport(onSaved) {
  const m = openModal({
    title: 'Nhập nhanh từ link Shopee',
    size: 'sm',
    body: `
      <label class="field">
        <span>Dán link sản phẩm Shopee</span>
        <input id="si-url" type="url"
               placeholder="https://shopee.vn/...-i.123456.7890123">
      </label>
      <label class="check">
        <input type="checkbox" id="si-short" checked>
        <span>Tạo luôn link rút gọn kèm subId</span>
      </label>
      <div class="auth-error" id="si-err" hidden></div>
      <div class="notice info" style="margin-top:12px">
        Cần đã deploy Edge Function <code class="mono">shopee-product</code> và có
        <code class="mono">SHOPEE_APP_ID</code> / <code class="mono">SHOPEE_SECRET</code>.
        Nếu chưa có, bấm “Nhập tay” để tự điền.
      </div>`,
    footer: `
      <button class="btn-ghost" id="si-manual">Nhập tay</button>
      <div class="spacer"></div>
      <button class="btn-ghost" data-modal-close>Huỷ</button>
      <button class="btn" id="si-go">Lấy thông tin</button>`,
  });

  const err = qs('#si-err', m.root);
  const showErr = (msg) => { err.textContent = msg; err.hidden = false; };

  qs('#si-manual', m.root).addEventListener('click', () => {
    const url = qs('#si-url', m.root).value.trim();
    const { itemId, shopId } = parseShopeeUrl(url);
    m.close();
    openProductForm({
      product_link: url || null, item_id: itemId, shop_id: shopId,
      content_status: 'todo', is_public: true, is_active: true,
    }, onSaved);
  });

  qs('#si-go', m.root).addEventListener('click', async () => {
    const url = qs('#si-url', m.root).value.trim();
    if (!url) return showErr('Dán link sản phẩm vào đã.');

    const { itemId, shopId } = parseShopeeUrl(url);
    if (!itemId) return showErr('Không nhận ra định dạng link Shopee. Dùng “Nhập tay” nhé.');

    const btn = qs('#si-go', m.root);
    btn.disabled = true;
    btn.textContent = 'Đang lấy…';
    err.hidden = true;

    const subId = suggestSubId('sp');
    const res = await db.callFunction('shopee-product', {
      itemId, shopId, url,
      subId: qs('#si-short', m.root).checked ? subId : null,
    });

    btn.disabled = false;
    btn.textContent = 'Lấy thông tin';

    if (!res.ok) {
      showErr(`${res.error} — bạn vẫn có thể bấm “Nhập tay”.`);
      return;
    }

    const d = res.data?.product || {};
    m.close();
    openProductForm({
      name: d.productName || '',
      item_id: d.itemId ?? itemId,
      shop_id: d.shopId ?? shopId,
      shop_name: d.shopName || null,
      product_link: d.productLink || url,
      offer_link: d.offerLink || null,
      short_link: res.data?.shortLink || null,
      sub_id: res.data?.shortLink ? subId : null,
      image_url: d.imageUrl || null,
      images: [],
      price_min: d.priceMin ?? null,
      price_max: d.priceMax ?? null,
      commission_rate: d.commissionRate ?? null,
      est_commission: d.commission ?? null,
      rating: d.ratingStar ?? null,
      sales: d.sales ?? null,
      content_status: 'todo', is_public: true, is_active: true,
    }, onSaved);
  });
}
