-- Additive: bell dismiss + support tickets
-- Safe to re-run on existing DBs.

alter table public.notifications
  add column if not exists cleared_at timestamptz;

comment on column public.notifications.cleared_at is
  'Set when user clears the bell preview. History page still shows the row.';

create index if not exists notifications_user_uncleared_idx
  on public.notifications (user_id, created_at desc)
  where cleared_at is null;

do $$ begin
  create type public.support_ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  subject      text not null,
  message      text not null,
  status       public.support_ticket_status not null default 'open',
  admin_note   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.support_tickets is
  'Customer support tickets from the user inbox page.';

create index if not exists support_tickets_user_idx
  on public.support_tickets (user_id, created_at desc);

create index if not exists support_tickets_status_idx
  on public.support_tickets (status, created_at desc);

drop trigger if exists support_tickets_touch_updated_at on public.support_tickets;
create trigger support_tickets_touch_updated_at
  before update on public.support_tickets
  for each row execute function public.touch_updated_at();

alter table public.support_tickets enable row level security;
