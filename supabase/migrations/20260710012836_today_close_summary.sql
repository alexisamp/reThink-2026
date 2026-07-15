alter table public.reviews
  add column if not exists today_close_summary jsonb;
