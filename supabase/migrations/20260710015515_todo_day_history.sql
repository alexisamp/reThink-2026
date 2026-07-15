create table if not exists public.todo_day_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  todo_id uuid not null,
  plan_date date not null,
  snapshot jsonb not null,
  captured_at timestamptz not null default now(),
  unique (user_id, todo_id, plan_date)
);

create index if not exists todo_day_history_user_date_idx
  on public.todo_day_history(user_id, plan_date, captured_at desc);

alter table public.todo_day_history enable row level security;

drop policy if exists "todo_day_history_select_own" on public.todo_day_history;
create policy "todo_day_history_select_own" on public.todo_day_history
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "todo_day_history_insert_own" on public.todo_day_history;
create policy "todo_day_history_insert_own" on public.todo_day_history
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "todo_day_history_update_own" on public.todo_day_history;
create policy "todo_day_history_update_own" on public.todo_day_history
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.todo_day_history to authenticated;

create or replace function public.capture_todo_day_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.date is not null and old.date ~ '^\d{4}-\d{2}-\d{2}$' then
    insert into public.todo_day_history(user_id, todo_id, plan_date, snapshot, captured_at)
    values(old.user_id, old.id, old.date::date, to_jsonb(old), now())
    on conflict (user_id, todo_id, plan_date) do update
      set snapshot = excluded.snapshot, captured_at = excluded.captured_at;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.date is not null and new.date ~ '^\d{4}-\d{2}-\d{2}$' then
    insert into public.todo_day_history(user_id, todo_id, plan_date, snapshot, captured_at)
    values(new.user_id, new.id, new.date::date, to_jsonb(new), now())
    on conflict (user_id, todo_id, plan_date) do update
      set snapshot = excluded.snapshot, captured_at = excluded.captured_at;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists todos_capture_day_history on public.todos;
create trigger todos_capture_day_history
  after insert or update or delete on public.todos
  for each row execute function public.capture_todo_day_history();

insert into public.todo_day_history(user_id, todo_id, plan_date, snapshot, captured_at)
select user_id, id, date::date, to_jsonb(todos), coalesce(created_at, now())
from public.todos
where date is not null and date ~ '^\d{4}-\d{2}-\d{2}$'
on conflict (user_id, todo_id, plan_date) do update
  set snapshot = excluded.snapshot, captured_at = excluded.captured_at;
