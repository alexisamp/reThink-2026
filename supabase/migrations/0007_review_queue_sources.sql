-- Migration: 0007_review_queue_sources
-- Purpose: Notion is a UI/style direction, not a review data source.

ALTER TABLE public.review_items
  DROP CONSTRAINT IF EXISTS review_items_source_check;

ALTER TABLE public.review_items
  ADD CONSTRAINT review_items_source_check
  CHECK (source IN ('conversations', 'manual'));
