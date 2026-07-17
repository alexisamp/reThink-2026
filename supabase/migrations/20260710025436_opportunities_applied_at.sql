alter table public.opportunities
  add column if not exists applied_at timestamptz;

create or replace function public.set_opportunity_applied_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if lower(new.stage) = 'applied'
    and (tg_op = 'INSERT' or lower(old.stage) <> 'applied')
    and new.applied_at is null then
    new.applied_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_set_applied_at on public.opportunities;
create trigger opportunities_set_applied_at
  before insert or update of stage
  on public.opportunities
  for each row execute function public.set_opportunity_applied_at();

-- Existing rows have no transition history. Creation time is the only
-- defensible backfill and preserves the one job verifiably created this week.
update public.opportunities
set applied_at = created_at
where lower(stage) = 'applied'
  and applied_at is null;

create index if not exists opportunities_user_applied_at_idx
  on public.opportunities(user_id, applied_at desc)
  where applied_at is not null;
