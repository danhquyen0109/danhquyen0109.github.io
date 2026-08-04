// =============================================================================
// shopee-product — dán link Shopee, trả về thông tin sản phẩm + link rút gọn
// =============================================================================
// Body: { itemId: 123, shopId: 456, url?: "...", subId?: "dq-abc-1234" }
// Trả:  { product: {...}, shortLink: "https://s.shopee.vn/..." | null }
// =============================================================================

import { preflight, json, fail } from '../_shared/http.ts';
import { shopeeQuery, productOfferQuery, shortLinkMutation } from '../_shared/shopee.ts';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  let body: any = {};
  try { body = await req.json(); } catch { /* trống */ }

  const itemId = Number(body.itemId);
  const shopId = body.shopId ? Number(body.shopId) : null;

  if (!Number.isFinite(itemId) || itemId <= 0) {
    return fail('Thiếu itemId hợp lệ.');
  }

  try {
    const data: any = await shopeeQuery(productOfferQuery(itemId, shopId));
    const node = data?.productOfferV2?.nodes?.[0];

    if (!node) {
      return fail(
        'Shopee không trả về sản phẩm nào cho itemId này. Có thể sản phẩm không nằm ' +
        'trong chương trình tiếp thị liên kết, hoặc đã ngừng bán.',
        200,
      );
    }

    // Shopee trả commissionRate dạng chuỗi thập phân ("0.105"), giữ nguyên fraction
    const product = {
      itemId: num(node.itemId) ?? itemId,
      shopId: num(node.shopId) ?? shopId,
      shopName: node.shopName ?? null,
      productName: node.productName ?? null,
      productLink: node.productLink ?? body.url ?? null,
      offerLink: node.offerLink ?? null,
      imageUrl: node.imageUrl ?? null,
      priceMin: num(node.priceMin),
      priceMax: num(node.priceMax),
      priceDiscountRate: num(node.priceDiscountRate),
      sales: num(node.sales),
      ratingStar: num(node.ratingStar),
      commissionRate: num(node.commissionRate),
      sellerCommissionRate: num(node.sellerCommissionRate),
      shopeeCommissionRate: num(node.shopeeCommissionRate),
      commission: num(node.commission),
    };

    // Link rút gọn kèm subId để sau này quy đơn về đúng sản phẩm
    let shortLink: string | null = null;
    let shortLinkError: string | null = null;

    if (body.subId) {
      const origin = product.offerLink || product.productLink || body.url;
      if (origin) {
        try {
          const r: any = await shopeeQuery(shortLinkMutation(origin, [String(body.subId)]));
          shortLink = r?.generateShortLink?.shortLink ?? null;
        } catch (e) {
          // Lấy được sản phẩm là đã có giá trị — không để lỗi rút gọn làm hỏng cả request
          shortLinkError = (e as Error).message;
        }
      }
    }

    return json({ ok: true, product, shortLink, shortLinkError });
  } catch (e) {
    return fail((e as Error).message, 200);
  }
});
