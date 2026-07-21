-- ═══════════════════════════════════════════════════════════════════════════
-- ODI · Users table
-- Run this in: Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- Auth model: Firebase handles sign-in (Google / email+password).
-- This table stores the application profile, keyed by the Firebase UID.
-- All access goes through the Express API using the service-role key,
-- so RLS is enabled with NO public policies (deny-all for anon/authenticated).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('active', 'inactive', 'banned');
exception when duplicate_object then null; end $$;

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            uuid        primary key default gen_random_uuid(),
  firebase_uid  text        not null unique,
  email         text        not null unique,
  full_name     text,
  avatar_url    text,
  phone         text,
  role          user_role   not null default 'user',
  provider      text        not null default 'password',  -- 'password' | 'google.com'
  status        user_status not null default 'active',
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.users              is 'Application user profiles. Authentication lives in Firebase; firebase_uid links the two.';
comment on column public.users.firebase_uid is 'Firebase Authentication UID (stable identifier from the ID token).';
comment on column public.users.provider     is 'Last sign-in provider reported by Firebase (password, google.com).';

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists users_email_idx      on public.users (email);
create index if not exists users_role_idx       on public.users (role);
create index if not exists users_created_at_idx on public.users (created_at desc);

-- ── updated_at auto-touch trigger ────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
  before update on public.users
  for each row
  execute function public.touch_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Enabled with no policies: the anon/authenticated Supabase keys can read
-- NOTHING. Only the backend (service role) can touch this table.
alter table public.users enable row level security;

-- ── Make yourself an admin (run AFTER your first login) ──────────────────────
-- update public.users set role = 'admin' where email = 'you@example.com';
