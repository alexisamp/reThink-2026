-- Normalized, user-owned view definitions shared by object collections and Lists.
create table if not exists public.crm_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_id uuid not null references public.crm_objects(id) on delete cascade,
  list_id uuid references public.lists(id) on delete cascade,
  legacy_key text,
  title text not null,
  view_type text not null default 'table' check (view_type in ('table', 'kanban')),
  columns jsonb not null default '[]'::jsonb check (jsonb_typeof(columns) = 'array'),
  column_widths jsonb not null default '{}'::jsonb check (jsonb_typeof(column_widths) = 'object'),
  filters jsonb not null default '[]'::jsonb check (jsonb_typeof(filters) = 'array'),
  sorts jsonb not null default '[]'::jsonb check (jsonb_typeof(sorts) = 'array'),
  density text not null default 'standard' check (density in ('standard', 'compact')),
  show_attribute_names boolean not null default true,
  group_by_attribute_key text,
  stage_settings jsonb not null default '[]'::jsonb check (jsonb_typeof(stage_settings) = 'array'),
  is_favorite boolean not null default false,
  is_default boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_views_object
  on public.crm_views (user_id, object_id, position, created_at);
create index if not exists idx_crm_views_list
  on public.crm_views (list_id, position, created_at)
  where list_id is not null;
create unique index if not exists idx_crm_views_list_legacy
  on public.crm_views (list_id, legacy_key)
  where list_id is not null and legacy_key is not null;
create unique index if not exists idx_crm_views_default_object
  on public.crm_views (user_id, object_id)
  where list_id is null and is_default;

drop trigger if exists crm_views_updated_at on public.crm_views;
create trigger crm_views_updated_at
  before update on public.crm_views
  for each row execute function public.handle_updated_at();

alter table public.crm_views enable row level security;

drop policy if exists "crm_views_owner_select" on public.crm_views;
create policy "crm_views_owner_select" on public.crm_views
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "crm_views_owner_insert" on public.crm_views;
create policy "crm_views_owner_insert" on public.crm_views
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.crm_objects object_row
      where object_row.id = object_id and object_row.user_id = (select auth.uid())
    )
    and (
      list_id is null
      or exists (
        select 1 from public.lists list_row
        where list_row.id = list_id and list_row.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "crm_views_owner_update" on public.crm_views;
create policy "crm_views_owner_update" on public.crm_views
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "crm_views_owner_delete" on public.crm_views;
create policy "crm_views_owner_delete" on public.crm_views
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.crm_views to authenticated;

-- Promote the legacy per-list JSON views into normalized rows.
insert into public.crm_views (
  user_id, object_id, list_id, legacy_key, title, view_type, columns,
  group_by_attribute_key, stage_settings, position
)
select
  list_row.user_id,
  object_row.id,
  list_row.id,
  coalesce(view_row.value ->> 'id', 'view-' || view_row.ordinality::text),
  coalesce(view_row.value ->> 'title', initcap(coalesce(view_row.value ->> 'type', 'table'))),
  case when view_row.value ->> 'type' = 'kanban' then 'kanban' else 'table' end,
  case when jsonb_typeof(view_row.value -> 'columns') = 'array' then view_row.value -> 'columns' else '[]'::jsonb end,
  case when view_row.value ->> 'type' = 'kanban' then coalesce(view_row.value ->> 'groupByAttributeKey', 'stage') else null end,
  case when jsonb_typeof(view_row.value -> 'stages') = 'array' then view_row.value -> 'stages' else coalesce(to_jsonb(list_row.stages), '[]'::jsonb) end,
  (view_row.ordinality - 1)::integer
from public.lists list_row
join public.crm_objects object_row
  on object_row.user_id = list_row.user_id and object_row.slug = list_row.object_slug
cross join lateral jsonb_array_elements(coalesce(list_row.views, '[]'::jsonb)) with ordinality as view_row(value, ordinality)
on conflict (list_id, legacy_key) where list_id is not null and legacy_key is not null do nothing;

update public.lists list_row
set active_view_id = matched.id::text
from public.crm_views matched
where matched.list_id = list_row.id
  and matched.legacy_key = list_row.active_view_id;

with fallback as (
  select distinct on (view_row.list_id) view_row.list_id, view_row.id
  from public.crm_views view_row
  where view_row.list_id is not null
  order by view_row.list_id, view_row.position, view_row.created_at
)
update public.lists list_row
set active_view_id = fallback.id::text
from fallback
where fallback.list_id = list_row.id
and not exists (
  select 1 from public.crm_views active
  where active.list_id = list_row.id and active.id::text = list_row.active_view_id
);

-- Seed one durable default table view for every enabled object.
insert into public.crm_views (
  user_id, object_id, legacy_key, title, view_type, columns, is_default, position
)
select
  object_row.user_id,
  object_row.id,
  'all',
  'All ' || object_row.plural_name,
  'table',
  coalesce(attribute_rows.columns, '[]'::jsonb),
  true,
  0
from public.crm_objects object_row
left join lateral (
  select jsonb_agg(attribute_row.key order by attribute_row.sort_order, attribute_row.created_at) as columns
  from (
    select attr.key, attr.sort_order, attr.created_at
    from public.crm_attributes attr
    where attr.object_id = object_row.id
      and not attr.is_archived
      and not attr.is_relationship
      and attr.key not in ('record_id', 'list_entries', 'created_by')
    order by attr.sort_order, attr.created_at
    limit 8
  ) attribute_row
) attribute_rows on true
where object_row.is_enabled and not object_row.is_archived
on conflict (user_id, object_id) where list_id is null and is_default do nothing;

-- Re-run the People membership backfill to capture writes after the first migration.
insert into public.crm_list_entries (
  list_id, user_id, object_slug, record_id, current_stage,
  entered_at, stage_changed_at, notes, attributes, created_at, updated_at
)
select
  membership.list_id,
  membership.user_id,
  'people',
  membership.contact_id,
  membership.current_stage,
  membership.entered_at,
  membership.stage_changed_at,
  membership.notes,
  coalesce(membership.attributes, '{}'::jsonb),
  membership.created_at,
  coalesce(membership.stage_changed_at, membership.created_at)
from public.list_memberships membership
where membership.contact_id is not null
on conflict (list_id, object_slug, record_id) do update set
  current_stage = excluded.current_stage,
  stage_changed_at = excluded.stage_changed_at,
  notes = excluded.notes,
  attributes = excluded.attributes,
  updated_at = excluded.updated_at;

create or replace function public.sync_legacy_list_membership_to_crm_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.crm_list_entries
    where list_id = old.list_id and object_slug = 'people' and record_id = old.contact_id;
    return old;
  end if;

  if new.contact_id is not null then
    insert into public.crm_list_entries (
      list_id, user_id, object_slug, record_id, current_stage,
      entered_at, stage_changed_at, notes, attributes, created_at, updated_at
    ) values (
      new.list_id, new.user_id, 'people', new.contact_id, new.current_stage,
      new.entered_at, new.stage_changed_at, new.notes, coalesce(new.attributes, '{}'::jsonb),
      new.created_at, coalesce(new.stage_changed_at, new.created_at)
    )
    on conflict (list_id, object_slug, record_id) do update set
      current_stage = excluded.current_stage,
      stage_changed_at = excluded.stage_changed_at,
      notes = excluded.notes,
      attributes = excluded.attributes,
      updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_legacy_list_membership_to_crm_entry on public.list_memberships;
create trigger sync_legacy_list_membership_to_crm_entry
  after insert or update or delete on public.list_memberships
  for each row execute function public.sync_legacy_list_membership_to_crm_entry();
