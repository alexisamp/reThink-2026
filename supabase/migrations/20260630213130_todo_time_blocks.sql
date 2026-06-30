ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS scheduled_start_minutes integer,
  ADD COLUMN IF NOT EXISTS scheduled_duration_minutes integer;

ALTER TABLE public.todos
  DROP CONSTRAINT IF EXISTS todos_scheduled_start_minutes_range,
  DROP CONSTRAINT IF EXISTS todos_scheduled_duration_minutes_valid,
  DROP CONSTRAINT IF EXISTS todos_scheduled_window_valid,
  DROP CONSTRAINT IF EXISTS todos_scheduled_fields_together;

ALTER TABLE public.todos
  ADD CONSTRAINT todos_scheduled_start_minutes_range
    CHECK (scheduled_start_minutes IS NULL OR scheduled_start_minutes BETWEEN 0 AND 1439),
  ADD CONSTRAINT todos_scheduled_duration_minutes_valid
    CHECK (
      scheduled_duration_minutes IS NULL
      OR (scheduled_duration_minutes >= 30 AND scheduled_duration_minutes % 30 = 0)
    ),
  ADD CONSTRAINT todos_scheduled_window_valid
    CHECK (
      scheduled_start_minutes IS NULL
      OR scheduled_duration_minutes IS NULL
      OR scheduled_start_minutes + scheduled_duration_minutes <= 1440
    ),
  ADD CONSTRAINT todos_scheduled_fields_together
    CHECK (
      (scheduled_start_minutes IS NULL AND scheduled_duration_minutes IS NULL)
      OR (scheduled_start_minutes IS NOT NULL AND scheduled_duration_minutes IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_todos_user_date_scheduled
  ON public.todos(user_id, date, scheduled_start_minutes)
  WHERE scheduled_start_minutes IS NOT NULL;
