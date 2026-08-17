-- Additive migration: product parcel dimensions for Delhivery / fulfillment.
-- Run in Supabase SQL Editor on an existing DB (do not re-run full schema.sql).

alter table public.products
  add column if not exists weight_grams integer
    check (weight_grams is null or weight_grams > 0);

alter table public.products
  add column if not exists length_cm numeric(6, 1)
    check (length_cm is null or length_cm > 0);

alter table public.products
  add column if not exists width_cm numeric(6, 1)
    check (width_cm is null or width_cm > 0);

alter table public.products
  add column if not exists height_cm numeric(6, 1)
    check (height_cm is null or height_cm > 0);

comment on column public.products.weight_grams is
  'Shippable parcel weight in grams (Delhivery / courier).';
comment on column public.products.length_cm is
  'Parcel length in cm (longest edge).';
comment on column public.products.width_cm is
  'Parcel width in cm.';
comment on column public.products.height_cm is
  'Parcel height in cm (stack height).';
