-- Prevent duplicate manual Gmail links to the same opportunity.

CREATE UNIQUE INDEX IF NOT EXISTS interactions_opportunity_external_id_unique
  ON public.interactions(user_id, opportunity_id, external_id)
  WHERE opportunity_id IS NOT NULL AND external_id IS NOT NULL;
