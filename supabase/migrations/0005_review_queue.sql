-- Migration: 0005_review_queue
-- Purpose: review queue for external-source suggestions before writing canonical data.

CREATE TABLE IF NOT EXISTS public.review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('notion', 'conversations')),
  source_external_id text,
  source_url text,
  title text NOT NULL,
  body text,
  proposed_target text NOT NULL CHECK (proposed_target IN (
    'contact_fact',
    'interaction',
    'next_step',
    'todo',
    'value_log',
    'playbook_entry'
  )),
  proposed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_id uuid REFERENCES public.outreach_logs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_items_external_source
  ON public.review_items(user_id, source, source_external_id)
  WHERE source_external_id IS NOT NULL AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_items_pending
  ON public.review_items(user_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_review_items_contact
  ON public.review_items(contact_id)
  WHERE contact_id IS NOT NULL;

DROP TRIGGER IF EXISTS review_items_updated_at ON public.review_items;
CREATE TRIGGER review_items_updated_at
  BEFORE UPDATE ON public.review_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_items_owner_select" ON public.review_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "review_items_owner_insert" ON public.review_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "review_items_owner_update" ON public.review_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "review_items_owner_delete" ON public.review_items
  FOR DELETE USING (auth.uid() = user_id);
