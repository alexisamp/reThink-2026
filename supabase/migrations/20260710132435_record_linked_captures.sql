alter table public.captures
  add column if not exists linked_record_slug text,
  add column if not exists linked_record_id uuid;

create index if not exists idx_captures_linked_record
  on public.captures (user_id, linked_record_slug, linked_record_id, created_at desc)
  where linked_record_id is not null;

grant select, insert, update, delete on public.captures to authenticated;
