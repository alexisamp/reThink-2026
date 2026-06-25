-- Let extension list memberships attach to companies and opportunities, not only people.

ALTER TABLE public.list_memberships
  ALTER COLUMN contact_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_list_memberships_company
  ON public.list_memberships(company_id)
  WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_list_memberships_opportunity
  ON public.list_memberships(opportunity_id)
  WHERE opportunity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_list_memberships_company
  ON public.list_memberships(list_id, company_id)
  WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_list_memberships_opportunity
  ON public.list_memberships(list_id, opportunity_id)
  WHERE opportunity_id IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'list_memberships_one_record'
      AND conrelid = 'public.list_memberships'::regclass
  ) THEN
    ALTER TABLE public.list_memberships
      ADD CONSTRAINT list_memberships_one_record
      CHECK (num_nonnulls(contact_id, company_id, opportunity_id) = 1);
  END IF;
END $$;
