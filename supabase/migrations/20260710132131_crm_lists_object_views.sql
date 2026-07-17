-- Additive list metadata for the full-app handoff. Existing relationship lists
-- remain People lists and continue to use list_memberships without disruption.
alter table public.lists
  add column if not exists object_slug text not null default 'people',
  add column if not exists views jsonb not null default '[{"id":"table","type":"table","title":"Table","columns":[]},{"id":"kanban","type":"kanban","title":"Kanban","columns":[]}]'::jsonb,
  add column if not exists active_view_id text not null default 'table';

create index if not exists idx_lists_user_object
  on public.lists (user_id, object_slug, created_at)
  where not is_archived;

create table if not exists public.crm_list_entries (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_slug text not null,
  record_id uuid not null,
  current_stage text,
  entered_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  notes text,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, object_slug, record_id)
);

create index if not exists idx_crm_list_entries_list_stage
  on public.crm_list_entries (list_id, current_stage, entered_at);
create index if not exists idx_crm_list_entries_record
  on public.crm_list_entries (user_id, object_slug, record_id);

insert into public.crm_list_entries (
  list_id, user_id, object_slug, record_id, current_stage,
  entered_at, stage_changed_at, notes, attributes, created_at
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
  membership.created_at
from public.list_memberships membership
where membership.contact_id is not null
on conflict (list_id, object_slug, record_id) do update set
  current_stage = excluded.current_stage,
  stage_changed_at = excluded.stage_changed_at,
  notes = excluded.notes,
  attributes = excluded.attributes;

alter table public.crm_list_entries enable row level security;

drop policy if exists "crm_list_entries_owner_select" on public.crm_list_entries;
create policy "crm_list_entries_owner_select" on public.crm_list_entries
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "crm_list_entries_owner_insert" on public.crm_list_entries;
create policy "crm_list_entries_owner_insert" on public.crm_list_entries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "crm_list_entries_owner_update" on public.crm_list_entries;
create policy "crm_list_entries_owner_update" on public.crm_list_entries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "crm_list_entries_owner_delete" on public.crm_list_entries;
create policy "crm_list_entries_owner_delete" on public.crm_list_entries
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.crm_list_entries to authenticated;
