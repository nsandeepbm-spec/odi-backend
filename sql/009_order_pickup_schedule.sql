-- Pickup schedule columns (admin Pickups → Scheduled tab).
-- Run once on existing DBs after 008_order_delhivery_fields.sql.

alter table public.orders
  add column if not exists delhivery_pickup_date text,
  add column if not exists delhivery_pickup_time text;

-- Backfill from delhivery_raw.pickup_schedule when present
update public.orders
set
  delhivery_pickup_date = delhivery_raw->'pickup_schedule'->>'date',
  delhivery_pickup_time = coalesce(
    delhivery_raw->'pickup_schedule'->>'time',
    delhivery_pickup_time
  )
where delhivery_pickup_token is not null
  and delhivery_pickup_date is null
  and delhivery_raw->'pickup_schedule'->>'date' is not null;

create index if not exists orders_delhivery_pickup_date_idx on public.orders (delhivery_pickup_date desc)
  where delhivery_pickup_token is not null;
