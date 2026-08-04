// =============================================================================
// feed — dữ liệu sản phẩm CÔNG KHAI cho các agent làm content
// =============================================================================
// Không cần đăng nhập (verify_jwt = false trong config.toml).
// Đọc từ view `public_products` — view này chỉ chứa thông tin sản phẩm và nội
// dung mô tả, KHÔNG có bất kỳ số liệu hoa hồng / doanh thu nào.
//
//   GET /functions/v1/feed?format=md
//   GET /functions/v1/feed?format=json&status=todo&limit=20
//   GET /functions/v1/feed?tag=gaming&q=tai%20nghe
// =============================================================================

import { preflight, json, text, fail, anonClient } from '../_shared/http.ts';

const MAX_LIMIT = 200;

const vnd = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0,
  }).format(v);
};

function priceRange(p: any) {
  const lo = vnd(p.price_min);
  const hi = vnd(p.price_max);
  if (!lo && !hi) return 'chưa có giá';
  if (!hi || lo === hi) return lo ?? hi!;
  return `${lo} – ${hi}`;
}

const slug = (s: string) =>
  String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');

function hashtags(p: any) {
  const raw = [
    ...(p.tags ?? []), p.category,
    ...String(p.name ?? '').split(/\s+/).slice(0, 3),
    'shopee', 'shopeeaffiliate', 'reviewsanpham',
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = slug(r);
    if (t.length >= 3 && !seen.has(t)) { seen.add(t); out.push('#' + t); }
  }
  return out.slice(0, 12);
}

const TASK_BLOCK = `## Việc cần làm

Với **mỗi sản phẩm** bên dưới, hãy tạo:

1. **Kịch bản clip ngắn 30–45 giây** (TikTok / Reels / Shorts) — hook giữ chân
   trong 3 giây đầu, phần giữa nêu 2–3 lợi ích cụ thể, kết bằng lời kêu gọi
   hành động dẫn tới link tiếp thị.
2. **Caption đăng bài** dưới 150 từ, giọng tự nhiên như người thật chia sẻ.
3. **Danh sách hashtag** (tham khảo phần gợi ý, thêm bớt cho hợp nền tảng).
4. **Gợi ý cảnh quay / hình ảnh** dựa trên các ảnh sản phẩm được cung cấp.

## Quy tắc bắt buộc

- Viết bằng **tiếng Việt**, đúng văn phong mạng xã hội Việt Nam.
- **Luôn dùng đúng link tiếp thị** ghi trong từng sản phẩm — không tự bịa hay rút gọn lại.
- **Không bịa** thông số, giá, khuyến mãi hay đánh giá không có trong dữ liệu.
- Nêu rõ đây là nội dung có gắn link tiếp thị.
`;

function toMarkdown(rows: any[]) {
  const L: string[] = [
    '# Brief nội dung — Tiếp thị liên kết Shopee',
    '',
    `> Xuất lúc ${new Date().toISOString()} · ${rows.length} sản phẩm`,
    '',
    TASK_BLOCK,
    '---',
    '',
    '# Danh sách sản phẩm',
    '',
  ];

  rows.forEach((p, i) => {
    L.push(`## ${i + 1}. ${p.name}`, '');
    L.push(`- **Giá:** ${priceRange(p)}`);
    if (p.category) L.push(`- **Danh mục:** ${p.category}`);
    if (p.link)     L.push(`- **Link tiếp thị (dùng đúng link này):** ${p.link}`);
    L.push('');

    const imgs = [p.image_url, ...(p.images ?? [])].filter(Boolean);
    if (imgs.length) {
      L.push('### Ảnh sản phẩm');
      imgs.forEach((u: string, k: number) => L.push(`${k + 1}. ${u}`));
      L.push('');
    }
    if (p.description)         L.push('### Mô tả chi tiết', '', String(p.description).trim(), '');
    if (p.highlights?.length)  L.push('### Điểm bán hàng chính',
                                      p.highlights.map((h: string) => `- ${h}`).join('\n'), '');
    if (p.target_audience)     L.push('### Đối tượng khách hàng', '', String(p.target_audience).trim(), '');
    if (p.hook_ideas?.length)  L.push('### Ý tưởng mở đầu (hook)',
                                      p.hook_ideas.map((h: string) => `- ${h}`).join('\n'), '');
    L.push('### Hashtag gợi ý', '', hashtags(p).join(' '), '');
    if (i < rows.length - 1) L.push('---', '');
  });

  return L.join('\n');
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase();
  const status = url.searchParams.get('status');
  const tag    = url.searchParams.get('tag');
  const q      = url.searchParams.get('q');
  const limit  = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get('limit')) || 50));

  try {
    let query = anonClient().from('public_products').select('*');

    if (status) query = query.eq('content_status', status);
    if (tag)    query = query.contains('tags', [tag]);
    if (q)      query = query.ilike('name', `%${q.replace(/[%,()]/g, ' ')}%`);

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    const rows = data ?? [];

    if (format === 'md' || format === 'markdown') {
      return text(toMarkdown(rows), 'text/markdown; charset=utf-8');
    }

    return json({
      generated_at: new Date().toISOString(),
      count: rows.length,
      filters: { status, tag, q, limit },
      products: rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        tags: p.tags ?? [],
        price: { min: p.price_min, max: p.price_max, currency: 'VND' },
        affiliate_link: p.link,
        images: [p.image_url, ...(p.images ?? [])].filter(Boolean),
        description: p.description ?? '',
        highlights: p.highlights ?? [],
        target_audience: p.target_audience ?? '',
        hook_ideas: p.hook_ideas ?? [],
        hashtags: hashtags(p),
        content_status: p.content_status,
        updated_at: p.updated_at,
      })),
    });
  } catch (e) {
    return fail((e as Error).message, 500);
  }
});
