-- ============================================================================
-- Migration: 0001_relationship_architecture
-- Date: 2026-04-21
-- Applied via Supabase MCP apply_migration
-- Project: amvezbymrnvrwcypivkf (reThink 2026)
--
-- Purpose: Foundation for Jacob-inspired relationship CRM overhaul
--
-- Changes:
--   1. outreach_logs: relationship_domain, personal_tier, custom_cadence_days,
--      connection_strength (+ computed_at)
--   2. profiles: tier_cadence_config, feature_flags
--   3. NEW tables: lists, list_memberships, contact_facts
--   4. Generic handle_updated_at() trigger function
--   5. Deprecate outreach_logs.status (comment only, no drop)
--   6. View: contact_cadence (effective_cadence_days per contact)
-- ============================================================================

-- 1. Generic updated_at trigger function (reusable)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Extend outreach_logs (the "contacts" table)
ALTER TABLE public.outreach_logs
  ADD COLUMN IF NOT EXISTS relationship_domain text NOT NULL
    DEFAULT 'professional'
    CHECK (relationship_domain IN ('professional','personal','mixed')),
  ADD COLUMN IF NOT EXISTS personal_tier text
    CHECK (personal_tier IS NULL OR personal_tier IN ('inner_circle','close','casual')),
  ADD COLUMN IF NOT EXISTS custom_cadence_days int
    CHECK (custom_cadence_days IS NULL OR custom_cadence_days > 0),
  ADD COLUMN IF NOT EXISTS connection_strength numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connection_strength_computed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_outreach_logs_domain
  ON public.outreach_logs(user_id, relationship_domain);

CREATE INDEX IF NOT EXISTS idx_outreach_logs_strength
  ON public.outreach_logs(user_id, connection_strength DESC)
  WHERE relationship_domain IN ('professional','mixed');

COMMENT ON COLUMN public.outreach_logs.status IS
  'DEPRECATED (2026-04-21): replaced by list_memberships.current_stage. Kept for backward compat; do not use in new code.';

-- 3. Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier_cadence_config jsonb NOT NULL
    DEFAULT '{"1":{"days":30,"label":"Monthly"},"2":{"days":90,"label":"Quarterly"},"3":{"days":365,"label":"Annually"}}'::jsonb,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL
    DEFAULT '{}'::jsonb;

-- 4. lists table (Attio-style contextual funnels)
CREATE TABLE IF NOT EXISTS public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  color text,
  icon text,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lists_user
  ON public.lists(user_id) WHERE NOT is_archived;

CREATE TRIGGER lists_updated_at
  BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lists_owner_select" ON public.lists
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "lists_owner_insert" ON public.lists
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lists_owner_update" ON public.lists
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "lists_owner_delete" ON public.lists
  FOR DELETE USING (auth.uid() = user_id);

-- 5. list_memberships
CREATE TABLE IF NOT EXISTS public.list_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.outreach_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_stage text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_list_memberships_list
  ON public.list_memberships(list_id);
CREATE INDEX IF NOT EXISTS idx_list_memberships_contact
  ON public.list_memberships(contact_id);
CREATE INDEX IF NOT EXISTS idx_list_memberships_user
  ON public.list_memberships(user_id);

ALTER TABLE public.list_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "list_memberships_owner_select" ON public.list_memberships
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "list_memberships_owner_insert" ON public.list_memberships
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "list_memberships_owner_update" ON public.list_memberships
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "list_memberships_owner_delete" ON public.list_memberships
  FOR DELETE USING (auth.uid() = user_id);

-- 6. contact_facts
CREATE TABLE IF NOT EXISTS public.contact_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.outreach_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN (
      'family','career_intel','compensation','obsession','hot_button',
      'life_phase','pet_peeve','origin_story','health','preference','other'
    )),
  label text,
  value text NOT NULL,
  importance int NOT NULL DEFAULT 2 CHECK (importance BETWEEN 1 AND 3),
  expires_at date,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','ai_extract','chat_capture','import')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_facts_contact
  ON public.contact_facts(contact_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_contact_facts_user_category
  ON public.contact_facts(user_id, category);
CREATE INDEX IF NOT EXISTS idx_contact_facts_expires
  ON public.contact_facts(user_id, expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TRIGGER contact_facts_updated_at
  BEFORE UPDATE ON public.contact_facts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.contact_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_facts_owner_select" ON public.contact_facts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "contact_facts_owner_insert" ON public.contact_facts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contact_facts_owner_update" ON public.contact_facts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contact_facts_owner_delete" ON public.contact_facts
  FOR DELETE USING (auth.uid() = user_id);

-- 7. Helper view: effective_cadence_days per contact
CREATE OR REPLACE VIEW public.contact_cadence AS
SELECT
  c.id AS contact_id,
  c.user_id,
  c.tier,
  c.relationship_domain,
  c.custom_cadence_days,
  CASE
    WHEN c.custom_cadence_days IS NOT NULL THEN c.custom_cadence_days
    WHEN c.tier IS NOT NULL AND c.relationship_domain IN ('professional','mixed') THEN
      ((p.tier_cadence_config -> c.tier::text) ->> 'days')::int
    ELSE NULL
  END AS effective_cadence_days,
  c.last_interaction_at,
  CASE
    WHEN c.last_interaction_at IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM (now() - c.last_interaction_at))::int
  END AS days_since_last_interaction
FROM public.outreach_logs c
LEFT JOIN public.profiles p ON p.id = c.user_id;
