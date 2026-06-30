-- Align Companies attribute metadata with the live Attio object settings UI.
-- Metadata-only: no record data is changed.

WITH attrs(slug, key, name, attribute_type, source, is_system, is_enriched, is_relationship, is_required, is_unique, is_editable, sort_order) AS (
  VALUES
    ('companies','logo_url','Logo URL','Text','enriched',false,true,false,false,false,true,40),
    ('companies','facebook_url','Facebook','Text','enriched',false,true,false,false,false,true,80),
    ('companies','linkedin_url','LinkedIn','Text','enriched',false,true,false,false,false,true,90),
    ('companies','twitter_url','Twitter','Text','enriched',false,true,false,false,false,true,100),
    ('companies','angellist_url','AngelList','Text','enriched',false,true,false,false,false,true,110),
    ('companies','instagram_url','Instagram','Text','system',true,false,false,false,false,true,120),
    ('companies','estimated_arr','Estimated ARR','Select','enriched',false,true,false,false,false,false,140),
    ('companies','employees_count','Employee range','Select','enriched',false,true,false,false,false,true,170),
    ('companies','first_calendar_interaction','First calendar interaction','Interaction','enriched',false,true,false,false,false,false,171),
    ('companies','last_calendar_interaction','Last calendar interaction','Interaction','enriched',false,true,false,false,false,false,172),
    ('companies','next_calendar_interaction','Next calendar interaction','Interaction','enriched',false,true,false,false,false,false,173),
    ('companies','first_email_interaction','First email interaction','Interaction','enriched',false,true,false,false,false,false,174),
    ('companies','last_email_interaction','Last email interaction','Interaction','enriched',false,true,false,false,false,false,175),
    ('companies','first_interaction','First interaction','Interaction','enriched',false,true,false,false,false,false,180),
    ('companies','last_interaction','Last interaction','Interaction','enriched',false,true,false,false,false,false,190),
    ('companies','next_interaction','Next interaction','Interaction','enriched',false,true,false,false,false,false,200),
    ('companies','connection_strength_legacy','Connection strength (legacy)','Number','enriched',false,true,false,false,false,false,205),
    ('companies','connection_strength','Connection strength','Select','enriched',false,true,false,false,false,false,210)
)
INSERT INTO public.crm_attributes (
  user_id,
  object_id,
  key,
  name,
  attribute_type,
  scope,
  source,
  is_system,
  is_enriched,
  is_relationship,
  is_required,
  is_unique,
  is_editable,
  sort_order
)
SELECT
  o.user_id,
  o.id,
  a.key,
  a.name,
  a.attribute_type,
  CASE WHEN a.is_system THEN 'system' ELSE 'object' END,
  a.source,
  a.is_system,
  a.is_enriched,
  a.is_relationship,
  a.is_required,
  a.is_unique,
  a.is_editable,
  a.sort_order
FROM public.crm_objects o
JOIN attrs a ON a.slug = o.slug
WHERE o.object_type = 'standard'
ON CONFLICT (object_id, key) DO UPDATE SET
  name = EXCLUDED.name,
  attribute_type = EXCLUDED.attribute_type,
  scope = EXCLUDED.scope,
  source = EXCLUDED.source,
  is_system = EXCLUDED.is_system,
  is_enriched = EXCLUDED.is_enriched,
  is_relationship = EXCLUDED.is_relationship,
  is_required = EXCLUDED.is_required,
  is_unique = EXCLUDED.is_unique,
  is_editable = EXCLUDED.is_editable,
  sort_order = EXCLUDED.sort_order;
