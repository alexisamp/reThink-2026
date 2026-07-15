create table if not exists public.job_application_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  subject text not null,
  sender text,
  received_at timestamptz not null,
  company_name text,
  role_title text,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  match_status text not null default 'unmatched'
    check (match_status in ('matched', 'created', 'unmatched', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

create index if not exists job_application_confirmations_user_received_idx
  on public.job_application_confirmations(user_id, received_at desc);

create index if not exists job_application_confirmations_opportunity_idx
  on public.job_application_confirmations(opportunity_id)
  where opportunity_id is not null;

alter table public.job_application_confirmations enable row level security;

create policy "job_application_confirmations_select_own"
  on public.job_application_confirmations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "job_application_confirmations_insert_own"
  on public.job_application_confirmations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "job_application_confirmations_update_own"
  on public.job_application_confirmations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "job_application_confirmations_delete_own"
  on public.job_application_confirmations for delete to authenticated
  using ((select auth.uid()) = user_id);
