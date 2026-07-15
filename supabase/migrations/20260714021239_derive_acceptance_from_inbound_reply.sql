-- Any LinkedIn inbound reply after a request_sent implies the connection was
-- accepted, even if we never saw the profile, notification, or Connections page.
-- This makes the funnel source-agnostic: Conversations, extension, or future
-- sync jobs can write inbound_reply_received and Supabase derives the accepted
-- stage through the canonical, idempotent observation path.

create or replace function public.derive_linkedin_acceptance_from_inbound_reply()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  request_row public.outreach_events%rowtype;
  evidence_source text;
  evidence_external_id text;
begin
  if new.event_type <> 'inbound_reply_received'
     or new.contact_id is null
     or new.occurred_at is null
     or new.occurred_on is null then
    return new;
  end if;

  select * into request_row
  from public.outreach_events
  where user_id = new.user_id
    and contact_id = new.contact_id
    and event_type = 'request_sent'
    and occurred_at <= new.occurred_at
  order by occurred_at desc
  limit 1;

  if request_row.id is null then
    return new;
  end if;

  evidence_source := case
    when coalesce(new.source, '') ilike '%conversation%' then 'conversation_sync'
    when coalesce(new.source, '') ilike '%linkedin%' then 'linkedin_dm_inbound'
    else 'inbound_reply_event'
  end;
  evidence_external_id := 'inbound-reply:' || coalesce(new.source_external_id, new.id::text) || ':accepted';

  perform public.record_linkedin_acceptance_observation(
    new.user_id,
    new.contact_id,
    new.occurred_on,
    new.occurred_at,
    coalesce(new.observed_at, now()),
    evidence_source,
    evidence_external_id,
    85::smallint,
    coalesce(nullif(new.payload->>'timezone', ''), 'America/New_York'),
    'Inbound LinkedIn reply visible'::text,
    jsonb_build_object(
      'request_event_id', request_row.id,
      'source_event_id', new.id,
      'source_event_type', new.event_type,
      'source_external_id', new.source_external_id,
      'linkedin_url', coalesce(new.payload->>'linkedin_url', request_row.payload->>'linkedin_url'),
      'inference_rule', 'inbound_reply_received'
    ),
    request_row.list_id,
    request_row.membership_id
  );

  return new;
end;
$$;

drop trigger if exists outreach_events_derive_acceptance_from_inbound_reply on public.outreach_events;
create trigger outreach_events_derive_acceptance_from_inbound_reply
  after insert or update of event_type, contact_id, occurred_at, occurred_on, payload
  on public.outreach_events
  for each row
  execute function public.derive_linkedin_acceptance_from_inbound_reply();

-- Backfill deterministic cases already present in outreach_events.
update public.outreach_events
set payload = coalesce(payload, '{}'::jsonb)
where event_type = 'inbound_reply_received'
  and contact_id is not null
  and occurred_at >= now() - interval '90 days';
