-- Backend resources required by the high-fidelity Today cockpit.

alter table public.reviews
  add column if not exists objective_link_kind text,
  add column if not exists objective_link_id uuid,
  add column if not exists objective_link_label text,
  add column if not exists objective_link_logo text;

alter table public.reviews
  drop constraint if exists reviews_objective_link_kind_check;

alter table public.reviews
  add constraint reviews_objective_link_kind_check
  check (objective_link_kind is null or objective_link_kind in ('person', 'company', 'opportunity'));

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.outreach_logs(id) on delete cascade,
  event_type text not null check (length(trim(event_type)) > 0),
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (length(trim(source)) > 0),
  source_external_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, source, source_external_id)
);

alter table public.outreach_events
  add column if not exists list_id uuid references public.lists(id) on delete set null,
  add column if not exists membership_id uuid references public.list_memberships(id) on delete set null;

alter table public.outreach_events add column if not exists occurred_on date;
update public.outreach_events set occurred_on = (occurred_at at time zone 'UTC')::date where occurred_on is null;
alter table public.outreach_events alter column occurred_on set default current_date;
alter table public.outreach_events alter column occurred_on set not null;

create index if not exists outreach_events_user_day_type_idx
  on public.outreach_events(user_id, occurred_on, event_type);
create index if not exists outreach_events_user_type_time_idx
  on public.outreach_events(user_id, event_type, occurred_at desc);

alter table public.outreach_events enable row level security;
drop policy if exists "outreach_events_select_own" on public.outreach_events;
create policy "outreach_events_select_own" on public.outreach_events for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "outreach_events_insert_own" on public.outreach_events;
create policy "outreach_events_insert_own" on public.outreach_events for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "outreach_events_update_own" on public.outreach_events;
create policy "outreach_events_update_own" on public.outreach_events for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "outreach_events_delete_own" on public.outreach_events;
create policy "outreach_events_delete_own" on public.outreach_events for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.outreach_events to authenticated;

create table if not exists public.today_metric_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  funnel_targets jsonb not null default '{"reached":{"day":12,"week":60},"accepted":{"day":8,"week":40},"replies":{"day":10,"week":50},"meetings":{"day":4,"week":20},"intros":{"day":3,"week":15}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.today_metric_settings enable row level security;
drop policy if exists "today_metric_settings_select_own" on public.today_metric_settings;
create policy "today_metric_settings_select_own" on public.today_metric_settings for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "today_metric_settings_insert_own" on public.today_metric_settings;
create policy "today_metric_settings_insert_own" on public.today_metric_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "today_metric_settings_update_own" on public.today_metric_settings;
create policy "today_metric_settings_update_own" on public.today_metric_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update on public.today_metric_settings to authenticated;

create table if not exists public.recurring_task_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id text not null references public.recurring_task_series(id) on delete cascade,
  occurrence_date date not null,
  action text not null check (action in ('skip', 'modify')),
  todo_id uuid references public.todos(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, series_id, occurrence_date)
);

alter table public.recurring_task_exceptions enable row level security;
drop policy if exists "recurring_task_exceptions_own" on public.recurring_task_exceptions;
create policy "recurring_task_exceptions_own" on public.recurring_task_exceptions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.recurring_task_exceptions to authenticated;

create or replace function public.enforce_daily_must_do_cap()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.must_do is true and new.date is not null and new.completed is not true and new.backlog_at is null then
    if (
      select count(*)
      from public.todos t
      where t.user_id = new.user_id
        and t.date = new.date
        and t.must_do is true
        and t.completed is not true
        and t.backlog_at is null
        and t.id <> new.id
    ) >= 2 then
      raise exception using errcode = 'P0001', message = 'TODAY_MUST_DO_CAP';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists todos_daily_must_do_cap on public.todos;
create trigger todos_daily_must_do_cap
  before insert or update of must_do, date, completed, backlog_at on public.todos
  for each row execute function public.enforce_daily_must_do_cap();
