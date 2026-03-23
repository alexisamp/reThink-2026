-- Migration 004: Change habits.tracks_outreach from bool to text
-- This enables the extension to distinguish 'networking' (WhatsApp) from 'prospecting' (LinkedIn adds)
--
-- Run in Supabase SQL editor.
-- Existing true values → 'networking' (the only outreach habit type before this migration)
-- Existing false/null values → null

ALTER TABLE habits
  ALTER COLUMN tracks_outreach TYPE text
  USING CASE
    WHEN tracks_outreach = true THEN 'networking'
    ELSE NULL
  END;

ALTER TABLE habits
  ADD CONSTRAINT habits_tracks_outreach_check
  CHECK (tracks_outreach IN ('networking', 'prospecting') OR tracks_outreach IS NULL);

-- After running this migration:
-- 1. Verify networking habit: SELECT id, text, tracks_outreach FROM habits WHERE tracks_outreach IS NOT NULL;
-- 2. Set your prospecting habit manually if needed:
--    UPDATE habits SET tracks_outreach = 'prospecting' WHERE text ILIKE '%prospectar%' OR text ILIKE '%add%' OR text ILIKE '%contact%';
