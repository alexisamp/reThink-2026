-- Canonicalize every legacy list membership, regardless of object type. The
-- previous compatibility path only copied contact_id and silently omitted
-- company and opportunity memberships.
insert into public.crm_list_entries (
  list_id, user_id, object_slug, record_id, current_stage,
  entered_at, stage_changed_at, notes, attributes, created_at, updated_at
)
select
  membership.list_id,
  membership.user_id,
  source.object_slug,
  source.record_id,
  membership.current_stage,
  membership.entered_at,
  membership.stage_changed_at,
  membership.notes,
  coalesce(membership.attributes, '{}'::jsonb),
  membership.created_at,
  coalesce(membership.stage_changed_at, membership.created_at)
from public.list_memberships membership
cross join lateral (
  values
    ('people'::text, membership.contact_id),
    ('companies'::text, membership.company_id),
    ('deals'::text, membership.opportunity_id)
) as source(object_slug, record_id)
where source.record_id is not null
on conflict (list_id, object_slug, record_id) do update set
  user_id = excluded.user_id,
  current_stage = excluded.current_stage,
  entered_at = excluded.entered_at,
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
    where list_id = old.list_id
      and (
        (object_slug = 'people' and record_id = old.contact_id) or
        (object_slug = 'companies' and record_id = old.company_id) or
        (object_slug = 'deals' and record_id = old.opportunity_id)
      );
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    old.list_id is distinct from new.list_id or
    old.contact_id is distinct from new.contact_id or
    old.company_id is distinct from new.company_id or
    old.opportunity_id is distinct from new.opportunity_id
  ) then
    delete from public.crm_list_entries
    where list_id = old.list_id
      and (
        (object_slug = 'people' and record_id = old.contact_id) or
        (object_slug = 'companies' and record_id = old.company_id) or
        (object_slug = 'deals' and record_id = old.opportunity_id)
      );
  end if;

  insert into public.crm_list_entries (
    list_id, user_id, object_slug, record_id, current_stage,
    entered_at, stage_changed_at, notes, attributes, created_at, updated_at
  )
  select
    new.list_id,
    new.user_id,
    source.object_slug,
    source.record_id,
    new.current_stage,
    new.entered_at,
    new.stage_changed_at,
    new.notes,
    coalesce(new.attributes, '{}'::jsonb),
    new.created_at,
    coalesce(new.stage_changed_at, new.created_at)
  from (
    values
      ('people'::text, new.contact_id),
      ('companies'::text, new.company_id),
      ('deals'::text, new.opportunity_id)
  ) as source(object_slug, record_id)
  where source.record_id is not null
  on conflict (list_id, object_slug, record_id) do update set
    user_id = excluded.user_id,
    current_stage = excluded.current_stage,
    entered_at = excluded.entered_at,
    stage_changed_at = excluded.stage_changed_at,
    notes = excluded.notes,
    attributes = excluded.attributes,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists sync_legacy_list_membership_to_crm_entry on public.list_memberships;
create trigger sync_legacy_list_membership_to_crm_entry
  after insert or update or delete on public.list_memberships
  for each row execute function public.sync_legacy_list_membership_to_crm_entry();
