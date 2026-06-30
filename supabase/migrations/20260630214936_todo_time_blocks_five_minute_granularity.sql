ALTER TABLE public.todos
  DROP CONSTRAINT IF EXISTS todos_scheduled_duration_minutes_valid;

ALTER TABLE public.todos
  ADD CONSTRAINT todos_scheduled_duration_minutes_valid
    CHECK (
      scheduled_duration_minutes IS NULL
      OR (scheduled_duration_minutes >= 5 AND scheduled_duration_minutes % 5 = 0)
    );
