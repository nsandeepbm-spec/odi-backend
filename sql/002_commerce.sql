-- ═══════════════════════════════════════════════════════════════════════════
-- ODI · Commerce schema (products, cart, coupons, orders, payments)
-- Run AFTER sql/001_create_users.sql in Supabase SQL Editor.
--
-- This replaces the stub 002_ecommerce_schema.sql. If you already ran the
-- stub, the DROP section below clears those tables before recreating.
--
-- Images: store public Supabase Storage URLs in product_images.url
-- (upload files in Dashboard → Storage; API stores URLs only).
-- Money: all amounts are integer paise (129900 = ₹1,299).
-- Access: RLS enabled, no public policies — Express service role only.
-- Seed data lives in sql/003_seed_catalog.sql (optional — do not run unless you want demo rows).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Drop stub / previous commerce tables (safe re-run) ───────────────────────
drop table if exists public.payments cascade;
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.cart_items cascade;
drop table if exists public.coupons cascade;
drop table if exists public.product_reviews cascade;
drop table if exists public.product_images cascade;
drop table if exists public.products cascade;
drop table if exists public.user_addresses cascade;
drop table if exists public.addresses cascade; -- stub name from old 002

drop type if exists public.payment_status cascade;
drop type if exists public.order_status cascade;
drop type if exists public.coupon_type cascade;
drop type if exists public.product_status cascade;

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.product_status as enum ('draft', 'live', 'coming_soon', 'archived');
create type public.coupon_type as enum ('percent', 'fixed_paise');
create type public.order_status as enum (
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
);
create type public.payment_status as enum (
  'created',
  'authorized',
  'captured',
  'failed',
  'refunded'
);

-- ── Products ─────────────────────────────────────────────────────────────────
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  volume            text,
  description       text,
  long_description  text,
  author            text,
  publisher         text,
  language          text default 'English',
  age_range         text,
  pages             integer check (pages is null or pages > 0),
  price_paise       integer not null check (price_paise >= 0),
  compare_at_paise  integer check (compare_at_paise is null or compare_at_paise >= 0),
  stock_qty         integer not null default 0 check (stock_qty >= 0),
  status            public.product_status not null default 'draft',
  tag               text,
  features          text[] not null default '{}',
  categories        text[] not null default '{}',
  kit_contents      jsonb not null default '[]'::jsonb,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint products_compare_gte_price check (
    compare_at_paise is null or compare_at_paise >= price_paise
  )
);

comment on table public.products is 'ODI Kids catalog. Prices in paise. Images live in product_images.';
comment on column public.products.kit_contents is 'JSON array: [{name, qty, detail}]';

create index products_status_idx on public.products (status);
create index products_sort_idx on public.products (sort_order, created_at);
create index products_categories_gin on public.products using gin (categories);

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ── Product images (Supabase Storage URLs) ───────────────────────────────────
create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  url         text not null,
  alt         text,
  sort_order  integer not null default 0,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index product_images_product_idx on public.product_images (product_id, sort_order);

-- At most one primary image per product
create unique index product_images_one_primary
  on public.product_images (product_id)
  where is_primary = true;

-- ── Product reviews ──────────────────────────────────────────────────────────
create table public.product_reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  title       text,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, user_id)
);

create index product_reviews_product_idx on public.product_reviews (product_id, created_at desc);

drop trigger if exists product_reviews_touch_updated_at on public.product_reviews;
create trigger product_reviews_touch_updated_at
  before update on public.product_reviews
  for each row execute function public.touch_updated_at();

-- ── User addresses ───────────────────────────────────────────────────────────
create table public.user_addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  label        text,
  first_name   text not null,
  last_name    text not null default '',
  phone        text not null,
  email        text,
  street       text not null,
  city         text not null,
  state        text,
  postal_code  text not null,
  country      text not null default 'IN',
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index user_addresses_user_idx on public.user_addresses (user_id);

drop trigger if exists user_addresses_touch_updated_at on public.user_addresses;
create trigger user_addresses_touch_updated_at
  before update on public.user_addresses
  for each row execute function public.touch_updated_at();

-- ── Cart ─────────────────────────────────────────────────────────────────────
create table public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  quantity    integer not null default 1 check (quantity > 0 and quantity <= 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create index cart_items_user_idx on public.cart_items (user_id);

drop trigger if exists cart_items_touch_updated_at on public.cart_items;
create trigger cart_items_touch_updated_at
  before update on public.cart_items
  for each row execute function public.touch_updated_at();

-- ── Coupons ──────────────────────────────────────────────────────────────────
create table public.coupons (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  type                public.coupon_type not null,
  value               integer not null check (value > 0),
  min_subtotal_paise  integer not null default 0 check (min_subtotal_paise >= 0),
  max_discount_paise  integer check (max_discount_paise is null or max_discount_paise > 0),
  max_uses            integer check (max_uses is null or max_uses > 0),
  per_user_limit      integer not null default 1 check (per_user_limit > 0),
  used_count          integer not null default 0 check (used_count >= 0),
  starts_at           timestamptz,
  ends_at             timestamptz,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint coupons_percent_max check (type <> 'percent' or value <= 100)
);

create index coupons_code_idx on public.coupons (lower(code));

drop trigger if exists coupons_touch_updated_at on public.coupons;
create trigger coupons_touch_updated_at
  before update on public.coupons
  for each row execute function public.touch_updated_at();

-- ── Orders (UI may call these “bookings”) ────────────────────────────────────
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique,
  user_id             uuid not null references public.users(id) on delete restrict,
  status              public.order_status not null default 'pending',
  subtotal_paise      integer not null check (subtotal_paise >= 0),
  discount_paise      integer not null default 0 check (discount_paise >= 0),
  shipping_paise      integer not null default 0 check (shipping_paise >= 0),
  total_paise         integer not null check (total_paise >= 0),
  currency            text not null default 'INR',
  coupon_id           uuid references public.coupons(id) on delete set null,
  coupon_code         text,
  shipping_address    jsonb not null,
  razorpay_order_id   text unique,
  idempotency_key     text not null unique,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status);

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  snapshot_name       text not null,
  snapshot_slug       text not null,
  snapshot_image_url  text,
  unit_price_paise    integer not null check (unit_price_paise >= 0),
  quantity            integer not null check (quantity > 0),
  line_total_paise    integer not null check (line_total_paise >= 0),
  created_at          timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

-- ── Payments ─────────────────────────────────────────────────────────────────
create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders(id) on delete cascade,
  provider                text not null default 'razorpay',
  provider_order_id       text,
  provider_payment_id     text,
  provider_signature      text,
  amount_paise            integer not null check (amount_paise >= 0),
  currency                text not null default 'INR',
  status                  public.payment_status not null default 'created',
  raw_webhook             jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index payments_provider_payment_uidx
  on public.payments (provider_payment_id)
  where provider_payment_id is not null;

create index payments_order_idx on public.payments (order_id);

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function public.touch_updated_at();

-- ── RLS deny-all (service role bypasses) ─────────────────────────────────────
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_reviews enable row level security;
alter table public.user_addresses enable row level security;
alter table public.cart_items enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

-- Optional demo catalog + coupon: sql/003_seed_catalog.sql
