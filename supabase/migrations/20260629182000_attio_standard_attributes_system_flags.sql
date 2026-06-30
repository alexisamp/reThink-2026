-- In Attio, official attributes on standard objects display as System
-- attributes, while also retaining Enriched or Relationship properties.

UPDATE public.crm_attributes a
SET
  is_system = true,
  scope = 'system',
  updated_at = now()
FROM public.crm_objects o
WHERE o.id = a.object_id
  AND o.object_type = 'standard'
  AND a.source <> 'custom';
