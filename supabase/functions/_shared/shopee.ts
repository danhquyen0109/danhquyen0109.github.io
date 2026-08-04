// =============================================================================
// _shared/shopee.ts — client gọi Shopee Affiliate Open API (GraphQL)
// =============================================================================
// Xác thực: header
//   Authorization: SHA256 Credential={appId}, Timestamp={ts}, Signature={sig}
// với sig = SHA256(appId + timestamp + payload + secret), payload là ĐÚNG chuỗi
// JSON gửi đi (sai một ký tự là chữ ký hỏng).
//
// Lấy appId/secret tại https://affiliate.shopee.vn/open_api
// Đặt vào Supabase bằng:
//   supabase secrets set SHOPEE_APP_ID=... SHOPEE_SECRET=...
// =============================================================================

const DEFAULT_ENDPOINT = 'https://open-api.affiliate.shopee.vn/graphql';

export class ShopeeError extends Error {
  code?: number | string;
  constructor(message: string, code?: number | string) {
    super(message);
    this.name = 'ShopeeError';
    this.code = code;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function credentials() {
  const appId  = Deno.env.get('SHOPEE_APP_ID');
  const secret = Deno.env.get('SHOPEE_SECRET');
  return { appId, secret, endpoint: Deno.env.get('SHOPEE_API_URL') ?? DEFAULT_ENDPOINT };
}

export function assertCredentials() {
  const { appId, secret } = credentials();
  if (!appId || !secret) {
    throw new ShopeeError(
      'Chưa đặt SHOPEE_APP_ID / SHOPEE_SECRET. Xin credentials tại ' +
      'affiliate.shopee.vn/open_api rồi chạy: supabase secrets set SHOPEE_APP_ID=... SHOPEE_SECRET=...',
    );
  }
}

/**
 * Gửi một truy vấn GraphQL đã ký.
 * Tham số được viết thẳng vào chuỗi query (không dùng GraphQL variables) để
 * chuỗi payload luôn khớp tuyệt đối với chuỗi đem đi ký.
 */
export async function shopeeQuery<T = unknown>(query: string): Promise<T> {
  assertCredentials();
  const { appId, secret, endpoint } = credentials();

  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const signature = await sha256Hex(`${appId}${ts}${payload}${secret}`);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${signature}`,
      },
      body: payload,
    });
  } catch (e) {
    throw new ShopeeError(`Không gọi được Shopee API: ${(e as Error).message}`);
  }

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ShopeeError(`Shopee trả về phản hồi không phải JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  if (json?.errors?.length) {
    const first = json.errors[0];
    const code = first.code ?? first.extensions?.code;
    if (String(code) === '10030') {
      throw new ShopeeError('Bị Shopee giới hạn tốc độ gọi (mã 10030). Thử lại sau ít phút.', code);
    }
    throw new ShopeeError(first.message ?? 'Shopee trả về lỗi không rõ.', code);
  }

  if (!res.ok) {
    throw new ShopeeError(`Shopee API lỗi HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  return json.data as T;
}

/* ============================ Các truy vấn cụ thể ========================== */
// LƯU Ý: tên field bên dưới dựa trên tài liệu Shopee Affiliate Open API. Shopee
// có đổi schema theo thời gian — nếu gặp lỗi kiểu "Cannot query field ...",
// gọi hàm với ?debug=1 để xem phản hồi thô rồi sửa lại đúng tên field ở đây.

/** Kiểm tra credentials bằng một truy vấn rẻ nhất. */
export const PROBE_QUERY = `{
  shopeeOfferV2(page: 1, limit: 1) {
    nodes { offerName commissionRate }
    pageInfo { page limit hasNextPage }
  }
}`;

export function productOfferQuery(itemId: number, shopId?: number | null) {
  const args = [`itemId: ${itemId}`];
  if (shopId) args.push(`shopId: ${shopId}`);
  return `{
  productOfferV2(${args.join(', ')}) {
    nodes {
      itemId shopId shopName productName productLink offerLink imageUrl
      priceMin priceMax priceDiscountRate sales ratingStar
      commissionRate sellerCommissionRate shopeeCommissionRate commission
      shopType
    }
    pageInfo { page limit hasNextPage }
  }
}`;
}

export function shortLinkMutation(originUrl: string, subIds: string[]) {
  const subs = subIds.filter(Boolean).map((s) => JSON.stringify(s)).join(', ');
  return `mutation {
  generateShortLink(input: { originUrl: ${JSON.stringify(originUrl)}, subIds: [${subs}] }) {
    shortLink
  }
}`;
}

/**
 * Báo cáo chuyển đổi. Phân trang bằng scrollId — CON TRỎ HẾT HẠN SAU 30 GIÂY,
 * nên vòng lặp phải gọi trang kế tiếp ngay, không chèn việc chậm ở giữa.
 */
export function conversionReportQuery(
  startSec: number, endSec: number, limit: number, scrollId?: string | null,
) {
  const args = [
    `purchaseTimeStart: ${startSec}`,
    `purchaseTimeEnd: ${endSec}`,
    `limit: ${limit}`,
  ];
  if (scrollId) args.push(`scrollId: ${JSON.stringify(scrollId)}`);

  return `{
  conversionReport(${args.join(', ')}) {
    nodes {
      conversionId
      purchaseTime
      clickTime
      device
      buyerType
      utmContent
      totalCommission
      sellerCommission
      shopeeCommissionCapped
      orders {
        orderId
        orderStatus
        shopId
        shopName
        items {
          itemId
          itemName
          itemPrice
          qty
          imageUrl
          itemTotalCommission
          itemSellerCommission
          itemShopeeCommissionCapped
        }
      }
    }
    pageInfo { hasNextPage scrollId limit }
  }
}`;
}

export function validatedReportQuery(validationId: number, limit: number, scrollId?: string | null) {
  const args = [`validationId: ${validationId}`, `limit: ${limit}`];
  if (scrollId) args.push(`scrollId: ${JSON.stringify(scrollId)}`);
  return `{
  validatedReport(${args.join(', ')}) {
    nodes { conversionId netCommission totalCommission }
    pageInfo { hasNextPage scrollId limit }
  }
}`;
}
