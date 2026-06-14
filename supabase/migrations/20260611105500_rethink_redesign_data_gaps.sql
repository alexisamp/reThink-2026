-- reThink redesign production data gaps.
-- Keeps existing tables as source of truth while enabling backlog, list-specific
-- attributes, and lightweight ABM/account fields from the handoff.

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS backlog_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_date date;

CREATE INDEX IF NOT EXISTS idx_todos_user_backlog
  ON public.todos(user_id, backlog_at DESC)
  WHERE backlog_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_todos_user_return_date
  ON public.todos(user_id, return_date)
  WHERE return_date IS NOT NULL;

ALTER TABLE public.list_memberships
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_list_memberships_attributes
  ON public.list_memberships USING gin(attributes);

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS icp text,
  ADD COLUMN IF NOT EXISTS account_stage text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS motion text,
  ADD COLUMN IF NOT EXISTS next_step text;

CREATE INDEX IF NOT EXISTS idx_companies_user_account_stage
  ON public.companies(user_id, account_stage)
  WHERE account_stage IS NOT NULL;
