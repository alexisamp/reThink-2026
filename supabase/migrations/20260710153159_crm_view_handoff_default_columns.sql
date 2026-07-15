with defaults(slug, columns) as (values
  ('companies', '["last_interaction","connection_strength","sector","domain","linkedin_url","twitter_url","twitter_follower_count","founded_year","hq_location","country","description"]'::jsonb),
  ('people', '["email","job_title","company","connection_strength","last_interaction_at","location","linkedin_url","phone_numbers"]'::jsonb),
  ('deals', '["owner","stage","estimated_value","company_id","associated_people","created_at"]'::jsonb)
)
update public.crm_views view_row
set columns = (
  select coalesce(jsonb_agg(column_key.value order by column_key.ordinality), '[]'::jsonb)
  from jsonb_array_elements_text(defaults.columns) with ordinality column_key(value, ordinality)
  where exists (
    select 1 from public.crm_attributes attribute_row
    where attribute_row.object_id = view_row.object_id
      and attribute_row.key = column_key.value
      and not attribute_row.is_archived
  )
)
from defaults
join public.crm_objects object_row on object_row.slug = defaults.slug
where view_row.object_id = object_row.id
  and view_row.view_type = 'table'
  and (view_row.is_default or view_row.legacy_key = 'table');
