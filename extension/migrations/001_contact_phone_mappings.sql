-- Migration 001: Contact Phone Mappings
-- Purpose: Map phone numbers to contacts for WhatsApp auto-capture
-- A contact can have multiple phone numbers (cell, work, etc)
-- A phone number can only be associated with one contact per user

-- Create contact_phone_mappings table
CREATE TABLE contact_phone_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES outreach_logs(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL, -- normalized: no spaces, with +52 country code
  label TEXT NULL, -- 'mobile', 'work', 'home', NULL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure one phone number per contact per user
  UNIQUE(user_id, phone_number)
);

-- Index for looking up phone mappings by user and contact
CREATE INDEX idx_contact_phone_mappings_user_contact
  ON contact_phone_mappings(user_id, contact_id);

-- Index for fast phone number lookups
CREATE INDEX idx_contact_phone_mappings_phone
  ON contact_phone_mappings(phone_number);

-- Enable Row Level Security
ALTER TABLE contact_phone_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own phone mappings
CREATE POLICY "Users can view their own phone mappings"
  ON contact_phone_mappings FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own phone mappings
CREATE POLICY "Users can insert their own phone mappings"
  ON contact_phone_mappings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own phone mappings
CREATE POLICY "Users can update their own phone mappings"
  ON contact_phone_mappings FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own phone mappings
CREATE POLICY "Users can delete their own phone mappings"
  ON contact_phone_mappings FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to automatically update updated_at column
CREATE TRIGGER update_contact_phone_mappings_updated_at
  BEFORE UPDATE ON contact_phone_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
