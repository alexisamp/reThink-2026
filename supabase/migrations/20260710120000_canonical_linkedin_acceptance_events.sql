alter table public.outreach_events
  add column if not exists evidence_confidence smallint not null default 50
    check (evidence_confidence between 0 and 100),
  add column if not exists observed_at timestamptz;

create table if not exists public.outreach_event_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.outreach_logs(id) on delete cascade,
  canonical_event_id uuid references public.outreach_events(id) on delete set null,
  event_type text not null,
  occurred_on date not null,
  occurred_at timestamptz not null,
  observed_at timestamptz not null default now(),
  source text not null,
  source_external_id text not null,
  confidence smallint not null check (confidence between 0 and 100),
  timezone text not null default 'UTC',
  raw_label text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_external_id)
);

create index if not exists outreach_event_observations_contact_idx
  on public.outreach_event_observations(user_id, contact_id, event_type, occurred_on);

create index if not exists outreach_event_observations_canonical_idx
  on public.outreach_event_observations(canonical_event_id)
  where canonical_event_id is not null;

alter table public.outreach_event_observations enable row level security;

create policy "outreach_event_observations_select_own"
  on public.outreach_event_observations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "outreach_event_observations_insert_own"
  on public.outreach_event_observations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "outreach_event_observations_update_own"
  on public.outreach_event_observations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.outreach_event_observations to authenticated;

-- Preserve the original detector evidence before normalizing accepted rows.
insert into public.outreach_event_observations (
  user_id, contact_id, canonical_event_id, event_type, occurred_on,
  occurred_at, observed_at, source, source_external_id, confidence,
  timezone, raw_label, payload
)
select
  event.user_id,
  event.contact_id,
  event.id,
  'linkedin_acceptance',
  event.occurred_on,
  event.occurred_at,
  coalesce(event.observed_at, event.created_at),
  event.source,
  coalesce(event.source_external_id, 'legacy-event:' || event.id::text),
  case
    when event.source = 'linkedin_connections_import' then 100
    when event.source = 'manual_backfill' then 90
    when event.source in ('linkedin', 'conversation_sync') then 80
    else 60
  end,
  'America/New_York',
  event.payload->>'detected_state',
  event.payload
from public.outreach_events event
where event.event_type in ('accepted_detected', 'accepted')
on conflict (user_id, source, source_external_id) do nothing;

update public.outreach_events event
set event_type = 'accepted_detected',
    evidence_confidence = observation.confidence,
    observed_at = observation.observed_at,
    source = 'linkedin_acceptance_canonical',
    source_external_id = 'linkedin-acceptance:' || event.contact_id::text,
    payload = event.payload || jsonb_build_object(
      'best_evidence_source', observation.source,
      'best_evidence_external_id', observation.source_external_id
    )
from public.outreach_event_observations observation
where observation.canonical_event_id = event.id
  and event.event_type in ('accepted_detected', 'accepted');

create unique index if not exists outreach_events_one_linkedin_acceptance_per_contact
  on public.outreach_events(user_id, contact_id)
  where event_type in ('accepted_detected', 'accepted');

create or replace function public.record_linkedin_acceptance_observation(
  p_user_id uuid,
  p_contact_id uuid,
  p_occurred_on date,
  p_occurred_at timestamptz,
  p_observed_at timestamptz,
  p_source text,
  p_source_external_id text,
  p_confidence smallint,
  p_timezone text,
  p_raw_label text,
  p_payload jsonb,
  p_list_id uuid,
  p_membership_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  observation_id uuid;
  canonical_event public.outreach_events%rowtype;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception using errcode = '42501', message = 'OUTREACH_OBSERVATION_OWNER_MISMATCH';
  end if;
  if p_confidence < 0 or p_confidence > 100 then
    raise exception using errcode = '22023', message = 'OUTREACH_OBSERVATION_INVALID_CONFIDENCE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_contact_id::text, 0));

  insert into public.outreach_event_observations (
    user_id, contact_id, event_type, occurred_on, occurred_at,
    observed_at, source, source_external_id, confidence, timezone,
    raw_label, payload
  ) values (
    p_user_id, p_contact_id, 'linkedin_acceptance', p_occurred_on, p_occurred_at,
    p_observed_at, p_source, p_source_external_id, p_confidence,
    coalesce(nullif(p_timezone, ''), 'UTC'), p_raw_label, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (user_id, source, source_external_id) do update set
    occurred_on = excluded.occurred_on,
    occurred_at = excluded.occurred_at,
    observed_at = excluded.observed_at,
    confidence = excluded.confidence,
    timezone = excluded.timezone,
    raw_label = excluded.raw_label,
    payload = excluded.payload
  returning id into observation_id;

  select * into canonical_event
  from public.outreach_events
  where user_id = p_user_id
    and contact_id = p_contact_id
    and event_type in ('accepted_detected', 'accepted')
  for update;

  if canonical_event.id is null then
    insert into public.outreach_events (
      user_id, contact_id, list_id, membership_id, event_type,
      occurred_at, occurred_on, observed_at, evidence_confidence,
      source, source_external_id, payload
    ) values (
      p_user_id, p_contact_id, p_list_id, p_membership_id, 'accepted_detected',
      p_occurred_at, p_occurred_on, p_observed_at, p_confidence,
      'linkedin_acceptance_canonical', 'linkedin-acceptance:' || p_contact_id::text,
      coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
        'best_evidence_source', p_source,
        'best_evidence_external_id', p_source_external_id
      )
    ) returning * into canonical_event;
  elsif p_confidence > canonical_event.evidence_confidence
     or (p_confidence = canonical_event.evidence_confidence and p_occurred_at < canonical_event.occurred_at) then
    update public.outreach_events
    set occurred_at = p_occurred_at,
        occurred_on = p_occurred_on,
        observed_at = p_observed_at,
        evidence_confidence = p_confidence,
        list_id = coalesce(p_list_id, list_id),
        membership_id = coalesce(p_membership_id, membership_id),
        payload = coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
          'best_evidence_source', p_source,
          'best_evidence_external_id', p_source_external_id
        )
    where id = canonical_event.id
    returning * into canonical_event;
  end if;

  update public.outreach_event_observations
  set canonical_event_id = canonical_event.id
  where id = observation_id;

  update public.outreach_logs
  set status = 'CONNECTED', updated_at = greatest(updated_at, p_observed_at)
  where id = p_contact_id
    and user_id = p_user_id
    and status <> 'CONNECTED';

  return canonical_event.id;
end;
$$;

grant execute on function public.record_linkedin_acceptance_observation(
  uuid, uuid, date, timestamptz, timestamptz, text, text,
  smallint, text, text, jsonb, uuid, uuid
) to authenticated;

create or replace function public.sync_linkedin_interaction_outreach_events()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  interaction_row public.interactions%rowtype;
  request_row public.outreach_events%rowtype;
  first_excerpt jsonb;
  inbound_excerpt jsonb;
  event_time timestamptz;
  acceptance_confidence smallint;
begin
  if new.channel <> 'linkedin' or jsonb_typeof(new.excerpts) <> 'array' then
    return new;
  end if;

  select * into interaction_row
  from public.interactions
  where id = new.interaction_id
    and user_id = new.user_id;

  if interaction_row.id is null or interaction_row.contact_id is null then
    return new;
  end if;

  select excerpt into first_excerpt
  from jsonb_array_elements(new.excerpts) as excerpt
  order by excerpt->>'timestamp'
  limit 1;

  select excerpt into inbound_excerpt
  from jsonb_array_elements(new.excerpts) as excerpt
  where excerpt->>'direction' = 'inbound'
  order by excerpt->>'timestamp'
  limit 1;

  begin
    event_time := (first_excerpt->>'timestamp')::timestamptz;
  exception when others then
    event_time := coalesce(new.window_start, new.window_end, new.created_at, now());
  end;

  select * into request_row
  from public.outreach_events
  where user_id = new.user_id
    and contact_id = interaction_row.contact_id
    and event_type = 'request_sent'
    and occurred_at <= event_time
  order by occurred_at desc
  limit 1;

  if request_row.id is not null then
    acceptance_confidence := case when inbound_excerpt is null then 75 else 80 end;
    perform public.record_linkedin_acceptance_observation(
      new.user_id,
      interaction_row.contact_id,
      interaction_row.interaction_date,
      event_time,
      coalesce(new.created_at, now()),
      'conversation_sync',
      'interaction-detail:' || coalesce(new.source_external_id, new.id::text) || ':conversation-visible',
      acceptance_confidence,
      'America/New_York',
      case when inbound_excerpt is null then 'Conversation visible' else 'Inbound reply visible' end,
      jsonb_build_object(
        'request_event_id', request_row.id,
        'interaction_id', interaction_row.id,
        'interaction_detail_id', new.id,
        'source_external_id', new.source_external_id,
        'inferred_from', case when inbound_excerpt is null then 'first_conversation_visibility' else 'inbound_reply_received' end
      ),
      request_row.list_id,
      request_row.membership_id
    );
  end if;

  if inbound_excerpt is null then
    return new;
  end if;

  begin
    event_time := (inbound_excerpt->>'timestamp')::timestamptz;
  exception when others then
    event_time := coalesce(new.window_end, new.window_start, now());
  end;

  insert into public.outreach_events (
    user_id, contact_id, event_type, occurred_at, occurred_on,
    observed_at, evidence_confidence, source, source_external_id, payload
  ) values (
    new.user_id,
    interaction_row.contact_id,
    'inbound_reply_received',
    event_time,
    interaction_row.interaction_date,
    coalesce(new.created_at, now()),
    90,
    'conversation_sync',
    'interaction-detail:' || coalesce(new.source_external_id, new.id::text) || ':inbound',
    jsonb_build_object(
      'interaction_id', interaction_row.id,
      'interaction_detail_id', new.id,
      'source_external_id', new.source_external_id,
      'direction', 'inbound'
    )
  ) on conflict do nothing;

  return new;
end;
$$;

-- Re-run deterministic derivation for recent conversation details. Both the
-- observation key and canonical acceptance key make this idempotent.
update public.interaction_details
set excerpts = excerpts
where channel = 'linkedin'
  and coalesce(window_end, window_start, created_at) >= now() - interval '30 days';
