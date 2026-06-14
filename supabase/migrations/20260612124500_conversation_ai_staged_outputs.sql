-- Remote mirror for Conversations AI review rows.
-- Conversations keeps ai_staged_outputs locally until approval; this table lets
-- reThink release/web render the same pending review queue without local SQLite.

CREATE TABLE IF NOT EXISTS public.conversation_ai_staged_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id bigint,
  run_id bigint,
  dedupe_key text,
  source_key text NOT NULL,
  target text NOT NULL CHECK (target IN ('interaction', 'contact_fact', 'value_log', 'todo', 'review_item')),
  contact_id uuid REFERENCES public.outreach_logs(id) ON DELETE SET NULL,
  interaction_date date,
  title text,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'synced', 'failed')),
  supabase_id uuid,
  error text,
  local_created_at bigint,
  local_updated_at bigint,
  confirmed_at bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

ALTER TABLE public.conversation_ai_staged_outputs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_ai_staged_outputs' AND policyname = 'conversation_ai_staged_outputs select own'
  ) THEN
    CREATE POLICY "conversation_ai_staged_outputs select own"
      ON public.conversation_ai_staged_outputs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_ai_staged_outputs' AND policyname = 'conversation_ai_staged_outputs insert own'
  ) THEN
    CREATE POLICY "conversation_ai_staged_outputs insert own"
      ON public.conversation_ai_staged_outputs FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_ai_staged_outputs' AND policyname = 'conversation_ai_staged_outputs update own'
  ) THEN
    CREATE POLICY "conversation_ai_staged_outputs update own"
      ON public.conversation_ai_staged_outputs FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS conversation_ai_staged_outputs_updated_at ON public.conversation_ai_staged_outputs;
CREATE TRIGGER conversation_ai_staged_outputs_updated_at
  BEFORE UPDATE ON public.conversation_ai_staged_outputs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS conversation_ai_staged_outputs_user_status_idx
  ON public.conversation_ai_staged_outputs(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS conversation_ai_staged_outputs_contact_idx
  ON public.conversation_ai_staged_outputs(contact_id, interaction_date DESC)
  WHERE contact_id IS NOT NULL;
