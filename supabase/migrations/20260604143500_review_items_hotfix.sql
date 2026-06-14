-- Hotfix: Conversations identity-resolution queue.
-- Notion is not a data source; valid review sources are conversations/manual.

CREATE TABLE IF NOT EXISTS public.review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_external_id text,
  source_url text,
  title text NOT NULL,
  body text,
  proposed_target text NOT NULL,
  proposed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_id uuid REFERENCES public.outreach_logs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.review_items
  DROP CONSTRAINT IF EXISTS review_items_source_check;
ALTER TABLE public.review_items
  ADD CONSTRAINT review_items_source_check
  CHECK (source IN ('conversations', 'manual'));
ALTER TABLE public.review_items
  DROP CONSTRAINT IF EXISTS review_items_proposed_target_check;
ALTER TABLE public.review_items
  ADD CONSTRAINT review_items_proposed_target_check
  CHECK (proposed_target IN (
    'contact_fact',
    'interaction',
    'next_step',
    'todo',
    'value_log',
    'playbook_entry'
  ));
ALTER TABLE public.review_items
  DROP CONSTRAINT IF EXISTS review_items_status_check;
ALTER TABLE public.review_items
  ADD CONSTRAINT review_items_status_check
  CHECK (status IN ('pending', 'accepted', 'dismissed'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_items_external_source
  ON public.review_items(user_id, source, source_external_id)
  WHERE source_external_id IS NOT NULL AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_review_items_pending
  ON public.review_items(user_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_review_items_contact
  ON public.review_items(contact_id)
  WHERE contact_id IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS review_items_updated_at ON public.review_items;
    CREATE TRIGGER review_items_updated_at
      BEFORE UPDATE ON public.review_items
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_items' AND policyname = 'review_items_owner_select') THEN
    CREATE POLICY review_items_owner_select ON public.review_items
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_items' AND policyname = 'review_items_owner_insert') THEN
    CREATE POLICY review_items_owner_insert ON public.review_items
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_items' AND policyname = 'review_items_owner_update') THEN
    CREATE POLICY review_items_owner_update ON public.review_items
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_items' AND policyname = 'review_items_owner_delete') THEN
    CREATE POLICY review_items_owner_delete ON public.review_items
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
