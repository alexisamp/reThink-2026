alter table public.companies
  add column if not exists favicon_url text;

insert into public.crm_attributes (
  object_id,
  user_id,
  key,
  name,
  attribute_type,
  source,
  is_system,
  is_enriched,
  is_editable,
  is_unique,
  is_required,
  sort_order
)
select
  object.id,
  object.user_id,
  'favicon_url',
  'Favicon URL',
  'URL',
  'enriched',
  false,
  true,
  false,
  false,
  false,
  41
from public.crm_objects object
where object.slug = 'companies'
on conflict (object_id, key) do update
set
  name = excluded.name,
  attribute_type = excluded.attribute_type,
  source = excluded.source,
  is_enriched = excluded.is_enriched,
  is_editable = excluded.is_editable,
  sort_order = excluded.sort_order;
