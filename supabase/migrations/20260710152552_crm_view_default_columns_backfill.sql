with object_columns as (
  select object_row.id as object_id,
    coalesce(jsonb_agg(attribute_row.key order by attribute_row.sort_order, attribute_row.created_at)
      filter (where attribute_row.key is not null), '[]'::jsonb) as columns
  from public.crm_objects object_row
  left join lateral (
    select attr.key, attr.sort_order, attr.created_at
    from public.crm_attributes attr
    where attr.object_id = object_row.id
      and not attr.is_archived
      and not attr.is_relationship
      and attr.key not in ('record_id', 'list_entries', 'created_by')
    order by attr.sort_order, attr.created_at
    limit 8
  ) attribute_row on true
  group by object_row.id
)
update public.crm_views view_row
set columns = object_columns.columns
from object_columns
where view_row.object_id = object_columns.object_id
  and jsonb_array_length(view_row.columns) = 0
  and view_row.view_type = 'table';

update public.crm_views view_row
set group_by_attribute_key = '__stage'
where view_row.list_id is not null and view_row.view_type = 'kanban';
