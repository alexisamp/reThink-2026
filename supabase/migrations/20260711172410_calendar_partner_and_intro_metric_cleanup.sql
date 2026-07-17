-- Keep spouse-only shared calendar events out of the funnel, without blocking
-- meetings where another external attendee is present.
create or replace view public.outreach_daily_metric_contacts
with (security_invoker = true)
as
with normalized as (
  select
    event.id,
    event.user_id,
    event.contact_id,
    event.occurred_on,
    event.occurred_at,
    event.event_type,
    case
      when event.event_type in ('request_sent', 'follow_up_sent', 'reached') then 'reached'
      when event.event_type in ('accepted_detected', 'accepted') then 'accepted'
      when event.event_type in ('inbound_reply_received', 'replies') then 'replies'
      when event.event_type in ('meeting_scheduled', 'meetings')
        and (
          event.source <> 'interaction_derived'
          and coalesce(event.payload ->> 'calendar_excluded_from_funnel', 'false') <> 'true'
        ) then 'meetings'
      when event.event_type in ('intro_made', 'intros') then 'intros'
      else null
    end as metric
  from public.outreach_events event
), ranked as (
  select normalized.*,
         row_number() over (
           partition by user_id, occurred_on, contact_id, metric
           order by occurred_at, id
         ) as metric_rank
  from normalized
  where metric is not null
)
select id, user_id, contact_id, occurred_on, occurred_at, event_type, metric
from ranked
where metric_rank = 1;

grant select on public.outreach_daily_metric_contacts to authenticated;

-- Existing shared-calendar events with Maria Jose were created before attendee
-- based exclusion existed. Flag only the confirmed personal/shared titles.
update public.outreach_events event
set payload = coalesce(event.payload, '{}'::jsonb)
  || jsonb_build_object(
    'calendar_excluded_from_funnel', true,
    'calendar_exclusion_reason', 'partner_only_shared_calendar'
  )
from public.outreach_logs contact
where event.contact_id = contact.id
  and event.user_id = contact.user_id
  and event.source = 'google_calendar'
  and event.event_type in ('meeting_scheduled', 'meetings')
  and lower(contact.name) = 'maria jose zuniga'
  and lower(coalesce(event.payload ->> 'title', '')) ~ '(pediatrician|doctor|dentist|therapy|trabaja( jo| alexis)?|tiempo compartido|shared time)';

-- The intro metric should point to the introduced person, not the introducer.
-- Sebastián remains recorded in metadata as the bridge.
with intro_fixes as (
  select
    event.id as event_id,
    event.contact_id as introducer_contact_id,
    introducer.name as introducer_name,
    introduced.id as introduced_contact_id,
    introduced.name as introduced_name
  from public.outreach_events event
  join public.outreach_logs introducer
    on introducer.id = event.contact_id
   and introducer.user_id = event.user_id
  join public.outreach_logs introduced
    on introduced.user_id = event.user_id
   and lower(introduced.name) = 'jose luis ortiz'
  where event.event_type in ('intro_made', 'intros')
    and event.occurred_on between date '2026-07-06' and date '2026-07-12'
    and lower(introducer.name) = 'sebastián cualla'
    and coalesce(event.payload ->> 'evidence', event.payload ->> 'notes_preview', '') ilike '%jose%'
)
update public.outreach_events event
set contact_id = intro_fixes.introduced_contact_id,
    payload = coalesce(event.payload, '{}'::jsonb)
      || jsonb_build_object(
        'metric_contact_role', 'introduced_person',
        'introduced_contact_id', intro_fixes.introduced_contact_id,
        'introduced_contact_name', intro_fixes.introduced_name,
        'introducer_contact_id', intro_fixes.introducer_contact_id,
        'introducer_contact_name', intro_fixes.introducer_name
      )
from intro_fixes
where event.id = intro_fixes.event_id;
