// =============================================================================
// brief.js — chuyển dữ liệu sản phẩm thành brief cho agent làm clip / bài viết
// =============================================================================

import { fmtVND, fmtPct, slugify, contentStatusMeta } from './ui.js';
import { CONFIG } from '../config.js';

/** Link tốt nhất để gắn vào bài đăng. */
export const bestLink = (p) => p.short_link || p.offer_link || p.product_link || '';

/** Khoảng giá dạng người đọc được. */
export function priceRange(p) {
  const lo = Number(p.price_min) || 0;
  const hi = Number(p.price_max) || 0;
  if (!lo && !hi) return 'chưa có giá';
  if (!hi || lo === hi) return fmtVND(lo || hi);
  return `${fmtVND(lo)} – ${fmtVND(hi)}`;
}

/** Sinh hashtag từ tên, category và tags. */
export function hashtags(p, extra = ['shopee', 'shopeeaffiliate', 'reviewsanpham']) {
  const raw = [
    ...(p.tags || []),
    p.category,
    ...String(p.name || '').split(/\s+/).slice(0, 3),
    ...extra,
  ];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    const tag = slugify(r).replace(/-/g, '');
    if (tag.length >= 3 && !seen.has(tag)) { seen.add(tag); out.push('#' + tag); }
  }
  return out.slice(0, 12);
}

/** Các nền tảng đã đăng rồi. */
export function postedOn(p) {
  const plats = p.platforms || {};
  return CONFIG.PLATFORMS
    .filter(({ key }) => plats[key]?.posted || plats[key]?.url)
    .map(({ key, label }) => ({ key, label, url: plats[key]?.url || '' }));
}

const bullets = (arr, prefix = '- ') =>
  (arr || []).filter(Boolean).map((x) => prefix + x).join('\n');

/* ------------------------- Brief Markdown 1 sản phẩm ----------------------- */

export function productBrief(p, { index = null, includeStatus = true } = {}) {
  const L = [];
  const heading = index ? `## ${index}. ${p.name}` : `## ${p.name}`;
  L.push(heading, '');

  L.push(`- **Giá:** ${priceRange(p)}`);
  if (p.commission_rate) L.push(`- **Hoa hồng:** ${fmtPct(p.commission_rate)}`);
  if (p.category)        L.push(`- **Danh mục:** ${p.category}`);
  if (p.shop_name)       L.push(`- **Shop:** ${p.shop_name}`);
  if (p.rating)          L.push(`- **Đánh giá:** ${p.rating}/5`);
  if (p.sales)           L.push(`- **Đã bán:** ${p.sales}`);

  const link = bestLink(p);
  if (link) L.push(`- **Link tiếp thị (dùng link này trong bài đăng):** ${link}`);

  if (includeStatus) {
    L.push(`- **Trạng thái content:** ${contentStatusMeta(p.content_status).label}`);
    const done = postedOn(p);
    if (done.length) {
      L.push(`- **Đã đăng ở:** ${done.map((d) => d.url ? `${d.label} (${d.url})` : d.label).join(', ')}`);
    }
  }
  L.push('');

  const imgs = [p.image_url, ...(p.images || [])].filter(Boolean);
  if (imgs.length) {
    L.push('### Ảnh sản phẩm');
    imgs.forEach((u, i) => L.push(`${i + 1}. ${u}`));
    L.push('');
  }

  if (p.description) {
    L.push('### Mô tả chi tiết', '', p.description.trim(), '');
  }

  if (p.highlights?.length) {
    L.push('### Điểm bán hàng chính', bullets(p.highlights), '');
  }

  if (p.target_audience) {
    L.push('### Đối tượng khách hàng', '', p.target_audience.trim(), '');
  }

  if (p.hook_ideas?.length) {
    L.push('### Ý tưởng mở đầu (hook)', bullets(p.hook_ideas), '');
  }

  if (p.notes) {
    L.push('### Ghi chú riêng', '', p.notes.trim(), '');
  }

  L.push('### Hashtag gợi ý', '', hashtags(p).join(' '), '');

  return L.join('\n');
}

/* ------------------------- Brief gộp nhiều sản phẩm ------------------------ */

const TASK_BLOCK = `## Việc cần làm

Với **mỗi sản phẩm** bên dưới, hãy tạo:

1. **Kịch bản clip ngắn 30–45 giây** (TikTok / Reels / Shorts) — mở đầu bằng hook
   giữ chân trong 3 giây đầu, phần giữa nêu 2–3 lợi ích cụ thể, kết bằng lời kêu
   gọi hành động dẫn tới link tiếp thị.
2. **Caption đăng bài** dưới 150 từ, giọng văn tự nhiên như người thật đang chia
   sẻ, không nghe như quảng cáo.
3. **Danh sách hashtag** (tham khảo phần gợi ý, thêm bớt cho hợp nền tảng).
4. **Gợi ý cảnh quay / hình ảnh** dựa trên các ảnh sản phẩm được cung cấp.

## Quy tắc bắt buộc

- Viết bằng **tiếng Việt**, giọng gần gũi, đúng văn phong mạng xã hội Việt Nam.
- **Luôn dùng đúng link tiếp thị** ghi trong từng sản phẩm — không tự bịa hay rút gọn lại.
- **Không bịa** thông số, giá, khuyến mãi hay đánh giá không có trong dữ liệu.
- Nêu rõ đây là nội dung có gắn link tiếp thị (yêu cầu công bố của các nền tảng).
`;

export function productsBrief(products, {
  title = 'Brief nội dung — Tiếp thị liên kết Shopee',
  includeTask = true,
  includeStatus = true,
} = {}) {
  const stamp = new Date().toLocaleString('vi-VN');
  const L = [
    `# ${title}`,
    '',
    `> Xuất lúc ${stamp} · ${products.length} sản phẩm`,
    '',
  ];
  if (includeTask) L.push(TASK_BLOCK, '---', '');
  L.push('# Danh sách sản phẩm', '');

  products.forEach((p, i) => {
    L.push(productBrief(p, { index: i + 1, includeStatus }));
    if (i < products.length - 1) L.push('---', '');
  });

  return L.join('\n');
}

/* ------------------------------ Dạng JSON --------------------------------- */

/** Object gọn cho agent xử lý bằng code (không chứa số liệu hoa hồng thực nhận). */
export function productJson(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category || null,
    tags: p.tags || [],
    price: { min: Number(p.price_min) || null, max: Number(p.price_max) || null, currency: 'VND' },
    commission_rate: p.commission_rate ? Number(p.commission_rate) : null,
    shop: p.shop_name || null,
    rating: p.rating ? Number(p.rating) : null,
    sales: p.sales ?? null,
    affiliate_link: bestLink(p),
    images: [p.image_url, ...(p.images || [])].filter(Boolean),
    description: p.description || '',
    highlights: p.highlights || [],
    target_audience: p.target_audience || '',
    hook_ideas: p.hook_ideas || [],
    hashtags: hashtags(p),
    content_status: p.content_status,
    posted_on: postedOn(p).map((d) => ({ platform: d.key, url: d.url })),
  };
}

export function productsJson(products, meta = {}) {
  return JSON.stringify({
    generated_at: new Date().toISOString(),
    count: products.length,
    ...meta,
    products: products.map(productJson),
  }, null, 2);
}
