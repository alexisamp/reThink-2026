-- Structured data emitted by Conversations and approved from Review.
-- These tables keep dates and introductions relational instead of flattening
-- them into generic facts/value logs.

CREATE TABLE IF NOT EXISTS public.contact_key_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.outreach_logs(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'important_date' CHECK (
    event_type IN ('birthday', 'anniversary', 'travel', 'return', 'move', 'important_date')
  ),
  subject text NOT NULL,
  relation text,
  date_value text,
  date_precision text NOT NULL DEFAULT 'unknown' CHECK (
    date_precision IN ('exact', 'month_day', 'month', 'year', 'unknown')
  ),
  description text NOT NULL,
  source text NOT NULL DEFAULT 'chat_capture',
  source_interaction_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_key_dates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_key_dates' AND policyname = 'contact_key_dates select own'
  ) THEN
    CREATE POLICY "contact_key_dates select own"
      ON public.contact_key_dates FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_key_dates' AND policyname = 'contact_key_dates insert own'
  ) THEN
    CREATE POLICY "contact_key_dates insert own"
      ON public.contact_key_dates FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_key_dates' AND policyname = 'contact_key_dates update own'
  ) THEN
    CREATE POLICY "contact_key_dates update own"
      ON public.contact_key_dates FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS contact_key_dates_updated_at ON public.contact_key_dates;
CREATE TRIGGER contact_key_dates_updated_at
  BEFORE UPDATE ON public.contact_key_dates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS contact_key_dates_user_date_idx
  ON public.contact_key_dates(user_id, date_precision, date_value);

CREATE INDEX IF NOT EXISTS contact_key_dates_contact_idx
  ON public.contact_key_dates(contact_id, event_type);

CREATE TABLE IF NOT EXISTS public.contact_introductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_contact_id uuid NOT NULL REFERENCES public.outreach_logs(id) ON DELETE CASCADE,
  connector_contact_id uuid REFERENCES public.outreach_logs(id) ON DELETE SET NULL,
  introduced_contact_id uuid REFERENCES public.outreach_logs(id) ON DELETE SET NULL,
  introduced_to_contact_id uuid REFERENCES public.outreach_logs(id) ON DELETE SET NULL,
  connector_name text,
  introduced_person_name text,
  introduced_person_company text,
  introduced_to_name text,
  introduced_to_company text,
  relationship_context text,
  status text NOT NULL DEFAULT 'made' CHECK (
    status IN ('requested', 'offered', 'made', 'received')
  ),
  direction text NOT NULL CHECK (direction IN ('given', 'received')),
  confidence text NOT NULL DEFAULT 'medium' CHECK (
    confidence IN ('low', 'medium', 'high')
  ),
  source_channel text NOT NULL DEFAULT 'whatsapp',
  source_interaction_date date NOT NULL,
  source_external_id text NOT NULL,
  source_value_log_id uuid REFERENCES public.value_logs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_external_id)
);

ALTER TABLE public.contact_introductions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_introductions' AND policyname = 'contact_introductions select own'
  ) THEN
    CREATE POLICY "contact_introductions select own"
      ON public.contact_introductions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_introductions' AND policyname = 'contact_introductions insert own'
  ) THEN
    CREATE POLICY "contact_introductions insert own"
      ON public.contact_introductions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contact_introductions' AND policyname = 'contact_introductions update own'
  ) THEN
    CREATE POLICY "contact_introductions update own"
      ON public.contact_introductions FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS contact_introductions_updated_at ON public.contact_introductions;
CREATE TRIGGER contact_introductions_updated_at
  BEFORE UPDATE ON public.contact_introductions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS contact_introductions_user_date_idx
  ON public.contact_introductions(user_id, source_interaction_date DESC);

CREATE INDEX IF NOT EXISTS contact_introductions_source_contact_idx
  ON public.contact_introductions(source_contact_id, source_interaction_date DESC);

CREATE INDEX IF NOT EXISTS contact_introductions_connector_idx
  ON public.contact_introductions(connector_contact_id)
  WHERE connector_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_introductions_introduced_idx
  ON public.contact_introductions(introduced_contact_id)
  WHERE introduced_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contact_introductions_to_idx
  ON public.contact_introductions(introduced_to_contact_id)
  WHERE introduced_to_contact_id IS NOT NULL;
