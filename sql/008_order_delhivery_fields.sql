-- Delhivery fulfillment fields on orders (waybill, pickup token, carrier status).
-- Run once on existing DBs after schema.sql.

alter table public.orders
  add column if not exists delhivery_waybill text,
  add column if not exists delhivery_status text,
  add column if not exists delhivery_pickup_token text,
  add column if not exists delhivery_raw jsonb;

create index if not exists orders_delhivery_waybill_idx on public.orders (delhivery_waybill)
  where delhivery_waybill is not null;
