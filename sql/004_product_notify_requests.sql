-- Additive migration for existing DBs (do not re-run full schema.sql).
-- Creates product launch waitlist for storefront “Notify Me”.

create table if not exists public.product_notify_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete cascade,
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, product_id)
);

comment on table public.product_notify_requests is
  'Storefront “Notify Me” waitlist. Join products.status for live vs coming_soon; do not denormalize status here.';
comment on column public.product_notify_requests.notified_at is
  'NULL until the product-went-live email is sent.';

create index if not exists product_notify_requests_user_idx
  on public.product_notify_requests (user_id, created_at desc);

create index if not exists product_notify_requests_product_pending_idx
  on public.product_notify_requests (product_id)
  where notified_at is null;

alter table public.product_notify_requests enable row level security;
