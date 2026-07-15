create table if not exists public.recurring_task_series (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  time_minutes integer check (time_minutes is null or (time_minutes >= 0 and time_minutes < 1440)),
  days integer[] not null default '{}',
  start_date date not null,
  end_type text not null default 'never' check (end_type in ('never', 'date', 'count')),
  end_date date,
  end_count integer check (end_count is null or end_count > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_task_series_user_id
  on public.recurring_task_series(user_id);

alter table public.recurring_task_series enable row level security;

drop policy if exists "recurring_task_series_select_own" on public.recurring_task_series;
create policy "recurring_task_series_select_own"
  on public.recurring_task_series
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "recurring_task_series_insert_own" on public.recurring_task_series;
create policy "recurring_task_series_insert_own"
  on public.recurring_task_series
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "recurring_task_series_update_own" on public.recurring_task_series;
create policy "recurring_task_series_update_own"
  on public.recurring_task_series
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "recurring_task_series_delete_own" on public.recurring_task_series;
create policy "recurring_task_series_delete_own"
  on public.recurring_task_series
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.recurring_task_series to authenticated;
