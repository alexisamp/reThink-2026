-- Migration 003: Performance Indexes
-- Purpose: Optimize frequent queries from the extension
-- The extension frequently queries interactions by contact and date

-- Index for interactions table to speed up contact + date queries
-- Extension needs to:
-- 1. Check recent interactions when detecting messages
-- 2. Count distinct contacts per day for networking habit
CREATE INDEX idx_interactions_contact_date
  ON interactions(user_id, contact_id, interaction_date DESC);
