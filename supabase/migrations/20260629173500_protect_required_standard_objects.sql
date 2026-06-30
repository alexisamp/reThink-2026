-- Match Attio semantics: People and Companies are required standard objects
-- and cannot be deactivated. This protects the rule below the UI layer.

ALTER TABLE public.crm_objects
  ADD CONSTRAINT crm_objects_people_companies_enabled
  CHECK (NOT (object_type = 'standard' AND slug IN ('people', 'companies') AND is_enabled = false));
