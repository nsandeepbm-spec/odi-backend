-- Existing databases: paste into Supabase SQL Editor and Run.
-- Safe to re-run. Does not drop other tables. API seeds official copy on first GET.

create table if not exists public.legal_company (
  id             smallint primary key default 1 check (id = 1),
  brand          text not null,
  entity         text not null,
  address        text not null,
  gstin          text not null,
  email          text not null,
  phone          text not null,
  website_href   text not null,
  website_label  text not null,
  updated_at     timestamptz not null default now()
);

comment on table public.legal_company is
  'Singleton company block shown on legal pages. Seeded by the API on first read.';

drop trigger if exists legal_company_touch_updated_at on public.legal_company;
create trigger legal_company_touch_updated_at
  before update on public.legal_company
  for each row execute function public.touch_updated_at();

create table if not exists public.legal_pages (
  slug             text primary key check (slug in ('terms', 'privacy', 'cookies')),
  eyebrow          text not null default 'Legal',
  title            text not null,
  title_accent     text not null default '',
  intro            text not null default '',
  effective_date   text not null,
  last_updated     text not null,
  sections         jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.users(id) on delete set null
);

comment on table public.legal_pages is
  'CMS copy for /terms, /privacy, /cookies. sections = [{ id, title, blocks }].';

drop trigger if exists legal_pages_touch_updated_at on public.legal_pages;
create trigger legal_pages_touch_updated_at
  before update on public.legal_pages
  for each row execute function public.touch_updated_at();

alter table public.legal_company enable row level security;
alter table public.legal_pages enable row level security;
