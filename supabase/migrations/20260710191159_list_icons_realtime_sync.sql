-- Handoff parity: list icon uploads and cross-client CRM sync.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'list-icons',
  'list-icons',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "list_icons_public_read" on storage.objects;
create policy "list_icons_public_read"
on storage.objects for select
to public
using (bucket_id = 'list-icons');

drop policy if exists "list_icons_owner_insert" on storage.objects;
create policy "list_icons_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'list-icons'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "list_icons_owner_update" on storage.objects;
create policy "list_icons_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'list-icons'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'list-icons'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "list_icons_owner_delete" on storage.objects;
create policy "list_icons_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'list-icons'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lists'
  ) then
    alter publication supabase_realtime add table public.lists;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_views'
  ) then
    alter publication supabase_realtime add table public.crm_views;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'crm_list_entries'
  ) then
    alter publication supabase_realtime add table public.crm_list_entries;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'list_memberships'
  ) then
    alter publication supabase_realtime add table public.list_memberships;
  end if;
end $$;
