-- Fill gaps against Attio's official standard object attribute tables.
-- This is metadata-only: it inserts missing crm_attributes and removes one
-- non-official Deals metadata row from the original seed. It does not touch
-- legacy People, Companies, Opportunities, Lists, or user record data.

WITH attrs(slug, key, name, attribute_type, source, is_system, is_enriched, is_relationship, is_required, is_unique, is_editable, sort_order) AS (
  VALUES
    ('people','phone_numbers','Phone numbers','Phone','system',true,false,false,false,false,true,50),
    ('people','owner','Owner','User','system',true,false,false,false,false,true,60),
    ('people','description','Description','Text','enriched',false,true,false,false,false,true,70),
    ('people','facebook_url','Facebook','URL','enriched',false,true,false,false,false,true,90),
    ('people','twitter_url','Twitter','URL','enriched',false,true,false,false,false,true,110),
    ('people','angellist_url','AngelList','URL','enriched',false,true,false,false,false,true,120),
    ('people','instagram_url','Instagram','URL','custom',false,false,false,false,false,true,130),
    ('people','employee_range','Employee range','Number','enriched',false,true,false,false,false,true,140),
    ('people','first_interaction','First interaction','Interaction','enriched',false,true,false,false,false,false,150),
    ('people','next_interaction','Next interaction','Interaction','enriched',false,true,false,false,false,false,170),
    ('people','strongest_connection','Strongest connection','User','enriched',false,true,false,false,false,false,190),
    ('people','associated_deals','Associated deals','Relationship','relationship',false,false,true,false,false,true,200),
    ('people','associated_companies','Associated companies','Relationship','relationship',false,false,true,false,false,true,210),
    ('people','associated_users','Associated users','Relationship','relationship',false,false,true,false,false,true,220),
    ('people','associated_workspaces','Associated workspaces','Relationship','relationship',false,false,true,false,false,true,230),

    ('companies','facebook_url','Facebook','URL','enriched',false,true,false,false,false,true,70),
    ('companies','twitter_url','Twitter','URL','enriched',false,true,false,false,false,true,90),
    ('companies','angellist_url','AngelList','URL','enriched',false,true,false,false,false,true,100),
    ('companies','instagram_url','Instagram','URL','custom',false,false,false,false,false,true,110),
    ('companies','twitter_follower_count','Twitter follower count','Number','enriched',false,true,false,false,false,true,120),
    ('companies','funding_raised','Funding raised','Currency','enriched',false,true,false,false,false,true,140),
    ('companies','first_interaction','First interaction','Interaction','enriched',false,true,false,false,false,false,170),
    ('companies','last_interaction','Last interaction','Interaction','enriched',false,true,false,false,false,false,180),
    ('companies','next_interaction','Next interaction','Interaction','enriched',false,true,false,false,false,false,190),
    ('companies','connection_strength','Connection strength','Number','enriched',false,true,false,false,false,false,200),
    ('companies','strongest_connection','Strongest connection','User','enriched',false,true,false,false,false,false,210),
    ('companies','associated_workspaces','Associated workspaces','Relationship','relationship',false,false,true,false,false,true,230)
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

DELETE FROM public.crm_attributes a
USING public.crm_objects o
WHERE a.object_id = o.id
  AND o.object_type = 'standard'
  AND o.slug = 'deals'
  AND a.key = 'target_date'
  AND a.source = 'custom';
