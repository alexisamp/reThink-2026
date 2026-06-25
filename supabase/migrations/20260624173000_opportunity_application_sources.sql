-- Track job/recruiting source domains separately from the company domain.
-- Example: Adaptive is the company, but application emails can come from
-- adaptive-build.recruitee.com, greenhouse.io, ashbyhq.com, lever.co, etc.

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS application_source_url text,
  ADD COLUMN IF NOT EXISTS application_source_domain text,
  ADD COLUMN IF NOT EXISTS application_source_name text;

CREATE INDEX IF NOT EXISTS idx_opportunities_application_source_domain
  ON public.opportunities(user_id, application_source_domain)
  WHERE application_source_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_opportunity_id
  ON public.interactions(user_id, opportunity_id)
  WHERE opportunity_id IS NOT NULL;
