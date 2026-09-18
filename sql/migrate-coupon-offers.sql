-- Visible product coupons (run once on existing Supabase DBs)
alter table public.coupons
  add column if not exists is_public boolean not null default false;

alter table public.coupons
  add column if not exists title text;

alter table public.coupons
  add column if not exists description text;

create index if not exists coupons_public_active_idx
  on public.coupons (is_public, active)
  where is_public = true and active = true;

create table if not exists public.coupon_products (
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  primary key (coupon_id, product_id)
);

create index if not exists coupon_products_product_idx
  on public.coupon_products (product_id);

alter table public.coupon_products enable row level security;
