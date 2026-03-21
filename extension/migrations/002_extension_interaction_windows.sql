-- Migration 002: Extension Interaction Windows
-- Purpose: Track 6-hour windows for grouping messages into interactions
-- Used to decide if a new message is part of an existing conversation
-- or starts a new interaction

-- Create extension_interaction_windows table
CREATE TABLE extension_interaction_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES outreach_logs(id) ON DELETE CASCADE,
  interaction_id UUID NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- 'whatsapp' | 'linkedin_msg'
  window_start TIMESTAMPTZ NOT NULL, -- timestamp of first message
  window_end TIMESTAMPTZ NOT NULL,   -- window_start + 6 hours
  direction TEXT NOT NULL,            -- 'inbound' | 'outbound' (of first message)
  message_count INTEGER NOT NULL DEFAULT 1, -- counter of messages in this window
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up windows by user and contact
CREATE INDEX idx_extension_windows_user_contact
  ON extension_interaction_windows(user_id, contact_id);

-- Index for finding active windows (most common query)
-- Only indexes rows where window_end is in the future
CREATE INDEX idx_extension_windows_active
  ON extension_interaction_windows(user_id, contact_id, window_end)
  WHERE window_end > now();

-- Enable Row Level Security
ALTER TABLE extension_interaction_windows ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own windows
CREATE POLICY "Users can view their own windows"
  ON extension_interaction_windows FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own windows
CREATE POLICY "Users can insert their own windows"
  ON extension_interaction_windows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own windows
CREATE POLICY "Users can update their own windows"
  ON extension_interaction_windows FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own windows
CREATE POLICY "Users can delete their own windows"
  ON extension_interaction_windows FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to automatically update updated_at column
CREATE TRIGGER update_extension_windows_updated_at
  BEFORE UPDATE ON extension_interaction_windows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Helper function to clean up expired windows
-- Can be run as a cron job or called from extension periodically
-- Removes windows older than 7 days (no longer needed for active queries)
CREATE OR REPLACE FUNCTION cleanup_expired_windows()
RETURNS void AS $$
BEGIN
  DELETE FROM extension_interaction_windows
  WHERE window_end < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
