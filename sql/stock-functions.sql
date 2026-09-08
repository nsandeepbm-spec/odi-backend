-- Atomic product stock RPCs.
-- Safe on an existing Supabase project: CREATE OR REPLACE only — does not drop tables.
--
-- How to run:
--   1. Open Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file → Run
--
-- Checkout / pay / COD / cancel use these via the API service role.
-- If they are missing, the API still updates stock, but not atomically.

create or replace function public.decrement_product_stock(p_product_id uuid, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_qty integer;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'quantity must be positive';
  end if;
  update public.products
     set stock_qty = stock_qty - p_qty
   where id = p_product_id
     and stock_qty >= p_qty
  returning stock_qty into new_qty;
  if not found then
    raise exception 'insufficient stock';
  end if;
  return new_qty;
end;
$$;

create or replace function public.increment_product_stock(p_product_id uuid, p_qty integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_qty integer;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'quantity must be positive';
  end if;
  update public.products
     set stock_qty = stock_qty + p_qty
   where id = p_product_id
  returning stock_qty into new_qty;
  if not found then
    raise exception 'product not found';
  end if;
  return new_qty;
end;
$$;

revoke execute on function public.decrement_product_stock(uuid, integer) from public, anon, authenticated;
revoke execute on function public.increment_product_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.decrement_product_stock(uuid, integer) to service_role;
grant execute on function public.increment_product_stock(uuid, integer) to service_role;
