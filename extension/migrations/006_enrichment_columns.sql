-- Migration 006: Add enrichment columns to outreach_logs
-- These columns were referenced in app code but never created in the DB,
-- causing all Enrich saves (company_domain, profile_photo_url, ai_enriched_at)
-- to silently fail with a Postgres "column does not exist" error.
--
-- Run this in the Supabase SQL editor before deploying v0.1.79.

ALTER TABLE outreach_logs
  ADD COLUMN IF NOT EXISTS company_domain        TEXT,
  ADD COLUMN IF NOT EXISTS company_linkedin_url  TEXT,
  ADD COLUMN IF NOT EXISTS attio_company_id      TEXT,
  ADD COLUMN IF NOT EXISTS ai_enriched_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_photo_url     TEXT;
