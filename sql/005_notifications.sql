-- Additive: in-app notifications inbox (email is separate / later).
-- Skip if you already created an equivalent `notifications` table in Supabase.

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  metadata    jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.notifications is
  'In-app notification inbox for user + admin dashboards. Separate from product_notify_requests waitlist.';

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;
