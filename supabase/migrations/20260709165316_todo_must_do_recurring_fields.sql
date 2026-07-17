ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS must_do boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_id text;

CREATE INDEX IF NOT EXISTS idx_todos_user_date_must_do
  ON public.todos(user_id, date)
  WHERE must_do = true;

CREATE INDEX IF NOT EXISTS idx_todos_user_recurring
  ON public.todos(user_id, recurring_id)
  WHERE recurring_id IS NOT NULL;
