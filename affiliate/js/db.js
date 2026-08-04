// =============================================================================
// db.js — Supabase client + toàn bộ truy vấn dữ liệu
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG, isConfigured } from '../config.js';

export { CONFIG, isConfigured };

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'shopee-affiliate-admin',
  },
});

/** Người dùng đang đăng nhập (được app.js gán sau khi xác thực). */
export const session = { user: null };

export const uid = () => session.user?.id ?? null;

/** Ném lỗi kèm thông báo tiếng Việt dễ hiểu. */
function check({ data, error, count }) {
  if (error) {
    console.error('[supabase]', error);
    throw new Error(translateError(error));
  }
  return count === undefined || count === null ? data : { data, count };
}

function translateError(error) {
  const msg = String(error?.message || '');
  if (/Invalid login credentials/i.test(msg)) return 'Sai email hoặc mật khẩu.';
  if (/Email not confirmed/i.test(msg))       return 'Email chưa được xác nhận.';
  if (/duplicate key/i.test(msg) && /item/i.test(msg))
    return 'Sản phẩm này (item_id) đã có trong danh sách rồi.';
  if (/duplicate key/i.test(msg) && /subid/i.test(msg))
    return 'subId này đã được dùng cho sản phẩm khác.';
  if (/duplicate key/i.test(msg))             return 'Bản ghi đã tồn tại.';
  if (/JWT|not authenticated|permission denied|row-level security/i.test(msg))
    return 'Phiên đăng nhập đã hết hạn hoặc không có quyền. Hãy đăng nhập lại.';
  if (/Failed to fetch|NetworkError/i.test(msg))
    return 'Không kết nối được Supabase. Kiểm tra mạng, hoặc project có đang bị pause không.';
  if (/relation .* does not exist/i.test(msg))
    return 'Chưa tạo bảng trong database. Hãy chạy file supabase/schema.sql trước.';
  return msg || 'Đã có lỗi xảy ra.';
}

/* =============================== Xác thực ================================= */

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateError(error));
  session.user = data.user;
  return data.user;
}

export async function signOut() {
  await sb.auth.signOut();
  session.user = null;
}

export async function currentUser() {
  const { data } = await sb.auth.getSession();
  session.user = data?.session?.user ?? null;
  return session.user;
}

export async function sendPasswordReset(email) {
  const redirectTo = location.origin + location.pathname;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(translateError(error));
}

export async function updatePassword(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw new Error(translateError(error));
}

/* =============================== Sản phẩm ================================= */

export const PRODUCT_FIELDS = `
  id, item_id, shop_id, shop_name, name, product_link, offer_link, short_link,
  sub_id, image_url, images, price_min, price_max, commission_rate, est_commission,
  rating, sales, category, tags, description, highlights, target_audience,
  hook_ideas, notes, content_status, platforms, is_public, is_active,
  created_at, updated_at
`;

/**
 * @param {{search?:string, status?:string, category?:string, tag?:string,
 *          includeInactive?:boolean, sort?:string, limit?:number, offset?:number}} opts
 */
export async function listProducts(opts = {}) {
  const {
    search, status, category, tag,
    includeInactive = false,
    sort = 'created_at.desc',
    limit = 200, offset = 0,
  } = opts;

  let q = sb.from('products').select(PRODUCT_FIELDS, { count: 'exact' });

  if (!includeInactive) q = q.eq('is_active', true);
  if (status)   q = q.eq('content_status', status);
  if (category) q = q.eq('category', category);
  if (tag)      q = q.contains('tags', [tag]);
  if (search) {
    const s = search.replace(/[%,()]/g, ' ').trim();
    if (s) q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%,category.ilike.%${s}%`);
  }

  const [col, dir] = sort.split('.');
  q = q.order(col, { ascending: dir !== 'desc', nullsFirst: false })
       .range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(translateError(error));
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getProduct(id) {
  return check(await sb.from('products').select(PRODUCT_FIELDS).eq('id', id).single());
}

/** Thêm mới nếu không có id, ngược lại cập nhật. */
export async function saveProduct(product) {
  const row = { ...product, owner: uid() };
  delete row.created_at;
  delete row.updated_at;

  if (row.id) {
    const id = row.id;
    delete row.id;
    return check(await sb.from('products').update(row).eq('id', id)
      .select(PRODUCT_FIELDS).single());
  }
  delete row.id;
  return check(await sb.from('products').insert(row).select(PRODUCT_FIELDS).single());
}

export async function deleteProduct(id) {
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) throw new Error(translateError(error));
}

export async function updateProductFields(id, fields) {
  return check(await sb.from('products').update(fields).eq('id', id)
    .select(PRODUCT_FIELDS).single());
}

/** Danh sách category đã dùng — để đổ vào bộ lọc. */
export async function listCategories() {
  const { data, error } = await sb.from('products')
    .select('category').not('category', 'is', null).eq('is_active', true);
  if (error) return [];
  return [...new Set((data ?? []).map((r) => r.category).filter(Boolean))].sort();
}

/* =============================== Đơn hàng ================================= */

export const CONVERSION_FIELDS = `
  conversion_id, purchase_time, click_time, order_status, total_commission,
  seller_commission, shopee_commission, net_commission, validation_id,
  buyer_type, device, utm_content, sub_ids, item_count, gmv, currency,
  source, created_at
`;

export async function listConversions(opts = {}) {
  const {
    from, to, status, subId, search,
    sort = 'purchase_time.desc',
    limit = 50, offset = 0,
  } = opts;

  let q = sb.from('conversions').select(CONVERSION_FIELDS, { count: 'exact' });

  if (from)   q = q.gte('purchase_time', new Date(from + 'T00:00:00').toISOString());
  if (to)     q = q.lte('purchase_time', new Date(to   + 'T23:59:59').toISOString());
  if (status) q = q.eq('order_status', status);
  if (subId)  q = q.eq('utm_content', subId);
  if (search) {
    const s = search.replace(/[%,()]/g, ' ').trim();
    if (s) q = q.or(`conversion_id.ilike.%${s}%,utm_content.ilike.%${s}%`);
  }

  const [col, dir] = sort.split('.');
  q = q.order(col, { ascending: dir !== 'desc', nullsFirst: false })
       .range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(translateError(error));
  return { rows: data ?? [], total: count ?? 0 };
}

/** Ghi đè theo conversion_id — chạy lại cùng dữ liệu không tạo bản ghi trùng. */
export async function upsertConversions(rows) {
  if (!rows.length) return 0;
  const owner = uid();
  const payload = rows.map((r) => ({ ...r, owner }));
  const { error } = await sb.from('conversions')
    .upsert(payload, { onConflict: 'owner,conversion_id' });
  if (error) throw new Error(translateError(error));
  return payload.length;
}

export async function deleteConversion(conversionId) {
  const { error } = await sb.from('conversions')
    .delete().eq('conversion_id', conversionId);
  if (error) throw new Error(translateError(error));
}

export async function listConversionItems(conversionId) {
  return check(await sb.from('conversion_items').select('*')
    .eq('conversion_id', conversionId).order('id'));
}

/* ============================== Thống kê ================================== */

/** Số liệu theo ngày trong khoảng [fromDay, toDay] (dạng 'YYYY-MM-DD'). */
export async function dailyStats(fromDay, toDay) {
  return check(await sb.from('v_daily_stats').select('*')
    .gte('day', fromDay).lte('day', toDay).order('day'));
}

export async function productPerformance({ limit = 100, sort = 'commission' } = {}) {
  return check(await sb.from('v_product_performance').select('*')
    .order(sort, { ascending: false, nullsFirst: false }).limit(limit));
}

/** Tổng hợp nhanh cho một khoảng ngày. */
export async function summarize(fromDay, toDay) {
  const rows = await dailyStats(fromDay, toDay);
  return rows.reduce((acc, r) => ({
    orders:           acc.orders           + (r.orders           || 0),
    completed_orders: acc.completed_orders + (r.completed_orders || 0),
    pending_orders:   acc.pending_orders   + (r.pending_orders   || 0),
    cancelled_orders: acc.cancelled_orders + (r.cancelled_orders || 0),
    commission:       acc.commission       + Number(r.commission     || 0),
    net_commission:   acc.net_commission   + Number(r.net_commission || 0),
    gmv:              acc.gmv              + Number(r.gmv            || 0),
    items:            acc.items            + (r.items || 0),
  }), {
    orders: 0, completed_orders: 0, pending_orders: 0, cancelled_orders: 0,
    commission: 0, net_commission: 0, gmv: 0, items: 0,
  });
}

export async function countProducts() {
  const { count, error } = await sb.from('products')
    .select('id', { count: 'exact', head: true }).eq('is_active', true);
  if (error) return 0;
  return count ?? 0;
}

/* ============================== Nhật ký sync ============================== */

export async function listSyncLog(limit = 20) {
  return check(await sb.from('sync_log').select('*')
    .order('ran_at', { ascending: false }).limit(limit));
}

export async function addSyncLog(entry) {
  const { error } = await sb.from('sync_log').insert({ ...entry, owner: uid() });
  if (error) console.warn('[sync_log]', error);
}

/* =============================== Cài đặt ================================== */

export async function getSetting(key, fallback = null) {
  const { data, error } = await sb.from('app_settings')
    .select('value').eq('key', key).maybeSingle();
  if (error) { console.warn('[settings]', error); return fallback; }
  return data?.value ?? fallback;
}

export async function setSetting(key, value) {
  const { error } = await sb.from('app_settings')
    .upsert({ owner: uid(), key, value }, { onConflict: 'owner,key' });
  if (error) throw new Error(translateError(error));
}

/* ============================= Edge Functions ============================= */

/**
 * Gọi Edge Function. Trả về { ok, data, error }.
 * Không ném lỗi — vì các function Shopee có thể chưa được deploy / chưa có
 * credentials, và giao diện cần xử lý êm chứ không được vỡ.
 */
export async function callFunction(name, body = {}) {
  try {
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) {
      // Đọc thêm nội dung lỗi do function trả về, nếu có
      let detail = error.message;
      try {
        const ctx = await error.context?.json?.();
        if (ctx?.error) detail = ctx.error;
      } catch { /* bỏ qua */ }
      return { ok: false, error: detail };
    }
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || 'Không gọi được Edge Function.' };
  }
}

/** URL feed công khai cho các agent khác fetch. */
export function feedUrl(params = {}) {
  const u = new URL(`${CONFIG.SUPABASE_URL}/functions/v1/feed`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') u.searchParams.set(k, v);
  });
  return u.toString();
}
