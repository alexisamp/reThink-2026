-- Value Ledger: track value GIVEN vs RECEIVED per contact (Jacob Warwick reciprocity imbalance).
-- Existing rows are back-filled as 'given' (preserves current semantics: value_logs = value given).
ALTER TABLE public.value_logs
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'given'
    CHECK (direction IN ('given', 'received'));

-- Efficient per-contact ledger queries (given vs received).
CREATE INDEX IF NOT EXISTS idx_value_logs_contact_direction
  ON public.value_logs(outreach_log_id, direction);
