-- Allow process/application emails to be attached directly to an opportunity
-- even when they come from generic ATS inboxes (no-reply, hiring team, etc.)
-- and should not create a person record.

ALTER TABLE public.interactions
  ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_contact_or_opportunity_check;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_contact_or_opportunity_check
  CHECK (contact_id IS NOT NULL OR opportunity_id IS NOT NULL);
