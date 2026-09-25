-- Bulk / Offline orders (run on existing DBs that already have schema.sql)
-- Safe to re-run. Does not touch ONLINE checkout or Delhivery data.

do $$ begin
  create type public.order_channel as enum ('ONLINE', 'BULK_OFFLINE');
exception when duplicate_object then null;
end $$;

alter table public.orders
  add column if not exists channel public.order_channel not null default 'ONLINE';

alter table public.orders
  add column if not exists tax_paise integer not null default 0;

alter table public.orders
  add column if not exists bulk_payment_method text;

alter table public.orders
  add column if not exists bulk_notes text;

alter table public.orders
  add column if not exists created_by_admin_id uuid references public.users(id) on delete set null;

-- Bulk/offline buyers may not have an app account
alter table public.orders
  alter column user_id drop not null;

do $$ begin
  alter table public.orders
    add constraint orders_tax_paise_nonneg check (tax_paise >= 0);
exception when duplicate_object then null;
end $$;

create index if not exists orders_channel_created_idx
  on public.orders (channel, created_at desc);

comment on column public.orders.channel is
  'ONLINE = storefront checkout (may use Delhivery). BULK_OFFLINE = admin bulk/school sales (never ships via Delhivery).';

comment on column public.orders.bulk_payment_method is
  'Human label for bulk payment (UPI, Cash, Online, Bank Transfer, …). ONLINE orders leave this null.';

comment on column public.orders.created_by_admin_id is
  'Admin who created a BULK_OFFLINE order.';
