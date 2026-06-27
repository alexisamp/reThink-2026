-- Conversations/reThink interaction detail layer.
-- Canonical timeline rows still live in public.interactions; these tables add
-- click-through detail and AI suggestions without storing full chat transcripts.

CREATE TABLE IF NOT EXISTS public.interaction_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interaction_id uuid NOT NULL REFERENCES public.interactions(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'linkedin', 'email')),
  source_external_id text NOT NULL,
  window_start timestamptz,
  window_end timestamptz,
  message_count integer NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  excerpts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_external_id)
);

CREATE INDEX IF NOT EXISTS interaction_details_interaction_idx
  ON public.interaction_details(interaction_id);
CREATE INDEX IF NOT EXISTS interaction_details_user_channel_idx
  ON public.interaction_details(user_id, channel, window_start DESC);

ALTER TABLE public.interaction_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interaction_details_owner_select ON public.interaction_details;
CREATE POLICY interaction_details_owner_select ON public.interaction_details
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS interaction_details_owner_insert ON public.interaction_details;
CREATE POLICY interaction_details_owner_insert ON public.interaction_details
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS interaction_details_owner_update ON public.interaction_details;
CREATE POLICY interaction_details_owner_update ON public.interaction_details
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS interaction_details_owner_delete ON public.interaction_details;
CREATE POLICY interaction_details_owner_delete ON public.interaction_details
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.interaction_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interaction_id uuid REFERENCES public.interactions(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.outreach_logs(id) ON DELETE CASCADE,
  source_external_id text NOT NULL,
  target text NOT NULL CHECK (target IN (
    'todo',
    'contact_fact',
    'key_date',
    'value_log',
    'intro',
    'next_step'
  )),
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_external_id, target)
);

CREATE INDEX IF NOT EXISTS interaction_suggestions_pending_idx
  ON public.interaction_suggestions(user_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS interaction_suggestions_contact_idx
  ON public.interaction_suggestions(contact_id, status, created_at DESC)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS interaction_suggestions_interaction_idx
  ON public.interaction_suggestions(interaction_id)
  WHERE interaction_id IS NOT NULL;

ALTER TABLE public.interaction_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interaction_suggestions_owner_select ON public.interaction_suggestions;
CREATE POLICY interaction_suggestions_owner_select ON public.interaction_suggestions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS interaction_suggestions_owner_insert ON public.interaction_suggestions;
CREATE POLICY interaction_suggestions_owner_insert ON public.interaction_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS interaction_suggestions_owner_update ON public.interaction_suggestions;
CREATE POLICY interaction_suggestions_owner_update ON public.interaction_suggestions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS interaction_suggestions_owner_delete ON public.interaction_suggestions;
CREATE POLICY interaction_suggestions_owner_delete ON public.interaction_suggestions
  FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.contact_key_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.outreach_logs(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'important_date',
  subject text NOT NULL,
  relation text,
  date_value text,
  date_precision text NOT NULL DEFAULT 'unknown' CHECK (
    date_precision IN ('exact', 'month_day', 'month', 'year', 'unknown')
  ),
  description text,
  source text NOT NULL DEFAULT 'chat_capture',
  source_interaction_date date,
  source_external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_key_dates
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'important_date',
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'Important date',
  ADD COLUMN IF NOT EXISTS relation text,
  ADD COLUMN IF NOT EXISTS date_value text,
  ADD COLUMN IF NOT EXISTS date_precision text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'chat_capture',
  ADD COLUMN IF NOT EXISTS source_interaction_date date,
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_key_dates_date_precision_check'
      AND conrelid = 'public.contact_key_dates'::regclass
  ) THEN
    ALTER TABLE public.contact_key_dates
      ADD CONSTRAINT contact_key_dates_date_precision_check
      CHECK (date_precision IN ('exact', 'month_day', 'month', 'year', 'unknown'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contact_key_dates_source_unique
  ON public.contact_key_dates(user_id, source_external_id)
  WHERE source_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_key_dates_contact_idx
  ON public.contact_key_dates(contact_id, source_interaction_date DESC);
CREATE INDEX IF NOT EXISTS contact_key_dates_user_date_idx
  ON public.contact_key_dates(user_id, source_interaction_date DESC);

ALTER TABLE public.contact_key_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_key_dates_owner_select ON public.contact_key_dates;
CREATE POLICY contact_key_dates_owner_select ON public.contact_key_dates
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS contact_key_dates_owner_insert ON public.contact_key_dates;
CREATE POLICY contact_key_dates_owner_insert ON public.contact_key_dates
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS contact_key_dates_owner_update ON public.contact_key_dates;
CREATE POLICY contact_key_dates_owner_update ON public.contact_key_dates
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS contact_key_dates_owner_delete ON public.contact_key_dates;
CREATE POLICY contact_key_dates_owner_delete ON public.contact_key_dates
  FOR DELETE USING (auth.uid() = user_id);
