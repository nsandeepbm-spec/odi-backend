-- Production / existing DB: unpaid online checkout lifecycle
-- Safe to run once on Supabase SQL editor (also embedded in schema.sql).

alter table public.orders
  add column if not exists payment_close_reason text;

create index if not exists orders_unpaid_online_pending_idx
  on public.orders (created_at)
  where status = 'pending' and razorpay_order_id is not null;
