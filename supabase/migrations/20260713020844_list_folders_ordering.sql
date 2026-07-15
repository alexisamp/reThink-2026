create table if not exists public.list_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lists
  add column if not exists folder_id uuid references public.list_folders(id) on delete set null,
  add column if not exists position integer;

with ordered as (
  select id, row_number() over (partition by user_id order by created_at, id) - 1 as next_position
  from public.lists
  where position is null
)
update public.lists list_row
set position = ordered.next_position
from ordered
where list_row.id = ordered.id;

alter table public.lists
  alter column position set default 0,
  alter column position set not null;

create index if not exists idx_list_folders_user_position
  on public.list_folders (user_id, position, created_at);

create index if not exists idx_lists_user_folder_position
  on public.lists (user_id, folder_id, position, created_at)
  where not is_archived;

drop trigger if exists list_folders_updated_at on public.list_folders;
create trigger list_folders_updated_at
  before update on public.list_folders
  for each row execute function public.handle_updated_at();

alter table public.list_folders enable row level security;

drop policy if exists "list_folders_owner_select" on public.list_folders;
create policy "list_folders_owner_select" on public.list_folders
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "list_folders_owner_insert" on public.list_folders;
create policy "list_folders_owner_insert" on public.list_folders
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "list_folders_owner_update" on public.list_folders;
create policy "list_folders_owner_update" on public.list_folders
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "list_folders_owner_delete" on public.list_folders;
create policy "list_folders_owner_delete" on public.list_folders
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.list_folders to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'list_folders'
  ) then
    alter publication supabase_realtime add table public.list_folders;
  end if;
end $$;
