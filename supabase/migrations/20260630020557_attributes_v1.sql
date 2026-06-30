alter table public.crm_attributes
  add column if not exists is_archived boolean not null default false,
  add column if not exists options jsonb not null default '[]'::jsonb,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists default_value jsonb;

create index if not exists idx_crm_attributes_object_active
  on public.crm_attributes(object_id, is_archived, sort_order);

create table if not exists public.crm_record_attribute_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_id uuid not null references public.crm_objects(id) on delete cascade,
  record_id uuid not null,
  attribute_id uuid not null references public.crm_attributes(id) on delete cascade,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attribute_id, record_id)
);

create index if not exists idx_crm_record_attribute_values_record
  on public.crm_record_attribute_values(user_id, object_id, record_id);

create index if not exists idx_crm_record_attribute_values_attribute
  on public.crm_record_attribute_values(attribute_id);

create index if not exists idx_crm_record_attribute_values_value
  on public.crm_record_attribute_values using gin(value);

drop trigger if exists crm_record_attribute_values_updated_at on public.crm_record_attribute_values;
create trigger crm_record_attribute_values_updated_at
  before update on public.crm_record_attribute_values
  for each row execute function public.handle_updated_at();

alter table public.crm_record_attribute_values enable row level security;

grant select, insert, update, delete on public.crm_record_attribute_values to authenticated;

drop policy if exists "Users can read their record attribute values" on public.crm_record_attribute_values;
create policy "Users can read their record attribute values"
  on public.crm_record_attribute_values
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their record attribute values" on public.crm_record_attribute_values;
create policy "Users can insert their record attribute values"
  on public.crm_record_attribute_values
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their record attribute values" on public.crm_record_attribute_values;
create policy "Users can update their record attribute values"
  on public.crm_record_attribute_values
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their record attribute values" on public.crm_record_attribute_values;
create policy "Users can delete their record attribute values"
  on public.crm_record_attribute_values
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
