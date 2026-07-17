alter table public.lists
  drop constraint if exists lists_object_slug_check;

alter table public.lists
  add constraint lists_object_slug_check
  check (object_slug = any (array['people'::text, 'companies'::text, 'deals'::text, 'opportunities'::text]));
