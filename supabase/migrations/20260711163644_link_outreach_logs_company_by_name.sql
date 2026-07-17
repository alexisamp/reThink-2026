create or replace function public.link_outreach_log_company_by_name()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  matched_company_id uuid;
begin
  if new.company_id is null and nullif(trim(coalesce(new.company, '')), '') is not null then
    select candidate.id into matched_company_id
    from (
      select
        company_row.id,
        count(*) over () as match_count
      from public.companies company_row
      where company_row.user_id = new.user_id
        and lower(regexp_replace(coalesce(company_row.name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(new.company, '[^a-z0-9]+', '', 'g'))
    ) candidate
    where candidate.match_count = 1
    limit 1;

    if matched_company_id is not null then
      new.company_id = matched_company_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists link_outreach_log_company_by_name on public.outreach_logs;
create trigger link_outreach_log_company_by_name
  before insert or update of company, company_id, user_id on public.outreach_logs
  for each row execute function public.link_outreach_log_company_by_name();

with candidates as (
  select
    outreach_row.id as contact_id,
    company_row.id as company_id,
    count(*) over (partition by outreach_row.id) as match_count
  from public.outreach_logs outreach_row
  join public.companies company_row
    on company_row.user_id = outreach_row.user_id
   and lower(regexp_replace(coalesce(company_row.name, ''), '[^a-z0-9]+', '', 'g')) = lower(regexp_replace(outreach_row.company, '[^a-z0-9]+', '', 'g'))
  where outreach_row.company_id is null
    and nullif(trim(coalesce(outreach_row.company, '')), '') is not null
)
update public.outreach_logs outreach_row
set company_id = candidates.company_id
from candidates
where outreach_row.id = candidates.contact_id
  and candidates.match_count = 1;
