-- =============================================================================
-- Shopee Affiliate Admin — Supabase schema
-- =============================================================================
-- Cách dùng: mở Supabase Dashboard > SQL Editor > New query > dán TOÀN BỘ file
-- này vào > Run. Chạy lại nhiều lần vẫn an toàn (idempotent).
--
-- Mô hình bảo mật: mọi bảng bật RLS, chỉ đọc/ghi được hàng có owner = auth.uid().
-- Riêng view `public_products` cố tình cho phép đọc công khai (không đăng nhập)
-- để các agent làm content fetch được — view này KHÔNG chứa số liệu hoa hồng.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Hàm tiện ích: tự cập nhật updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- BẢNG: products — sản phẩm + link tiếp thị + nội dung cho agent
-- =============================================================================
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  owner             uuid not null default auth.uid()
                      references auth.users(id) on delete cascade,

  -- Định danh phía Shopee
  item_id           bigint,
  shop_id           bigint,
  shop_name         text,

  -- Thông tin sản phẩm
  name              text not null,
  product_link      text,        -- link gốc shopee.vn
  offer_link        text,        -- link tiếp thị đầy đủ
  short_link        text,        -- link rút gọn s.shopee.vn/...
  sub_id            text,        -- subId để quy đơn về đúng sản phẩm này
  image_url         text,        -- ảnh chính
  images            text[]        not null default '{}',  -- ảnh phụ
  price_min         numeric(14,2),
  price_max         numeric(14,2),
  commission_rate   numeric(6,4),                         -- 0.1050 = 10.5%
  est_commission    numeric(14,2),
  rating            numeric(3,2),
  sales             integer,
  category          text,
  tags              text[]        not null default '{}',

  -- Nội dung phục vụ làm clip / bài viết
  description       text,                                 -- mô tả chi tiết
  highlights        text[]        not null default '{}',  -- gạch đầu dòng bán hàng
  target_audience   text,                                 -- đối tượng khách
  hook_ideas        text[]        not null default '{}',  -- ý tưởng mở đầu clip
  notes             text,                                 -- ghi chú riêng

  -- Trạng thái sản xuất content
  content_status    text          not null default 'todo'
                      check (content_status in ('todo','scripting','filmed','posted','paused')),
  platforms         jsonb         not null default '{}'::jsonb,
                      -- vd: {"tiktok":{"url":"...","posted_at":"2026-08-01"},"facebook":{...}}

  is_public         boolean       not null default true,   -- có xuất ra feed công khai không
  is_active         boolean       not null default true,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

-- Không cho trùng cùng 1 sản phẩm Shopee, và subId phải là duy nhất để quy đơn đúng
create unique index if not exists products_owner_item_uidx
  on public.products (owner, item_id) where item_id is not null;
create unique index if not exists products_owner_subid_uidx
  on public.products (owner, sub_id) where sub_id is not null and sub_id <> '';

create index if not exists products_owner_status_idx  on public.products (owner, content_status);
create index if not exists products_owner_created_idx on public.products (owner, created_at desc);
create index if not exists products_tags_gin_idx      on public.products using gin (tags);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();


-- =============================================================================
-- BẢNG: conversions — đơn hàng + hoa hồng (từ Shopee API / CSV / nhập tay)
-- =============================================================================
create table if not exists public.conversions (
  conversion_id     text          not null,
  owner             uuid          not null default auth.uid()
                      references auth.users(id) on delete cascade,

  purchase_time     timestamptz,
  click_time        timestamptz,
  order_status      text,          -- PENDING | COMPLETED | CANCELLED | UNPAID
  total_commission  numeric(14,2) not null default 0,   -- tạm tính
  seller_commission numeric(14,2) not null default 0,
  shopee_commission numeric(14,2) not null default 0,
  net_commission    numeric(14,2),                      -- số chốt từ validatedReport
  validation_id     integer,
  buyer_type        text,          -- NEW | EXISTING
  device            text,          -- App | Web
  utm_content       text,          -- = sub_id, dùng để join về products
  sub_ids           text[]        not null default '{}',
  item_count        integer       not null default 0,
  gmv               numeric(14,2) not null default 0,
  currency          text          not null default 'VND',
  source            text          not null default 'api'
                      check (source in ('api','csv','manual')),
  raw               jsonb,         -- giữ payload gốc để không mất dữ liệu
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  primary key (owner, conversion_id)
);

create index if not exists conversions_owner_time_idx
  on public.conversions (owner, purchase_time desc);
create index if not exists conversions_owner_status_idx
  on public.conversions (owner, order_status);
create index if not exists conversions_owner_utm_idx
  on public.conversions (owner, utm_content);

drop trigger if exists conversions_set_updated_at on public.conversions;
create trigger conversions_set_updated_at
  before update on public.conversions
  for each row execute function public.set_updated_at();


-- =============================================================================
-- BẢNG: conversion_items — chi tiết từng sản phẩm trong đơn
-- =============================================================================
create table if not exists public.conversion_items (
  id                     bigserial primary key,
  owner                  uuid not null default auth.uid()
                           references auth.users(id) on delete cascade,
  conversion_id          text not null,

  order_id               text,
  item_id                bigint,
  shop_id                bigint,
  item_name              text,
  image_url              text,
  item_price             numeric(14,2) not null default 0,
  qty                    integer       not null default 1,
  item_total_commission  numeric(14,2) not null default 0,
  item_seller_commission numeric(14,2) not null default 0,
  item_shopee_commission numeric(14,2) not null default 0,
  order_status           text,
  raw                    jsonb,
  created_at             timestamptz not null default now(),

  foreign key (owner, conversion_id)
    references public.conversions (owner, conversion_id) on delete cascade
);

-- Chống trùng khi sync lại cùng một khoảng thời gian
create unique index if not exists conversion_items_uidx
  on public.conversion_items
     (owner, conversion_id, coalesce(order_id, ''), coalesce(item_id, 0));

create index if not exists conversion_items_owner_item_idx
  on public.conversion_items (owner, item_id);


-- =============================================================================
-- BẢNG: sync_log — nhật ký đồng bộ Shopee
-- =============================================================================
create table if not exists public.sync_log (
  id           bigserial primary key,
  owner        uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,
  ran_at       timestamptz not null default now(),
  kind         text not null,   -- conversion | validated | product | csv | manual
  ok           boolean not null default true,
  fetched      integer not null default 0,
  upserted     integer not null default 0,
  window_start timestamptz,
  window_end   timestamptz,
  duration_ms  integer,
  message      text
);

create index if not exists sync_log_owner_ran_idx on public.sync_log (owner, ran_at desc);


-- =============================================================================
-- BẢNG: app_settings — key/value (mốc sync cuối, mapping cột CSV đã lưu, ...)
-- =============================================================================
create table if not exists public.app_settings (
  owner      uuid not null default auth.uid()
               references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, key)
);

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();


-- =============================================================================
-- ROW LEVEL SECURITY — chỉ chủ sở hữu đọc/ghi được dữ liệu của mình
-- =============================================================================
alter table public.products         enable row level security;
alter table public.conversions      enable row level security;
alter table public.conversion_items enable row level security;
alter table public.sync_log         enable row level security;
alter table public.app_settings     enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['products','conversions','conversion_items','sync_log','app_settings']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format($f$
      create policy %I on public.%I
        for all
        to authenticated
        using (owner = auth.uid())
        with check (owner = auth.uid())
    $f$, t || '_owner_all', t);
  end loop;
end
$$;


-- =============================================================================
-- VIEW: v_daily_stats — hoa hồng & số đơn theo ngày (giờ Việt Nam)
-- =============================================================================
drop view if exists public.v_daily_stats;
create view public.v_daily_stats
with (security_invoker = on) as
select
  owner,
  (purchase_time at time zone 'Asia/Ho_Chi_Minh')::date              as day,
  count(*)::int                                                      as orders,
  count(*) filter (where upper(order_status) = 'COMPLETED')::int      as completed_orders,
  count(*) filter (where upper(order_status) = 'PENDING')::int        as pending_orders,
  count(*) filter (where upper(order_status) = 'CANCELLED')::int      as cancelled_orders,
  coalesce(sum(total_commission), 0)                                 as commission,
  coalesce(sum(coalesce(net_commission, total_commission))
             filter (where upper(coalesce(order_status,'')) <> 'CANCELLED'), 0) as net_commission,
  coalesce(sum(gmv), 0)                                              as gmv,
  coalesce(sum(item_count), 0)::int                                  as items
from public.conversions
where purchase_time is not null
group by owner, 2;


-- =============================================================================
-- VIEW: v_product_performance — hiệu quả từng sản phẩm
-- Quy đơn theo 2 đường: khớp item_id (chính xác) hoặc khớp sub_id/utm_content
-- =============================================================================
drop view if exists public.v_product_performance;
create view public.v_product_performance
with (security_invoker = on) as
with by_item as (
  select
    ci.owner,
    ci.item_id,
    count(distinct ci.conversion_id)::int          as orders,
    coalesce(sum(ci.qty), 0)::int                  as units,
    coalesce(sum(ci.item_total_commission), 0)     as commission,
    coalesce(sum(ci.item_price * ci.qty), 0)       as gmv,
    max(c.purchase_time)                           as last_order_at
  from public.conversion_items ci
  join public.conversions c
    on c.owner = ci.owner and c.conversion_id = ci.conversion_id
  where upper(coalesce(c.order_status, '')) <> 'CANCELLED'
    and ci.item_id is not null
  group by 1, 2
),
by_sub as (
  select
    owner,
    utm_content                                    as sub_id,
    count(*)::int                                  as orders,
    coalesce(sum(total_commission), 0)             as commission,
    coalesce(sum(gmv), 0)                          as gmv,
    max(purchase_time)                             as last_order_at
  from public.conversions
  where utm_content is not null and utm_content <> ''
    and upper(coalesce(order_status, '')) <> 'CANCELLED'
  group by 1, 2
)
select
  p.owner,
  p.id                                             as product_id,
  p.name,
  p.image_url,
  p.item_id,
  p.sub_id,
  p.category,
  p.content_status,
  p.commission_rate,
  coalesce(bi.orders, bs.orders, 0)                as orders,
  coalesce(bi.units, bs.orders, 0)                 as units,
  coalesce(bi.commission, bs.commission, 0)        as commission,
  coalesce(bi.gmv, bs.gmv, 0)                      as gmv,
  greatest(bi.last_order_at, bs.last_order_at)     as last_order_at
from public.products p
left join by_item bi on bi.owner = p.owner and bi.item_id = p.item_id
left join by_sub  bs on bs.owner = p.owner and bs.sub_id  = p.sub_id
where p.is_active;


-- =============================================================================
-- VIEW: public_products — FEED CÔNG KHAI cho các agent làm content
-- =============================================================================
-- CỐ Ý là security definer (bỏ qua RLS) để agent fetch được mà không cần đăng
-- nhập. Vì vậy chỉ được chọn các cột an toàn — TUYỆT ĐỐI KHÔNG thêm cột hoa
-- hồng / doanh thu vào đây.
-- =============================================================================
drop view if exists public.public_products;
create view public.public_products
with (security_invoker = off) as
select
  p.id,
  p.name,
  p.category,
  p.tags,
  p.image_url,
  p.images,
  p.price_min,
  p.price_max,
  p.description,
  p.highlights,
  p.target_audience,
  p.hook_ideas,
  coalesce(nullif(p.short_link, ''),
           nullif(p.offer_link, ''),
           p.product_link)                         as link,
  p.content_status,
  p.platforms,
  p.updated_at
from public.products p
where p.is_public and p.is_active;

grant select on public.public_products to anon, authenticated;


-- =============================================================================
-- KIỂM TRA NHANH sau khi chạy xong
-- =============================================================================
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' order by 1;
--   -- tất cả các bảng ở trên phải có rowsecurity = true
