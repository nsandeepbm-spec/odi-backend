-- ═══════════════════════════════════════════════════════════════════════════
-- ODI · Full database schema (single source of truth)
--
-- Run once in: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Auth:     Firebase (Google / email+password). Profiles live in `users`.
-- Access:   Express API uses the Supabase service-role key.
--           RLS is ON with no public policies (deny-all for anon/authenticated).
-- Money:    All amounts are integer paise (129900 = ₹1,299).
-- Images:   Public URLs in `product_images.url` (Storage or frontend `/public`).
--           kind = 'card' (hero) | 'gallery' (thumbnails). Max one card / product.
--
-- WARNING: The DROP section wipes commerce tables. Safe on empty projects.
--          Do not re-run on a live DB with real orders unless you intend a reset.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════
-- Shared helpers
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Enums
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum ('active', 'inactive', 'banned');
exception when duplicate_object then null; end $$;

-- Commerce enums: drop + recreate so this file is the full current contract
drop type if exists public.payment_status cascade;
drop type if exists public.order_status cascade;
drop type if exists public.coupon_type cascade;
drop type if exists public.product_status cascade;
drop type if exists public.support_ticket_status cascade;

create type public.product_status as enum ('draft', 'live', 'coming_soon', 'archived');
create type public.coupon_type as enum ('percent', 'fixed_paise');
create type public.order_status as enum (
  'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
);
create type public.payment_status as enum (
  'created', 'authorized', 'captured', 'failed', 'refunded'
);
create type public.support_ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

-- ═══════════════════════════════════════════════════════════════════════════
-- Users (Firebase UID → app profile)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.users (
  id              uuid          primary key default gen_random_uuid(),
  firebase_uid    text          not null unique,
  email           text          not null unique,
  full_name       text,
  avatar_url      text,
  phone           text,
  role            public.user_role   not null default 'user',
  is_super_admin  boolean       not null default false,
  provider        text          not null default 'password',  -- 'password' | 'google.com'
  status          public.user_status not null default 'active',
  last_login_at   timestamptz,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

-- Safe if an older users table already exists without this column
alter table public.users
  add column if not exists is_super_admin boolean not null default false;

comment on table  public.users                is 'App profiles. Auth is Firebase; firebase_uid links the two.';
comment on column public.users.firebase_uid   is 'Firebase Authentication UID from the ID token.';
comment on column public.users.is_super_admin is 'Only super-admins can promote other users to admin.';
comment on column public.users.provider       is 'Last sign-in provider (password, google.com).';

create index if not exists users_email_idx      on public.users (email);
create index if not exists users_role_idx       on public.users (role);
create index if not exists users_created_at_idx on public.users (created_at desc);

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

alter table public.users enable row level security;

-- After first login, promote yourself:
--   update public.users set role = 'admin', is_super_admin = true where email = 'you@example.com';

-- ═══════════════════════════════════════════════════════════════════════════
-- Commerce tables (reset on re-run)
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists public.payments cascade;
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.cart_items cascade;
drop table if exists public.support_tickets cascade;
drop table if exists public.notifications cascade;
drop table if exists public.product_notify_requests cascade;
drop table if exists public.user_favorites cascade;
drop table if exists public.coupons cascade;
drop table if exists public.product_reviews cascade;
drop table if exists public.product_images cascade;
drop table if exists public.products cascade;
drop table if exists public.user_addresses cascade;
drop table if exists public.addresses cascade; -- legacy stub name

-- ── Products ─────────────────────────────────────────────────────────────────
create table public.products (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,
  name                     text not null,
  volume                   text,
  description              text,
  long_description         text,
  author                   text,
  author_bio               text,
  publisher                text,
  publisher_bio            text,
  language                 text default 'English',
  age_range                text,
  pages                    integer check (pages is null or pages > 0),
  weight_grams             integer check (weight_grams is null or weight_grams > 0),
  length_cm                numeric(6, 1) check (length_cm is null or length_cm > 0),
  width_cm                 numeric(6, 1) check (width_cm is null or width_cm > 0),
  height_cm                numeric(6, 1) check (height_cm is null or height_cm > 0),
  price_paise              integer not null check (price_paise >= 0),
  compare_at_paise         integer check (compare_at_paise is null or compare_at_paise >= 0),
  stock_qty                integer not null default 0 check (stock_qty >= 0),
  status                   public.product_status not null default 'draft',
  tag                      text,
  is_featured              boolean not null default false,
  features                 text[] not null default '{}',
  categories               text[] not null default '{}',
  kit_contents             jsonb not null default '[]'::jsonb,
  editorial_review         text,
  editorial_review_author  text,
  editorial_review_rating  integer check (
    editorial_review_rating is null
    or (editorial_review_rating >= 1 and editorial_review_rating <= 5)
  ),
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint products_compare_gte_price check (
    compare_at_paise is null or compare_at_paise >= price_paise
  )
);

comment on table public.products is
  'ODI Kids catalog. Prices in paise. Images live in product_images.';
comment on column public.products.kit_contents is
  'JSON array: [{name, qty, detail}]';
comment on column public.products.is_featured is
  'Featured Immersive Series on /products (live or coming_soon). Prefer ≤3.';
comment on column public.products.publisher_bio is
  'Checkout Publisher tab body.';
comment on column public.products.author_bio is
  'Checkout Author tab body.';
comment on column public.products.editorial_review is
  'Featured editorial blurb on checkout / cards.';
comment on column public.products.editorial_review_author is
  'Author of the featured editorial review.';
comment on column public.products.editorial_review_rating is
  'Star rating (1–5) for the editorial review.';
comment on column public.products.weight_grams is
  'Shippable parcel weight in grams (Delhivery / courier).';
comment on column public.products.length_cm is
  'Parcel length in cm (longest edge).';
comment on column public.products.width_cm is
  'Parcel width in cm.';
comment on column public.products.height_cm is
  'Parcel height in cm (stack height).';

create index products_status_idx on public.products (status);
create index products_sort_idx on public.products (sort_order, created_at);
create index products_featured_idx on public.products (is_featured, sort_order)
  where is_featured = true;
create index products_categories_gin on public.products using gin (categories);

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ── Product images ───────────────────────────────────────────────────────────
create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  url         text not null,
  alt         text,
  sort_order  integer not null default 0,
  is_primary  boolean not null default false,  -- legacy mirror of kind = 'card'
  kind        text not null default 'gallery' check (kind in ('card', 'gallery')),
  created_at  timestamptz not null default now()
);

comment on column public.product_images.kind is
  'card = hero / product cards; gallery = thumbnail strip (up to 8).';

create index product_images_product_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_card
  on public.product_images (product_id)
  where kind = 'card';

-- ── Product reviews (one per user per product) ───────────────────────────────
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

-- ── Favorites (wishlist) ─────────────────────────────────────────────────────
create table public.user_favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, product_id)
);

create index user_favorites_user_id_idx on public.user_favorites (user_id);
create index user_favorites_product_id_idx on public.user_favorites (product_id);

-- ── Notify Me (product launch waitlist) ──────────────────────────────────────
create table public.product_notify_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  -- Set when launch email is sent (job later). NULL = still waiting.
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, product_id)
);

comment on table public.product_notify_requests is
  'Storefront “Notify Me” waitlist. Join products.status for live vs coming_soon; do not denormalize status here.';
comment on column public.product_notify_requests.notified_at is
  'NULL until the product-went-live email is sent.';

create index product_notify_requests_user_idx
  on public.product_notify_requests (user_id, created_at desc);
create index product_notify_requests_product_pending_idx
  on public.product_notify_requests (product_id)
  where notified_at is null;

-- ── Notifications (in-app inbox) ─────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  metadata    jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  -- Cleared from bell preview; history page still lists the row
  cleared_at  timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.notifications is
  'In-app notification inbox. Waitlist subscriptions live in product_notify_requests.';
comment on column public.notifications.cleared_at is
  'Set when user clears the bell. Full history remains on /dashboard/inbox.';

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null and cleared_at is null;
create index notifications_user_uncleared_idx
  on public.notifications (user_id, created_at desc)
  where cleared_at is null;

-- ── Support tickets ──────────────────────────────────────────────────────────
create table public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  subject      text not null,
  message      text not null,
  status       public.support_ticket_status not null default 'open',
  admin_note   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.support_tickets is
  'Customer support tickets from the user inbox page.';

create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, created_at desc);

drop trigger if exists support_tickets_touch_updated_at on public.support_tickets;
create trigger support_tickets_touch_updated_at
  before update on public.support_tickets
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

-- ── Orders (UI may say “bookings”) ───────────────────────────────────────────
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
  delhivery_waybill   text,
  delhivery_status    text,
  delhivery_pickup_token text,
  delhivery_pickup_date text,
  delhivery_pickup_time text,
  delhivery_raw       jsonb,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS deny-all (service role bypasses)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_reviews enable row level security;
alter table public.user_addresses enable row level security;
alter table public.user_favorites enable row level security;
alter table public.product_notify_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.cart_items enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Next steps for a new environment
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Create a public Storage bucket named `product-images` (or set SUPABASE_STORAGE_BUCKET).
-- 2. Sign in via the app once, then promote your user to admin (SQL comment above).
-- 3. Add catalog via Admin → Products (or API). Prefer Storage public URLs for images.
-- 4. Configure Razorpay keys + webhook for checkout.
