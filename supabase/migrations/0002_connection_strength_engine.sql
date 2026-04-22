-- ============================================================================
-- Migration: 0002_connection_strength_engine
-- Date: 2026-04-21
-- Applied via Supabase MCP apply_migration
--
-- Purpose: compute + maintain outreach_logs.connection_strength automatically
--
-- Design:
--   - Formula: strength = Σ (weight(type, direction) * exp(-days_ago / half_life))
--   - Half-life: 45 days
--   - Direction matters: INBOUND messages count ~60% more than OUTBOUND
--     (suppresses one-sided monologues — Jacob bidirectionality principle)
--   - Only interactions in last 2 years
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Core per-contact computation
CREATE OR REPLACE FUNCTION public.compute_connection_strength(p_contact_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  result numeric := 0;
  half_life constant numeric := 45.0;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'in_person'       AND direction = 'inbound'  THEN 6.0
      WHEN type = 'in_person'       AND direction = 'outbound' THEN 5.0
      WHEN type = 'virtual_coffee'  AND direction = 'inbound'  THEN 4.2
      WHEN type = 'virtual_coffee'  AND direction = 'outbound' THEN 3.5
      WHEN type = 'call'            AND direction = 'inbound'  THEN 4.2
      WHEN type = 'call'            AND direction = 'outbound' THEN 3.5
      WHEN type = 'whatsapp'        AND direction = 'inbound'  THEN 2.5
      WHEN type = 'whatsapp'        AND direction = 'outbound' THEN 1.5
      WHEN type = 'linkedin_msg'    AND direction = 'inbound'  THEN 2.0
      WHEN type = 'linkedin_msg'    AND direction = 'outbound' THEN 1.0
      WHEN type = 'email'           AND direction = 'inbound'  THEN 1.5
      WHEN type = 'email'           AND direction = 'outbound' THEN 1.0
      WHEN direction = 'inbound'                               THEN 1.0
      WHEN direction = 'outbound'                              THEN 0.6
      ELSE 0.5
    END
    * exp(
        -EXTRACT(EPOCH FROM (now() - interaction_date))::numeric
        / 86400.0 / half_life
      )
  ), 0)
  INTO result
  FROM public.interactions
  WHERE contact_id = p_contact_id
    AND interaction_date >= now() - interval '2 years'
    AND interaction_date <= now();
  RETURN round(result, 2);
END;
$$;

-- Batch refresh (for cron)
CREATE OR REPLACE FUNCTION public.refresh_all_connection_strengths()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE affected int;
BEGIN
  WITH updates AS (
    UPDATE public.outreach_logs ol
    SET
      connection_strength = public.compute_connection_strength(ol.id),
      connection_strength_computed_at = now()
    WHERE EXISTS (
      SELECT 1 FROM public.interactions i
      WHERE i.contact_id = ol.id
        AND i.interaction_date >= now() - interval '2 years'
    )
    RETURNING 1
  )
  SELECT count(*) INTO affected FROM updates;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION public.refresh_all_connection_strengths() IS
  'Batch refresh connection_strength for all contacts. Run daily via pg_cron.';

-- Incremental trigger: update on interaction insert/update/delete
CREATE OR REPLACE FUNCTION public.refresh_contact_strength_on_interaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.outreach_logs
  SET
    connection_strength = public.compute_connection_strength(
      COALESCE(NEW.contact_id, OLD.contact_id)
    ),
    connection_strength_computed_at = now()
  WHERE id = COALESCE(NEW.contact_id, OLD.contact_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_strength_on_interaction ON public.interactions;
CREATE TRIGGER trg_refresh_strength_on_interaction
  AFTER INSERT OR UPDATE OR DELETE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.refresh_contact_strength_on_interaction();

-- Daily cron at 3am UTC
SELECT cron.unschedule('daily-connection-strength-refresh')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-connection-strength-refresh');

SELECT cron.schedule(
  'daily-connection-strength-refresh',
  '0 3 * * *',
  $CRON$ SELECT public.refresh_all_connection_strengths(); $CRON$
);

-- One-time backfill
SELECT public.refresh_all_connection_strengths();
