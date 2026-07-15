-- Derive CRM funnel events from Conversations' structured LinkedIn excerpts.
-- The interaction row is intentionally aggregated into six-hour windows, so
-- the excerpts are the authoritative place to detect an inbound reply.

create or replace function public.sync_linkedin_interaction_outreach_events()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  interaction_row public.interactions%rowtype;
  request_row public.outreach_events%rowtype;
  inbound_excerpt jsonb;
  event_time timestamptz;
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

  select excerpt into inbound_excerpt
  from jsonb_array_elements(new.excerpts) as excerpt
  where excerpt->>'direction' = 'inbound'
  order by excerpt->>'timestamp'
  limit 1;

  if inbound_excerpt is null then
    return new;
  end if;

  begin
    event_time := (inbound_excerpt->>'timestamp')::timestamptz;
  exception when others then
    event_time := coalesce(new.window_end, new.window_start, now());
  end;

  insert into public.outreach_events (
    user_id,
    contact_id,
    event_type,
    occurred_at,
    occurred_on,
    source,
    source_external_id,
    payload
  ) values (
    new.user_id,
    interaction_row.contact_id,
    'inbound_reply_received',
    event_time,
    interaction_row.interaction_date,
    'conversation_sync',
    'interaction-detail:' || new.source_external_id || ':inbound',
    jsonb_build_object(
      'interaction_id', interaction_row.id,
      'interaction_detail_id', new.id,
      'source_external_id', new.source_external_id,
      'direction', 'inbound'
    )
  ) on conflict do nothing;

  select * into request_row
  from public.outreach_events
  where user_id = new.user_id
    and contact_id = interaction_row.contact_id
    and event_type = 'request_sent'
    and occurred_at <= event_time
  order by occurred_at desc
  limit 1;

  if request_row.id is not null and not exists (
    select 1
    from public.outreach_events accepted
    where accepted.user_id = new.user_id
      and accepted.contact_id = interaction_row.contact_id
      and accepted.event_type in ('accepted_detected', 'accepted')
      and accepted.occurred_at >= request_row.occurred_at
  ) then
    insert into public.outreach_events (
      user_id,
      contact_id,
      list_id,
      membership_id,
      event_type,
      occurred_at,
      occurred_on,
      source,
      source_external_id,
      payload
    ) values (
      new.user_id,
      interaction_row.contact_id,
      request_row.list_id,
      request_row.membership_id,
      'accepted_detected',
      event_time,
      interaction_row.interaction_date,
      'linkedin',
      'linkedin-request:' || request_row.id || ':accepted',
      jsonb_build_object(
        'request_event_id', request_row.id,
        'inferred_from', 'inbound_reply_received',
        'interaction_detail_id', new.id
      )
    ) on conflict do nothing;
  end if;

  update public.outreach_logs
  set status = 'CONNECTED', updated_at = now()
  where id = interaction_row.contact_id
    and user_id = new.user_id
    and status = 'PROSPECT';

  return new;
end;
$$;

drop trigger if exists interaction_details_linkedin_outreach_events on public.interaction_details;
create trigger interaction_details_linkedin_outreach_events
  after insert or update of excerpts, interaction_id, channel
  on public.interaction_details
  for each row
  execute function public.sync_linkedin_interaction_outreach_events();

-- Repair recent rows captured before this automation existed. The generated
-- source_external_id makes the operation idempotent.
update public.interaction_details
set excerpts = excerpts
where channel = 'linkedin'
  and coalesce(window_end, window_start, created_at) >= now() - interval '14 days'
  and exists (
    select 1
    from jsonb_array_elements(excerpts) as excerpt
    where excerpt->>'direction' = 'inbound'
  );
