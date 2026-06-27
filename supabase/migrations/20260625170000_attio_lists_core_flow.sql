-- Attio-style lists: object-scoped lists, list-entry attributes, and saved views.
-- This migration preserves existing list rows and memberships.

alter table public.lists
  add column if not exists parent_object text;

update public.lists l
set parent_object = inferred.parent_object
from (
  select
    lm.list_id,
    case
      when bool_or(lm.opportunity_id is not null) then 'opportunity'
      when bool_or(lm.company_id is not null) then 'company'
      else 'person'
    end as parent_object
  from public.list_memberships lm
  group by lm.list_id
) inferred
where l.id = inferred.list_id
  and l.parent_object is null;

update public.lists
set parent_object = 'person'
where parent_object is null;

alter table public.lists
  alter column parent_object set default 'person',
  alter column parent_object set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lists_parent_object_check'
      and conrelid = 'public.lists'::regclass
  ) then
    alter table public.lists
      add constraint lists_parent_object_check
      check (parent_object in ('person', 'company', 'opportunity'));
  end if;
end $$;

alter table public.list_memberships
  add column if not exists attributes jsonb not null default '{}'::jsonb;

update public.list_memberships
set attributes = '{}'::jsonb
where attributes is null;

alter table public.list_memberships
  alter column attributes set default '{}'::jsonb,
  alter column attributes set not null;

alter table public.list_memberships
  alter column current_stage drop not null;

alter table public.list_memberships
  drop constraint if exists list_memberships_list_id_contact_id_key;

drop index if exists public.uniq_list_memberships_contact;
drop index if exists public.uniq_list_memberships_company;
drop index if exists public.uniq_list_memberships_opportunity;

create table if not exists public.list_attributes (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('text', 'number', 'date', 'select', 'status', 'url', 'checkbox')),
  config jsonb not null default '{}'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_list_attributes_list_id on public.list_attributes(list_id, order_index);
create index if not exists idx_list_attributes_user_id on public.list_attributes(user_id);

alter table public.list_attributes enable row level security;

drop policy if exists "Users can view own list attributes" on public.list_attributes;
create policy "Users can view own list attributes"
  on public.list_attributes for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own list attributes" on public.list_attributes;
create policy "Users can insert own list attributes"
  on public.list_attributes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own list attributes" on public.list_attributes;
create policy "Users can update own list attributes"
  on public.list_attributes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own list attributes" on public.list_attributes;
create policy "Users can delete own list attributes"
  on public.list_attributes for delete
  using (auth.uid() = user_id);

drop trigger if exists update_list_attributes_updated_at on public.list_attributes;
create trigger update_list_attributes_updated_at
  before update on public.list_attributes
  for each row execute function public.handle_updated_at();

create table if not exists public.list_views (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('table', 'kanban')),
  config jsonb not null default '{}'::jsonb,
  order_index integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_list_views_list_id on public.list_views(list_id, order_index);
create index if not exists idx_list_views_user_id on public.list_views(user_id);
create unique index if not exists uniq_list_views_default
  on public.list_views(list_id)
  where is_default;

alter table public.list_views enable row level security;

drop policy if exists "Users can view own list views" on public.list_views;
create policy "Users can view own list views"
  on public.list_views for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own list views" on public.list_views;
create policy "Users can insert own list views"
  on public.list_views for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own list views" on public.list_views;
create policy "Users can update own list views"
  on public.list_views for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own list views" on public.list_views;
create policy "Users can delete own list views"
  on public.list_views for delete
  using (auth.uid() = user_id);

drop trigger if exists update_list_views_updated_at on public.list_views;
create trigger update_list_views_updated_at
  before update on public.list_views
  for each row execute function public.handle_updated_at();
