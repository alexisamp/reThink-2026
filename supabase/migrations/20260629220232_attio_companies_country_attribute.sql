-- Add the live Attio Companies Country attribute.
-- Metadata-only: no existing company records are changed.

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
  'country',
  'Country',
  'Text',
  'system',
  'enriched',
  true,
  true,
  false,
  false,
  false,
  true,
  76
FROM public.crm_objects o
WHERE o.slug = 'companies'
  AND o.object_type = 'standard'
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
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
