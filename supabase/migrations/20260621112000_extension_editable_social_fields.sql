-- Support manual extension edits for Attio-like all-values fields.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS primary_location text,
  ADD COLUMN IF NOT EXISTS angellist_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS twitter_url text;
ALTER TABLE public.outreach_logs
  ADD COLUMN IF NOT EXISTS angellist_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS twitter_url text;
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS close_date date,
  ADD COLUMN IF NOT EXISTS owner_contact_id uuid REFERENCES public.outreach_logs(id) ON DELETE SET NULL;
