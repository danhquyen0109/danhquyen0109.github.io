// =============================================================================
// shopee-sync — kéo đơn hàng + hoa hồng từ Shopee Affiliate API về Supabase
// =============================================================================
// Gọi từ giao diện:  { from: "2026-08-01", to: "2026-08-04" }
// Kiểm tra kết nối:  { probe: true }
// Xem phản hồi thô:  { debug: true, from, to }   ← dùng khi Shopee đổi schema
// Cập nhật hoa hồng chốt: { validationId: 123 }
//
// Chạy tự động bằng Supabase Cron (khuyến nghị 6 giờ/lần) — xem SETUP.md.
// =============================================================================

import { preflight, json, fail, adminClient, resolveOwner } from '../_shared/http.ts';
import {
  shopeeQuery, ShopeeError, PROBE_QUERY, credentials,
  conversionReportQuery, validatedReportQuery,
} from '../_shared/shopee.ts';

const PAGE_LIMIT = 500;
const MAX_PAGES = 40;                 // chặn vòng lặp vô hạn nếu API trả sai

/** Shopee trả thời gian dạng Unix giây. */
const toIso = (sec: unknown) => {
  const n = Number(sec);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
};
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Suy ra trạng thái chung của conversion từ trạng thái các đơn con. */
function rollupStatus(orders: any[]): string | null {
  const statuses = orders.map((o) => String(o?.orderStatus ?? '').toUpperCase()).filter(Boolean);
  if (!statuses.length) return null;
  if (statuses.some((s) => s.includes('COMPLETE'))) return 'COMPLETED';
  if (statuses.every((s) => s.includes('CANCEL') || s.includes('REFUND'))) return 'CANCELLED';
  if (statuses.some((s) => s.includes('PENDING') || s.includes('UNPAID'))) return 'PENDING';
  return statuses[0];
}

/** Chuyển một node conversionReport thành bản ghi bảng `conversions` + items. */
function mapNode(node: any, owner: string) {
  const orders: any[] = Array.isArray(node?.orders) ? node.orders : [];

  const items: any[] = [];
  let itemCount = 0;
  let gmv = 0;

  for (const order of orders) {
    const list: any[] = Array.isArray(order?.items) ? order.items : [];
    for (const it of list) {
      const qty = Math.max(1, Math.round(num(it?.qty)));
      const price = num(it?.itemPrice);
      itemCount += qty;
      gmv += price * qty;
      items.push({
        owner,
        conversion_id: String(node.conversionId),
        order_id: order?.orderId != null ? String(order.orderId) : null,
        item_id: it?.itemId != null ? Number(it.itemId) : null,
        shop_id: order?.shopId != null ? Number(order.shopId) : null,
        item_name: it?.itemName ?? null,
        image_url: it?.imageUrl ?? null,
        item_price: price,
        qty,
        item_total_commission:  num(it?.itemTotalCommission),
        item_seller_commission: num(it?.itemSellerCommission),
        item_shopee_commission: num(it?.itemShopeeCommissionCapped ?? it?.itemShopeeCommission),
        order_status: order?.orderStatus ?? null,
        raw: it,
      });
    }
  }

  const utm = node?.utmContent ? String(node.utmContent) : null;

  return {
    conversion: {
      owner,
      conversion_id:     String(node.conversionId),
      purchase_time:     toIso(node?.purchaseTime),
      click_time:        toIso(node?.clickTime),
      order_status:      rollupStatus(orders),
      total_commission:  num(node?.totalCommission),
      seller_commission: num(node?.sellerCommission),
      shopee_commission: num(node?.shopeeCommissionCapped ?? node?.shopeeCommission),
      buyer_type:        node?.buyerType ?? null,
      device:            node?.device ?? null,
      utm_content:       utm,
      sub_ids:           utm ? [utm] : [],
      item_count:        itemCount,
      gmv,
      currency:          'VND',
      source:            'api',
      raw:               node,
    },
    items,
  };
}

/**
 * Lấy hết các trang của conversionReport.
 * scrollId hết hạn sau 30 giây nên vòng lặp này chỉ fetch, không xen việc khác.
 */
async function fetchAllConversions(startSec: number, endSec: number) {
  const nodes: any[] = [];
  let scrollId: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES) {
    const data: any = await shopeeQuery(
      conversionReportQuery(startSec, endSec, PAGE_LIMIT, scrollId),
    );
    const report = data?.conversionReport;
    const page: any[] = report?.nodes ?? [];
    nodes.push(...page);
    pages++;

    const info = report?.pageInfo;
    if (!info?.hasNextPage || !info?.scrollId) break;
    scrollId = info.scrollId;
  }

  return { nodes, pages, truncated: pages >= MAX_PAGES };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const started = Date.now();
  const admin = adminClient();

  let body: any = {};
  try { body = await req.json(); } catch { /* cron gọi có thể không kèm body */ }

  /* ------------------------- Kiểm tra kết nối ---------------------------- */
  if (body.probe) {
    try {
      await shopeeQuery(PROBE_QUERY);
      return json({ ok: true, appId: credentials().appId });
    } catch (e) {
      return fail((e as Error).message, 200);   // 200 để giao diện đọc được thông báo
    }
  }

  let owner: string;
  try {
    owner = await resolveOwner(req, admin);
  } catch (e) {
    return fail((e as Error).message, 401);
  }

  /* --------------- Cập nhật hoa hồng đã chốt (validatedReport) ------------ */
  if (body.validationId) {
    try {
      const validationId = Number(body.validationId);
      let scrollId: string | null = null;
      let updated = 0;

      for (let i = 0; i < MAX_PAGES; i++) {
        const data: any = await shopeeQuery(
          validatedReportQuery(validationId, PAGE_LIMIT, scrollId),
        );
        const report = data?.validatedReport;
        const nodes: any[] = report?.nodes ?? [];

        for (const n of nodes) {
          const { error } = await admin.from('conversions')
            .update({ net_commission: num(n.netCommission), validation_id: validationId })
            .eq('owner', owner)
            .eq('conversion_id', String(n.conversionId));
          if (!error) updated++;
        }

        const info = report?.pageInfo;
        if (!info?.hasNextPage || !info?.scrollId) break;
        scrollId = info.scrollId;
      }

      await admin.from('sync_log').insert({
        owner, kind: 'validated', ok: true, upserted: updated,
        duration_ms: Date.now() - started,
        message: `Cập nhật hoa hồng chốt cho kỳ ${validationId}: ${updated} đơn.`,
      });

      return json({ ok: true, updated });
    } catch (e) {
      const msg = (e as Error).message;
      await admin.from('sync_log').insert({
        owner, kind: 'validated', ok: false, message: msg,
        duration_ms: Date.now() - started,
      });
      return fail(msg, 200);
    }
  }

  /* ----------------------- Đồng bộ báo cáo chuyển đổi --------------------- */

  // Mặc định: 7 ngày gần nhất (đủ để bắt các đơn cập nhật muộn)
  const now = new Date();
  const defFrom = new Date(now.getTime() - 7 * 86400000);

  const startSec = Math.floor(
    (body.from ? new Date(`${body.from}T00:00:00+07:00`) : defFrom).getTime() / 1000,
  );
  const endSec = Math.floor(
    (body.to ? new Date(`${body.to}T23:59:59+07:00`) : now).getTime() / 1000,
  );

  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec >= endSec) {
    return fail('Khoảng thời gian không hợp lệ.');
  }

  try {
    const { nodes, pages, truncated } = await fetchAllConversions(startSec, endSec);

    if (body.debug) {
      return json({ ok: true, pages, count: nodes.length, sample: nodes.slice(0, 2) });
    }

    const conversions: any[] = [];
    const items: any[] = [];
    for (const n of nodes) {
      if (!n?.conversionId) continue;
      const mapped = mapNode(n, owner);
      conversions.push(mapped.conversion);
      items.push(...mapped.items);
    }

    let upserted = 0;
    for (let i = 0; i < conversions.length; i += 500) {
      const chunk = conversions.slice(i, i + 500);
      const { error } = await admin.from('conversions')
        .upsert(chunk, { onConflict: 'owner,conversion_id' });
      if (error) throw new Error(`Ghi conversions lỗi: ${error.message}`);
      upserted += chunk.length;
    }

    for (let i = 0; i < items.length; i += 500) {
      const { error } = await admin.from('conversion_items')
        .upsert(items.slice(i, i + 500),
          { onConflict: 'owner,conversion_id,order_id,item_id', ignoreDuplicates: false });
      // Index chống trùng dùng biểu thức coalesce nên onConflict có thể không khớp;
      // nếu vậy bỏ qua lỗi trùng, dữ liệu chính đã nằm ở bảng conversions.
      if (error && !/duplicate|conflict|constraint/i.test(error.message)) {
        console.error('[conversion_items]', error.message);
      }
    }

    const message = `Đồng bộ ${upserted} đơn (${pages} trang)` +
      (truncated ? ` — CHẠM GIỚI HẠN ${MAX_PAGES} trang, hãy thu hẹp khoảng ngày.` : '.');

    await admin.from('sync_log').insert({
      owner, kind: 'conversion', ok: true,
      fetched: nodes.length, upserted,
      window_start: new Date(startSec * 1000).toISOString(),
      window_end: new Date(endSec * 1000).toISOString(),
      duration_ms: Date.now() - started,
      message,
    });

    return json({ ok: true, fetched: nodes.length, upserted, pages, truncated });
  } catch (e) {
    const err = e as ShopeeError;
    await admin.from('sync_log').insert({
      owner, kind: 'conversion', ok: false,
      window_start: new Date(startSec * 1000).toISOString(),
      window_end: new Date(endSec * 1000).toISOString(),
      duration_ms: Date.now() - started,
      message: err.message,
    });
    return fail(err.message, 200);
  }
});
