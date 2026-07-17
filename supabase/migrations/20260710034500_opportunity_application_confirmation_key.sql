alter table public.opportunities
  add column if not exists application_confirmation_id uuid
  references public.job_application_confirmations(id) on delete set null;

create unique index if not exists opportunities_application_confirmation_uidx
  on public.opportunities(application_confirmation_id)
  where application_confirmation_id is not null;
